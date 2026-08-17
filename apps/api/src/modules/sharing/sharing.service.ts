import type { GrantScope, Prisma, PrismaClient } from '@prisma/client';
import type { AceitarConvite, Compartilhar, ResultadoDoCompartilhamento } from '@controle/shared';
import { normalizarEmail } from '../../lib/email.js';
import { hashPassword } from '../../lib/hash.js';
import {
  calcularExpiracao,
  gerarToken,
  hashDoToken,
  urlDoConvite,
  urlDoWhatsApp,
} from '../../lib/convite.js';
import { registrarAceite, type DadosDaRequisicao } from '../auth/auth.service.js';
import { ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';

/**
 * Compartilha o relatório com alguém, resolvendo os dois casos numa chamada.
 *
 * Quem já tem conta recebe o acesso na hora. Quem não tem gera um convite, e o link volta
 * na resposta para a interface copiar e oferecer o envio pelo WhatsApp. O sistema não
 * envia nada por conta própria: quem entrega o link é o dono, pelo canal que ele já usa.
 */
export async function compartilhar(
  prisma: PrismaClient,
  donoId: string,
  dados: Compartilhar,
): Promise<ResultadoDoCompartilhamento> {
  const email = normalizarEmail(dados.email);

  const dono = await prisma.user.findUniqueOrThrow({
    where: { id: donoId },
    select: { name: true, email: true },
  });

  if (email === normalizarEmail(dono.email)) {
    throw new ErroDeRegra('Você já vê o seu próprio relatório');
  }

  const convidado = await prisma.user.findUnique({
    where: { email },
    select: { id: true, active: true, anonymizedAt: true },
  });

  if (convidado && convidado.active && !convidado.anonymizedAt) {
    // Uma linha por par (dono, convidado): conceder de novo reativa a mesma linha em vez
    // de empilhar históricos, porque ambiguidade na consulta de permissão vira vazamento.
    await prisma.reportGrant.upsert({
      where: { ownerId_granteeUserId: { ownerId: donoId, granteeUserId: convidado.id } },
      create: { ownerId: donoId, granteeUserId: convidado.id, scope: dados.escopo },
      update: { scope: dados.escopo, revokedAt: null, expiresAt: null },
    });

    return { status: 'GRANT_CREATED', escopo: dados.escopo, email };
  }

  return criarConvite(prisma, donoId, dados, dono.name);
}

/**
 * Cria (ou reemite) o convite.
 *
 * Reemitir em vez de acumular: dois cliques no botão criariam dois convites válidos, e
 * revogar um deixaria o outro de pé — o dono acharia que tirou o acesso. O token novo
 * invalida o anterior, que é o comportamento que as pessoas esperam de "reenviar".
 */
export async function criarConvite(
  prisma: PrismaClient,
  donoId: string,
  dados: Compartilhar,
  nomeDeQuemConvida?: string,
): Promise<ResultadoDoCompartilhamento> {
  const email = normalizarEmail(dados.email);

  const nome =
    nomeDeQuemConvida ??
    (await prisma.user.findUniqueOrThrow({ where: { id: donoId }, select: { name: true } })).name;

  if (dados.pessoaId) {
    const pessoa = await prisma.person.findFirst({
      where: { id: dados.pessoaId, ownerId: donoId },
      select: { id: true },
    });

    if (!pessoa) {
      throw new ErroNaoEncontrado('Pessoa não encontrada');
    }
  }

  const token = gerarToken();
  const expiraEm = calcularExpiracao();

  const pendente = await prisma.reportInvite.findFirst({
    where: { ownerId: donoId, email, status: 'PENDING' },
    select: { id: true },
  });

  const convite = pendente
    ? await prisma.reportInvite.update({
        where: { id: pendente.id },
        data: {
          scope: dados.escopo,
          phone: dados.telefone || null,
          personId: dados.pessoaId ?? null,
          tokenHash: hashDoToken(token),
          expiresAt: expiraEm,
        },
        select: { id: true },
      })
    : await prisma.reportInvite.create({
        data: {
          ownerId: donoId,
          email,
          phone: dados.telefone || null,
          personId: dados.pessoaId ?? null,
          scope: dados.escopo,
          tokenHash: hashDoToken(token),
          expiresAt: expiraEm,
        },
        select: { id: true },
      });

  return {
    status: 'INVITE_CREATED',
    escopo: dados.escopo,
    email,
    conviteId: convite.id,
    // O token em claro existe só aqui, nesta resposta. Depois disso só há o hash.
    urlDoConvite: urlDoConvite(token),
    urlDoWhatsApp: urlDoWhatsApp(token, { telefone: dados.telefone, nomeDeQuemConvida: nome }),
    expiraEm,
  };
}

/**
 * Concedidos e pendentes numa lista só.
 *
 * Convite pendente é acesso futuro: escondê-lo faria o dono acreditar que compartilhou com
 * menos gente do que compartilhou.
 */
export async function listar(prisma: PrismaClient, donoId: string) {
  const [grants, convites] = await Promise.all([
    prisma.reportGrant.findMany({
      where: { ownerId: donoId, revokedAt: null },
      select: {
        id: true,
        scope: true,
        createdAt: true,
        expiresAt: true,
        grantee: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.reportInvite.findMany({
      where: { ownerId: donoId, status: 'PENDING' },
      select: { id: true, email: true, scope: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return [
    ...grants.map((grant) => ({
      id: grant.id,
      tipo: 'GRANT' as const,
      email: grant.grantee.email,
      nome: grant.grantee.name,
      escopo: grant.scope,
      criadoEm: grant.createdAt,
      expiraEm: grant.expiresAt,
    })),
    ...convites.map((convite) => ({
      id: convite.id,
      tipo: 'CONVITE' as const,
      email: convite.email,
      nome: null,
      escopo: convite.scope,
      criadoEm: convite.createdAt,
      expiraEm: convite.expiresAt,
    })),
  ];
}

export async function revogarGrant(prisma: PrismaClient, id: string, donoId: string) {
  const { count } = await prisma.reportGrant.updateMany({
    where: { id, ownerId: donoId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count === 0) {
    throw new ErroNaoEncontrado('Compartilhamento não encontrado');
  }
}

export async function revogarConvite(prisma: PrismaClient, id: string, donoId: string) {
  const { count } = await prisma.reportInvite.updateMany({
    where: { id, ownerId: donoId, status: 'PENDING' },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });

  if (count === 0) {
    throw new ErroNaoEncontrado('Convite não encontrado');
  }
}

/** Carrega o convite pelo token, recusando o que não está mais válido. */
async function carregarConvitePendente(prisma: PrismaClient, token: string) {
  const convite = await prisma.reportInvite.findUnique({
    where: { tokenHash: hashDoToken(token) },
    select: {
      id: true,
      email: true,
      scope: true,
      status: true,
      expiresAt: true,
      personId: true,
      ownerId: true,
      owner: { select: { name: true } },
    },
  });

  // Mesma mensagem para inexistente, já aceito, revogado e expirado: distinguir permitiria
  // sondar tokens e descobrir quais já foram usados.
  if (!convite || convite.status !== 'PENDING' || convite.expiresAt <= new Date()) {
    throw new ErroNaoEncontrado('Convite inválido ou expirado');
  }

  return convite;
}

export async function verConvite(prisma: PrismaClient, token: string) {
  const convite = await carregarConvitePendente(prisma, token);

  const conta = await prisma.user.findUnique({
    where: { email: convite.email },
    select: { id: true },
  });

  return {
    email: convite.email,
    escopo: convite.scope,
    convidadoPor: convite.owner.name,
    expiraEm: convite.expiresAt,
    jaTemConta: Boolean(conta),
  };
}

export interface ConviteAceito {
  usuarioId: string;
  papel: 'ADMIN' | 'USER';
  escopo: GrantScope;
}

/**
 * Aceita o convite: cria a conta (se preciso) e o consentimento, na mesma transação.
 *
 * É isso que entrega "a permissão já embutida no convite" — o convidado nunca vive um
 * instante cadastrado-mas-sem-acesso, e o dono não precisa voltar para conceder de novo.
 */
/**
 * Põe quem convidou na agenda de quem aceitou.
 *
 * O convite já é a relação: alguém compartilhou as próprias contas com esta pessoa, e a
 * primeira coisa que ela vai querer fazer é lançar algo com essa mesma pessoa. Sem isto, a
 * agenda do convidado nasce vazia e ele precisa cadastrar à mão alguém que o sistema já
 * conhece — e o cadastro à mão nasce **sem** `userId`, isto é, sem ligação com a conta real.
 *
 * A ficha aponta para a conta de quem convidou (`userId`), e é isso que faz o fechamento
 * entre os dois enxergar as duas pontas da mesma dívida.
 */
async function registrarQuemConvidou(
  tx: Prisma.TransactionClient,
  quemConvidouId: string,
  convidadoId: string,
) {
  const jaExiste = await tx.person.findFirst({
    where: { ownerId: convidadoId, userId: quemConvidouId },
    select: { id: true },
  });

  // Reaceitar um convite, ou aceitar um segundo do mesmo dono, não pode duplicar a ficha.
  if (jaExiste) return;

  const quemConvidou = await tx.user.findUnique({
    where: { id: quemConvidouId },
    select: { name: true, email: true },
  });

  if (!quemConvidou) return;

  await tx.person.create({
    data: {
      name: quemConvidou.name,
      email: quemConvidou.email,
      ownerId: convidadoId,
      userId: quemConvidouId,
    },
  });
}

export async function aceitarConvite(
  prisma: PrismaClient,
  token: string,
  dados: AceitarConvite,
  requisicao: DadosDaRequisicao,
): Promise<ConviteAceito> {
  const convite = await carregarConvitePendente(prisma, token);

  const contaExistente = await prisma.user.findUnique({
    where: { email: convite.email },
    select: { id: true, role: true, active: true, anonymizedAt: true },
  });

  if (contaExistente && (!contaExistente.active || contaExistente.anonymizedAt)) {
    throw new ErroDeRegra('A conta deste e-mail está inativa');
  }

  // A senha é gerada fora da transação: hashPassword com custo 12 leva ~250ms, e segurar
  // uma transação aberta por esse tempo prende conexão e linha por nada.
  const passwordHash = contaExistente ? null : await hashPassword(dados.senha);

  return prisma.$transaction(async (tx) => {
    // Consumo condicionado ao estado PENDENTE, dentro da transação. Verificar antes e
    // gravar depois tem race: dois aceites simultâneos do mesmo link passariam pelos dois
    // `if` e o convite serviria duas vezes.
    const consumo = await tx.reportInvite.updateMany({
      where: { id: convite.id, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    if (consumo.count === 0) {
      throw new ErroNaoEncontrado('Convite inválido ou expirado');
    }

    let usuarioId = contaExistente?.id;
    let papel: 'ADMIN' | 'USER' = contaExistente?.role ?? 'USER';

    if (!usuarioId) {
      const criado = await tx.user.create({
        // O e-mail vem do convite, nunca do formulário: aceitar outro e-mail transformaria
        // um link encaminhado no WhatsApp em acesso transferível a dado financeiro.
        data: { name: dados.nome, email: convite.email, passwordHash: passwordHash!, role: 'USER' },
      });

      usuarioId = criado.id;
      papel = 'USER';

      await tx.person.create({
        data: {
          name: dados.nome,
          email: convite.email,
          ownerId: criado.id,
          userId: criado.id,
        },
      });
    }

    await registrarAceite(tx, usuarioId, requisicao);

    // A Person que o dono indicou passa a apontar para a conta nova: é assim que o
    // convidado enxerga as dívidas lançadas em nome dele antes de ele ter conta.
    if (convite.personId) {
      await tx.person.updateMany({
        where: { id: convite.personId, ownerId: convite.ownerId, userId: null },
        data: { userId: usuarioId },
      });
    }

    await tx.reportInvite.update({
      where: { id: convite.id },
      data: { acceptedByUserId: usuarioId },
    });

    await tx.reportGrant.upsert({
      where: { ownerId_granteeUserId: { ownerId: convite.ownerId, granteeUserId: usuarioId } },
      create: { ownerId: convite.ownerId, granteeUserId: usuarioId, scope: convite.scope },
      update: { scope: convite.scope, revokedAt: null, expiresAt: null },
    });

    await registrarQuemConvidou(tx, convite.ownerId, usuarioId);

    return { usuarioId, papel, escopo: convite.scope };
  });
}
