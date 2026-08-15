import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/hash.js';
import { normalizarEmail } from '../src/lib/email.js';
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS } from '../src/lib/legal.js';
import '../src/env.js';

const prisma = new PrismaClient();

/**
 * Senha aleatória legível, para quando ADMIN_PASSWORD não vem do ambiente.
 * base64url evita caracteres que se perdem ao copiar de um terminal ou que precisam de
 * escape em linha de comando.
 */
function gerarSenha(): string {
  return randomBytes(18).toString('base64url');
}

async function main() {
  const email = normalizarEmail(process.env.ADMIN_EMAIL ?? 'admin@controle.local');
  const nome = process.env.ADMIN_NAME ?? 'Administrador';
  const senhaDoAmbiente = process.env.ADMIN_PASSWORD?.trim();

  const existente = await prisma.user.findUnique({ where: { email } });

  if (existente) {
    // Idempotência de verdade: reexecutar o seed não pode trocar a senha de um admin em
    // uso. Um `upsert` com senha no update faria exatamente isso, e o efeito só apareceria
    // no próximo login de quem já estava trabalhando.
    console.warn(`Admin já existe (${email}). Nada alterado.`);
    return;
  }

  const senha = senhaDoAmbiente && senhaDoAmbiente.length > 0 ? senhaDoAmbiente : gerarSenha();
  const senhaFoiGerada = senha !== senhaDoAmbiente;

  await prisma.$transaction(async (tx) => {
    const admin = await tx.user.create({
      data: {
        name: nome,
        email,
        passwordHash: await hashPassword(senha),
        role: 'ADMIN',
        // Senha que o sistema inventou é senha que o dono da conta não escolheu.
        mustChangePassword: senhaFoiGerada,
      },
    });

    // Todo usuário tem uma Person espelho: é ela que aparece como devedora ou credora nas
    // obrigações. Sem isso o admin existiria para autenticar mas não poderia participar de
    // um rateio, e o modelo teria dois tipos de gente.
    await tx.person.create({
      data: {
        name: nome,
        email,
        ownerId: admin.id,
        userId: admin.id,
      },
    });

    await tx.termsAcceptance.createMany({
      data: [
        { userId: admin.id, documentType: 'TERMS', version: VERSAO_TERMOS },
        { userId: admin.id, documentType: 'PRIVACY', version: VERSAO_PRIVACIDADE },
      ],
    });
  });

  console.warn(`Admin criado: ${email}`);

  if (senhaFoiGerada) {
    console.warn('');
    console.warn('  Senha gerada (aparece uma única vez, anote agora):');
    console.warn(`  ${senha}`);
    console.warn('');
    console.warn('  A troca será exigida no primeiro acesso.');
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
