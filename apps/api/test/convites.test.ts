import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, type App } from './helpers.js';

let app: App;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();
});

afterEach(() => app.close());

/** Extrai o token do link, que é a única vez em que ele aparece em claro. */
function tokenDaUrl(url: string): string {
  return url.split('/convite/')[1]!;
}

async function compartilhar(app: App, cookie: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/compartilhamentos', headers: { cookie }, payload });
}

const dadosDeCadastro = {
  nome: 'Bruno',
  senha: 'Senha-De-Teste-123',
  aceitaTermos: true,
  aceitaPrivacidade: true,
};

describe('compartilhar com quem já tem conta', () => {
  it('concede o acesso na hora, sem convite', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await compartilhar(app, cookie, {
      email: 'bruno@exemplo.com',
      escopo: 'PAYABLE',
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().status).toBe('GRANT_CREATED');
    expect(await app.prisma.reportInvite.count()).toBe(0);
  });

  it('reconceder depois de revogar reativa o mesmo registro', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const primeira = await compartilhar(app, cookie, {
      email: 'bruno@exemplo.com',
      escopo: 'BOTH',
    });
    const lista = await app.inject({
      method: 'GET',
      url: '/compartilhamentos',
      headers: { cookie },
    });
    const grantId = lista.json()[0].id;

    await app.inject({
      method: 'DELETE',
      url: `/compartilhamentos/${grantId}`,
      headers: { cookie },
    });

    await compartilhar(app, cookie, { email: 'bruno@exemplo.com', escopo: 'PAYABLE' });

    // Uma linha por par (dono, convidado). Empilhar históricos faria a consulta de
    // permissão ter de escolher entre várias, e ambiguidade ali vira vazamento.
    const grants = await app.prisma.reportGrant.findMany({ where: { ownerId: ana.id } });
    expect(primeira.json().status).toBe('GRANT_CREATED');
    expect(grants).toHaveLength(1);
    expect(grants[0]!.revokedAt).toBeNull();
    expect(grants[0]!.scope).toBe('PAYABLE');
  });

  it('recusa compartilhar consigo mesmo', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await compartilhar(app, cookie, { email: 'ana@exemplo.com', escopo: 'BOTH' });

    expect(resposta.statusCode).toBe(422);
  });
});

describe('convite para quem não tem conta', () => {
  it('devolve o link e o link do WhatsApp, sem enviar nada', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await compartilhar(app, cookie, {
      email: 'novo@exemplo.com',
      escopo: 'BOTH',
      telefone: '(11) 98888-7777',
    });

    const corpo = resposta.json();
    expect(corpo.status).toBe('INVITE_CREATED');
    expect(corpo.urlDoConvite).toContain('/convite/');
    // Com o código do país: `wa.me/11988887777` não abre a conversa, ou abre a conversa
    // de outra pessoa em outro país. O banco guarda o número nacional; o 55 entra no link.
    expect(corpo.urlDoWhatsApp).toContain('wa.me/5511988887777');
    expect(decodeURIComponent(corpo.urlDoWhatsApp)).toContain('Ana compartilhou');
  });

  it('não duplica o código do país num telefone que já o tenha', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await compartilhar(app, cookie, {
      email: 'novo@exemplo.com',
      escopo: 'BOTH',
      telefone: '+55 11 98888-7777',
    });

    expect(resposta.json().urlDoWhatsApp).toContain('wa.me/5511988887777');
  });

  it('guarda apenas o hash do token', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await compartilhar(app, cookie, { email: 'novo@exemplo.com', escopo: 'BOTH' });
    const token = tokenDaUrl(resposta.json().urlDoConvite);

    // Vazamento do banco não pode virar acesso ao dado financeiro de ninguém: sem o token
    // original, nem quem administra o banco reconstrói um link.
    const convite = await app.prisma.reportInvite.findFirstOrThrow();
    expect(convite.tokenHash).not.toBe(token);
    expect(convite.tokenHash).toHaveLength(64);
  });

  it('reemite em vez de acumular quando já há convite pendente', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const primeiro = await compartilhar(app, cookie, { email: 'novo@exemplo.com', escopo: 'BOTH' });
    const segundo = await compartilhar(app, cookie, {
      email: 'novo@exemplo.com',
      escopo: 'PAYABLE',
    });

    // Dois convites válidos para a mesma pessoa fariam revogar um deixar o outro de pé,
    // e o dono acharia que tirou o acesso.
    expect(await app.prisma.reportInvite.count()).toBe(1);

    const tokenAntigo = tokenDaUrl(primeiro.json().urlDoConvite);
    const tokenNovo = tokenDaUrl(segundo.json().urlDoConvite);

    expect((await app.inject({ method: 'GET', url: `/convite/${tokenAntigo}` })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'GET', url: `/convite/${tokenNovo}` })).statusCode).toBe(
      200,
    );
  });

  it('mostra quem convidou e o que será compartilhado antes do cadastro', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana Souza' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const criado = await compartilhar(app, cookie, {
      email: 'novo@exemplo.com',
      escopo: 'RECEIVABLE',
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/convite/${tokenDaUrl(criado.json().urlDoConvite)}`,
    });

    expect(resposta.json()).toMatchObject({
      email: 'novo@exemplo.com',
      escopo: 'RECEIVABLE',
      convidadoPor: 'Ana Souza',
      jaTemConta: false,
    });
    // O token está no caminho da URL; sem esta política ele iria no Referer de qualquer
    // recurso externo que a página carregasse.
    expect(resposta.headers['referrer-policy']).toBe('no-referrer');
  });

  it('recusa token inexistente, revogado e expirado com a mesma resposta', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const revogado = await compartilhar(app, cookie, { email: 'a@exemplo.com', escopo: 'BOTH' });
    await app.inject({
      method: 'DELETE',
      url: `/convites/${revogado.json().conviteId}`,
      headers: { cookie },
    });

    const expirado = await compartilhar(app, cookie, { email: 'b@exemplo.com', escopo: 'BOTH' });
    await app.prisma.reportInvite.update({
      where: { id: expirado.json().conviteId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const tokens = [
      'token-que-nunca-existiu-mas-tem-tamanho',
      tokenDaUrl(revogado.json().urlDoConvite),
      tokenDaUrl(expirado.json().urlDoConvite),
    ];

    // Distinguir permitiria sondar tokens e descobrir quais já foram usados.
    for (const token of tokens) {
      const resposta = await app.inject({ method: 'GET', url: `/convite/${token}` });
      expect(resposta.statusCode).toBe(404);
      expect(resposta.json().mensagem).toBe('Convite inválido ou expirado');
    }
  });
});

describe('aceite do convite', () => {
  it('cria conta e consentimento na mesma transação, já logado', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const criado = await compartilhar(app, cookie, {
      email: 'bruno@exemplo.com',
      escopo: 'PAYABLE',
    });

    const resposta = await app.inject({
      method: 'POST',
      url: `/convite/${tokenDaUrl(criado.json().urlDoConvite)}/aceitar`,
      payload: dadosDeCadastro,
    });

    expect(resposta.statusCode).toBe(200);
    // Já entra logado: o convidado nunca vive um instante cadastrado-mas-sem-acesso.
    expect(resposta.cookies.find((c) => c.name === 'controle_sessao')?.value).toBeTruthy();

    const grant = await app.prisma.reportGrant.findFirstOrThrow({ where: { ownerId: ana.id } });
    expect(grant.scope).toBe('PAYABLE');
    expect(grant.revokedAt).toBeNull();
  });

  it('põe quem convidou na agenda de quem aceitou', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const criado = await compartilhar(app, cookie, {
      email: 'bruno@exemplo.com',
      escopo: 'BOTH',
    });

    await app.inject({
      method: 'POST',
      url: `/convite/${tokenDaUrl(criado.json().urlDoConvite)}/aceitar`,
      payload: dadosDeCadastro,
    });

    const bruno = await app.prisma.user.findUniqueOrThrow({
      where: { email: 'bruno@exemplo.com' },
    });

    const ficha = await app.prisma.person.findFirstOrThrow({
      where: { ownerId: bruno.id, userId: ana.id },
    });

    // Com `userId` preenchido, e não uma ficha solta: é a ligação com a conta real que faz
    // o fechamento entre os dois enxergar as duas pontas da mesma dívida. Cadastrada à mão
    // depois, ela nasceria sem essa ligação.
    expect(ficha.name).toBe('Ana');
  });

  it('usa o e-mail do convite e ignora qualquer outro enviado no formulário', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const criado = await compartilhar(app, cookie, {
      email: 'bruno@exemplo.com',
      escopo: 'BOTH',
    });

    await app.inject({
      method: 'POST',
      url: `/convite/${tokenDaUrl(criado.json().urlDoConvite)}/aceitar`,
      payload: { ...dadosDeCadastro, email: 'sequestrador@exemplo.com' },
    });

    // Aceitar outro e-mail transformaria um link encaminhado no WhatsApp em acesso
    // transferível a dado financeiro.
    expect(
      await app.prisma.user.findUnique({ where: { email: 'sequestrador@exemplo.com' } }),
    ).toBeNull();
    expect(
      await app.prisma.user.findUnique({ where: { email: 'bruno@exemplo.com' } }),
    ).toBeTruthy();
  });

  it('não serve para um segundo uso', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const criado = await compartilhar(app, cookie, { email: 'bruno@exemplo.com', escopo: 'BOTH' });
    const token = tokenDaUrl(criado.json().urlDoConvite);

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/convite/${token}/aceitar`,
          payload: dadosDeCadastro,
        })
      ).statusCode,
    ).toBe(200);

    const segunda = await app.inject({
      method: 'POST',
      url: `/convite/${token}/aceitar`,
      payload: { ...dadosDeCadastro, nome: 'Outro' },
    });

    expect(segunda.statusCode).toBe(404);
    expect(await app.prisma.user.count()).toBe(2);
  });

  it('resiste a dois aceites simultâneos do mesmo link', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const criado = await compartilhar(app, cookie, { email: 'bruno@exemplo.com', escopo: 'BOTH' });
    const token = tokenDaUrl(criado.json().urlDoConvite);

    const respostas = await Promise.all([
      app.inject({ method: 'POST', url: `/convite/${token}/aceitar`, payload: dadosDeCadastro }),
      app.inject({ method: 'POST', url: `/convite/${token}/aceitar`, payload: dadosDeCadastro }),
    ]);

    // O consumo é condicionado ao estado PENDENTE dentro da transação. Verificar antes e
    // gravar depois deixaria os dois passarem pelo mesmo `if`.
    const sucessos = respostas.filter((r) => r.statusCode === 200);
    expect(sucessos).toHaveLength(1);
    expect(await app.prisma.user.count()).toBe(2);
  });

  it('quando o convidado já criou conta sozinho, só concede o acesso', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const criado = await compartilhar(app, cookie, { email: 'bruno@exemplo.com', escopo: 'BOTH' });

    // Bruno se cadastra por conta própria antes de abrir o link.
    await criarUsuario(app, { email: 'bruno@exemplo.com', nome: 'Bruno' });

    const resposta = await app.inject({
      method: 'POST',
      url: `/convite/${tokenDaUrl(criado.json().urlDoConvite)}/aceitar`,
      payload: dadosDeCadastro,
    });

    expect(resposta.statusCode).toBe(200);
    expect(await app.prisma.user.count()).toBe(2);
    expect(await app.prisma.reportGrant.count()).toBe(1);
  });

  it('vincula a pessoa indicada, dando ao convidado a ficha que já existia', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const pessoa = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie },
      payload: { nome: 'Bruno do rolê' },
    });

    const criado = await compartilhar(app, cookie, {
      email: 'bruno@exemplo.com',
      escopo: 'BOTH',
      pessoaId: pessoa.json().id,
    });

    await app.inject({
      method: 'POST',
      url: `/convite/${tokenDaUrl(criado.json().urlDoConvite)}/aceitar`,
      payload: dadosDeCadastro,
    });

    const bruno = await app.prisma.user.findUniqueOrThrow({
      where: { email: 'bruno@exemplo.com' },
    });
    const vinculada = await app.prisma.person.findUniqueOrThrow({
      where: { id: pessoa.json().id },
    });

    // É o vínculo que faz o convidado ver as dívidas lançadas em nome dele antes de ele
    // ter conta — sem ele, a ficha antiga ficaria órfã e ele veria uma tela vazia.
    expect(vinculada.userId).toBe(bruno.id);
    expect(vinculada.ownerId).toBe(ana.id);
  });

  it('recusa o aceite sem o aceite dos termos', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const criado = await compartilhar(app, cookie, { email: 'bruno@exemplo.com', escopo: 'BOTH' });

    const resposta = await app.inject({
      method: 'POST',
      url: `/convite/${tokenDaUrl(criado.json().urlDoConvite)}/aceitar`,
      payload: { ...dadosDeCadastro, aceitaTermos: false },
    });

    expect(resposta.statusCode).toBe(400);
    expect(await app.prisma.user.count()).toBe(1);
  });

  it('revogar antes do aceite impede o acesso', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const criado = await compartilhar(app, cookie, { email: 'bruno@exemplo.com', escopo: 'BOTH' });

    await app.inject({
      method: 'DELETE',
      url: `/convites/${criado.json().conviteId}`,
      headers: { cookie },
    });

    const resposta = await app.inject({
      method: 'POST',
      url: `/convite/${tokenDaUrl(criado.json().urlDoConvite)}/aceitar`,
      payload: dadosDeCadastro,
    });

    expect(resposta.statusCode).toBe(404);
    expect(await app.prisma.reportGrant.count()).toBe(0);
  });
});

describe('lista de compartilhamentos', () => {
  it('mostra concedidos e convites pendentes juntos', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    await criarUsuario(app, { email: 'bruno@exemplo.com', nome: 'Bruno' });
    const cookie = await logar(app, 'ana@exemplo.com');

    await compartilhar(app, cookie, { email: 'bruno@exemplo.com', escopo: 'BOTH' });
    await compartilhar(app, cookie, { email: 'carla@exemplo.com', escopo: 'PAYABLE' });

    const lista = await app.inject({
      method: 'GET',
      url: '/compartilhamentos',
      headers: { cookie },
    });
    const itens = lista.json();

    // Convite pendente é acesso futuro: escondê-lo faria o dono acreditar que compartilhou
    // com menos gente do que compartilhou.
    expect(itens).toHaveLength(2);
    expect(itens.map((i: { tipo: string }) => i.tipo).sort()).toEqual(['CONVITE', 'GRANT']);
  });

  it('não mostra o compartilhamento de outra pessoa', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    await criarUsuario(app, { email: 'carla@exemplo.com' });

    await app.prisma.reportGrant.create({
      data: {
        ownerId: ana.id,
        granteeUserId: (
          await app.prisma.user.findUniqueOrThrow({
            where: { email: 'carla@exemplo.com' },
          })
        ).id,
        scope: 'BOTH',
      },
    });

    const bruno = await logar(app, 'bruno@exemplo.com');
    const lista = await app.inject({
      method: 'GET',
      url: '/compartilhamentos',
      headers: { cookie: bruno },
    });

    expect(lista.json()).toHaveLength(0);
  });

  it('recusa revogar compartilhamento de outro dono', async () => {
    const { usuario: ana } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const { usuario: carla } = await criarUsuario(app, { email: 'carla@exemplo.com' });
    await criarUsuario(app, { email: 'bruno@exemplo.com' });

    const grant = await app.prisma.reportGrant.create({
      data: { ownerId: ana.id, granteeUserId: carla.id, scope: 'BOTH' },
    });

    const bruno = await logar(app, 'bruno@exemplo.com');
    const resposta = await app.inject({
      method: 'DELETE',
      url: `/compartilhamentos/${grant.id}`,
      headers: { cookie: bruno },
    });

    expect(resposta.statusCode).toBe(404);
    expect(
      (await app.prisma.reportGrant.findUniqueOrThrow({ where: { id: grant.id } })).revokedAt,
    ).toBeNull();
  });
});
