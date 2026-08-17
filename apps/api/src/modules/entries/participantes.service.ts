import type { PrismaClient } from '@prisma/client';
import type { QuitarFechamento } from '@controle/shared';
import {
  deCentavos,
  descricaoDoAcerto,
  observacaoDaQuitacao,
  paraCentavos,
  somarCentavos,
} from '@controle/shared';
import { ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';
import { CAMPOS, fichasDoUsuario, nasceConfirmado, paraSaida } from './entries.service.js';
import { paraSaidaDaAgenda } from './agenda.service.js';
import { registrarPagamento } from './pagamentos.service.js';

/**
 * Todas as fichas que representam o participante.
 *
 * A ficha da minha agenda é uma; se ele também tem conta, as fichas que **outras** agendas
 * criaram para ele apontam para a mesma pessoa. Fechar contas olhando só a minha ficha
 * deixaria de fora a dívida que ele mesmo lançou no meu nome, e o acerto sairia errado
 * justamente no caso em que os dois lados usam o sistema.
 */
async function fichasDoParticipante(prisma: PrismaClient, participanteId: string, donoId: string) {
  const participante = await prisma.person.findFirst({
    where: { id: participanteId, ownerId: donoId },
    select: { id: true, name: true, userId: true },
  });

  if (!participante) {
    throw new ErroNaoEncontrado('Pessoa não encontrada');
  }

  if (!participante.userId) {
    return { participante, ids: [participante.id] };
  }

  const vinculadas = await prisma.person.findMany({
    where: { userId: participante.userId },
    select: { id: true },
  });

  return { participante, ids: vinculadas.map((ficha) => ficha.id) };
}

/** Primeiro instante do mês seguinte: o teto exclusivo do período. */
function fimDoMes(mes: string): Date {
  return new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1));
}

/**
 * O saldo em aberto com cada participante, do maior devedor ao maior credor.
 *
 * O fechamento já respondia isto para **uma** pessoa por vez, o que obriga a abrir uma
 * tela por participante para descobrir com quem as contas estão desacertadas — justamente
 * a pergunta que se faz primeiro.
 *
 * O recorte é o mesmo do fechamento: **até** o fim do mês, e não dentro dele. Uma conta de
 * junho que ninguém pagou continua devida em agosto, e ignorá-la mostraria saldo zero com
 * alguém que deve há três meses.
 */
export async function listarSaldos(prisma: PrismaClient, userId: string, mes: string) {
  const minhasFichas = await fichasDoUsuario(prisma, userId);

  const pessoas = await prisma.person.findMany({
    where: { ownerId: userId, id: { notIn: minhasFichas }, anonymizedAt: null },
    select: { id: true, name: true, userId: true },
    orderBy: { name: 'asc' },
  });

  if (pessoas.length === 0) return { mes, participantes: [] };

  // Uma consulta só, e o agrupamento em memória: uma por pessoa seria N consultas para
  // responder uma tela, e a lista de pessoas cresce.
  const obrigacoes = await prisma.obligation.findMany({
    where: {
      OR: [{ debtorId: { in: minhasFichas } }, { creditorId: { in: minhasFichas } }],
      status: { in: ['OPEN', 'PARTIAL'] },
      dueDate: { lt: fimDoMes(mes) },
    },
    select: CAMPOS,
  });

  // Da ficha para o participante. Quem tem conta aparece em várias agendas, e todas essas
  // fichas são a mesma pessoa — sem o mapa, a dívida que ele lançou no meu nome ficaria
  // fora do saldo, que é o caso em que os dois lados usam o sistema.
  const comConta = pessoas.filter((pessoa) => pessoa.userId !== null);
  const vinculadas = comConta.length
    ? await prisma.person.findMany({
        where: { userId: { in: comConta.map((pessoa) => pessoa.userId!) } },
        select: { id: true, userId: true },
      })
    : [];

  const participantePorFicha = new Map<string, string>();

  for (const pessoa of pessoas) participantePorFicha.set(pessoa.id, pessoa.id);

  for (const ficha of vinculadas) {
    const dono = comConta.find((pessoa) => pessoa.userId === ficha.userId);

    if (dono && !minhasFichas.includes(ficha.id)) participantePorFicha.set(ficha.id, dono.id);
  }

  const totais = new Map<string, { aReceber: number; aPagar: number; titulos: number }>();

  for (const obrigacao of obrigacoes) {
    const souCredor = obrigacao.creditorId !== null && minhasFichas.includes(obrigacao.creditorId);
    const outraPonta = souCredor ? obrigacao.debtorId : obrigacao.creditorId;
    const participanteId = outraPonta ? participantePorFicha.get(outraPonta) : undefined;

    // Contraparte nula é a instituição do cartão, não uma pessoa; ficha de fora da agenda
    // não é participante deste usuário.
    if (!participanteId) continue;

    const saida = paraSaida(obrigacao, minhasFichas);
    const restante = paraCentavos(saida.restante);

    if (restante <= 0) continue;

    const atual = totais.get(participanteId) ?? { aReceber: 0, aPagar: 0, titulos: 0 };

    if (souCredor) atual.aReceber += restante;
    else atual.aPagar += restante;

    atual.titulos += 1;
    totais.set(participanteId, atual);
  }

  const participantes = pessoas
    .map((pessoa) => {
      const total = totais.get(pessoa.id) ?? { aReceber: 0, aPagar: 0, titulos: 0 };

      return {
        id: pessoa.id,
        nome: pessoa.name,
        temConta: pessoa.userId !== null,
        aReceber: deCentavos(total.aReceber),
        aPagar: deCentavos(total.aPagar),
        saldo: deCentavos(total.aReceber - total.aPagar),
        titulos: total.titulos,
      };
    })
    // Do maior credor ao maior devedor: quem tem saldo zero é quem não exige nada, e vai
    // para o fim sem sumir — ele existe na agenda e a lista precisa dizer que está quite.
    .sort(
      (a, b) =>
        paraCentavos(b.saldo) - paraCentavos(a.saldo) || a.nome.localeCompare(b.nome, 'pt-BR'),
    );

  return { mes, participantes };
}

/**
 * O que há para acertar com um participante até o fim de um mês.
 *
 * O recorte é **até** o mês, e não dentro dele: uma conta de junho que ninguém pagou
 * continua devida em agosto, e um fechamento que a ignorasse produziria um acerto que não
 * acerta nada — a dívida velha seguiria pendurada, invisível, para sempre.
 */
export async function obterDadosFechamento(
  prisma: PrismaClient,
  userId: string,
  participanteId: string,
  mes: string,
) {
  const [{ participante, ids: idsDoParticipante }, minhasFichas, usuario] = await Promise.all([
    fichasDoParticipante(prisma, participanteId, userId),
    fichasDoUsuario(prisma, userId),
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { nextSettlementNumber: true },
    }),
  ]);

  const agenda = await prisma.settlementSchedule.findUnique({
    where: { personId: participanteId },
    select: { active: true, dayOfMonth: true, lastMonth: true },
  });

  const obrigacoes = await prisma.obligation.findMany({
    where: {
      // As duas pontas, nos dois sentidos. Sem isso o fechamento seria de um lado só.
      OR: [
        { debtorId: { in: idsDoParticipante }, creditorId: { in: minhasFichas } },
        { debtorId: { in: minhasFichas }, creditorId: { in: idsDoParticipante } },
      ],
      status: { in: ['OPEN', 'PARTIAL'] },
      dueDate: { lt: fimDoMes(mes) },
    },
    select: CAMPOS,
    orderBy: [{ dueDate: 'asc' }, { description: 'asc' }],
  });

  const lancamentos = obrigacoes.map((obrigacao) => paraSaida(obrigacao, minhasFichas));
  const aReceber = lancamentos.filter((item) => item.direcao === 'RECEIVABLE');
  const aPagar = lancamentos.filter((item) => item.direcao === 'PAYABLE');

  // O que conta é o **restante**, não o valor cheio: um título pago pela metade entra no
  // acerto pela metade que falta, senão o saldo cobraria duas vezes o que já foi pago.
  const totalAReceber = somarCentavos(aReceber.map((item) => paraCentavos(item.restante)));
  const totalAPagar = somarCentavos(aPagar.map((item) => paraCentavos(item.restante)));

  return {
    participante: {
      id: participante.id,
      nome: participante.name,
      temConta: participante.userId !== null,
    },
    mes,
    proximoNumero: usuario.nextSettlementNumber,
    aReceber,
    aPagar,
    totalAReceber: deCentavos(totalAReceber),
    totalAPagar: deCentavos(totalAPagar),
    saldo: deCentavos(totalAReceber - totalAPagar),
    agenda: paraSaidaDaAgenda(agenda),
  };
}

/**
 * Os fechamentos já feitos, do mais recente ao mais antigo.
 *
 * Os itens vêm da cópia gravada no dia, e não das obrigações: o título pode ter sido
 * editado depois, e o papel assinado precisa continuar batendo com o que foi assinado.
 */
export async function listarHistorico(
  prisma: PrismaClient,
  userId: string,
  participanteId?: string,
) {
  const fechamentos = await prisma.participantSettlement.findMany({
    where: { ownerId: userId, ...(participanteId ? { personId: participanteId } : {}) },
    select: {
      id: true,
      number: true,
      month: true,
      personId: true,
      person: { select: { name: true } },
      totalReceivable: true,
      totalPayable: true,
      balance: true,
      settledAt: true,
      adjustmentId: true,
      entries: { select: { description: true, amount: true, receivable: true } },
    },
    orderBy: { number: 'desc' },
  });

  return fechamentos.map((fechamento) => ({
    id: fechamento.id,
    numero: fechamento.number,
    mes: fechamento.month.trim(),
    participanteId: fechamento.personId,
    participante: fechamento.person.name,
    totalAReceber: fechamento.totalReceivable.toString(),
    totalAPagar: fechamento.totalPayable.toString(),
    saldo: fechamento.balance.toString(),
    fechadoEm: fechamento.settledAt,
    itens: fechamento.entries.map((item) => ({
      descricao: item.description,
      valor: item.amount.toString(),
      aReceber: item.receivable,
    })),
    acertoId: fechamento.adjustmentId,
  }));
}

/**
 * Quita em lote os títulos escolhidos e, se sobrar diferença, lança o acerto.
 *
 * Tudo em uma transação: um fechamento que baixasse metade dos títulos e falhasse no
 * acerto deixaria a conta em um estado que ninguém sabe desfazer — e o número do
 * fechamento já teria sido consumido.
 */
export async function quitarFechamento(
  prisma: PrismaClient,
  userId: string,
  participanteId: string,
  dados: QuitarFechamento,
) {
  const { ids: idsDoParticipante } = await fichasDoParticipante(prisma, participanteId, userId);
  const minhasFichas = await fichasDoUsuario(prisma, userId);

  const selecionados = await prisma.obligation.findMany({
    where: {
      id: { in: dados.lancamentosIds },
      OR: [
        { debtorId: { in: idsDoParticipante }, creditorId: { in: minhasFichas } },
        { debtorId: { in: minhasFichas }, creditorId: { in: idsDoParticipante } },
      ],
      status: { in: ['OPEN', 'PARTIAL'] },
    },
    select: CAMPOS,
  });

  // Recusar em vez de quitar o que deu para achar: um id que não é deste participante, ou
  // que já foi quitado noutra aba, muda o saldo — e o acerto sairia de um total que a
  // pessoa não viu na tela.
  if (selecionados.length !== dados.lancamentosIds.length) {
    throw new ErroDeRegra('Algum lançamento selecionado mudou. Recarregue o fechamento');
  }

  return prisma.$transaction(async (tx) => {
    // `increment` e não ler-somar-gravar: dois fechamentos simultâneos receberiam o mesmo
    // número, e dois papéis diferentes passariam a se chamar "fechamento nº 7".
    const { nextSettlementNumber } = await tx.user.update({
      where: { id: userId },
      data: { nextSettlementNumber: { increment: 1 } },
      select: { nextSettlementNumber: true },
    });

    const numero = nextSettlementNumber - 1;
    const observacao = observacaoDaQuitacao(numero, dados.mes);

    for (const obrigacao of selecionados) {
      const restante =
        paraCentavos(obrigacao.amount.toString()) -
        paraCentavos(obrigacao.settledAmount.toString());

      if (restante <= 0) continue;

      await registrarPagamento(tx, obrigacao.id, {
        valor: deCentavos(restante),
        pagoEm: dados.dataDaQuitacao,
        observacao,
        // A mesma regra da baixa avulsa: quitar uma dívida **minha** com quem tem conta
        // continua dependendo da palavra de quem recebe. O fechamento organiza o acerto,
        // não dá ao devedor um atalho para dar a própria dívida por paga.
        confirmed: nasceConfirmado(obrigacao, userId),
      });
    }

    // Os valores do dia, para o registro. Calculados uma vez só e reaproveitados no acerto:
    // recalcular no meio da transação abriria espaço para os dois números divergirem.
    const itens = selecionados.map((obrigacao) => ({
      obligationId: obrigacao.id,
      description: obrigacao.description,
      amount: deCentavos(
        paraCentavos(obrigacao.amount.toString()) -
          paraCentavos(obrigacao.settledAmount.toString()),
      ),
      receivable: obrigacao.creditorId !== null && minhasFichas.includes(obrigacao.creditorId),
    }));

    const totalAReceber = somarCentavos(
      itens.filter((item) => item.receivable).map((item) => paraCentavos(item.amount)),
    );
    const totalAPagar = somarCentavos(
      itens.filter((item) => !item.receivable).map((item) => paraCentavos(item.amount)),
    );
    const saldo = totalAReceber - totalAPagar;

    let acertoId: string | null = null;

    if (dados.novoTitulo) {
      if (saldo !== 0) {
        const minhaFicha = await tx.person.findFirstOrThrow({
          where: { userId, ownerId: userId },
          select: { id: true },
        });

        // O saldo positivo vira um a receber do participante; o negativo, um a pagar meu.
        // O valor é sempre absoluto: quem é devedor e quem é credor está nos dois campos,
        // e um valor negativo faria a mesma informação existir em dois lugares.
        const acerto = await tx.obligation.create({
          data: {
            ...(saldo > 0
              ? { creditorId: minhaFicha.id, debtorId: participanteId }
              : { debtorId: minhaFicha.id, creditorId: participanteId }),
            description: dados.novoTitulo.descricao || descricaoDoAcerto(numero, dados.mes),
            amount: deCentavos(Math.abs(saldo)),
            dueDate: dados.novoTitulo.vencimento,
            paymentMethod: dados.novoTitulo.formaDePagamento,
            originType: 'MANUAL',
          },
          select: { id: true },
        });

        acertoId = acerto.id;
      }
    }

    // O registro do fechamento, com os títulos como estavam hoje. As descrições e os
    // valores são cópias de propósito: o título pode ser editado depois, e o papel
    // assinado precisa continuar batendo com o que foi assinado.
    await tx.participantSettlement.create({
      data: {
        ownerId: userId,
        personId: participanteId,
        number: numero,
        month: dados.mes,
        totalReceivable: deCentavos(totalAReceber),
        totalPayable: deCentavos(totalAPagar),
        balance: deCentavos(saldo),
        adjustmentId: acertoId,
        settledAt: dados.dataDaQuitacao,
        entries: { createMany: { data: itens } },
      },
    });

    // A agenda avança para o mês fechado, e para de cobrar este acerto. `updateMany` para
    // não falhar quando não há agenda: a maioria dos fechamentos é avulsa.
    await tx.settlementSchedule.updateMany({
      where: { personId: participanteId, ownerId: userId },
      data: { lastMonth: dados.mes },
    });

    return { numero, quitados: selecionados.length, acertoId };
  });
}
