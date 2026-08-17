import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, type App } from './helpers.js';

let app: App;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();

  // Rota-sonda: exercita o guard de acesso a relatório sozinho, antes de existir uma tela
  // de relatório. Testar o guard só através da tela faria a falha aparecer como "o
  // relatório está errado" em vez de "a permissão está errada".
  app.get(
    '/sonda/relatorio/:ownerId',
    { preHandler: app.requireReportAccess },
    async (request) => ({ escopo: request.escopoDeRelatorio }),
  );
});

afterEach(() => app.close());

describe('rotas de administração', () => {
  it('nega a um usuário comum e libera ao admin', async () => {
    await criarUsuario(app, { email: 'comum@exemplo.com' });
    await criarUsuario(app, { email: 'chefe@exemplo.com', papel: 'ADMIN' });

    const comum = await logar(app, 'comum@exemplo.com');
    const chefe = await logar(app, 'chefe@exemplo.com');

    expect(
      (await app.inject({ method: 'GET', url: '/usuarios', headers: { cookie: comum } }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/usuarios', headers: { cookie: chefe } }))
        .statusCode,
    ).toBe(200);
  });

  it('impede o admin de rebaixar ou desativar a própria conta', async () => {
    const { usuario } = await criarUsuario(app, { email: 'chefe@exemplo.com', papel: 'ADMIN' });
    const cookie = await logar(app, 'chefe@exemplo.com');

    // Um admin que se rebaixa pode deixar o sistema sem nenhum admin ativo, e não sobra
    // ninguém com poder de desfazer.
    for (const payload of [{ papel: 'USER' }, { ativo: false }]) {
      const resposta = await app.inject({
        method: 'PATCH',
        url: `/usuarios/${usuario.id}`,
        headers: { cookie },
        payload,
      });

      expect(resposta.statusCode).toBe(422);
    }
  });

  it('exige troca de senha em usuário criado pelo admin', async () => {
    await criarUsuario(app, { email: 'chefe@exemplo.com', papel: 'ADMIN' });
    const cookie = await logar(app, 'chefe@exemplo.com');

    const resposta = await app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: { cookie },
      payload: {
        nome: 'Novo',
        email: 'novo@exemplo.com',
        senha: 'Senha-Provisoria-1!',
        papel: 'USER',
      },
    });

    expect(resposta.statusCode).toBe(201);

    // Senha escolhida por um admin não é senha escolhida pelo dono da conta.
    const criado = await app.prisma.user.findUnique({ where: { email: 'novo@exemplo.com' } });
    expect(criado?.mustChangePassword).toBe(true);
  });
});

describe('acesso ao relatório de outra pessoa', () => {
  it('nega quando não há consentimento', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const bruno = await logar(app, 'bruno@exemplo.com');

    const resposta = await app.inject({
      method: 'GET',
      url: `/sonda/relatorio/${ana.id}`,
      headers: { cookie: bruno },
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('libera o próprio relatório sem precisar de consentimento', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await app.inject({
      method: 'GET',
      url: `/sonda/relatorio/${ana.id}`,
      headers: { cookie },
    });

    expect(resposta.statusCode).toBe(200);
  });

  it('libera ao admin qualquer relatório', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    await criarUsuario(app, { email: 'chefe@exemplo.com', papel: 'ADMIN' });
    const chefe = await logar(app, 'chefe@exemplo.com');

    const resposta = await app.inject({
      method: 'GET',
      url: `/sonda/relatorio/${ana.id}`,
      headers: { cookie: chefe },
    });

    expect(resposta.statusCode).toBe(200);
  });

  it('respeita o escopo concedido e recusa o que ele não cobre', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const { usuario: brunoUser } = await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const bruno = await logar(app, 'bruno@exemplo.com');

    await app.prisma.reportGrant.create({
      data: { ownerId: ana.id, granteeUserId: brunoUser.id, scope: 'PAYABLE' },
    });

    const permitido = await app.inject({
      method: 'GET',
      url: `/sonda/relatorio/${ana.id}?escopo=PAYABLE`,
      headers: { cookie: bruno },
    });
    expect(permitido.statusCode).toBe(200);
    expect(permitido.json().escopo).toBe('PAYABLE');

    // Um grant de "a pagar" não pode virar visão de "a receber" só porque o cliente pediu.
    const negado = await app.inject({
      method: 'GET',
      url: `/sonda/relatorio/${ana.id}?escopo=RECEIVABLE`,
      headers: { cookie: bruno },
    });
    expect(negado.statusCode).toBe(403);

    // Nem pode virar "ambos" por omissão do parâmetro: o escopo efetivo continua o concedido.
    const semParametro = await app.inject({
      method: 'GET',
      url: `/sonda/relatorio/${ana.id}`,
      headers: { cookie: bruno },
    });
    expect(semParametro.statusCode).toBe(403);
  });

  it('deixa de liberar assim que o consentimento é revogado', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const { usuario: brunoUser } = await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const bruno = await logar(app, 'bruno@exemplo.com');

    const grant = await app.prisma.reportGrant.create({
      data: { ownerId: ana.id, granteeUserId: brunoUser.id, scope: 'BOTH' },
    });

    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/sonda/relatorio/${ana.id}`,
          headers: { cookie: bruno },
        })
      ).statusCode,
    ).toBe(200);

    await app.prisma.reportGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });

    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/sonda/relatorio/${ana.id}`,
          headers: { cookie: bruno },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('deixa de liberar depois da data de expiração', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const { usuario: brunoUser } = await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const bruno = await logar(app, 'bruno@exemplo.com');

    await app.prisma.reportGrant.create({
      data: {
        ownerId: ana.id,
        granteeUserId: brunoUser.id,
        scope: 'BOTH',
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/sonda/relatorio/${ana.id}`,
          headers: { cookie: bruno },
        })
      ).statusCode,
    ).toBe(403);
  });
});
