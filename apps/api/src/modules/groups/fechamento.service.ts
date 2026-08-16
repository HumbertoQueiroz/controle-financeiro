import type { Prisma, PrismaClient } from '@prisma/client';
import { deCentavos, paraCentavos, somarCentavos } from '@controle/shared';
import { resolverTransferencias, type SaldoDeParticipante } from '../../lib/netting.js';
import { ErroDeRegra } from '../../lib/erros.js';
import { carregarGrupoDoDono } from './groups.service.js';

type Transacao = Prisma.TransactionClient;

/** Primeiro instante do mês e o primeiro do mês seguinte, em UTC. */
function intervaloDoPeriodo(periodo: string) {
  const [ano, mes] = periodo.split('-').map(Number);

  return {
    inicio: new Date(Date.UTC(ano!, mes! - 1, 1)),
    fim: new Date(Date.UTC(ano!, mes!, 1)),
  };
}

interface ApuracaoDoPeriodo {
  totalEmCentavos: number;
  saldos: {
    pessoaId: string;
    nome: string;
    pagouEmCentavos: number;
    deveriaEmCentavos: number;
    saldoEmCentavos: number;
  }[];
  /** Obrigações abertas do período, para serem liquidadas no fechamento. */
  obrigacoes: { id: string; restanteEmCentavos: number }[];
}

/**
 * Apura o período: quanto cada um pagou, quanto deveria ter pago, e o saldo.
 *
 * O saldo sai da diferença entre o que a pessoa desembolsou e a soma das cotas dela. É essa
 * conta que o README chama de "o que tem que abater": quem pagou pelos outros tem a
 * receber a diferença, não o valor cheio que colocou.
 */
async function apurar(
  tx: Transacao | PrismaClient,
  grupoId: string,
  periodo: string,
): Promise<ApuracaoDoPeriodo> {
  const { inicio, fim } = intervaloDoPeriodo(periodo);

  const despesas = await tx.groupExpense.findMany({
    where: { event: { groupId: grupoId, date: { gte: inicio, lt: fim } } },
    select: {
      amount: true,
      payerPersonId: true,
      payer: { select: { name: true } },
      shares: {
        select: { id: true, personId: true, amount: true, person: { select: { name: true } } },
      },
    },
  });

  const pagou = new Map<string, number>();
  const deveria = new Map<string, number>();
  const nomes = new Map<string, string>();
  const idsDasCotas: string[] = [];

  for (const despesa of despesas) {
    const valor = paraCentavos(despesa.amount.toString());

    pagou.set(despesa.payerPersonId, (pagou.get(despesa.payerPersonId) ?? 0) + valor);
    nomes.set(despesa.payerPersonId, despesa.payer.name);

    for (const cota of despesa.shares) {
      const cotaEmCentavos = paraCentavos(cota.amount.toString());

      deveria.set(cota.personId, (deveria.get(cota.personId) ?? 0) + cotaEmCentavos);
      nomes.set(cota.personId, cota.person.name);
      idsDasCotas.push(cota.id);
    }
  }

  const obrigacoes = idsDasCotas.length
    ? await tx.obligation.findMany({
        where: {
          originType: 'GROUP_EXPENSE',
          originId: { in: idsDasCotas },
          status: { in: ['OPEN', 'PARTIAL'] },
        },
        select: { id: true, amount: true, settledAmount: true },
      })
    : [];

  const participantes = new Set([...pagou.keys(), ...deveria.keys()]);

  const saldos = [...participantes]
    .map((pessoaId) => {
      const pagouTotal = pagou.get(pessoaId) ?? 0;
      const deveriaTotal = deveria.get(pessoaId) ?? 0;

      return {
        pessoaId,
        nome: nomes.get(pessoaId) ?? 'Participante',
        pagouEmCentavos: pagouTotal,
        deveriaEmCentavos: deveriaTotal,
        saldoEmCentavos: pagouTotal - deveriaTotal,
      };
    })
    .sort((a, b) => b.saldoEmCentavos - a.saldoEmCentavos || a.nome.localeCompare(b.nome));

  return {
    totalEmCentavos: somarCentavos(
      despesas.map((despesa) => paraCentavos(despesa.amount.toString())),
    ),
    saldos,
    obrigacoes: obrigacoes.map((obrigacao) => ({
      id: obrigacao.id,
      restanteEmCentavos:
        paraCentavos(obrigacao.amount.toString()) -
        paraCentavos(obrigacao.settledAmount.toString()),
    })),
  };
}

function montarSaida(
  periodo: string,
  apuracao: ApuracaoDoPeriodo,
  transferencias: { dePessoaId: string; paraPessoaId: string; centavos: number }[],
) {
  const nomePor = new Map(apuracao.saldos.map((saldo) => [saldo.pessoaId, saldo.nome]));

  return {
    periodo,
    totalDoPeriodo: deCentavos(apuracao.totalEmCentavos),
    saldos: apuracao.saldos.map((saldo) => ({
      pessoaId: saldo.pessoaId,
      nome: saldo.nome,
      pagou: deCentavos(saldo.pagouEmCentavos),
      deveria: deCentavos(saldo.deveriaEmCentavos),
      saldo: deCentavos(saldo.saldoEmCentavos),
    })),
    transferencias: transferencias.map((transferencia) => ({
      dePessoaId: transferencia.dePessoaId,
      de: nomePor.get(transferencia.dePessoaId) ?? 'Participante',
      paraPessoaId: transferencia.paraPessoaId,
      para: nomePor.get(transferencia.paraPessoaId) ?? 'Participante',
      valor: deCentavos(transferencia.centavos),
    })),
  };
}

/**
 * Prévia do fechamento, sem gravar nada.
 *
 * Existe porque fechar o mês liquida obrigações, e ninguém deve descobrir o resultado
 * depois de ele já ter acontecido.
 */
export async function preverFechamento(
  prisma: PrismaClient,
  grupoId: string,
  donoId: string,
  periodo: string,
) {
  await carregarGrupoDoDono(prisma, grupoId, donoId);

  const apuracao = await apurar(prisma, grupoId, periodo);
  const saldosParaNetting: SaldoDeParticipante[] = apuracao.saldos.map((saldo) => ({
    pessoaId: saldo.pessoaId,
    saldoEmCentavos: saldo.saldoEmCentavos,
  }));

  return montarSaida(periodo, apuracao, resolverTransferencias(saldosParaNetting));
}

/**
 * Fecha o período: grava o plano de transferências e liquida as obrigações.
 *
 * Tudo numa transação. Um fechamento pela metade — transferências gravadas, obrigações
 * ainda abertas — faria o mês seguinte cobrar de novo o que já foi acertado.
 */
export async function fecharPeriodo(
  prisma: PrismaClient,
  grupoId: string,
  donoId: string,
  periodo: string,
) {
  await carregarGrupoDoDono(prisma, grupoId, donoId);

  const jaFechado = await prisma.settlement.findUnique({
    where: { groupId_period: { groupId: grupoId, period: periodo } },
    select: { status: true },
  });

  if (jaFechado?.status === 'CLOSED') {
    throw new ErroDeRegra('Este período já foi fechado');
  }

  return prisma.$transaction(async (tx) => {
    const apuracao = await apurar(tx, grupoId, periodo);

    if (apuracao.obrigacoes.length === 0) {
      throw new ErroDeRegra('Não há nada em aberto para fechar neste período');
    }

    const transferencias = resolverTransferencias(
      apuracao.saldos.map((saldo) => ({
        pessoaId: saldo.pessoaId,
        saldoEmCentavos: saldo.saldoEmCentavos,
      })),
    );

    const fechamento = await tx.settlement.upsert({
      where: { groupId_period: { groupId: grupoId, period: periodo } },
      create: { groupId: grupoId, period: periodo, status: 'CLOSED', closedAt: new Date() },
      update: { status: 'CLOSED', closedAt: new Date() },
      select: { id: true, closedAt: true },
    });

    // Refazer um fechamento aberto não pode empilhar planos antigos ao lado do novo.
    await tx.settlementTransfer.deleteMany({ where: { settlementId: fechamento.id } });

    for (const transferencia of transferencias) {
      await tx.settlementTransfer.create({
        data: {
          settlementId: fechamento.id,
          fromPersonId: transferencia.dePessoaId,
          toPersonId: transferencia.paraPessoaId,
          amount: deCentavos(transferencia.centavos),
        },
      });
    }

    // As obrigações individuais são substituídas pelo plano compensado: elas foram
    // absorvidas pelas transferências, e mantê-las abertas cobraria duas vezes.
    //
    // A baixa é datada no fechamento, e não no vencimento de cada despesa: foi o
    // fechamento que resolveu quem paga quem, e é ele o momento em que aquelas dívidas
    // deixaram de existir individualmente.
    const fechadoEm = fechamento.closedAt ?? new Date();

    for (const obrigacao of apuracao.obrigacoes) {
      await tx.obligation.update({
        where: { id: obrigacao.id },
        data: {
          status: 'SETTLED',
          settledAt: fechadoEm,
          settledAmount: { increment: deCentavos(obrigacao.restanteEmCentavos) },
        },
      });
    }

    return {
      ...montarSaida(periodo, apuracao, transferencias),
      id: fechamento.id,
      fechadoEm: fechamento.closedAt,
    };
  });
}

export async function listarFechamentos(prisma: PrismaClient, grupoId: string, donoId: string) {
  await carregarGrupoDoDono(prisma, grupoId, donoId);

  const fechamentos = await prisma.settlement.findMany({
    where: { groupId: grupoId },
    orderBy: { period: 'desc' },
    select: {
      id: true,
      period: true,
      closedAt: true,
      transfers: {
        select: {
          fromPersonId: true,
          toPersonId: true,
          amount: true,
          from: { select: { name: true } },
          to: { select: { name: true } },
        },
      },
    },
  });

  return fechamentos.map((fechamento) => ({
    id: fechamento.id,
    periodo: fechamento.period,
    fechadoEm: fechamento.closedAt,
    transferencias: fechamento.transfers.map((transferencia) => ({
      dePessoaId: transferencia.fromPersonId,
      de: transferencia.from.name,
      paraPessoaId: transferencia.toPersonId,
      para: transferencia.to.name,
      valor: transferencia.amount.toString(),
    })),
  }));
}
