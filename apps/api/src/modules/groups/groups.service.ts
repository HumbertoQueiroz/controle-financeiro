import type { Prisma, PrismaClient } from '@prisma/client';
import type { CriarDespesa, CriarEvento, CriarGrupo } from '@controle/shared';
import { deCentavos, dividirEmPartesIguais, paraCentavos, somarCentavos } from '@controle/shared';
import { ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';

type Transacao = Prisma.TransactionClient;

export async function carregarGrupoDoDono(prisma: PrismaClient, grupoId: string, donoId: string) {
  const grupo = await prisma.group.findFirst({
    where: { id: grupoId, ownerUserId: donoId },
    select: { id: true, name: true },
  });

  if (!grupo) {
    throw new ErroNaoEncontrado('Grupo não encontrado');
  }

  return grupo;
}

export async function listar(prisma: PrismaClient, donoId: string) {
  const grupos = await prisma.group.findMany({
    where: { ownerUserId: donoId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, _count: { select: { members: true } } },
  });

  return grupos.map((grupo) => ({
    id: grupo.id,
    nome: grupo.name,
    quantidadeDeMembros: grupo._count.members,
  }));
}

/**
 * Cria o grupo já com o dono dentro.
 *
 * Quem cria participa: um grupo sem o criador levaria a despesa dele a não entrar no
 * rateio, e o saldo do rolê fecharia errado logo na primeira conta.
 */
export async function criar(prisma: PrismaClient, donoId: string, dados: CriarGrupo) {
  const propria = await prisma.person.findFirstOrThrow({
    where: { userId: donoId, ownerId: donoId },
    select: { id: true },
  });

  const grupo = await prisma.group.create({
    data: {
      name: dados.nome,
      ownerUserId: donoId,
      members: { create: { personId: propria.id } },
    },
    select: { id: true, name: true, _count: { select: { members: true } } },
  });

  return { id: grupo.id, nome: grupo.name, quantidadeDeMembros: grupo._count.members };
}

export async function listarMembros(prisma: PrismaClient, grupoId: string, donoId: string) {
  await carregarGrupoDoDono(prisma, grupoId, donoId);

  const membros = await prisma.groupMember.findMany({
    where: { groupId: grupoId },
    select: { person: { select: { id: true, name: true, userId: true } } },
    orderBy: { person: { name: 'asc' } },
  });

  return membros.map((membro) => ({
    pessoaId: membro.person.id,
    nome: membro.person.name,
    usuarioId: membro.person.userId,
  }));
}

export async function adicionarMembro(
  prisma: PrismaClient,
  grupoId: string,
  donoId: string,
  pessoaId: string,
) {
  await carregarGrupoDoDono(prisma, grupoId, donoId);

  const pessoa = await prisma.person.findFirst({
    where: { id: pessoaId, ownerId: donoId },
    select: { id: true },
  });

  if (!pessoa) {
    throw new ErroNaoEncontrado('Pessoa não encontrada');
  }

  await prisma.groupMember.upsert({
    where: { groupId_personId: { groupId: grupoId, personId: pessoaId } },
    create: { groupId: grupoId, personId: pessoaId },
    update: {},
  });

  return listarMembros(prisma, grupoId, donoId);
}

export async function removerMembro(
  prisma: PrismaClient,
  grupoId: string,
  donoId: string,
  pessoaId: string,
) {
  await carregarGrupoDoDono(prisma, grupoId, donoId);

  const temDespesa = await prisma.expenseShare.count({
    where: { personId: pessoaId, expense: { event: { groupId: grupoId } } },
  });

  // Remover quem já participou de despesa apagaria a cota dela por cascata e o saldo de
  // todo mundo mudaria retroativamente, sem ninguém ter pago nada.
  if (temDespesa > 0) {
    throw new ErroDeRegra('Esta pessoa já participou de despesas do grupo e não pode ser removida');
  }

  await prisma.groupMember.deleteMany({ where: { groupId: grupoId, personId: pessoaId } });

  return listarMembros(prisma, grupoId, donoId);
}

export async function listarEventos(prisma: PrismaClient, grupoId: string, donoId: string) {
  await carregarGrupoDoDono(prisma, grupoId, donoId);

  const eventos = await prisma.groupEvent.findMany({
    where: { groupId: grupoId },
    orderBy: { date: 'desc' },
    select: { id: true, name: true, date: true, expenses: { select: { amount: true } } },
  });

  return eventos.map((evento) => ({
    id: evento.id,
    nome: evento.name,
    data: evento.date,
    total: deCentavos(
      somarCentavos(evento.expenses.map((despesa) => paraCentavos(despesa.amount.toString()))),
    ),
  }));
}

export async function criarEvento(
  prisma: PrismaClient,
  grupoId: string,
  donoId: string,
  dados: CriarEvento,
) {
  await carregarGrupoDoDono(prisma, grupoId, donoId);

  const evento = await prisma.groupEvent.create({
    data: { groupId: grupoId, name: dados.nome, date: dados.data },
  });

  return { id: evento.id, nome: evento.name, data: evento.date, total: '0.00' };
}

async function carregarEventoDoDono(prisma: PrismaClient, eventoId: string, donoId: string) {
  const evento = await prisma.groupEvent.findFirst({
    where: { id: eventoId, group: { ownerUserId: donoId } },
    select: { id: true, date: true, groupId: true },
  });

  if (!evento) {
    throw new ErroNaoEncontrado('Rolê não encontrado');
  }

  return evento;
}

/**
 * Membros do grupo a que o rolê pertence.
 *
 * A tela de despesas precisa saber entre quem dividir, e chegar nela pela URL do rolê não
 * dá acesso ao id do grupo — pedir que a interface guarde esse vínculo faria a página
 * quebrar em recarregamento ou link compartilhado.
 */
export async function listarMembrosDoEvento(
  prisma: PrismaClient,
  eventoId: string,
  donoId: string,
) {
  const evento = await carregarEventoDoDono(prisma, eventoId, donoId);

  return listarMembros(prisma, evento.groupId, donoId);
}

/**
 * Calcula as cotas da despesa, em centavos.
 *
 * Com cotas explícitas, a soma tem de bater **exatamente** com o valor. Aceitar diferença
 * faria o rateio distribuir um total diferente do que foi gasto, e o erro só apareceria no
 * fechamento, como um saldo que não zera.
 */
function calcularCotas(
  totalEmCentavos: number,
  participantes: string[],
  cotas: Record<string, string> | undefined,
): Map<string, number> {
  if (cotas) {
    const resultado = new Map(
      Object.entries(cotas).map(([pessoaId, valor]) => [pessoaId, paraCentavos(valor)]),
    );

    const soma = somarCentavos([...resultado.values()]);

    if (soma !== totalEmCentavos) {
      throw new ErroDeRegra(
        `A soma das cotas (${deCentavos(soma)}) não bate com o valor da despesa (${deCentavos(totalEmCentavos)})`,
      );
    }

    return resultado;
  }

  const partes = dividirEmPartesIguais(totalEmCentavos, participantes.length);

  return new Map(participantes.map((pessoaId, indice) => [pessoaId, partes[indice]!]));
}

/**
 * Registra a despesa e gera as obrigações do rateio.
 *
 * Cada participante que não pagou passa a dever a sua cota a quem pagou. A cota de quem
 * pagou não vira obrigação: ninguém deve a si mesmo, e o banco recusaria a linha.
 */
export async function criarDespesa(
  prisma: PrismaClient,
  eventoId: string,
  donoId: string,
  dados: CriarDespesa,
) {
  const evento = await carregarEventoDoDono(prisma, eventoId, donoId);

  // A ordem importa e não pode vir do banco: `dividirEmPartesIguais` dá o centavo que
  // sobra ao **primeiro** participante, e sem `orderBy` o Postgres devolve as linhas na
  // ordem que quiser. O mesmo rateio, repetido, cobrava o centavo de outra pessoa — e o
  // erro só apareceria no fechamento, como um saldo que ninguém consegue explicar.
  const membros = await prisma.groupMember.findMany({
    where: { groupId: evento.groupId },
    select: { personId: true },
    orderBy: { person: { name: 'asc' } },
  });
  const idsDosMembros = new Set(membros.map((membro) => membro.personId));

  if (!idsDosMembros.has(dados.pagantePessoaId)) {
    throw new ErroDeRegra('Quem pagou precisa ser membro do grupo');
  }

  const participantes = dados.participantes.length > 0 ? dados.participantes : [...idsDosMembros];

  const foraDoGrupo = participantes.find((pessoaId) => !idsDosMembros.has(pessoaId));

  if (foraDoGrupo) {
    throw new ErroDeRegra('Todos os participantes precisam ser membros do grupo');
  }

  const totalEmCentavos = paraCentavos(dados.valor);
  const cotas = calcularCotas(totalEmCentavos, participantes, dados.cotas);

  const foraDoGrupoNasCotas = [...cotas.keys()].find((pessoaId) => !idsDosMembros.has(pessoaId));

  if (foraDoGrupoNasCotas) {
    throw new ErroDeRegra('Todos os participantes precisam ser membros do grupo');
  }

  return prisma.$transaction(async (tx) => {
    const despesa = await tx.groupExpense.create({
      data: {
        eventId: eventoId,
        payerPersonId: dados.pagantePessoaId,
        description: dados.descricao,
        amount: dados.valor,
        paymentMethod: dados.formaDePagamento,
      },
    });

    for (const [pessoaId, centavos] of cotas) {
      const cota = await tx.expenseShare.create({
        data: { expenseId: despesa.id, personId: pessoaId, amount: deCentavos(centavos) },
      });

      if (pessoaId === dados.pagantePessoaId || centavos === 0) {
        continue;
      }

      await tx.obligation.create({
        data: {
          debtorId: pessoaId,
          creditorId: dados.pagantePessoaId,
          description: dados.descricao,
          amount: deCentavos(centavos),
          dueDate: evento.date,
          paymentMethod: dados.formaDePagamento,
          originType: 'GROUP_EXPENSE',
          // A cota, e não a despesa: cada obrigação fica rastreável até a linha exata que
          // a originou, o que importa quando só uma delas é acertada.
          originId: cota.id,
        },
      });
    }

    return carregarDespesa(tx, despesa.id);
  });
}

async function carregarDespesa(tx: Transacao, despesaId: string) {
  const despesa = await tx.groupExpense.findUniqueOrThrow({
    where: { id: despesaId },
    select: {
      id: true,
      description: true,
      amount: true,
      paymentMethod: true,
      payerPersonId: true,
      payer: { select: { name: true } },
      shares: { select: { personId: true, amount: true, person: { select: { name: true } } } },
    },
  });

  return {
    id: despesa.id,
    descricao: despesa.description,
    valor: despesa.amount.toString(),
    formaDePagamento: despesa.paymentMethod,
    pagantePessoaId: despesa.payerPersonId,
    pagante: despesa.payer.name,
    cotas: despesa.shares.map((cota) => ({
      pessoaId: cota.personId,
      nome: cota.person.name,
      valor: cota.amount.toString(),
    })),
  };
}

export async function listarDespesas(prisma: PrismaClient, eventoId: string, donoId: string) {
  await carregarEventoDoDono(prisma, eventoId, donoId);

  const despesas = await prisma.groupExpense.findMany({
    where: { eventId: eventoId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  return Promise.all(despesas.map((despesa) => carregarDespesa(prisma, despesa.id)));
}

/**
 * Apaga a despesa e as obrigações que ela gerou.
 *
 * Só é permitido enquanto nenhuma das obrigações foi acertada: apagar depois sumiria com o
 * registro de um dinheiro que já trocou de mãos.
 */
export async function excluirDespesa(prisma: PrismaClient, despesaId: string, donoId: string) {
  const despesa = await prisma.groupExpense.findFirst({
    where: { id: despesaId, event: { group: { ownerUserId: donoId } } },
    select: { id: true, shares: { select: { id: true } } },
  });

  if (!despesa) {
    throw new ErroNaoEncontrado('Despesa não encontrada');
  }

  const idsDasCotas = despesa.shares.map((cota) => cota.id);

  const jaAcertada = await prisma.obligation.count({
    where: {
      originType: 'GROUP_EXPENSE',
      originId: { in: idsDasCotas },
      OR: [{ status: 'SETTLED' }, { settledAmount: { gt: 0 } }],
    },
  });

  if (jaAcertada > 0) {
    throw new ErroDeRegra('Esta despesa já foi acertada e não pode ser excluída');
  }

  await prisma.$transaction(async (tx) => {
    await tx.obligation.deleteMany({
      where: { originType: 'GROUP_EXPENSE', originId: { in: idsDasCotas } },
    });
    await tx.groupExpense.delete({ where: { id: despesaId } });
  });

  return { ok: true };
}
