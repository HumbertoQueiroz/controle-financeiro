import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, type App } from './helpers.js';

let app: App;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();
});

afterEach(() => app.close());

/**
 * Ana deve R$ 300 (fatura) e tem R$ 120 a receber do Bruno.
 * Saldo esperado: −180,00.
 */
async function montarCenario(app: App) {
  const { usuario: ana, pessoa: pessoaDaAna } = await criarUsuario(app, {
    email: 'ana@exemplo.com',
    nome: 'Ana',
  });
  const { usuario: bruno, pessoa: pessoaDoBruno } = await criarUsuario(app, {
    email: 'bruno@exemplo.com',
    nome: 'Bruno',
  });

  await app.prisma.obligation.create({
    data: {
      debtorId: pessoaDaAna.id,
      creditorId: null,
      description: 'Fatura Nubank 2026-08',
      amount: 300,
      dueDate: new Date('2026-08-05'),
      paymentMethod: 'CREDIT_CARD',
      originType: 'INVOICE',
    },
  });

  await app.prisma.obligation.create({
    data: {
      debtorId: pessoaDoBruno.id,
      creditorId: pessoaDaAna.id,
      description: 'Mercado repassado',
      amount: 120,
      dueDate: new Date('2026-08-05'),
      paymentMethod: 'CREDIT_CARD',
      originType: 'CARD_ENTRY',
    },
  });

  return { ana, bruno, pessoaDaAna, pessoaDoBruno };
}

describe('os três modos do relatório', () => {
  it('mostra a pagar, a receber e o saldo final', async () => {
    const { ana } = await montarCenario(app);
    const cookie = await logar(app, 'ana@exemplo.com');

    const resposta = await app.inject({
      method: 'GET',
      url: `/relatorios/${ana.id}`,
      headers: { cookie },
    });

    expect(resposta.statusCode).toBe(200);
    const relatorio = resposta.json();

    expect(relatorio.aPagar.total).toBe('300.00');
    expect(relatorio.aReceber.total).toBe('120.00');
    expect(relatorio.saldo).toBe('-180.00');
  });

  it('traz só um lado quando pedido, sem calcular saldo', async () => {
    const { ana } = await montarCenario(app);
    const cookie = await logar(app, 'ana@exemplo.com');

    const soPagar = await app.inject({
      method: 'GET',
      url: `/relatorios/${ana.id}?escopo=PAYABLE`,
      headers: { cookie },
    });

    expect(soPagar.json().aPagar.total).toBe('300.00');
    expect(soPagar.json().aReceber).toBeNull();
    // Calcular o saldo com um lado faltando devolveria um número que parece saldo e não é.
    expect(soPagar.json().saldo).toBeNull();
  });

  it('identifica a contraparte, e a instituição do cartão como nula', async () => {
    const { ana } = await montarCenario(app);
    const cookie = await logar(app, 'ana@exemplo.com');

    const relatorio = (
      await app.inject({ method: 'GET', url: `/relatorios/${ana.id}`, headers: { cookie } })
    ).json();

    expect(relatorio.aPagar.itens[0].contraparte).toBeNull();
    expect(relatorio.aReceber.itens[0].contraparte).toBe('Bruno');
  });

  it('conta o que falta, não o valor original', async () => {
    const { ana, pessoaDaAna } = await montarCenario(app);
    const cookie = await logar(app, 'ana@exemplo.com');

    await app.prisma.obligation.updateMany({
      where: { debtorId: pessoaDaAna.id },
      data: { settledAmount: 180, status: 'PARTIAL' },
    });

    const relatorio = (
      await app.inject({ method: 'GET', url: `/relatorios/${ana.id}`, headers: { cookie } })
    ).json();

    // Uma dívida de 300 com 180 já pagos pesa 120. Somar o valor cheio faria a pessoa
    // parecer dever mais do que deve.
    expect(relatorio.aPagar.total).toBe('120.00');
    expect(relatorio.aPagar.itens[0].restante).toBe('120.00');
  });

  it('inclui dívida lançada por outra pessoa na agenda dela', async () => {
    const { bruno } = await montarCenario(app);
    const brunoCookie = await logar(app, 'bruno@exemplo.com');

    const relatorio = (
      await app.inject({
        method: 'GET',
        url: `/relatorios/${bruno.id}`,
        headers: { cookie: brunoCookie },
      })
    ).json();

    // A obrigação está na ficha que a Ana criou, não na ficha espelho do Bruno. Consultar
    // só a ficha própria esconderia justamente a dívida que o terceiro lançou em nome dele.
    expect(relatorio.aPagar.total).toBe('120.00');
    expect(relatorio.aPagar.itens[0].contraparte).toBe('Ana');
  });

  it('ignora obrigação cancelada', async () => {
    const { ana, pessoaDaAna } = await montarCenario(app);
    const cookie = await logar(app, 'ana@exemplo.com');

    await app.prisma.obligation.updateMany({
      where: { debtorId: pessoaDaAna.id },
      data: { status: 'CANCELLED' },
    });

    const relatorio = (
      await app.inject({ method: 'GET', url: `/relatorios/${ana.id}`, headers: { cookie } })
    ).json();

    // Cancelada não é dívida de ninguém, em nenhum modo.
    expect(relatorio.aPagar.total).toBe('0.00');
  });

  it('mostra as liquidadas apenas quando se pede o histórico', async () => {
    const { ana, pessoaDaAna } = await montarCenario(app);
    const cookie = await logar(app, 'ana@exemplo.com');

    await app.prisma.obligation.updateMany({
      where: { debtorId: pessoaDaAna.id },
      // A data da baixa acompanha o status: o banco exige a coerência entre as duas.
      data: { settledAmount: 300, status: 'SETTLED', settledAt: new Date('2026-08-20') },
    });

    const abertas = (
      await app.inject({ method: 'GET', url: `/relatorios/${ana.id}`, headers: { cookie } })
    ).json();
    const todas = (
      await app.inject({
        method: 'GET',
        url: `/relatorios/${ana.id}?situacao=TODAS`,
        headers: { cookie },
      })
    ).json();

    expect(abertas.aPagar.quantidade).toBe(0);
    expect(todas.aPagar.quantidade).toBe(1);
    // Já quitada não soma no total nem quando aparece na lista.
    expect(todas.aPagar.total).toBe('0.00');
  });

  it('filtra por vencimento', async () => {
    const { ana } = await montarCenario(app);
    const cookie = await logar(app, 'ana@exemplo.com');

    const foraDoPeriodo = await app.inject({
      method: 'GET',
      url: `/relatorios/${ana.id}?de=2026-09-01&ate=2026-09-30`,
      headers: { cookie },
    });

    expect(foraDoPeriodo.json().aPagar.quantidade).toBe(0);
  });
});

describe('relatório de outra pessoa', () => {
  it('respeita o escopo do consentimento na consulta', async () => {
    const { ana, bruno } = await montarCenario(app);

    await app.prisma.reportGrant.create({
      data: { ownerId: ana.id, granteeUserId: bruno.id, scope: 'PAYABLE' },
    });

    const brunoCookie = await logar(app, 'bruno@exemplo.com');

    const permitido = await app.inject({
      method: 'GET',
      url: `/relatorios/${ana.id}?escopo=PAYABLE`,
      headers: { cookie: brunoCookie },
    });

    expect(permitido.statusCode).toBe(200);
    expect(permitido.json().aPagar.total).toBe('300.00');
    // O lado não concedido nem chega a ser consultado no banco.
    expect(permitido.json().aReceber).toBeNull();

    const negado = await app.inject({
      method: 'GET',
      url: `/relatorios/${ana.id}?escopo=RECEIVABLE`,
      headers: { cookie: brunoCookie },
    });

    expect(negado.statusCode).toBe(403);
  });

  it('nega sem consentimento', async () => {
    const { ana } = await montarCenario(app);
    const brunoCookie = await logar(app, 'bruno@exemplo.com');

    const resposta = await app.inject({
      method: 'GET',
      url: `/relatorios/${ana.id}`,
      headers: { cookie: brunoCookie },
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('libera ao admin', async () => {
    const { ana } = await montarCenario(app);
    await criarUsuario(app, { email: 'chefe@exemplo.com', papel: 'ADMIN' });
    const chefe = await logar(app, 'chefe@exemplo.com');

    const resposta = await app.inject({
      method: 'GET',
      url: `/relatorios/${ana.id}`,
      headers: { cookie: chefe },
    });

    expect(resposta.statusCode).toBe(200);
  });
});

describe('resumo do painel', () => {
  it('devolve os totais de quem está logado', async () => {
    await montarCenario(app);
    const cookie = await logar(app, 'ana@exemplo.com');

    const resumo = await app.inject({ method: 'GET', url: '/resumo', headers: { cookie } });

    expect(resumo.json()).toMatchObject({
      aPagar: '300.00',
      aReceber: '120.00',
      saldo: '-180.00',
      faturasEmAberto: 0,
    });
  });

  it('exige sessão', async () => {
    expect((await app.inject({ method: 'GET', url: '/resumo' })).statusCode).toBe(401);
  });
});
