import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, SENHA_PADRAO, type App } from './helpers.js';

let app: App;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();
});

afterEach(() => app.close());
afterAll(() => limparBanco());

describe('login', () => {
  it('autentica e devolve a sessão em cookie httpOnly', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });

    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ana@exemplo.com', senha: SENHA_PADRAO },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ email: 'ana@exemplo.com', papel: 'USER' });

    const cookie = resposta.cookies.find((c) => c.name === 'controle_sessao');
    // httpOnly é o que faz um XSS não virar roubo de sessão: script na página não lê o cookie.
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
  });

  it('aceita o e-mail em qualquer caixa', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });

    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: '  Ana@Exemplo.COM ', senha: SENHA_PADRAO },
    });

    expect(resposta.statusCode).toBe(200);
  });

  it('devolve a mesma mensagem para senha errada, conta inexistente e conta inativa', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    await criarUsuario(app, { email: 'inativa@exemplo.com', ativo: false });

    const tentativas = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ana@exemplo.com', senha: 'senha-errada' },
      }),
      app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'ninguem@exemplo.com', senha: SENHA_PADRAO },
      }),
      app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'inativa@exemplo.com', senha: SENHA_PADRAO },
      }),
    ]);

    // Distinguir os casos transformaria a tela de login num verificador de cadastro:
    // bastaria tentar um e-mail para saber se a pessoa tem conta aqui.
    for (const tentativa of tentativas) {
      expect(tentativa.statusCode).toBe(401);
      expect(tentativa.json().mensagem).toBe('E-mail ou senha inválidos');
    }
  });

  it('encerra a sessão no logout', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    const cookieApagado = logout.cookies.find((c) => c.name === 'controle_sessao');

    expect(cookieApagado?.value).toBe('');
    // Mesmo path com que foi criado — path diferente cria um segundo cookie vazio e
    // deixa o original de pé, e a pessoa clica em sair sem sair.
    expect(cookieApagado?.path).toBe('/');
  });
});

describe('sessão', () => {
  it('recusa /auth/eu sem cookie', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/auth/eu' });
    expect(resposta.statusCode).toBe(401);
  });

  it('recusa cookie com token forjado', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/auth/eu',
      headers: { cookie: 'controle_sessao=token.completamente.invalido' },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('derruba a sessão assim que a conta é desativada', async () => {
    const { usuario } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    expect(
      (await app.inject({ method: 'GET', url: '/auth/eu', headers: { cookie } })).statusCode,
    ).toBe(200);

    await app.prisma.user.update({ where: { id: usuario.id }, data: { active: false } });

    // O guard relê o usuário no banco em vez de confiar no token. Sem isso, desativar
    // alguém só teria efeito quando o token expirasse — até lá, a pessoa continuaria entrando.
    const depois = await app.inject({ method: 'GET', url: '/auth/eu', headers: { cookie } });
    expect(depois.statusCode).toBe(401);
  });

  it('respeita o rebaixamento de papel sem esperar o token expirar', async () => {
    const { usuario } = await criarUsuario(app, { email: 'chefe@exemplo.com', papel: 'ADMIN' });
    const cookie = await logar(app, 'chefe@exemplo.com');

    expect(
      (await app.inject({ method: 'GET', url: '/usuarios', headers: { cookie } })).statusCode,
    ).toBe(200);

    await app.prisma.user.update({ where: { id: usuario.id }, data: { role: 'USER' } });

    const depois = await app.inject({ method: 'GET', url: '/usuarios', headers: { cookie } });
    expect(depois.statusCode).toBe(403);
  });
});

describe('troca de senha', () => {
  it('troca a senha e limpa a exigência de troca', async () => {
    const { usuario } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    await app.prisma.user.update({ where: { id: usuario.id }, data: { mustChangePassword: true } });
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/trocar-senha',
      headers: { cookie },
      payload: { senhaAtual: SENHA_PADRAO, novaSenha: 'Outra-Senha-Boa-456' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'ana@exemplo.com', senha: 'Outra-Senha-Boa-456' },
        })
      ).json().precisaTrocarSenha,
    ).toBe(false);
  });

  it('recusa quando a senha atual está errada', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/trocar-senha',
      headers: { cookie },
      payload: { senhaAtual: 'nao-e-essa', novaSenha: 'Outra-Senha-Boa-456' },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('recusa senha nova igual à atual', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    // Sem esta checagem, a tela de "troque sua senha" seria satisfeita digitando a mesma
    // senha duas vezes, e a exigência de troca perderia o sentido.
    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/trocar-senha',
      headers: { cookie },
      payload: { senhaAtual: SENHA_PADRAO, novaSenha: SENHA_PADRAO },
    });

    expect(resposta.statusCode).toBe(422);
  });

  it('recusa senha acima do limite de bytes do bcrypt', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    // 40 caracteres acentuados = 80 bytes. O bcrypt truncaria em 72 e validaria só o começo.
    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/trocar-senha',
      headers: { cookie },
      payload: { senhaAtual: SENHA_PADRAO, novaSenha: 'ç'.repeat(40) },
    });

    expect(resposta.statusCode).toBe(400);
  });
});
