import type { Direction, Prisma, PrismaClient } from '@prisma/client';
import type { AtualizarLancamento, CriarLancamento, DarBaixa, Direcao } from '@controle/shared';
import { deCentavos, paraCentavos } from '@controle/shared';
import { ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';
import {
  paraSaidaDePagamento,
  recalcularSituacao,
  registrarPagamento,
} from './pagamentos.service.js';

const CAMPOS = {
  id: true,
  description: true,
  amount: true,
  settledAmount: true,
  dueDate: true,
  settledAt: true,
  status: true,
  paymentMethod: true,
  originType: true,
  counterpartyLabel: true,
  debtorId: true,
  creditorId: true,
  debtor: { select: { name: true } },
  creditor: { select: { name: true } },
  payments: {
    select: { id: true, amount: true, paidAt: true, note: true },
    orderBy: { paidAt: 'asc' },
  },
} as const;

type ObrigacaoDoBanco = Prisma.ObligationGetPayload<{ select: typeof CAMPOS }>;

/** Ficha espelho do usuário: é ela que aparece como devedora ou credora do que ele lança. */
export async function fichaDoUsuario(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
) {
  return prisma.person.findFirstOrThrow({
    where: { userId, ownerId: userId },
    select: { id: true },
  });
}

/** Todas as fichas que apontam para a conta — inclusive as criadas por terceiros. */
export async function fichasDoUsuario(prisma: PrismaClient, userId: string): Promise<string[]> {
  const fichas = await prisma.person.findMany({ where: { userId }, select: { id: true } });

  return fichas.map((ficha) => ficha.id);
}

export function paraSaida(obrigacao: ObrigacaoDoBanco, idsDasFichas: string[]) {
  const ehReceber = obrigacao.creditorId !== null && idsDasFichas.includes(obrigacao.creditorId);
  const valor = paraCentavos(obrigacao.amount.toString());
  const liquidado = paraCentavos(obrigacao.settledAmount.toString());

  return {
    id: obrigacao.id,
    direcao: (ehReceber ? 'RECEIVABLE' : 'PAYABLE') as Direcao,
    descricao: obrigacao.description,
    valor: obrigacao.amount.toString(),
    valorLiquidado: obrigacao.settledAmount.toString(),
    restante: deCentavos(valor - liquidado),
    vencimento: obrigacao.dueDate,
    dataDaBaixa: obrigacao.settledAt,
    status: obrigacao.status,
    formaDePagamento: obrigacao.paymentMethod,
    origem: obrigacao.originType,
    contraparte:
      obrigacao.counterpartyLabel ??
      (ehReceber ? (obrigacao.debtor?.name ?? null) : (obrigacao.creditor?.name ?? null)),
    // Só o que foi lançado à mão se edita aqui. Fatura, rateio e repasse se corrigem na
    // origem — editar a obrigação deixaria o valor divergente do que a originou.
    editavel: obrigacao.originType === 'MANUAL' || obrigacao.originType === 'RECURRENCE',
    atrasado: obrigacao.status !== 'SETTLED' && obrigacao.dueDate < new Date(),
    pagamentos: obrigacao.payments.map(paraSaidaDePagamento),
  };
}

async function carregarDoUsuario(prisma: PrismaClient, id: string, userId: string) {
  const idsDasFichas = await fichasDoUsuario(prisma, userId);

  const obrigacao = await prisma.obligation.findFirst({
    where: {
      id,
      OR: [{ debtorId: { in: idsDasFichas } }, { creditorId: { in: idsDasFichas } }],
    },
    select: CAMPOS,
  });

  if (!obrigacao) {
    throw new ErroNaoEncontrado('Lançamento não encontrado');
  }

  return { obrigacao, idsDasFichas };
}

export async function listar(
  prisma: PrismaClient,
  userId: string,
  filtro: { direcao: Direcao; mes?: string; situacao: 'ABERTAS' | 'BAIXADAS' | 'TODAS' },
) {
  const idsDasFichas = await fichasDoUsuario(prisma, userId);

  const periodo = filtro.mes
    ? {
        gte: new Date(Date.UTC(Number(filtro.mes.slice(0, 4)), Number(filtro.mes.slice(5)) - 1, 1)),
        lt: new Date(Date.UTC(Number(filtro.mes.slice(0, 4)), Number(filtro.mes.slice(5)), 1)),
      }
    : undefined;

  const obrigacoes = await prisma.obligation.findMany({
    where: {
      // O lado define a direção: a receber é o que cai numa ficha minha como credora.
      ...(filtro.direcao === 'RECEIVABLE'
        ? { creditorId: { in: idsDasFichas } }
        : { debtorId: { in: idsDasFichas } }),
      ...(periodo ? { dueDate: periodo } : {}),
      ...(filtro.situacao === 'ABERTAS' ? { status: { in: ['OPEN', 'PARTIAL'] } } : {}),
      ...(filtro.situacao === 'BAIXADAS' ? { status: 'SETTLED' } : {}),
      NOT: { status: 'CANCELLED' },
    },
    select: CAMPOS,
    orderBy: [{ dueDate: 'asc' }, { description: 'asc' }],
  });

  return obrigacoes.map((obrigacao) => paraSaida(obrigacao, idsDasFichas));
}

export async function criar(prisma: PrismaClient, userId: string, dados: CriarLancamento) {
  const ficha = await fichaDoUsuario(prisma, userId);

  if (dados.pessoaId) {
    const pessoa = await prisma.person.findFirst({
      where: { id: dados.pessoaId, ownerId: userId },
      select: { id: true },
    });

    if (!pessoa) {
      throw new ErroNaoEncontrado('Pessoa não encontrada');
    }
  }

  const contraparte = dados.pessoaId ?? null;

  const obrigacao = await prisma.obligation.create({
    data: {
      // A receber: eu sou o credor e a contraparte é quem deve. A pagar, o inverso.
      ...(dados.direcao === 'RECEIVABLE'
        ? { creditorId: ficha.id, debtorId: contraparte }
        : { debtorId: ficha.id, creditorId: contraparte }),
      counterpartyLabel: dados.contraparte ?? null,
      description: dados.descricao,
      amount: dados.valor,
      dueDate: dados.vencimento,
      paymentMethod: dados.formaDePagamento,
      originType: 'MANUAL',
    },
    select: CAMPOS,
  });

  return paraSaida(obrigacao, await fichasDoUsuario(prisma, userId));
}

export async function atualizar(
  prisma: PrismaClient,
  id: string,
  userId: string,
  dados: AtualizarLancamento,
) {
  const { obrigacao, idsDasFichas } = await carregarDoUsuario(prisma, id, userId);

  if (obrigacao.originType !== 'MANUAL' && obrigacao.originType !== 'RECURRENCE') {
    throw new ErroDeRegra('Este lançamento vem de outra tela e precisa ser corrigido lá');
  }

  if (dados.valor !== undefined && paraCentavos(obrigacao.settledAmount.toString()) > 0) {
    // Baixar R$ 100 e depois dizer que a conta era de R$ 50 deixaria liquidado maior que
    // o valor — o banco recusaria, e a mensagem seria incompreensível.
    throw new ErroDeRegra('Estorne a baixa antes de alterar o valor');
  }

  const atualizada = await prisma.obligation.update({
    where: { id },
    data: {
      ...(dados.descricao !== undefined && { description: dados.descricao }),
      ...(dados.valor !== undefined && { amount: dados.valor }),
      ...(dados.vencimento !== undefined && { dueDate: dados.vencimento }),
      ...(dados.formaDePagamento !== undefined && { paymentMethod: dados.formaDePagamento }),
      ...(dados.contraparte !== undefined && { counterpartyLabel: dados.contraparte || null }),
    },
    select: CAMPOS,
  });

  return paraSaida(atualizada, idsDasFichas);
}

export async function excluir(prisma: PrismaClient, id: string, userId: string) {
  const { obrigacao } = await carregarDoUsuario(prisma, id, userId);

  if (obrigacao.originType !== 'MANUAL' && obrigacao.originType !== 'RECURRENCE') {
    throw new ErroDeRegra('Este lançamento vem de outra tela e precisa ser removido lá');
  }

  if (paraCentavos(obrigacao.settledAmount.toString()) > 0) {
    // Apagar depois da baixa sumiria com o registro de um dinheiro que trocou de mãos.
    throw new ErroDeRegra('Estorne a baixa antes de excluir');
  }

  await prisma.obligation.delete({ where: { id } });

  return { ok: true };
}

/**
 * Dá baixa: registra que o dinheiro se moveu, e quando.
 *
 * A data vem de quem lança e não é assumida como hoje — quem registra no domingo o que
 * pagou na sexta precisa que o caixa mostre sexta, senão o fechamento erra na virada do mês.
 */
export async function darBaixa(prisma: PrismaClient, id: string, userId: string, dados: DarBaixa) {
  const { obrigacao, idsDasFichas } = await carregarDoUsuario(prisma, id, userId);

  if (obrigacao.status === 'SETTLED') {
    throw new ErroDeRegra('Este lançamento já teve baixa');
  }

  if (obrigacao.status === 'CANCELLED') {
    throw new ErroDeRegra('Este lançamento está cancelado');
  }

  const valorTotal = paraCentavos(obrigacao.amount.toString());
  const jaLiquidado = paraCentavos(obrigacao.settledAmount.toString());
  const restante = valorTotal - jaLiquidado;
  const pago = dados.valorPago ? paraCentavos(dados.valorPago) : restante;

  if (pago > restante) {
    throw new ErroDeRegra(`O valor excede o que falta (${deCentavos(restante)})`);
  }

  // Cada baixa é um pagamento com data e observação próprias. O total liquidado e a
  // situação do título saem da soma deles, recalculados dentro da transação.
  const atualizada = await prisma.$transaction(async (tx) => {
    await registrarPagamento(tx, id, {
      valor: deCentavos(pago),
      pagoEm: dados.dataDaBaixa,
      observacao: dados.observacao ?? null,
    });

    return tx.obligation.findUniqueOrThrow({ where: { id }, select: CAMPOS });
  });

  return paraSaida(atualizada, idsDasFichas);
}

/** Apaga um pagamento específico, mantendo os demais. */
export async function removerPagamentoDoLancamento(
  prisma: PrismaClient,
  id: string,
  pagamentoId: string,
  userId: string,
) {
  const { idsDasFichas } = await carregarDoUsuario(prisma, id, userId);

  const pagamento = await prisma.payment.findFirst({
    where: { id: pagamentoId, obligationId: id },
    select: { id: true },
  });

  if (!pagamento) {
    throw new ErroNaoEncontrado('Pagamento não encontrado');
  }

  const atualizada = await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: pagamentoId } });
    await recalcularSituacao(tx, id);

    return tx.obligation.findUniqueOrThrow({ where: { id }, select: CAMPOS });
  });

  return paraSaida(atualizada, idsDasFichas);
}

export async function estornarBaixa(prisma: PrismaClient, id: string, userId: string) {
  const { obrigacao, idsDasFichas } = await carregarDoUsuario(prisma, id, userId);

  if (paraCentavos(obrigacao.settledAmount.toString()) === 0) {
    throw new ErroDeRegra('Este lançamento não tem baixa para estornar');
  }

  // Estornar apaga todos os pagamentos e devolve o título ao previsto. Para desfazer só
  // um deles, existe a remoção individual.
  const atualizada = await prisma.$transaction(async (tx) => {
    await tx.payment.deleteMany({ where: { obligationId: id } });
    await recalcularSituacao(tx, id);

    return tx.obligation.findUniqueOrThrow({ where: { id }, select: CAMPOS });
  });

  return paraSaida(atualizada, idsDasFichas);
}

/** Direção do enum do banco a partir da direção do contrato. */
export function paraDirecaoDoBanco(direcao: Direcao): Direction {
  return direcao;
}
