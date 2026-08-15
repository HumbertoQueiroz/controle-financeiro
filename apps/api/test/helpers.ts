import { apontarParaBancoDeTeste } from './env-de-teste.js';

apontarParaBancoDeTeste();

const { buildApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/lib/hash.js');
const { VERSAO_PRIVACIDADE, VERSAO_TERMOS } = await import('../src/lib/legal.js');

export type App = Awaited<ReturnType<typeof buildApp>>;

export async function criarApp(): Promise<App> {
  return buildApp();
}

export const SENHA_PADRAO = 'senha-de-teste-123';

/**
 * Cria um usuário já pronto para logar: com Person espelho e os termos aceitos.
 * Montar isso em cada teste faria o preparo esconder o que o teste realmente verifica.
 */
export async function criarUsuario(
  app: App,
  opcoes: {
    nome?: string;
    email: string;
    senha?: string;
    papel?: 'ADMIN' | 'USER';
    ativo?: boolean;
    aceitouTermos?: boolean;
  },
) {
  const nome = opcoes.nome ?? 'Fulano';
  const usuario = await app.prisma.user.create({
    data: {
      name: nome,
      email: opcoes.email,
      passwordHash: await hashPassword(opcoes.senha ?? SENHA_PADRAO),
      role: opcoes.papel ?? 'USER',
      active: opcoes.ativo ?? true,
    },
  });

  const pessoa = await app.prisma.person.create({
    data: { name: nome, email: opcoes.email, ownerId: usuario.id, userId: usuario.id },
  });

  if (opcoes.aceitouTermos !== false) {
    await app.prisma.termsAcceptance.createMany({
      data: [
        { userId: usuario.id, documentType: 'TERMS', version: VERSAO_TERMOS },
        { userId: usuario.id, documentType: 'PRIVACY', version: VERSAO_PRIVACIDADE },
      ],
    });
  }

  return { usuario, pessoa };
}

/** Faz login e devolve o cookie de sessão, pronto para o header das próximas requisições. */
export async function logar(app: App, email: string, senha = SENHA_PADRAO): Promise<string> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, senha },
  });

  const cookie = resposta.cookies.find((c) => c.name === 'controle_sessao');

  if (!cookie) {
    throw new Error(`Login falhou para ${email}: ${resposta.statusCode} ${resposta.body}`);
  }

  return `controle_sessao=${cookie.value}`;
}
