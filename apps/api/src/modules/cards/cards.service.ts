import type { PrismaClient } from '@prisma/client';
import type { AtualizarCartao, CriarCartao } from '@controle/shared';
import { ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';
import { carregarCartaoDoDono, sincronizarFatura, sincronizarRepasse } from './faturas.service.js';

interface CartaoDoBanco {
  id: string;
  name: string;
  brand: string | null;
  lastFour: string | null;
  closingDay: number;
  dueDay: number;
  active: boolean;
}

function paraSaida(cartao: CartaoDoBanco) {
  return {
    id: cartao.id,
    nome: cartao.name,
    bandeira: cartao.brand,
    finalDoCartao: cartao.lastFour,
    diaDeFechamento: cartao.closingDay,
    diaDeVencimento: cartao.dueDay,
    ativo: cartao.active,
  };
}

export async function listar(prisma: PrismaClient, donoId: string) {
  const cartoes = await prisma.creditCard.findMany({
    where: { ownerUserId: donoId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });

  return cartoes.map(paraSaida);
}

export async function criar(prisma: PrismaClient, donoId: string, dados: CriarCartao) {
  const cartao = await prisma.creditCard.create({
    data: {
      ownerUserId: donoId,
      name: dados.nome,
      brand: dados.bandeira ?? null,
      lastFour: dados.finalDoCartao ?? null,
      closingDay: dados.diaDeFechamento,
      dueDay: dados.diaDeVencimento,
    },
  });

  return paraSaida(cartao);
}

export async function atualizar(
  prisma: PrismaClient,
  cartaoId: string,
  donoId: string,
  dados: AtualizarCartao,
) {
  await carregarCartaoDoDono(prisma, cartaoId, donoId);

  const cartao = await prisma.creditCard.update({
    where: { id: cartaoId },
    data: {
      ...(dados.nome !== undefined && { name: dados.nome }),
      ...(dados.bandeira !== undefined && { brand: dados.bandeira || null }),
      ...(dados.finalDoCartao !== undefined && { lastFour: dados.finalDoCartao || null }),
      ...(dados.diaDeFechamento !== undefined && { closingDay: dados.diaDeFechamento }),
      ...(dados.diaDeVencimento !== undefined && { dueDay: dados.diaDeVencimento }),
      ...(dados.ativo !== undefined && { active: dados.ativo }),
    },
  });

  return paraSaida(cartao);
}

export async function listarFaturas(prisma: PrismaClient, cartaoId: string, donoId: string) {
  await carregarCartaoDoDono(prisma, cartaoId, donoId);

  const faturas = await prisma.invoice.findMany({
    where: { cardId: cartaoId },
    orderBy: { referenceMonth: 'desc' },
    select: {
      id: true,
      cardId: true,
      referenceMonth: true,
      dueDate: true,
      status: true,
      total: true,
      payments: { select: { amount: true } },
    },
  });

  return faturas.map((fatura) => ({
    id: fatura.id,
    cartaoId: fatura.cardId,
    mesDeReferencia: fatura.referenceMonth,
    vencimento: fatura.dueDate,
    status: fatura.status,
    total: fatura.total.toString(),
    totalPago: fatura.payments
      .reduce((soma, pagamento) => soma.plus(pagamento.amount), fatura.total.mul(0))
      .toString(),
  }));
}

async function carregarFaturaDoDono(prisma: PrismaClient, faturaId: string, donoId: string) {
  const fatura = await prisma.invoice.findFirst({
    where: { id: faturaId, card: { ownerUserId: donoId } },
    select: { id: true, status: true },
  });

  if (!fatura) {
    throw new ErroNaoEncontrado('Fatura não encontrada');
  }

  return fatura;
}

export async function listarLancamentos(prisma: PrismaClient, faturaId: string, donoId: string) {
  await carregarFaturaDoDono(prisma, faturaId, donoId);

  const lancamentos = await prisma.invoiceEntry.findMany({
    where: { invoiceId: faturaId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      installmentNumber: true,
      installmentTotal: true,
      forwardedToPersonId: true,
      forwardedTo: { select: { name: true } },
    },
  });

  return lancamentos.map((lancamento) => ({
    id: lancamento.id,
    data: lancamento.date,
    descricao: lancamento.description,
    valor: lancamento.amount.toString(),
    parcelaNumero: lancamento.installmentNumber,
    parcelaTotal: lancamento.installmentTotal,
    repassadoParaPessoaId: lancamento.forwardedToPersonId,
    repassadoPara: lancamento.forwardedTo?.name ?? null,
  }));
}

/**
 * Marca (ou desmarca) um lançamento como repassado a terceiro.
 *
 * É aqui que nasce o "a receber" do README: o gasto continua sendo dívida do dono com a
 * fatura, e passa a ser também dívida do terceiro com o dono.
 */
export async function repassarLancamento(
  prisma: PrismaClient,
  lancamentoId: string,
  donoId: string,
  pessoaId: string | null,
) {
  const lancamento = await prisma.invoiceEntry.findFirst({
    where: { id: lancamentoId, invoice: { card: { ownerUserId: donoId } } },
    select: { id: true, amount: true },
  });

  if (!lancamento) {
    throw new ErroNaoEncontrado('Lançamento não encontrado');
  }

  if (pessoaId) {
    const pessoa = await prisma.person.findFirst({
      where: { id: pessoaId, ownerId: donoId },
      select: { id: true },
    });

    if (!pessoa) {
      throw new ErroNaoEncontrado('Pessoa não encontrada');
    }

    // Estorno é crédito, não gasto: repassar um valor negativo criaria uma cobrança
    // invertida, em que o terceiro passaria a ter a receber por uma compra que não fez.
    if (lancamento.amount.isNegative()) {
      throw new ErroDeRegra('Um estorno não pode ser repassado a outra pessoa');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoiceEntry.update({
      where: { id: lancamentoId },
      data: { forwardedToPersonId: pessoaId },
    });

    await sincronizarRepasse(tx, lancamentoId);
  });

  return { ok: true };
}

/** Fecha a fatura manualmente, o que impede o CSV de registrar pagamento nela depois. */
export async function fecharFatura(prisma: PrismaClient, faturaId: string, donoId: string) {
  const fatura = await carregarFaturaDoDono(prisma, faturaId, donoId);

  if (fatura.status !== 'OPEN') {
    throw new ErroDeRegra('Esta fatura não está aberta');
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id: faturaId }, data: { status: 'CLOSED' } });
    await sincronizarFatura(tx, faturaId);
  });

  return { ok: true };
}
