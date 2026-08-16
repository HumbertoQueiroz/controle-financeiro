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

function lancar(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/lancamentos', headers: { cookie }, payload });
}

const SALARIO = {
  direcao: 'RECEIVABLE',
  descricao: 'Salário',
  valor: '5000.00',
  vencimento: '2026-08-05',
  formaDePagamento: 'CASH',
  contraparte: 'Empresa X',
};

const ALUGUEL = {
  direcao: 'PAYABLE',
  descricao: 'Aluguel',
  valor: '1800.00',
  vencimento: '2026-08-10',
  formaDePagamento: 'CASH',
  contraparte: 'Imobiliária',
};

describe('lançamento avulso', () => {
  it('registra entrada sem exigir devedor cadastrado', async () => {
    const resposta = await lancar(SALARIO);

    expect(resposta.statusCode).toBe(201);
    // Quem paga o salário é o empregador. Obrigar a cadastrá-lo como pessoa só para
    // lançar a receita seria atrito sem ganho.
    expect(resposta.json()).toMatchObject({
      direcao: 'RECEIVABLE',
      contraparte: 'Empresa X',
      dataDaBaixa: null,
      restante: '5000.00',
    });
  });

  it('registra saída', async () => {
    const resposta = await lancar(ALUGUEL);

    expect(resposta.json().direcao).toBe('PAYABLE');
  });

  it('separa as duas listas pelo lado do lançamento', async () => {
    await lancar(SALARIO);
    await lancar(ALUGUEL);

    const receber = await app.inject({
      method: 'GET',
      url: '/lancamentos?direcao=RECEIVABLE',
      headers: { cookie },
    });
    const pagar = await app.inject({
      method: 'GET',
      url: '/lancamentos?direcao=PAYABLE',
      headers: { cookie },
    });

    expect(receber.json().map((i: { descricao: string }) => i.descricao)).toEqual(['Salário']);
    expect(pagar.json().map((i: { descricao: string }) => i.descricao)).toEqual(['Aluguel']);
  });

  it('não enxerga lançamento de outra pessoa', async () => {
    const criado = await lancar(SALARIO);

    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const bruno = await logar(app, 'bruno@exemplo.com');

    const lista = await app.inject({
      method: 'GET',
      url: '/lancamentos?direcao=RECEIVABLE',
      headers: { cookie: bruno },
    });
    expect(lista.json()).toHaveLength(0);

    const tentativa = await app.inject({
      method: 'PATCH',
      url: `/lancamentos/${criado.json().id}`,
      headers: { cookie: bruno },
      payload: { valor: '1.00' },
    });
    expect(tentativa.statusCode).toBe(404);
  });
});

describe('baixa', () => {
  it('registra a data informada, e não a de hoje', async () => {
    const criado = await lancar(ALUGUEL);

    const resposta = await app.inject({
      method: 'POST',
      url: `/lancamentos/${criado.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-08' },
    });

    // Quem registra no domingo o que pagou na sexta precisa que o caixa mostre sexta,
    // senão o fechamento do mês erra na virada.
    expect(resposta.json().dataDaBaixa).toContain('2026-08-08');
    expect(resposta.json().status).toBe('SETTLED');
    expect(resposta.json().restante).toBe('0.00');
  });

  it('mantém as duas datas separadas', async () => {
    const criado = await lancar(ALUGUEL);

    const resposta = await app.inject({
      method: 'POST',
      url: `/lancamentos/${criado.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-09-03' },
    });

    // Vencimento em agosto, baixa em setembro: a conta pertence ao orçamento de agosto e
    // ao caixa de setembro, e as duas leituras são verdadeiras.
    expect(resposta.json().vencimento).toContain('2026-08-10');
    expect(resposta.json().dataDaBaixa).toContain('2026-09-03');
  });

  it('aceita baixa parcial sem marcar como quitado', async () => {
    const criado = await lancar(ALUGUEL);

    const resposta = await app.inject({
      method: 'POST',
      url: `/lancamentos/${criado.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-08', valorPago: '800.00' },
    });

    expect(resposta.json().status).toBe('PARTIAL');
    expect(resposta.json().restante).toBe('1000.00');
    // Baixa parcial não é o momento em que o lançamento saiu do previsto.
    expect(resposta.json().dataDaBaixa).toBeNull();
  });

  it('recusa pagar mais do que falta', async () => {
    const criado = await lancar(ALUGUEL);

    const resposta = await app.inject({
      method: 'POST',
      url: `/lancamentos/${criado.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-08', valorPago: '5000.00' },
    });

    expect(resposta.statusCode).toBe(422);
  });

  it('estorna a baixa e devolve o lançamento ao previsto', async () => {
    const criado = await lancar(ALUGUEL);
    const id = criado.json().id;

    await app.inject({
      method: 'POST',
      url: `/lancamentos/${id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-08' },
    });

    const estorno = await app.inject({
      method: 'DELETE',
      url: `/lancamentos/${id}/baixa`,
      headers: { cookie },
    });

    expect(estorno.json()).toMatchObject({
      status: 'OPEN',
      dataDaBaixa: null,
      valorLiquidado: '0',
    });
  });

  it('impede alterar valor ou excluir enquanto houver baixa', async () => {
    const criado = await lancar(ALUGUEL);
    const id = criado.json().id;

    await app.inject({
      method: 'POST',
      url: `/lancamentos/${id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-08' },
    });

    // Apagar depois da baixa sumiria com o registro de um dinheiro que trocou de mãos.
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/lancamentos/${id}`,
          headers: { cookie },
          payload: { valor: '10.00' },
        })
      ).statusCode,
    ).toBe(422);

    expect(
      (await app.inject({ method: 'DELETE', url: `/lancamentos/${id}`, headers: { cookie } }))
        .statusCode,
    ).toBe(422);
  });

  it('marca como atrasado o que venceu sem baixa', async () => {
    await lancar({ ...ALUGUEL, vencimento: '2020-01-10' });

    const lista = await app.inject({
      method: 'GET',
      url: '/lancamentos?direcao=PAYABLE',
      headers: { cookie },
    });

    expect(lista.json()[0].atrasado).toBe(true);
  });
});

describe('recorrência', () => {
  const SALARIO_MENSAL = {
    direcao: 'RECEIVABLE',
    descricao: 'Salário',
    valor: '5000.00',
    diaDoVencimento: 5,
    formaDePagamento: 'CASH',
    contraparte: 'Empresa X',
    inicioEm: '2026-08',
  };

  function criarRecorrencia(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/recorrencias', headers: { cookie }, payload });
  }

  it('gera a parcela do mês ao abrir o orçamento', async () => {
    await criarRecorrencia(SALARIO_MENSAL);

    const orcamento = await app.inject({
      method: 'GET',
      url: '/orcamento?mes=2026-08',
      headers: { cookie },
    });

    expect(orcamento.json().entradas.previsto).toBe('5000.00');
    expect(orcamento.json().entradas.itens[0]).toMatchObject({
      descricao: 'Salário',
      origem: 'RECURRENCE',
    });
  });

  it('não duplica ao abrir o mesmo mês de novo', async () => {
    await criarRecorrencia(SALARIO_MENSAL);

    await app.inject({ method: 'GET', url: '/orcamento?mes=2026-08', headers: { cookie } });
    await app.inject({ method: 'GET', url: '/orcamento?mes=2026-08', headers: { cookie } });

    // O único (recorrência, mês) no banco é o que garante isso mesmo com duas abas abertas.
    expect(await app.prisma.obligation.count()).toBe(1);
  });

  it('gera parcela distinta em cada mês', async () => {
    await criarRecorrencia(SALARIO_MENSAL);

    await app.inject({ method: 'GET', url: '/orcamento?mes=2026-08', headers: { cookie } });
    await app.inject({ method: 'GET', url: '/orcamento?mes=2026-09', headers: { cookie } });

    const parcelas = await app.prisma.obligation.findMany({ orderBy: { dueDate: 'asc' } });
    expect(parcelas).toHaveLength(2);
    expect(parcelas.map((p) => p.referenceMonth?.trim())).toEqual(['2026-08', '2026-09']);
  });

  it('respeita a vigência', async () => {
    await criarRecorrencia({ ...SALARIO_MENSAL, inicioEm: '2026-08', fimEm: '2026-08' });

    await app.inject({ method: 'GET', url: '/orcamento?mes=2026-07', headers: { cookie } });
    await app.inject({ method: 'GET', url: '/orcamento?mes=2026-09', headers: { cookie } });

    expect(await app.prisma.obligation.count()).toBe(0);
  });

  it('usa o último dia em mês que não tem o dia escolhido', async () => {
    await criarRecorrencia({ ...SALARIO_MENSAL, diaDoVencimento: 31, inicioEm: '2026-02' });

    await app.inject({ method: 'GET', url: '/orcamento?mes=2026-02', headers: { cookie } });

    const parcela = await app.prisma.obligation.findFirstOrThrow();
    // Sem o ajuste, 31 de fevereiro viraria 3 de março e a parcela mudaria de mês.
    expect(parcela.dueDate.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('encerrar mantém o histórico e remove só as parcelas futuras sem baixa', async () => {
    const criada = await criarRecorrencia({ ...SALARIO_MENSAL, inicioEm: '2020-01' });

    await app.inject({ method: 'GET', url: '/orcamento?mes=2020-01', headers: { cookie } });
    await app.inject({ method: 'GET', url: '/orcamento?mes=2099-01', headers: { cookie } });

    await app.inject({
      method: 'DELETE',
      url: `/recorrencias/${criada.json().id}`,
      headers: { cookie },
    });

    const restantes = await app.prisma.obligation.findMany();
    // A parcela de 2020 é um lançamento de verdade; apagá-la mudaria o caixa daquele mês
    // retroativamente. A de 2099 era só previsão.
    expect(restantes).toHaveLength(1);
    expect(restantes[0]!.referenceMonth?.trim()).toBe('2020-01');
  });
});

describe('orçamento do mês', () => {
  it('separa previsto, realizado e em aberto', async () => {
    await lancar(SALARIO);
    const aluguel = await lancar(ALUGUEL);

    await app.inject({
      method: 'POST',
      url: `/lancamentos/${aluguel.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-09' },
    });

    const orcamento = (
      await app.inject({ method: 'GET', url: '/orcamento?mes=2026-08', headers: { cookie } })
    ).json();

    expect(orcamento.entradas).toMatchObject({
      previsto: '5000.00',
      realizado: '0.00',
      emAberto: '5000.00',
    });
    expect(orcamento.saidas).toMatchObject({
      previsto: '1800.00',
      realizado: '1800.00',
      emAberto: '0.00',
    });

    expect(orcamento.saldoPrevisto).toBe('3200.00');
    // O caixa do mês: só o que se moveu. O salário ainda não caiu.
    expect(orcamento.saldoRealizado).toBe('-1800.00');
  });

  it('mantém no mês do vencimento o que foi pago no mês seguinte', async () => {
    const aluguel = await lancar(ALUGUEL);

    await app.inject({
      method: 'POST',
      url: `/lancamentos/${aluguel.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-09-03' },
    });

    const agosto = (
      await app.inject({ method: 'GET', url: '/orcamento?mes=2026-08', headers: { cookie } })
    ).json();
    const setembro = (
      await app.inject({ method: 'GET', url: '/orcamento?mes=2026-09', headers: { cookie } })
    ).json();

    // A conta foi assumida em agosto: é ali que ela pertence ao orçamento.
    expect(agosto.saidas.previsto).toBe('1800.00');
    expect(setembro.saidas.previsto).toBe('0.00');
  });

  it('conta os atrasados', async () => {
    await lancar({ ...ALUGUEL, vencimento: '2020-01-10' });

    const orcamento = (
      await app.inject({ method: 'GET', url: '/orcamento?mes=2020-01', headers: { cookie } })
    ).json();

    expect(orcamento.atrasados).toBe(1);
  });

  it('exige sessão', async () => {
    expect((await app.inject({ method: 'GET', url: '/orcamento?mes=2026-08' })).statusCode).toBe(
      401,
    );
  });
});
