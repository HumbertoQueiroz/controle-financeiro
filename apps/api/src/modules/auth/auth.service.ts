import type { PrismaClient, Role } from '@prisma/client';
import type { Cadastro, Credenciais, TrocaDeSenha } from '@controle/shared';
import { hashPassword, verifyPassword } from '../../lib/hash.js';
import { normalizarEmail } from '../../lib/email.js';
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS } from '../../lib/legal.js';
import { ErroDeAutenticacao, ErroDeConflito, ErroDeRegra } from '../../lib/erros.js';

export interface DadosDaRequisicao {
  ip?: string;
  userAgent?: string;
}

export interface UsuarioDaSessao {
  id: string;
  nome: string;
  email: string;
  papel: Role;
  precisaTrocarSenha: boolean;
  precisaAceitarTermos: boolean;
}

/**
 * Uma pessoa precisa reaceitar quando o documento vigente mudou de versão desde o último
 * aceite dela. É a regra que faz a versão em `legal.ts` ter efeito: subir o número lá é o
 * que dispara o pedido de aceite no próximo login.
 */
export async function precisaAceitarTermos(prisma: PrismaClient, userId: string) {
  const aceites = await prisma.termsAcceptance.findMany({
    where: {
      userId,
      OR: [
        { documentType: 'TERMS', version: VERSAO_TERMOS },
        { documentType: 'PRIVACY', version: VERSAO_PRIVACIDADE },
      ],
    },
    select: { documentType: true },
  });

  return aceites.length < 2;
}

async function montarSessao(prisma: PrismaClient, userId: string): Promise<UsuarioDaSessao> {
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, mustChangePassword: true },
  });

  return {
    id: usuario.id,
    nome: usuario.name,
    email: usuario.email,
    papel: usuario.role,
    precisaTrocarSenha: usuario.mustChangePassword,
    precisaAceitarTermos: await precisaAceitarTermos(prisma, usuario.id),
  };
}

export async function autenticar(
  prisma: PrismaClient,
  credenciais: Credenciais,
): Promise<UsuarioDaSessao> {
  const email = normalizarEmail(credenciais.email);

  const usuario = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, active: true, anonymizedAt: true },
  });

  // O compare roda mesmo sem usuário (verifyPassword trata hash nulo). Sair antes daria
  // uma resposta rápida demais para e-mail inexistente, e o tempo revelaria quem tem conta.
  const senhaConfere = await verifyPassword(credenciais.senha, usuario?.passwordHash ?? null);

  // Mensagem única para os três casos — não existe, está inativo, senha errada. Distinguir
  // transformaria a tela de login num verificador de cadastro.
  if (!usuario || !senhaConfere || !usuario.active || usuario.anonymizedAt) {
    throw new ErroDeAutenticacao('E-mail ou senha inválidos');
  }

  return montarSessao(prisma, usuario.id);
}

export async function cadastrar(
  prisma: PrismaClient,
  dados: Cadastro,
  requisicao: DadosDaRequisicao,
): Promise<UsuarioDaSessao> {
  const email = normalizarEmail(dados.email);

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new ErroDeConflito('Já existe uma conta com este e-mail');
  }

  const passwordHash = await hashPassword(dados.senha);

  const usuario = await prisma.$transaction(async (tx) => {
    const criado = await tx.user.create({
      data: { name: dados.nome, email, passwordHash, role: 'USER' },
    });

    // A Person espelho nasce junto: sem ela o usuário autenticaria mas não poderia ser
    // parte de uma obrigação, e metade do produto ficaria inacessível para ele.
    await tx.person.create({
      data: { name: dados.nome, email, ownerId: criado.id, userId: criado.id },
    });

    await registrarAceite(tx, criado.id, requisicao);

    return criado;
  });

  return montarSessao(prisma, usuario.id);
}

type ClienteDeTransacao = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Grava o aceite das duas versões vigentes.
 *
 * `createMany` com `skipDuplicates` porque o unique é (usuário, documento, versão): quem
 * reaceita a mesma versão não gera linha nova, e quem aceita uma versão nova não apaga o
 * registro da anterior — o histórico é a evidência.
 */
export async function registrarAceite(
  tx: ClienteDeTransacao,
  userId: string,
  requisicao: DadosDaRequisicao,
) {
  await tx.termsAcceptance.createMany({
    data: [
      {
        userId,
        documentType: 'TERMS' as const,
        version: VERSAO_TERMOS,
        ipAddress: requisicao.ip,
        userAgent: requisicao.userAgent,
      },
      {
        userId,
        documentType: 'PRIVACY' as const,
        version: VERSAO_PRIVACIDADE,
        ipAddress: requisicao.ip,
        userAgent: requisicao.userAgent,
      },
    ],
    skipDuplicates: true,
  });
}

export async function aceitarTermos(
  prisma: PrismaClient,
  userId: string,
  requisicao: DadosDaRequisicao,
): Promise<UsuarioDaSessao> {
  await prisma.$transaction((tx) => registrarAceite(tx, userId, requisicao));
  return montarSessao(prisma, userId);
}

export async function trocarSenha(
  prisma: PrismaClient,
  userId: string,
  dados: TrocaDeSenha,
): Promise<void> {
  const usuario = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!(await verifyPassword(dados.senhaAtual, usuario.passwordHash))) {
    throw new ErroDeAutenticacao('Senha atual incorreta');
  }

  if (await verifyPassword(dados.novaSenha, usuario.passwordHash)) {
    throw new ErroDeRegra('A nova senha precisa ser diferente da atual');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(dados.novaSenha), mustChangePassword: false },
  });
}

export async function obterSessao(prisma: PrismaClient, userId: string): Promise<UsuarioDaSessao> {
  return montarSessao(prisma, userId);
}
