import type { PrismaClient } from '@prisma/client';
import type { DefinirAgenda } from '@controle/shared';
import { ErroNaoEncontrado } from '../../lib/erros.js';

interface AgendaMinima {
  dayOfMonth: number;
  lastMonth: string | null;
}

function mesDe(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mesAnterior(mes: string): string {
  const [ano, numero] = mes.split('-').map(Number);
  const data = new Date(Date.UTC(ano!, numero! - 2, 1));

  return mesDe(data);
}

/**
 * O mês que uma agenda está esperando fechar, ou nulo quando não há nada devido.
 *
 * A regra tem uma sutileza que vale explicar: o fechamento de **agosto** só faz sentido
 * quando agosto acabou de fechar, isto é, a partir do dia combinado de **setembro**. Cobrar
 * o acerto de agosto no dia 5 de agosto pediria para conferir contas que ainda vão nascer.
 *
 * Por isso o mês devido é sempre o **anterior** ao corrente, e só depois que o dia chegou.
 */
export function mesPendenteDaAgenda(agenda: AgendaMinima, hoje: Date): string | null {
  if (hoje.getUTCDate() < agenda.dayOfMonth) {
    // Antes do dia combinado, o mês devido é o retrasado — e se ele já foi fechado, nada
    // está pendente. Sem esta volta, a agenda ficaria muda entre o dia 1 e o dia combinado.
    const anterior = mesAnterior(mesAnterior(mesDe(hoje)));

    return agenda.lastMonth && agenda.lastMonth >= anterior ? null : anterior;
  }

  const devido = mesAnterior(mesDe(hoje));

  return agenda.lastMonth && agenda.lastMonth >= devido ? null : devido;
}

export function paraSaidaDaAgenda(
  agenda: { active: boolean; dayOfMonth: number; lastMonth: string | null } | null,
  hoje = new Date(),
) {
  if (!agenda) return null;

  return {
    ativa: agenda.active,
    diaDoMes: agenda.dayOfMonth,
    ultimoMes: agenda.lastMonth,
    mesPendente: agenda.active ? mesPendenteDaAgenda(agenda, hoje) : null,
  };
}

/** Liga ou desliga a repetição do fechamento com uma pessoa. */
export async function definirAgenda(
  prisma: PrismaClient,
  userId: string,
  participanteId: string,
  dados: DefinirAgenda,
) {
  const pessoa = await prisma.person.findFirst({
    where: { id: participanteId, ownerId: userId },
    select: { id: true },
  });

  if (!pessoa) {
    throw new ErroNaoEncontrado('Pessoa não encontrada');
  }

  const agenda = await prisma.settlementSchedule.upsert({
    where: { personId: participanteId },
    create: {
      ownerId: userId,
      personId: participanteId,
      dayOfMonth: dados.diaDoMes,
      active: dados.ativa,
    },
    // Desligar preserva `lastMonth`: religar meses depois não deve cobrar de uma vez todos
    // os acertos que não foram feitos enquanto a agenda estava desligada.
    update: { dayOfMonth: dados.diaDoMes, active: dados.ativa },
    select: { active: true, dayOfMonth: true, lastMonth: true },
  });

  // Não é nulo: o `upsert` acabou de garantir a linha. O `!` evita propagar um opcional
  // que só existe porque `paraSaidaDaAgenda` também serve ao caso "nunca teve agenda".
  return paraSaidaDaAgenda(agenda)!;
}
