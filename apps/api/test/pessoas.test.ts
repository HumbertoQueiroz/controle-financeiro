import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, type App } from './helpers.js';

let app: App;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();
});

afterEach(() => app.close());

async function criarPessoa(app: App, cookie: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/pessoas', headers: { cookie }, payload });
}

describe('cadastro de pessoas', () => {
  it('cadastra terceiro sem exigir que ele tenha conta', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await criarPessoa(app, cookie, {
      nome: 'Bruno do rolê',
      telefone: '(11) 98888-7777',
    });

    expect(resposta.statusCode).toBe(201);
    // O ponto de Person existir separada de User: a despesa do amigo é registrada sem
    // obrigá-lo a criar conta antes.
    expect(resposta.json()).toMatchObject({ nome: 'Bruno do rolê', usuarioId: null });
    expect(resposta.json().telefone).toBe('11988887777');
  });

  it('lista a própria ficha como não editável', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const lista = await app.inject({ method: 'GET', url: '/pessoas', headers: { cookie } });
    const propria = lista.json().find((p: { nome: string }) => p.nome === 'Ana');

    // A Person espelho é a identidade do usuário nas obrigações. Apagá-la deixaria ele
    // sem contraparte e quebraria os saldos onde ele aparece.
    expect(propria.editavel).toBe(false);
  });

  it('recusa duas pessoas com o mesmo e-mail na mesma agenda', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    await criarPessoa(app, cookie, { nome: 'Bruno', email: 'bruno@exemplo.com' });
    const repetida = await criarPessoa(app, cookie, {
      nome: 'Bruno de novo',
      email: 'Bruno@Exemplo.com',
    });

    // Ambiguidade aqui tornaria indefinido a quem uma dívida pertence, e o convite não
    // saberia qual das duas vincular.
    expect(repetida.statusCode).toBe(409);
  });

  it('não enxerga nem altera pessoa de outro dono', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    await criarUsuario(app, { email: 'bruno@exemplo.com' });

    const ana = await logar(app, 'ana@exemplo.com');
    const bruno = await logar(app, 'bruno@exemplo.com');

    const pessoa = await criarPessoa(app, ana, { nome: 'Carla' });

    const listaDoBruno = await app.inject({
      method: 'GET',
      url: '/pessoas',
      headers: { cookie: bruno },
    });
    expect(listaDoBruno.json().some((p: { nome: string }) => p.nome === 'Carla')).toBe(false);

    // 404 e não 403: responder "existe, mas não é sua" permitiria varrer ids para
    // descobrir quem está cadastrado no sistema.
    const tentativa = await app.inject({
      method: 'PATCH',
      url: `/pessoas/${pessoa.json().id}`,
      headers: { cookie: bruno },
      payload: { nome: 'Sequestrada' },
    });
    expect(tentativa.statusCode).toBe(404);
  });
});

describe('exclusão de pessoa', () => {
  it('apaga de verdade quem não tem obrigação nenhuma', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const pessoa = await criarPessoa(app, cookie, { nome: 'Carla' });

    const resposta = await app.inject({
      method: 'DELETE',
      url: `/pessoas/${pessoa.json().id}`,
      headers: { cookie },
    });

    expect(resposta.json().anonimizada).toBe(false);
    expect(await app.prisma.person.findUnique({ where: { id: pessoa.json().id } })).toBeNull();
  });

  it('anonimiza quem já aparece num saldo, preservando o valor', async () => {
    const { pessoa: anaPessoa } = await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const carla = await criarPessoa(app, cookie, { nome: 'Carla', email: 'carla@exemplo.com' });

    await app.prisma.obligation.create({
      data: {
        debtorId: carla.json().id,
        creditorId: anaPessoa.id,
        description: 'rateio',
        amount: 80,
        dueDate: new Date(),
        paymentMethod: 'CASH',
        originType: 'GROUP_EXPENSE',
      },
    });

    const resposta = await app.inject({
      method: 'DELETE',
      url: `/pessoas/${carla.json().id}`,
      headers: { cookie },
    });

    // Apagar quem já aparece num saldo faria Ana deixar de ter R$ 80 a receber sem
    // ninguém ter pago — o mesmo motivo pelo qual a exclusão de conta anonimiza.
    expect(resposta.json().anonimizada).toBe(true);

    const restante = await app.prisma.person.findUniqueOrThrow({ where: { id: carla.json().id } });
    expect(restante.name).toBe('Pessoa excluída');
    expect(restante.email).toBeNull();
    expect(await app.prisma.obligation.count()).toBe(1);
  });

  it('impede excluir a própria ficha', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const lista = await app.inject({ method: 'GET', url: '/pessoas', headers: { cookie } });
    const propria = lista.json().find((p: { editavel: boolean }) => !p.editavel);

    const resposta = await app.inject({
      method: 'DELETE',
      url: `/pessoas/${propria.id}`,
      headers: { cookie },
    });

    expect(resposta.statusCode).toBe(422);
  });
});

describe('vínculo entre pessoa e conta', () => {
  it('vincula por iniciativa do dono, nunca por coincidência de e-mail', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const { usuario: bruno } = await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const pessoa = await criarPessoa(app, cookie, { nome: 'Bruno', email: 'bruno@exemplo.com' });

    // Só cadastrar com o mesmo e-mail não vincula: não há verificação de e-mail, e o
    // vínculo automático deixaria alguém herdar as dívidas de outra pessoa só por
    // adivinhar o endereço dela.
    expect(pessoa.json().usuarioId).toBeNull();

    const vinculada = await app.inject({
      method: 'POST',
      url: `/pessoas/${pessoa.json().id}/vinculo`,
      headers: { cookie },
      payload: { email: 'bruno@exemplo.com' },
    });

    expect(vinculada.json().usuarioId).toBe(bruno.id);
  });

  it('recusa vincular duas pessoas da mesma agenda à mesma conta', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');

    const primeira = await criarPessoa(app, cookie, { nome: 'Bruno' });
    const segunda = await criarPessoa(app, cookie, { nome: 'Bruninho' });

    await app.inject({
      method: 'POST',
      url: `/pessoas/${primeira.json().id}/vinculo`,
      headers: { cookie },
      payload: { email: 'bruno@exemplo.com' },
    });

    // Duas fichas apontando para a mesma conta duplicariam o que ela deve, e o saldo
    // apareceria dobrado.
    const repetida = await app.inject({
      method: 'POST',
      url: `/pessoas/${segunda.json().id}/vinculo`,
      headers: { cookie },
      payload: { email: 'bruno@exemplo.com' },
    });

    expect(repetida.statusCode).toBe(409);
  });

  it('recusa vincular a conta inexistente', async () => {
    await criarUsuario(app, { email: 'ana@exemplo.com' });
    const cookie = await logar(app, 'ana@exemplo.com');
    const pessoa = await criarPessoa(app, cookie, { nome: 'Carla' });

    const resposta = await app.inject({
      method: 'POST',
      url: `/pessoas/${pessoa.json().id}/vinculo`,
      headers: { cookie },
      payload: { email: 'ninguem@exemplo.com' },
    });

    expect(resposta.statusCode).toBe(404);
  });
});
