import type { Prisma, PrismaClient } from '@prisma/client';
import type { AtualizarRecorrencia, CriarRecorrencia } from '@controle/shared';
import { ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';
import { fichaDoUsuario } from './entries.service.js';

type Transacao = Prisma.TransactionClient;

interface RecorrenciaDoBanco {
  id: string;
  categoryId?: string | null;
  category?: { name: string } | null;
  _count?: { obligations: number };
  direction: 'RECEIVABLE' | 'PAYABLE';
  description: string;
  amount: Prisma.Decimal;
  dayOfMonth: number;
  paymentMethod: 'CASH' | 'BARTER' | 'MEAL_VOUCHER' | 'CREDIT_CARD';
  counterpartyLabel: string | null;
  startsOn: string;
  endsOn: string | null;
  active: boolean;
}

function paraSaida(recorrencia: RecorrenciaDoBanco, hoje = new Date()) {
  return {
    id: recorrencia.id,
    direcao: recorrencia.direction,
    descricao: recorrencia.description,
    valor: recorrencia.amount.toString(),
    diaDoVencimento: recorrencia.dayOfMonth,
    formaDePagamento: recorrencia.paymentMethod,
    contraparte: recorrencia.counterpartyLabel,
    inicioEm: recorrencia.startsOn.trim(),
    fimEm: recorrencia.endsOn?.trim() ?? null,
    ativa: recorrencia.active,
    categoriaId: recorrencia.categoryId ?? null,
    categoria: recorrencia.category?.name ?? null,
    parcelasGeradas: recorrencia._count?.obligations ?? 0,
    // O próximo vencimento é o que responde "quando isso cai de novo", e é a informação
    // que falta numa lista de recorrências sem ela: o dia do mês sozinho não diz se a
    // vigência já acabou.
    proximoVencimento: proximoVencimento(recorrencia, hoje),
  };
}

/** O vencimento seguinte dentro da vigência, ou nulo quando a recorrência já se esgotou. */
function proximoVencimento(
  recorrencia: { active: boolean; dayOfMonth: number; startsOn: string; endsOn: string | null },
  hoje: Date,
): Date | null {
  if (!recorrencia.active) return null;

  const mesDeHoje = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, '0')}`;
  const inicio = recorrencia.startsOn.trim();
  const fim = recorrencia.endsOn?.trim();
  const candidato = inicio > mesDeHoje ? inicio : mesDeHoje;

  if (fim && candidato > fim) return null;

  const nesteMes = vencimentoNoMes(candidato, recorrencia.dayOfMonth);

  // Passado o dia neste mês, o próximo é o do mês seguinte — desde que caiba na vigência.
  if (candidato === mesDeHoje && nesteMes < hoje) {
    const [ano, numero] = candidato.split('-').map(Number);
    const seguinte = new Date(Date.UTC(ano!, numero!, 1));
    const mesSeguinte = `${seguinte.getUTCFullYear()}-${String(seguinte.getUTCMonth() + 1).padStart(2, '0')}`;

    if (fim && mesSeguinte > fim) return null;

    return vencimentoNoMes(mesSeguinte, recorrencia.dayOfMonth);
  }

  return nesteMes;
}

/**
 * Vencimento da parcela no mês.
 *
 * `Math.min` com o último dia porque nem todo mês tem dia 31: um salário no dia 31 cairia
 * em 3 de março se o `Date` "corrigisse" 31 de fevereiro sozinho, e a parcela mudaria de mês.
 */
export function vencimentoNoMes(mes: string, diaDoVencimento: number): Date {
  const ano = Number(mes.slice(0, 4));
  const numeroDoMes = Number(mes.slice(5));
  const ultimoDia = new Date(Date.UTC(ano, numeroDoMes, 0)).getUTCDate();

  return new Date(Date.UTC(ano, numeroDoMes - 1, Math.min(diaDoVencimento, ultimoDia)));
}

export async function listar(prisma: PrismaClient, userId: string) {
  const recorrencias = await prisma.recurrence.findMany({
    where: { ownerUserId: userId },
    include: { category: { select: { name: true } }, _count: { select: { obligations: true } } },
    orderBy: [{ active: 'desc' }, { description: 'asc' }],
  });

  return recorrencias.map((recorrencia) => paraSaida(recorrencia));
}

export async function criar(prisma: PrismaClient, userId: string, dados: CriarRecorrencia) {
  if (dados.fimEm && dados.fimEm < dados.inicioEm) {
    throw new ErroDeRegra('O fim da vigência não pode ser antes do início');
  }

  const ficha = await fichaDoUsuario(prisma, userId);

  const recorrencia = await prisma.recurrence.create({
    data: {
      ownerUserId: userId,
      personId: ficha.id,
      direction: dados.direcao,
      description: dados.descricao,
      amount: dados.valor,
      paymentMethod: dados.formaDePagamento,
      counterpartyLabel: dados.contraparte ?? null,
      dayOfMonth: dados.diaDoVencimento,
      startsOn: dados.inicioEm,
      endsOn: dados.fimEm ?? null,
      categoryId: dados.categoriaId ?? null,
    },
    include: { category: { select: { name: true } }, _count: { select: { obligations: true } } },
  });

  return paraSaida(recorrencia);
}

export async function atualizar(
  prisma: PrismaClient,
  id: string,
  userId: string,
  dados: AtualizarRecorrencia,
) {
  const existente = await prisma.recurrence.findFirst({
    where: { id, ownerUserId: userId },
    select: { id: true, startsOn: true },
  });

  if (!existente) {
    throw new ErroNaoEncontrado('Recorrência não encontrada');
  }

  if (dados.fimEm && dados.fimEm < existente.startsOn.trim()) {
    throw new ErroDeRegra('O fim da vigência não pode ser antes do início');
  }

  const recorrencia = await prisma.recurrence.update({
    where: { id },
    data: {
      ...(dados.descricao !== undefined && { description: dados.descricao }),
      ...(dados.valor !== undefined && { amount: dados.valor }),
      ...(dados.diaDoVencimento !== undefined && { dayOfMonth: dados.diaDoVencimento }),
      ...(dados.formaDePagamento !== undefined && { paymentMethod: dados.formaDePagamento }),
      ...(dados.contraparte !== undefined && { counterpartyLabel: dados.contraparte || null }),
      ...(dados.fimEm !== undefined && { endsOn: dados.fimEm || null }),
      ...(dados.ativa !== undefined && { active: dados.ativa }),
      ...(dados.categoriaId !== undefined && { categoryId: dados.categoriaId || null }),
    },
    include: { category: { select: { name: true } }, _count: { select: { obligations: true } } },
  });

  return paraSaida(recorrencia);
}

/**
 * Encerra a recorrência sem apagar o que ela já gerou.
 *
 * As parcelas passadas são lançamentos de verdade, com baixa e histórico. Apagá-las
 * junto faria o caixa dos meses anteriores mudar retroativamente.
 */
export async function excluir(prisma: PrismaClient, id: string, userId: string) {
  const existente = await prisma.recurrence.findFirst({
    where: { id, ownerUserId: userId },
    select: { id: true },
  });

  if (!existente) {
    throw new ErroNaoEncontrado('Recorrência não encontrada');
  }

  await prisma.$transaction(async (tx) => {
    // As parcelas futuras ainda sem baixa somem: elas eram só previsão.
    await tx.obligation.deleteMany({
      where: { recurrenceId: id, settledAmount: 0, dueDate: { gt: new Date() } },
    });

    await tx.recurrence.update({ where: { id }, data: { active: false } });
  });

  return { ok: true };
}

function estaVigente(recorrencia: { startsOn: string; endsOn: string | null }, mes: string) {
  const inicio = recorrencia.startsOn.trim();
  const fim = recorrencia.endsOn?.trim();

  return inicio <= mes && (!fim || fim >= mes);
}

/**
 * Garante que as parcelas do mês existam.
 *
 * Chamada quando o orçamento ou a lista do mês é aberta. É idempotente pelo único
 * (recorrência, mês) no banco combinado com `skipDuplicates`: abrir a tela duas vezes não
 * lança o salário duas vezes, nem sob concorrência — checar antes e criar depois teria
 * corrida entre duas abas abertas ao mesmo tempo.
 *
 * As parcelas nascem como obrigações de verdade porque precisam receber baixa e correção
 * individual. Calcular na exibição impediria dizer "este mês recebi menos".
 */
export async function gerarParcelasDoMes(
  prisma: PrismaClient | Transacao,
  userId: string,
  mes: string,
): Promise<number> {
  const recorrencias = await prisma.recurrence.findMany({
    where: { ownerUserId: userId, active: true },
    select: {
      id: true,
      personId: true,
      direction: true,
      description: true,
      amount: true,
      paymentMethod: true,
      counterpartyLabel: true,
      dayOfMonth: true,
      startsOn: true,
      endsOn: true,
      categoryId: true,
    },
  });

  const vigentes = recorrencias.filter((recorrencia) => estaVigente(recorrencia, mes));

  if (vigentes.length === 0) return 0;

  const { count } = await prisma.obligation.createMany({
    data: vigentes.map((recorrencia) => ({
      ...(recorrencia.direction === 'RECEIVABLE'
        ? { creditorId: recorrencia.personId, debtorId: null }
        : { debtorId: recorrencia.personId, creditorId: null }),
      counterpartyLabel: recorrencia.counterpartyLabel,
      description: recorrencia.description,
      amount: recorrencia.amount,
      dueDate: vencimentoNoMes(mes, recorrencia.dayOfMonth),
      paymentMethod: recorrencia.paymentMethod,
      originType: 'RECURRENCE' as const,
      recurrenceId: recorrencia.id,
      referenceMonth: mes,
      // A parcela herda a categoria do molde: classificar o salário uma vez basta.
      categoryId: recorrencia.categoryId,
    })),
    skipDuplicates: true,
  });

  return count;
}
