import { Prisma, type ObligationStatus, type PrismaClient } from '@prisma/client';
import { ErroNaoEncontrado } from '../../lib/erros.js';

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
  diaDeVencimento: number,
) {
  return tx.invoice.upsert({
    where: { cardId_referenceMonth: { cardId: cartaoId, referenceMonth: mesDeReferencia } },
    create: {
      cardId: cartaoId,
      referenceMonth: mesDeReferencia,
      dueDate: calcularVencimento(mesDeReferencia, diaDeVencimento),
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

  const [somaLancamentos, somaPagamentos] = await Promise.all([
    tx.invoiceEntry.aggregate({ where: { invoiceId: faturaId }, _sum: { amount: true } }),
    tx.invoicePayment.aggregate({ where: { invoiceId: faturaId }, _sum: { amount: true } }),
  ]);

  const total = somaLancamentos._sum.amount ?? new Prisma.Decimal(0);
  const pago = somaPagamentos._sum.amount ?? new Prisma.Decimal(0);

  // Estorno pode deixar o total negativo (mais crédito que compra no mês). A obrigação
  // não aceita valor negativo, e nem faria sentido: não se "deve menos que zero".
  const totalDevido = total.isNegative() ? new Prisma.Decimal(0) : total;
  const quitada = pago.greaterThanOrEqualTo(totalDevido) && totalDevido.greaterThan(0);

  await tx.invoice.update({
    where: { id: faturaId },
    data: {
      total,
      // A fatura só vira PAID sozinha; fechar é decisão de quem administra o cartão.
      ...(quitada && fatura.status === 'OPEN' ? { status: 'PAID' as const } : {}),
    },
  });

  const dono = await tx.person.findFirstOrThrow({
    where: { userId: fatura.card.ownerUserId, ownerId: fatura.card.ownerUserId },
    select: { id: true },
  });

  const descricao = `Fatura ${fatura.card.name} ${fatura.referenceMonth}`;
  // Nunca liquidar mais que o devido: o banco tem CHECK impedindo, e pagar a mais
  // acontece de verdade quando o CSV traz o pagamento de um mês junto com o do outro.
  const liquidado = pago.greaterThan(totalDevido) ? totalDevido : pago;
  const status: ObligationStatus = quitada
    ? 'SETTLED'
    : liquidado.greaterThan(0)
      ? 'PARTIAL'
      : 'OPEN';

  const existente = await tx.obligation.findFirst({
    where: { originType: 'INVOICE', originId: faturaId },
    select: { id: true },
  });

  const dados = {
    description: descricao,
    amount: totalDevido,
    settledAmount: liquidado,
    dueDate: fatura.dueDate,
    status,
    paymentMethod: 'CREDIT_CARD' as const,
  };

  if (existente) {
    await tx.obligation.update({ where: { id: existente.id }, data: dados });
  } else {
    await tx.obligation.create({
      data: {
        ...dados,
        debtorId: dono.id,
        // Nulo porque a contraparte é a instituição do cartão, não uma pessoa.
        creditorId: null,
        originType: 'INVOICE',
        originId: faturaId,
      },
    });
  }
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
        data: { status: 'CANCELLED' },
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
  };

  if (existente) {
    await tx.obligation.update({
      where: { id: existente.id },
      data: {
        ...dados,
        debtorId: lancamento.forwardedToPersonId,
        creditorId: dono.id,
        status: existente.settledAmount.greaterThan(0) ? 'PARTIAL' : 'OPEN',
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
