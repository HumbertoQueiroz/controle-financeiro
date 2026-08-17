import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { requisitosDaSenha } from '@controle/shared';
import { hashPassword } from '../src/lib/hash.js';
import { normalizarEmail } from '../src/lib/email.js';
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS } from '../src/lib/legal.js';
import '../src/env.js';

const prisma = new PrismaClient();

/**
 * Senha aleatória legível, para quando ADMIN_PASSWORD não vem do ambiente.
 *
 * base64url evita caracteres que se perdem ao copiar de um terminal ou que precisam de
 * escape em linha de comando — mas ele não garante maiúscula, minúscula nem dígito, e um
 * sorteio pode sair sem algum deles. O sufixo fixo faz a senha gerada satisfazer a mesma
 * régua exigida das pessoas; sem ele, o seed criaria de vez em quando um admin com uma
 * senha que o próprio sistema recusaria no cadastro.
 *
 * Os 18 bytes aleatórios continuam sendo toda a entropia: o sufixo é público e não conta.
 */
function gerarSenha(): string {
  return `${randomBytes(18).toString('base64url')}aA1!`;
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

  // A conta com acesso a todos os dados de todo mundo é a última que pode ficar de fora da
  // exigência. Recusar aqui, com a lista do que falta, é melhor que criar o admin e só
  // descobrir a senha fraca quando alguém tentar trocá-la.
  const pendencias = requisitosDaSenha(senha).filter((requisito) => !requisito.atendido);

  if (pendencias.length > 0) {
    console.error('ADMIN_PASSWORD não atende às exigências:');
    for (const pendencia of pendencias) console.error(`  - ${pendencia.rotulo}`);
    process.exitCode = 1;
    return;
  }

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
