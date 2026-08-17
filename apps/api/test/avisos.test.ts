import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, type App } from './helpers.js';

let app: App;
let cookie: string;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();
  await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
  cookie = await logar(app, 'ana@exemplo.com');
});

afterEach(() => app.close());

function post(url: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url, headers: { cookie }, payload });
}

function verAvisos() {
  return app.inject({ method: 'GET', url: '/avisos', headers: { cookie } });
}

const ONTEM = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function lancarAtrasado(descricao: string, valor: string) {
  return post('/lancamentos', {
    direcao: 'PAYABLE',
    descricao,
    valor,
    vencimento: ONTEM,
    formaDePagamento: 'CASH',
  });
}

describe('confirmação de leitura do aviso', () => {
  it('tira o aviso da lista ativa e do contador', async () => {
    await lancarAtrasado('Aluguel', '1850.00');

    const antes = (await verAvisos()).json();
    expect(antes.itens).toHaveLength(1);
    expect(antes.urgentes).toBe(1);

    const resposta = await post('/avisos/leitura', { avisoIds: [antes.itens[0].id] });
    expect(resposta.json().confirmados).toBe(1);

    const depois = (await verAvisos()).json();
    expect(depois.itens).toHaveLength(0);
    expect(depois.urgentes).toBe(0);
    // Continua acessível: confirmar não é apagar, e a pessoa precisa poder conferir o que
    // deu por lido.
    expect(depois.lidos).toHaveLength(1);
    expect(depois.lidos[0].lido).toBe(true);
  });

  it('confirma todos de uma vez', async () => {
    await lancarAtrasado('Aluguel', '1850.00');
    await lancarAtrasado('Luz', '90.00');

    expect((await post('/avisos/leitura', { todos: true })).json().confirmados).toBe(2);
    expect((await verAvisos()).json().itens).toHaveLength(0);
  });

  it('devolve o aviso quando o motivo muda', async () => {
    const conta = await lancarAtrasado('Aluguel', '1850.00');

    await post('/avisos/leitura', { todos: true });
    expect((await verAvisos()).json().itens).toHaveLength(0);

    // Pagamento parcial: o aviso passa a cobrar outro valor, então é outro problema.
    await post(`/lancamentos/${conta.json().id}/baixa`, {
      dataDaBaixa: ONTEM,
      valorPago: '850.00',
    });

    const depois = (await verAvisos()).json();

    // Sem a assinatura, o "já vi" de R$ 1.850 silenciaria também o de R$ 1.000, e a
    // confirmação viraria um silenciador permanente daquele aluguel.
    expect(depois.itens).toHaveLength(1);
    expect(depois.itens[0].valor).toBe('1000.00');
    expect(depois.lidos).toHaveLength(0);
  });

  it('desfaz a confirmação', async () => {
    await lancarAtrasado('Aluguel', '1850.00');
    const aviso = (await verAvisos()).json().itens[0];

    await post('/avisos/leitura', { avisoIds: [aviso.id] });
    await app.inject({
      method: 'DELETE',
      url: `/avisos/leitura/${encodeURIComponent(aviso.id)}`,
      headers: { cookie },
    });

    expect((await verAvisos()).json().itens).toHaveLength(1);
  });

  it('some de vez quando a causa deixa de existir', async () => {
    const conta = await lancarAtrasado('Aluguel', '1850.00');

    await post('/avisos/leitura', { todos: true });
    await post(`/lancamentos/${conta.json().id}/baixa`, { dataDaBaixa: ONTEM });

    const depois = (await verAvisos()).json();

    // Nem em `itens` nem em `lidos`: a leitura guardada não ressuscita um aviso cuja causa
    // acabou. Os avisos continuam derivados; só a leitura é persistida.
    expect(depois.itens).toHaveLength(0);
    expect(depois.lidos).toHaveLength(0);
  });

  it('ignora id de aviso que não está na lista', async () => {
    await lancarAtrasado('Aluguel', '1850.00');

    const resposta = await post('/avisos/leitura', { avisoIds: ['venc-inventado'] });

    // Confirmar o que ninguém viu criaria leitura para um aviso inexistente, e ela ficaria
    // esperando para calar o aviso de verdade se um dia o id coincidisse.
    expect(resposta.json().confirmados).toBe(0);
    expect((await verAvisos()).json().itens).toHaveLength(1);
  });

  it('não confunde a leitura de um usuário com a de outro', async () => {
    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const cookieDoBruno = await logar(app, 'bruno@exemplo.com');

    await lancarAtrasado('Aluguel', '1850.00');
    await post('/avisos/leitura', { todos: true });

    await app.inject({
      method: 'POST',
      url: '/lancamentos',
      headers: { cookie: cookieDoBruno },
      payload: {
        direcao: 'PAYABLE',
        descricao: 'Aluguel',
        valor: '1850.00',
        vencimento: ONTEM,
        formaDePagamento: 'CASH',
      },
    });

    const doBruno = (
      await app.inject({ method: 'GET', url: '/avisos', headers: { cookie: cookieDoBruno } })
    ).json();

    expect(doBruno.itens).toHaveLength(1);
  });

  it('exige informar o que confirmar', async () => {
    expect((await post('/avisos/leitura', {})).statusCode).toBe(400);
  });
});
