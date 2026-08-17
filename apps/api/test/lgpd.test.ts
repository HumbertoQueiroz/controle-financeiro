import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, SENHA_PADRAO, type App } from './helpers.js';

let app: App;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();
});

afterEach(() => app.close());

const cadastroValido = {
  nome: 'Ana',
  email: 'ana@exemplo.com',
  senha: 'Senha-De-Teste-123',
  aceitaTermos: true,
  aceitaPrivacidade: true,
};

describe('aceite de termos', () => {
  it('recusa o cadastro sem aceite dos dois documentos', async () => {
    for (const recusa of [{ aceitaTermos: false }, { aceitaPrivacidade: false }]) {
      const resposta = await app.inject({
        method: 'POST',
        url: '/auth/cadastro',
        payload: { ...cadastroValido, ...recusa },
      });

      expect(resposta.statusCode).toBe(400);
    }

    expect(await app.prisma.user.count()).toBe(0);
  });

  it('grava versão, IP e user-agent do aceite', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/cadastro',
      payload: cadastroValido,
      headers: { 'user-agent': 'navegador-de-teste/1.0' },
    });

    expect(resposta.statusCode).toBe(201);

    const aceites = await app.prisma.termsAcceptance.findMany();

    // Sem versão, IP e momento não há como demonstrar quando e a que a pessoa consentiu —
    // e é isso que a LGPD cobra, não a existência de um checkbox.
    expect(aceites).toHaveLength(2);
    expect(aceites.map((a) => a.documentType).sort()).toEqual(['PRIVACY', 'TERMS']);
    for (const aceite of aceites) {
      expect(aceite.version).toBeTruthy();
      expect(aceite.userAgent).toBe('navegador-de-teste/1.0');
      expect(aceite.ipAddress).toBeTruthy();
    }
  });

  it('cria a Person espelho junto com a conta', async () => {
    await app.inject({ method: 'POST', url: '/auth/cadastro', payload: cadastroValido });

    const pessoa = await app.prisma.person.findFirst({ where: { email: 'ana@exemplo.com' } });

    // Sem a Person, a conta autenticaria mas não poderia ser parte de uma obrigação,
    // e metade do produto ficaria inacessível para ela.
    expect(pessoa?.userId).toBeTruthy();
  });

  it('volta a exigir aceite quando a versão vigente muda', async () => {
    const { usuario } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    expect(
      (await app.inject({ method: 'GET', url: '/auth/eu', headers: { cookie } })).json()
        .precisaAceitarTermos,
    ).toBe(false);

    // Simula a publicação de uma versão nova: o aceite antigo permanece no histórico,
    // mas deixa de valer para a versão vigente.
    await app.prisma.termsAcceptance.updateMany({
      where: { userId: usuario.id, documentType: 'TERMS' },
      data: { version: '0.9.0' },
    });

    const depois = await app.inject({ method: 'GET', url: '/auth/eu', headers: { cookie } });
    expect(depois.json().precisaAceitarTermos).toBe(true);

    await app.inject({ method: 'POST', url: '/auth/aceitar-termos', headers: { cookie } });

    const aceites = await app.prisma.termsAcceptance.findMany({ where: { userId: usuario.id } });
    // O registro antigo continua lá: o histórico é a evidência do que foi consentido antes.
    expect(aceites.some((a) => a.version === '0.9.0')).toBe(true);
    expect(aceites.length).toBe(3);
  });

  it('recusa cadastro com e-mail já usado sem revelar a senha de ninguém', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });

    const resposta = await app.inject({
      method: 'POST',
      url: '/auth/cadastro',
      payload: cadastroValido,
    });

    expect(resposta.statusCode).toBe(409);
  });
});

describe('direitos do titular', () => {
  it('exporta os dados da pessoa em arquivo', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await app.inject({ method: 'GET', url: '/eu/dados', headers: { cookie } });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-disposition']).toContain('meus-dados.json');

    const dados = resposta.json();
    expect(dados.usuario.email).toBe('ana@exemplo.com');
    expect(dados.aceitesDeTermos).toHaveLength(2);
  });

  it('anonimiza em vez de apagar, preservando o saldo de terceiros', async () => {
    const { usuario, pessoa } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const { pessoa: outra } = await criarUsuario(app, { email: 'bruno@exemplo.com' });

    const obrigacao = await app.prisma.obligation.create({
      data: {
        debtorId: pessoa.id,
        creditorId: outra.id,
        description: 'rateio do rolê',
        amount: 200,
        dueDate: new Date(),
        paymentMethod: 'CASH',
        originType: 'GROUP_EXPENSE',
      },
    });

    const cookie = await logar(app, 'ana@exemplo.com');
    const resposta = await app.inject({ method: 'DELETE', url: '/eu', headers: { cookie } });

    expect(resposta.statusCode).toBe(200);

    // O ponto da anonimização: apagar a linha faria Bruno deixar de ter R$ 200 a receber,
    // sem ninguém ter pago. O que identifica a pessoa some; o valor devido permanece.
    const preservada = await app.prisma.obligation.findUnique({ where: { id: obrigacao.id } });
    expect(preservada?.amount.toString()).toBe('200');

    const anonimizada = await app.prisma.person.findUnique({ where: { id: pessoa.id } });
    expect(anonimizada?.name).toBe('Usuário excluído');
    expect(anonimizada?.email).toBeNull();

    const conta = await app.prisma.user.findUnique({ where: { id: usuario.id } });
    expect(conta?.anonymizedAt).toBeTruthy();
    expect(conta?.email).not.toBe('ana@exemplo.com');
  });

  it('impede login em conta anonimizada', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    await app.inject({ method: 'DELETE', url: '/eu', headers: { cookie } });

    const tentativa = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ana@exemplo.com', senha: SENHA_PADRAO },
    });

    expect(tentativa.statusCode).toBe(401);
  });

  it('revoga os consentimentos ao anonimizar', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const { usuario: bruno } = await criarUsuario(app, { email: 'bruno@exemplo.com' });

    await app.prisma.reportGrant.create({
      data: { ownerId: ana.id, granteeUserId: bruno.id, scope: 'BOTH' },
    });

    const cookie = await logar(app, 'ana@exemplo.com');
    await app.inject({ method: 'DELETE', url: '/eu', headers: { cookie } });

    const grant = await app.prisma.reportGrant.findFirst({ where: { ownerId: ana.id } });
    // Consentimento morre com a conta: quem via o relatório dela deixa de ver agora.
    expect(grant?.revokedAt).toBeTruthy();
  });

  it('impede o admin de excluir a própria conta por autoatendimento', async () => {
    await criarUsuario(app, { email: 'chefe@exemplo.com', papel: 'ADMIN' });
    const cookie = await logar(app, 'chefe@exemplo.com');

    // O admin é o único caminho de volta para qualquer coisa; excluí-lo assim pode deixar
    // o sistema sem administrador e sem forma de recuperar.
    const resposta = await app.inject({ method: 'DELETE', url: '/eu', headers: { cookie } });

    expect(resposta.statusCode).toBe(422);
  });
});
