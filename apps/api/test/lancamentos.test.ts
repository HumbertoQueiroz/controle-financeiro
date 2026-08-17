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

function listar(direcao: string, extra = '') {
  return app.inject({
    method: 'GET',
    url: `/lancamentos?direcao=${direcao}${extra}`,
    headers: { cookie },
  });
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

  it('aceita pagar mais que o título: são juros ou multa', async () => {
    const criado = await lancar(ALUGUEL);

    const resposta = await app.inject({
      method: 'POST',
      url: `/lancamentos/${criado.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-08', valorPago: '1900.00' },
    });

    // Quem paga atrasado paga mais, e recusar obrigava a mentir o valor para dar a baixa.
    expect(resposta.json().status).toBe('SETTLED');
    expect(resposta.json().restante).toBe('0.00');

    // O valor que saiu do banco é o cheio; só o liquidado fica preso ao devido, que é o
    // que o CHECK do banco exige.
    const pagamento = await app.prisma.payment.findFirstOrThrow();
    expect(pagamento.amount.toString()).toBe('1900');
    expect(pagamento.adjustment).toBe(false);
  });

  it('quita com desconto quando a pessoa diz que foi desconto', async () => {
    const criado = await lancar(ALUGUEL);

    const resposta = await app.inject({
      method: 'POST',
      url: `/lancamentos/${criado.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-08', valorPago: '1700.00', quitar: true },
    });

    expect(resposta.json().status).toBe('SETTLED');

    // Duas linhas, e não um título de valor menor: mexer no valor apagaria quanto a dívida
    // era de verdade, e o histórico deixaria de explicar a diferença.
    const pagamentos = await app.prisma.payment.findMany({ orderBy: { adjustment: 'asc' } });
    expect(pagamentos).toHaveLength(2);
    expect(pagamentos[0]!.amount.toString()).toBe('1700');
    expect(pagamentos[1]!.amount.toString()).toBe('100');
    expect(pagamentos[1]!.adjustment).toBe(true);
  });

  it('sem dizer que é desconto, pagar a menor continua sendo parcial', async () => {
    const criado = await lancar(ALUGUEL);

    const resposta = await app.inject({
      method: 'POST',
      url: `/lancamentos/${criado.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-08', valorPago: '1700.00' },
    });

    // As duas coisas são diferentes, e só quem deu a baixa sabe qual foi.
    expect(resposta.json().status).toBe('PARTIAL');
    expect(await app.prisma.payment.count()).toBe(1);
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

/**
 * A dívida entre duas contas do sistema: quem deve declara o pagamento, quem recebe
 * confirma. É o único ponto do sistema em que uma baixa não vale sozinha.
 */
describe('pagamento pendente de confirmação', () => {
  let cookieDoBruno: string;
  let dividaId: string;

  beforeEach(async () => {
    const { usuario: bruno } = await criarUsuario(app, {
      email: 'bruno@exemplo.com',
      nome: 'Bruno',
    });
    cookieDoBruno = await logar(app, 'bruno@exemplo.com');

    // A ficha do Bruno na agenda da Ana, ligada à conta dele: é o vínculo que faz o Bruno
    // enxergar, na conta dele, a dívida que a Ana lançou no nome dele.
    const ficha = await app.prisma.person.create({
      data: {
        name: 'Bruno',
        ownerId: (await app.prisma.user.findFirstOrThrow({ where: { email: 'ana@exemplo.com' } }))
          .id,
        userId: bruno.id,
      },
    });

    const divida = await lancar({
      direcao: 'RECEIVABLE',
      descricao: 'Churrasco',
      valor: '100.00',
      vencimento: '2026-08-20',
      formaDePagamento: 'CASH',
      pessoaId: ficha.id,
    });

    dividaId = divida.json().id;
  });

  const baixar = (cookieDeQuem: string) =>
    app.inject({
      method: 'POST',
      url: `/lancamentos/${dividaId}/baixa`,
      headers: { cookie: cookieDeQuem },
      payload: { dataDaBaixa: '2026-08-18' },
    });

  const verComoBruno = async () =>
    (
      await app.inject({
        method: 'GET',
        url: '/lancamentos?direcao=PAYABLE&situacao=TODAS',
        headers: { cookie: cookieDoBruno },
      })
    ).json()[0];

  const verComoAna = async () =>
    (
      await app.inject({
        method: 'GET',
        url: '/lancamentos?direcao=RECEIVABLE&situacao=TODAS',
        headers: { cookie },
      })
    ).json()[0];

  it('nasce pendente quando quem deve é que dá a baixa', async () => {
    const resposta = await baixar(cookieDoBruno);

    expect(resposta.json().pagamentos[0].confirmado).toBe(false);
  });

  it('não abate a dívida enquanto não é confirmado', async () => {
    await baixar(cookieDoBruno);

    // O ponto todo: se abatesse, o Bruno quitaria a própria dívida sozinho e o título
    // sumiria da lista de a receber da Ana sem nada ter entrado.
    const comoAna = await verComoAna();
    expect(comoAna.status).toBe('OPEN');
    expect(comoAna.restante).toBe('100.00');
    expect(comoAna.valorLiquidado).toBe('0');
  });

  it('aparece para os dois lados, e só quem recebe pode confirmar', async () => {
    await baixar(cookieDoBruno);

    expect((await verComoBruno()).pagamentos).toHaveLength(1);
    expect((await verComoBruno()).podeConfirmarPagamentos).toBe(false);
    expect((await verComoAna()).podeConfirmarPagamentos).toBe(true);
  });

  it('abate a dívida ao ser confirmado por quem recebe', async () => {
    const pagamentoId = (await baixar(cookieDoBruno)).json().pagamentos[0].id;

    const resposta = await app.inject({
      method: 'POST',
      url: `/lancamentos/${dividaId}/pagamentos/${pagamentoId}/confirmar`,
      headers: { cookie },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ status: 'SETTLED', restante: '0.00' });
    expect(resposta.json().pagamentos[0].confirmado).toBe(true);
  });

  it('recusa a confirmação vinda de quem deve', async () => {
    const pagamentoId = (await baixar(cookieDoBruno)).json().pagamentos[0].id;

    const resposta = await app.inject({
      method: 'POST',
      url: `/lancamentos/${dividaId}/pagamentos/${pagamentoId}/confirmar`,
      headers: { cookie: cookieDoBruno },
    });

    // Deixar o devedor confirmar devolveria o problema ao ponto de partida: seria uma
    // baixa de duas etapas feita pela mesma pessoa.
    expect(resposta.statusCode).toBe(422);
    expect((await verComoAna()).status).toBe('OPEN');
  });

  it('já nasce confirmado quando quem recebe é que dá a baixa', async () => {
    const resposta = await baixar(cookie);

    expect(resposta.json().pagamentos[0].confirmado).toBe(true);
    expect(resposta.json().status).toBe('SETTLED');
  });

  it('impede o devedor de declarar o valor cheio duas vezes', async () => {
    await baixar(cookieDoBruno);

    // O teto é o que já foi declarado, e não só o confirmado: sem isso o Bruno encheria
    // a lista de declarações enquanto a Ana não olha.
    const segunda = await baixar(cookieDoBruno);

    expect(segunda.statusCode).toBe(422);
  });

  it('deixa quem recebe recusar, estornando o que não reconhece', async () => {
    await baixar(cookieDoBruno);

    const resposta = await app.inject({
      method: 'DELETE',
      url: `/lancamentos/${dividaId}/baixa`,
      headers: { cookie },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().pagamentos).toHaveLength(0);
  });
});

describe('filtro por origem e forma de pagamento', () => {
  it('separa o que veio da fatura do resto', async () => {
    await lancar(ALUGUEL);

    const cartao = await app.inject({
      method: 'POST',
      url: '/cartoes',
      headers: { cookie },
      payload: { nome: 'Nubank', diaDeFechamento: 25, diaDeVencimento: 5 },
    });

    const fatura = await app.inject({
      method: 'GET',
      url: `/cartoes/${cartao.json().id}/faturas?mes=2026-08`,
      headers: { cookie },
    });

    const todos = await listar('PAYABLE', '&mes=2026-08&situacao=TODAS');
    const soFaturas = await listar('PAYABLE', '&mes=2026-08&situacao=TODAS&origem=INVOICE');

    // Sem o filtro, "faturas de cartão R$ X" no dashboard levaria à lista inteira, e o
    // total da tela de destino não bateria com o do card que a pessoa tocou.
    expect(fatura.statusCode).toBe(200);
    expect(todos.json().length).toBeGreaterThan(soFaturas.json().length);
    expect(soFaturas.json().every((item: { origem: string }) => item.origem === 'INVOICE')).toBe(
      true,
    );
  });

  it('aceita uma forma de pagamento ou várias', async () => {
    await lancar(ALUGUEL);
    await lancar({
      ...ALUGUEL,
      descricao: 'Almoço',
      valor: '40.00',
      formaDePagamento: 'MEAL_VOUCHER',
    });
    await lancar({ ...ALUGUEL, descricao: 'Troca', valor: '10.00', formaDePagamento: 'BARTER' });

    const uma = await listar('PAYABLE', '&mes=2026-08&situacao=TODAS&formaDePagamento=CASH');
    const duas = await listar(
      'PAYABLE',
      '&mes=2026-08&situacao=TODAS&formaDePagamento=CASH&formaDePagamento=MEAL_VOUCHER',
    );

    // Uma querystring com um valor só chega como string, e com dois como lista. Exigir a
    // lista faria o link de um filtro só ser recusado.
    expect(uma.json()).toHaveLength(1);
    expect(duas.json()).toHaveLength(2);
  });

  it('recusa origem que não existe', async () => {
    expect((await listar('PAYABLE', '&origem=INVENTADA')).statusCode).toBe(400);
  });
});

describe('dashboard', () => {
  function verDashboard(mes = '2026-08') {
    return app.inject({ method: 'GET', url: `/dashboard?mes=${mes}`, headers: { cookie } });
  }

  it('reúne os dois saldos do mês', async () => {
    await lancar(SALARIO);
    const conta = await lancar(ALUGUEL);

    await app.inject({
      method: 'POST',
      url: `/lancamentos/${conta.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-11' },
    });

    const corpo = (await verDashboard()).json();

    // Previsto é tudo que vence no mês; realizado, só o que se moveu.
    expect(corpo.saldoPrevisto).toMatchObject({ entradas: '5000.00', saidas: '1800.00' });
    expect(corpo.saldoRealizado).toMatchObject({ entradas: '0.00', saidas: '1800.00' });
  });

  it('parte o a pagar entre caixa e cartão, sem repetir lançamento', async () => {
    await lancar(ALUGUEL);
    await lancar({
      ...ALUGUEL,
      descricao: 'Streaming',
      valor: '40.00',
      formaDePagamento: 'CREDIT_CARD',
    });

    const corpo = (await verDashboard()).json();
    const [caixa, cartao] = corpo.aPagar.blocos;

    // Os blocos particionam a lista: somados, dão o total da seção. Um terceiro bloco por
    // origem cruzaria o eixo e mostraria o mesmo lançamento duas vezes.
    expect(caixa.total).toBe('1800.00');
    expect(cartao.total).toBe('40.00');
    expect(corpo.aPagar.total).toBe('1840.00');
  });

  it('leva o filtro que abre a lista de cada bloco', async () => {
    await lancar(ALUGUEL);

    const corpo = (await verDashboard()).json();

    // O filtro nasce ao lado do número que ele promete; numa tabela de rotas noutro
    // arquivo, ele deixaria de bater no dia em que o recorte mudasse.
    expect(corpo.aPagar.blocos.map((b: { filtro: string }) => b.filtro)).toEqual([
      'caixa',
      'cartao',
    ]);
  });

  it('conta o que venceu sem baixa', async () => {
    await lancar(ALUGUEL);

    expect((await verDashboard()).json().atrasados).toBe(1);
  });
});
