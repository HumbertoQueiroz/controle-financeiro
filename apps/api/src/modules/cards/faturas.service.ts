import { Prisma, type PrismaClient } from '@prisma/client';
import { ErroNaoEncontrado } from '../../lib/erros.js';
import { recalcularSituacao } from '../entries/pagamentos.service.js';

type Transacao = Prisma.TransactionClient;

/**
 * Data de vencimento da fatura de um mês de referência.
 *
 * `Math.min` com o último dia do mês porque nem todo mês tem dia 31: um cartão que vence
 * dia 31 venceria em 3 de março se o Date "corrigisse" 31 de fevereiro sozinho.
 */
export function calcularVencimento(mesDeReferencia: string, diaDeVencimento: number): Date {
  const [ano, mes] = mesDeReferencia.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(ano!, mes!, 0)).getUTCDate();

  return new Date(Date.UTC(ano!, mes! - 1, Math.min(diaDeVencimento, ultimoDia)));
}

/** Mesma regra do vencimento: o dia de fechamento cai no último dia em meses curtos. */
export function calcularFechamento(mesDeReferencia: string, diaDeFechamento: number): Date {
  return calcularVencimento(mesDeReferencia, diaDeFechamento);
}

/**
 * Descobre em qual fatura uma compra entra.
 *
 * Compra feita **depois** do fechamento do mês vai para a fatura seguinte — é a regra que
 * todo cartão usa e a que mais confunde quem confere o extrato, porque a compra do dia 28
 * aparece na fatura do mês que vem.
 */
export function faturaDaCompra(dataDaCompra: Date, diaDeFechamento: number): string {
  const ano = dataDaCompra.getUTCFullYear();
  const mes = dataDaCompra.getUTCMonth();
  const dia = dataDaCompra.getUTCDate();

  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const fechamento = Math.min(diaDeFechamento, ultimoDiaDoMes);

  const referencia = new Date(Date.UTC(ano, dia > fechamento ? mes + 1 : mes, 1));

  return `${referencia.getUTCFullYear()}-${String(referencia.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Soma meses a um mês no formato YYYY-MM. */
export function somarMeses(mes: string, quantidade: number): string {
  const [ano, numero] = mes.split('-').map(Number);
  const data = new Date(Date.UTC(ano!, numero! - 1 + quantidade, 1));

  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Encontra ou cria a fatura do mês, sempre em transação com quem chamou.
 *
 * `upsert` sobre o único (cartão, mês) em vez de buscar-e-criar: duas importações
 * simultâneas do mesmo mês criariam duas faturas, e os lançamentos se dividiriam entre
 * elas sem nenhuma delas bater com o extrato.
 */
export async function obterOuCriarFatura(
  tx: Transacao,
  cartaoId: string,
  mesDeReferencia: string,
  cartao: { dueDay: number; closingDay: number },
) {
  return tx.invoice.upsert({
    where: { cardId_referenceMonth: { cardId: cartaoId, referenceMonth: mesDeReferencia } },
    create: {
      cardId: cartaoId,
      referenceMonth: mesDeReferencia,
      closingDate: calcularFechamento(mesDeReferencia, cartao.closingDay),
      dueDate: calcularVencimento(mesDeReferencia, cartao.dueDay),
    },
    update: {},
  });
}

/**
 * Recalcula o total da fatura e sincroniza a obrigação do dono.
 *
 * É **uma** obrigação por fatura, não uma por lançamento: ninguém paga cada compra, paga a
 * fatura. Uma por lançamento duplicaria a dívida (a fatura já é o agregado) e faria o
 * estorno precisar cancelar obrigação individual, em vez de só reduzir o total daqui.
 *
 * Chamada depois de qualquer alteração em lançamentos ou pagamentos.
 */
export async function sincronizarFatura(tx: Transacao, faturaId: string) {
  const fatura = await tx.invoice.findUniqueOrThrow({
    where: { id: faturaId },
    select: {
      id: true,
      referenceMonth: true,
      dueDate: true,
      status: true,
      card: { select: { name: true, ownerUserId: true } },
    },
  });

  const somaLancamentos = await tx.invoiceEntry.aggregate({
    where: { invoiceId: faturaId },
    _sum: { amount: true },
  });

  const total = somaLancamentos._sum.amount ?? new Prisma.Decimal(0);

  // Estorno pode deixar o total negativo (mais crédito que compra no mês). A obrigação
  // não aceita valor negativo, e nem faria sentido: não se "deve menos que zero".
  const totalDevido = total.isNegative() ? new Prisma.Decimal(0) : total;

  const dono = await tx.person.findFirstOrThrow({
    where: { userId: fatura.card.ownerUserId, ownerId: fatura.card.ownerUserId },
    select: { id: true },
  });

  const existente = await tx.obligation.findFirst({
    where: { originType: 'INVOICE', originId: faturaId },
    select: { id: true, settledAmount: true },
  });

  const dados = {
    description: `Fatura ${fatura.card.name} ${fatura.referenceMonth}`,
    amount: totalDevido,
    dueDate: fatura.dueDate,
    paymentMethod: 'CREDIT_CARD' as const,
    // O `settledAmount` vem junto, preso ao novo total, porque ele é cache do que os
    // pagamentos dizem e ainda guarda o valor da fatura anterior. Quando o total encolhe —
    // um estorno, ou a exclusão da importação —, o banco recusa o estado intermediário
    // pelo CHECK de `settledAmount <= amount`, e a operação inteira falha antes de o
    // `recalcularSituacao` abaixo ter a chance de corrigir o cache.
    ...(existente
      ? {
          settledAmount: existente.settledAmount.greaterThan(totalDevido)
            ? totalDevido
            : existente.settledAmount,
        }
      : {}),
  };

  // A situação da obrigação não é decidida aqui: ela é recalculada a partir dos
  // pagamentos, que são a fonte única da verdade sobre o que foi pago.
  const obrigacaoId = existente
    ? (await tx.obligation.update({ where: { id: existente.id }, data: dados })).id
    : (
        await tx.obligation.create({
          data: {
            ...dados,
            debtorId: dono.id,
            // Nulo porque a contraparte é a instituição do cartão, não uma pessoa.
            creditorId: null,
            originType: 'INVOICE',
            originId: faturaId,
          },
        })
      ).id;

  await recalcularSituacao(tx, obrigacaoId);

  const quitada = await tx.obligation.findUniqueOrThrow({
    where: { id: obrigacaoId },
    select: { status: true },
  });

  await tx.invoice.update({
    where: { id: faturaId },
    data: {
      total,
      // A fatura só vira PAID sozinha; fechar é decisão de quem administra o cartão.
      ...(quitada.status === 'SETTLED' && fatura.status === 'OPEN'
        ? { status: 'PAID' as const }
        : {}),
    },
  });
}

/**
 * Cria, atualiza ou cancela o "a receber" de um lançamento repassado a terceiro.
 *
 * O lançamento repassado gera **duas** obrigações que coexistem e não se anulam: o dono
 * continua devendo à fatura, e o terceiro passa a dever ao dono. Anular uma com a outra
 * faria a fatura parecer menor do que é.
 */
export async function sincronizarRepasse(tx: Transacao, lancamentoId: string) {
  const lancamento = await tx.invoiceEntry.findUniqueOrThrow({
    where: { id: lancamentoId },
    select: {
      id: true,
      description: true,
      amount: true,
      forwardedToPersonId: true,
      categoryId: true,
      invoice: {
        select: { dueDate: true, card: { select: { ownerUserId: true } } },
      },
    },
  });

  const existente = await tx.obligation.findFirst({
    where: { originType: 'CARD_ENTRY', originId: lancamentoId },
    select: { id: true, settledAmount: true },
  });

  if (!lancamento.forwardedToPersonId) {
    if (existente) {
      // Cancelar, não apagar: se já houve pagamento parcial, apagar sumiria com o
      // registro de um dinheiro que trocou de mãos.
      await tx.obligation.update({
        where: { id: existente.id },
        // Cancelada deixa de ter data de baixa: ela não foi paga, foi desfeita.
        data: { status: 'CANCELLED', settledAt: null },
      });
    }

    return;
  }

  const dono = await tx.person.findFirstOrThrow({
    where: {
      userId: lancamento.invoice.card.ownerUserId,
      ownerId: lancamento.invoice.card.ownerUserId,
    },
    select: { id: true },
  });

  const dados = {
    description: lancamento.description,
    amount: lancamento.amount,
    dueDate: lancamento.invoice.dueDate,
    paymentMethod: 'CREDIT_CARD' as const,
    // O repasse herda a categoria da compra: é o mesmo gasto visto do outro lado, e
    // classificar duas vezes a mesma coisa só cria chance de divergir.
    categoryId: lancamento.categoryId,
  };

  if (existente) {
    await tx.obligation.update({
      where: { id: existente.id },
      data: {
        ...dados,
        debtorId: lancamento.forwardedToPersonId,
        creditorId: dono.id,
        status: existente.settledAmount.greaterThan(0) ? 'PARTIAL' : 'OPEN',
        // Reabrir o repasse limpa a baixa: o que estava quitado voltou a ser devido.
        settledAt: null,
      },
    });

    return;
  }

  await tx.obligation.create({
    data: {
      ...dados,
      debtorId: lancamento.forwardedToPersonId,
      creditorId: dono.id,
      originType: 'CARD_ENTRY',
      originId: lancamentoId,
    },
  });
}

export async function carregarCartaoDoDono(prisma: PrismaClient, cartaoId: string, donoId: string) {
  const cartao = await prisma.creditCard.findFirst({
    where: { id: cartaoId, ownerUserId: donoId },
  });

  if (!cartao) {
    throw new ErroNaoEncontrado('Cartão não encontrado');
  }

  return cartao;
}
