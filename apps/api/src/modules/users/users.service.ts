import type { PrismaClient } from '@prisma/client';
import type { AtualizarUsuario, CriarUsuario } from '@controle/shared';
import { hashPassword } from '../../lib/hash.js';
import { normalizarEmail } from '../../lib/email.js';
import { ErroDeConflito, ErroDeRegra } from '../../lib/erros.js';

const CAMPOS_PUBLICOS = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

function paraSaida(usuario: {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  active: boolean;
  createdAt: Date;
}) {
  return {
    id: usuario.id,
    nome: usuario.name,
    email: usuario.email,
    papel: usuario.role,
    ativo: usuario.active,
    criadoEm: usuario.createdAt,
  };
}

export async function listar(prisma: PrismaClient) {
  const usuarios = await prisma.user.findMany({
    where: { anonymizedAt: null },
    select: CAMPOS_PUBLICOS,
    orderBy: { createdAt: 'asc' },
  });

  return usuarios.map(paraSaida);
}

export async function criar(prisma: PrismaClient, dados: CriarUsuario) {
  const email = normalizarEmail(dados.email);

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new ErroDeConflito('Já existe uma conta com este e-mail');
  }

  const passwordHash = await hashPassword(dados.senha);

  const usuario = await prisma.$transaction(async (tx) => {
    const criado = await tx.user.create({
      data: {
        name: dados.nome,
        email,
        passwordHash,
        role: dados.papel,
        // Senha escolhida por um admin não é senha escolhida pelo dono da conta.
        mustChangePassword: true,
      },
      select: CAMPOS_PUBLICOS,
    });

    await tx.person.create({
      data: { name: dados.nome, email, ownerId: criado.id, userId: criado.id },
    });

    return criado;
  });

  return paraSaida(usuario);
}

export async function atualizar(
  prisma: PrismaClient,
  idAlvo: string,
  idDoSolicitante: string,
  dados: AtualizarUsuario,
) {
  // Um admin rebaixando ou desativando a si mesmo pode deixar o sistema sem nenhum admin
  // ativo, e não sobra ninguém com poder de desfazer. Barrar o auto-rebaixamento é mais
  // simples e mais seguro que ter de contar admins restantes a cada alteração.
  if (idAlvo === idDoSolicitante && (dados.papel === 'USER' || dados.ativo === false)) {
    throw new ErroDeRegra('Um administrador não pode rebaixar nem desativar a própria conta');
  }

  const usuario = await prisma.user.update({
    where: { id: idAlvo },
    data: {
      ...(dados.nome !== undefined && { name: dados.nome }),
      ...(dados.papel !== undefined && { role: dados.papel }),
      ...(dados.ativo !== undefined && { active: dados.ativo }),
    },
    select: CAMPOS_PUBLICOS,
  });

  return paraSaida(usuario);
}
