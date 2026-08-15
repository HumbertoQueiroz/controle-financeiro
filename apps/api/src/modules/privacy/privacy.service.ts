import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ErroDeRegra } from '../../lib/erros.js';

/**
 * Exportação dos dados do titular (LGPD, direito de acesso e portabilidade).
 *
 * Devolve o que é da pessoa, não o que apenas a menciona: as obrigações em que ela é parte
 * entram, mas os dados de contato de terceiros que o outro lado cadastrou não — exportar
 * a agenda alheia junto seria vazar dado de quem não pediu nada.
 */
export async function exportarDados(prisma: PrismaClient, userId: string) {
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      // Todas as fichas que apontam para esta conta: a própria e as que outras pessoas
      // criaram na agenda delas. Exportar só a própria esconderia do titular metade dos
      // registros que existem sobre ele.
      pessoasVinculadas: {
        select: { id: true, name: true, email: true, phone: true, ownerId: true },
      },
      termsAcceptances: {
        select: { documentType: true, version: true, acceptedAt: true, ipAddress: true },
      },
      cards: {
        select: { name: true, brand: true, lastFour: true, closingDay: true, dueDay: true },
      },
      grantsGiven: {
        select: {
          scope: true,
          createdAt: true,
          revokedAt: true,
          grantee: { select: { email: true } },
        },
      },
      grantsReceived: {
        select: {
          scope: true,
          createdAt: true,
          revokedAt: true,
          owner: { select: { email: true } },
        },
      },
    },
  });

  const idsDasFichas = usuario.pessoasVinculadas.map((pessoa) => pessoa.id);
  const propria = usuario.pessoasVinculadas.find((pessoa) => pessoa.ownerId === userId);

  const obrigacoes = idsDasFichas.length
    ? await prisma.obligation.findMany({
        where: {
          OR: [{ debtorId: { in: idsDasFichas } }, { creditorId: { in: idsDasFichas } }],
        },
        select: {
          description: true,
          amount: true,
          settledAmount: true,
          dueDate: true,
          status: true,
          paymentMethod: true,
          originType: true,
          debtorId: true,
          creditorId: true,
        },
      })
    : [];

  return {
    geradoEm: new Date(),
    usuario: {
      nome: usuario.name,
      email: usuario.email,
      papel: usuario.role,
      criadoEm: usuario.createdAt,
    },
    pessoa: propria ?? null,
    fichasEmAgendasAlheias: usuario.pessoasVinculadas.filter((p) => p.ownerId !== userId).length,
    aceitesDeTermos: usuario.termsAcceptances,
    cartoes: usuario.cards,
    compartilhamentosConcedidos: usuario.grantsGiven,
    compartilhamentosRecebidos: usuario.grantsReceived,
    obrigacoes: obrigacoes.map((obrigacao) => ({
      ...obrigacao,
      amount: obrigacao.amount.toString(),
      settledAmount: obrigacao.settledAmount.toString(),
      papel: idsDasFichas.includes(obrigacao.debtorId) ? 'DEVEDOR' : 'CREDOR',
      debtorId: undefined,
      creditorId: undefined,
    })),
  };
}

/**
 * Exclusão de conta por anonimização, não por DELETE físico.
 *
 * Apagar a linha quebraria o saldo de outras pessoas: as obrigações do grupo referenciam
 * esta Person, e sumir com ela falsifica o fechamento de quem ficou — alguém que devia
 * R$ 200 simplesmente deixaria de dever, sem ninguém ter pago. A anonimização remove o que
 * identifica a pessoa e preserva os valores, que são dado de terceiros tanto quanto dela.
 *
 * Está documentado em Docs/lgpd.md porque é uma decisão que será questionada.
 */
export async function anonimizarConta(prisma: PrismaClient, userId: string) {
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { role: true, anonymizedAt: true },
  });

  if (usuario.anonymizedAt) {
    throw new ErroDeRegra('Esta conta já foi excluída');
  }

  if (usuario.role === 'ADMIN') {
    // O admin é o único caminho de volta para qualquer coisa. Excluí-lo por autoatendimento
    // pode deixar o sistema sem administrador e sem forma de recuperar.
    throw new ErroDeRegra(
      'Uma conta de administrador não pode ser excluída por aqui. Transfira a administração antes.',
    );
  }

  const agora = new Date();
  // Sufixo único: o e-mail continua com unique, e vários "excluido@..." colidiriam entre si.
  const marcador = `excluido+${randomUUID()}@anonimizado.local`;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name: 'Usuário excluído',
        email: marcador,
        // Hash inválido de propósito: nenhuma senha gera este valor, então nenhuma senha
        // autentica esta conta, mesmo que alguém reative o registro por engano.
        passwordHash: 'CONTA_ANONIMIZADA',
        active: false,
        anonymizedAt: agora,
      },
    });

    // A ficha espelho — a que o próprio usuário possui — é anonimizada.
    await tx.person.updateMany({
      where: { userId, ownerId: userId },
      data: { name: 'Usuário excluído', email: null, phone: null, anonymizedAt: agora },
    });

    // As fichas em agendas alheias apenas perdem o vínculo com a conta. Elas são o
    // registro que aquele outro dono fez, sob a responsabilidade dele, e apagá-las
    // deixaria alguém com um devedor anônimo sem saber de quem cobrar. O que a exclusão
    // garante é que esta conta não é mais alcançada por elas.
    await tx.person.updateMany({
      where: { userId, ownerId: { not: userId } },
      data: { userId: null },
    });

    // Consentimento morre com a conta: quem tinha acesso ao relatório dela perde agora,
    // e os convites que ela enviou não podem mais ser aceitos.
    await tx.reportGrant.updateMany({
      where: { OR: [{ ownerId: userId }, { granteeUserId: userId }], revokedAt: null },
      data: { revokedAt: agora },
    });

    await tx.reportInvite.updateMany({
      where: { ownerId: userId, status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt: agora },
    });
  });
}
