import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, type App } from './helpers.js';

let app: App;
let cookie: string;
let anaId: string;
let brunoFichaId: string;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();

  const { usuario } = await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
  anaId = usuario.id;
  cookie = await logar(app, 'ana@exemplo.com');

  const bruno = await app.prisma.person.create({
    data: { name: 'Bruno', ownerId: anaId },
  });
  brunoFichaId = bruno.id;
});

afterEach(() => app.close());

function lancar(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/lancamentos', headers: { cookie }, payload });
}

/** Uma conta a receber do Bruno. */
function aReceber(descricao: string, valor: string, vencimento: string) {
  return lancar({
    direcao: 'RECEIVABLE',
    descricao,
    valor,
    vencimento,
    formaDePagamento: 'CASH',
    pessoaId: brunoFichaId,
  });
}

/** Uma conta a pagar ao Bruno. */
function aPagar(descricao: string, valor: string, vencimento: string) {
  return lancar({
    direcao: 'PAYABLE',
    descricao,
    valor,
    vencimento,
    formaDePagamento: 'CASH',
    pessoaId: brunoFichaId,
  });
}

function verFechamento(mes = '2026-08') {
  return app.inject({
    method: 'GET',
    url: `/participantes/${brunoFichaId}/fechamento?mes=${mes}`,
    headers: { cookie },
  });
}

function quitar(payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/participantes/${brunoFichaId}/fechamento/quitar`,
    headers: { cookie },
    payload: { mes: '2026-08', dataDaQuitacao: '2026-08-31', ...payload },
  });
}

describe('fechamento por participante', () => {
  it('reúne os dois lados e devolve o saldo líquido', async () => {
    await aReceber('Churrasco', '150.00', '2026-08-10');
    await aPagar('Uber', '50.00', '2026-08-12');

    const corpo = (await verFechamento()).json();

    expect(corpo.participante.nome).toBe('Bruno');
    expect(corpo.totalAReceber).toBe('150.00');
    expect(corpo.totalAPagar).toBe('50.00');
    expect(corpo.saldo).toBe('100.00');
    expect(corpo.proximoNumero).toBe(1);
  });

  it('inclui as contas vencidas de meses anteriores', async () => {
    await aReceber('Conta de junho', '80.00', '2026-06-05');
    await aReceber('Conta de agosto', '20.00', '2026-08-05');

    const corpo = (await verFechamento()).json();

    // Uma dívida de junho que ninguém pagou continua devida em agosto. Um fechamento que
    // a ignorasse deixaria a conta velha pendurada, invisível, para sempre.
    expect(corpo.aReceber.map((i: { descricao: string }) => i.descricao)).toEqual([
      'Conta de junho',
      'Conta de agosto',
    ]);
    expect(corpo.totalAReceber).toBe('100.00');
  });

  it('deixa de fora o que vence depois do mês pedido', async () => {
    await aReceber('Conta de agosto', '20.00', '2026-08-05');
    await aReceber('Conta de setembro', '90.00', '2026-09-05');

    expect((await verFechamento()).json().totalAReceber).toBe('20.00');
  });

  it('conta só o que falta num título parcialmente pago', async () => {
    const conta = await aReceber('Churrasco', '100.00', '2026-08-10');

    await app.inject({
      method: 'POST',
      url: `/lancamentos/${conta.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-15', valorPago: '40.00' },
    });

    // Pelo valor cheio, o acerto cobraria de novo os R$ 40 que já foram pagos.
    expect((await verFechamento()).json().totalAReceber).toBe('60.00');
  });

  it('quita só o que foi selecionado e deixa o resto em aberto', async () => {
    const churrasco = await aReceber('Churrasco', '150.00', '2026-08-10');
    const emDiscussao = await aReceber('Em discussão', '70.00', '2026-08-11');

    const resposta = await quitar({ lancamentosIds: [churrasco.json().id] });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ numero: 1, quitados: 1 });

    const depois = (await verFechamento()).json();

    // A conta desmarcada segue em aberto: é o que permite fechar o mês deixando de lado
    // uma conta ainda em discussão.
    expect(depois.aReceber.map((i: { id: string }) => i.id)).toEqual([emDiscussao.json().id]);
  });

  it('grava a observação com o número do fechamento e o mês por extenso', async () => {
    const conta = await aReceber('Churrasco', '150.00', '2026-08-10');

    await quitar({ lancamentosIds: [conta.json().id] });

    const pagamento = await app.prisma.payment.findFirstOrThrow({
      where: { obligationId: conta.json().id },
    });

    expect(pagamento.note).toBe('Quitado no fechamento nº 1 - Agosto/2026');
    expect(pagamento.amount.toString()).toBe('150');
  });

  it('incrementa o número do fechamento a cada acerto', async () => {
    const primeira = await aReceber('Uma', '10.00', '2026-08-10');
    const segunda = await aReceber('Outra', '20.00', '2026-08-11');

    expect((await quitar({ lancamentosIds: [primeira.json().id] })).json().numero).toBe(1);
    expect((await quitar({ lancamentosIds: [segunda.json().id] })).json().numero).toBe(2);

    const usuario = await app.prisma.user.findUniqueOrThrow({ where: { id: anaId } });
    expect(usuario.nextSettlementNumber).toBe(3);
  });

  it('lança o acerto da diferença como título novo', async () => {
    const receber = await aReceber('Churrasco', '150.00', '2026-08-10');
    const pagar = await aPagar('Uber', '50.00', '2026-08-12');

    const resposta = await quitar({
      lancamentosIds: [receber.json().id, pagar.json().id],
      novoTitulo: {
        descricao: 'Acerto do fechamento nº 1 do mês Agosto/2026',
        vencimento: '2026-09-10',
        formaDePagamento: 'CASH',
      },
    });

    const acerto = await app.prisma.obligation.findUniqueOrThrow({
      where: { id: resposta.json().acertoId },
    });

    expect(acerto.description).toBe('Acerto do fechamento nº 1 do mês Agosto/2026');
    expect(acerto.amount.toString()).toBe('100');
    // Saldo positivo: o Bruno é quem deve a diferença.
    expect(acerto.debtorId).toBe(brunoFichaId);
    expect(acerto.originType).toBe('MANUAL');
  });

  it('inverte as pontas do acerto quando o saldo é negativo', async () => {
    const receber = await aReceber('Pequena', '20.00', '2026-08-10');
    const pagar = await aPagar('Grande', '120.00', '2026-08-12');

    const resposta = await quitar({
      lancamentosIds: [receber.json().id, pagar.json().id],
      novoTitulo: {
        descricao: 'Acerto',
        vencimento: '2026-09-10',
        formaDePagamento: 'CASH',
      },
    });

    const acerto = await app.prisma.obligation.findUniqueOrThrow({
      where: { id: resposta.json().acertoId },
    });

    // O valor é sempre absoluto: quem deve a quem está nas duas pontas, e um valor
    // negativo faria a mesma informação existir em dois lugares.
    expect(acerto.amount.toString()).toBe('100');
    expect(acerto.creditorId).toBe(brunoFichaId);
  });

  it('não lança acerto quando os dois lados se anulam', async () => {
    const receber = await aReceber('Churrasco', '100.00', '2026-08-10');
    const pagar = await aPagar('Uber', '100.00', '2026-08-12');

    const resposta = await quitar({
      lancamentosIds: [receber.json().id, pagar.json().id],
      novoTitulo: { descricao: 'Acerto', vencimento: '2026-09-10', formaDePagamento: 'CASH' },
    });

    expect(resposta.json().acertoId).toBeNull();
  });

  it('recusa lançamento que não é deste participante', async () => {
    const carla = await app.prisma.person.create({ data: { name: 'Carla', ownerId: anaId } });
    const daCarla = await lancar({
      direcao: 'RECEIVABLE',
      descricao: 'Da Carla',
      valor: '10.00',
      vencimento: '2026-08-10',
      formaDePagamento: 'CASH',
      pessoaId: carla.id,
    });

    const resposta = await quitar({ lancamentosIds: [daCarla.json().id] });

    expect(resposta.statusCode).toBe(422);
  });

  it('não expõe pessoa de outro usuário', async () => {
    const { usuario: outro } = await criarUsuario(app, { email: 'outro@exemplo.com' });
    const pessoaAlheia = await app.prisma.person.create({
      data: { name: 'Alheia', ownerId: outro.id },
    });

    const resposta = await app.inject({
      method: 'GET',
      url: `/participantes/${pessoaAlheia.id}/fechamento?mes=2026-08`,
      headers: { cookie },
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('exige sessão', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: `/participantes/${brunoFichaId}/fechamento?mes=2026-08`,
    });

    expect(resposta.statusCode).toBe(401);
  });
});

describe('fechamento com participante que também tem conta', () => {
  it('deixa a baixa da minha dívida pendente da confirmação dele', async () => {
    const { usuario: bruno } = await criarUsuario(app, {
      email: 'bruno@exemplo.com',
      nome: 'Bruno',
    });

    await app.prisma.person.update({
      where: { id: brunoFichaId },
      data: { userId: bruno.id },
    });

    const divida = await aPagar('Uber', '50.00', '2026-08-12');

    await quitar({ lancamentosIds: [divida.json().id] });

    const pagamento = await app.prisma.payment.findFirstOrThrow({
      where: { obligationId: divida.json().id },
    });

    // O fechamento organiza o acerto; ele não dá ao devedor um atalho para dar a própria
    // dívida por paga sem quem recebe reconhecer.
    expect(pagamento.confirmed).toBe(false);

    const obrigacao = await app.prisma.obligation.findUniqueOrThrow({
      where: { id: divida.json().id },
    });
    expect(obrigacao.status).toBe('OPEN');
  });
});

describe('saldo com cada participante', () => {
  function verSaldos(mes = '2026-08') {
    return app.inject({
      method: 'GET',
      url: `/participantes/saldos?mes=${mes}`,
      headers: { cookie },
    });
  }

  it('devolve o líquido de cada pessoa, do maior credor ao maior devedor', async () => {
    const carla = await app.prisma.person.create({ data: { name: 'Carla', ownerId: anaId } });

    await aReceber('Pizza', '300.00', '2026-08-10');
    await aPagar('Uber', '100.00', '2026-08-12');
    await lancar({
      direcao: 'PAYABLE',
      descricao: 'Cinema',
      valor: '50.00',
      vencimento: '2026-08-15',
      formaDePagamento: 'CASH',
      pessoaId: carla.id,
    });

    const corpo = (await verSaldos()).json();

    expect(corpo.participantes).toHaveLength(2);
    // Bruno: 300 a receber − 100 a pagar = 200. Carla: 50 a pagar = −50.
    expect(corpo.participantes[0]).toMatchObject({ nome: 'Bruno', saldo: '200.00', titulos: 2 });
    expect(corpo.participantes[1]).toMatchObject({ nome: 'Carla', saldo: '-50.00' });
  });

  it('conta o que falta, e não o valor cheio', async () => {
    const conta = await aReceber('Pizza', '300.00', '2026-08-10');

    await app.inject({
      method: 'POST',
      url: `/lancamentos/${conta.json().id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-20', valorPago: '120.00' },
    });

    // Um título pago pela metade entra pelo que falta, senão o saldo cobraria de novo o
    // que já foi pago.
    expect((await verSaldos()).json().participantes[0]).toMatchObject({ saldo: '180.00' });
  });

  it('inclui a dívida de meses anteriores', async () => {
    await aReceber('Conta de junho', '80.00', '2026-06-10');

    // O recorte é **até** o mês: uma dívida velha que sumisse da lista ficaria pendurada,
    // invisível, para sempre.
    expect((await verSaldos('2026-08')).json().participantes[0]).toMatchObject({
      saldo: '80.00',
    });
  });

  it('mantém na lista quem está quite', async () => {
    const corpo = (await verSaldos()).json();

    // "Não aparece" e "não deve nada" são coisas diferentes: some da lista e a pessoa vai
    // procurar o cadastro achando que ele sumiu.
    expect(corpo.participantes).toHaveLength(1);
    expect(corpo.participantes[0]).toMatchObject({ nome: 'Bruno', saldo: '0.00', titulos: 0 });
  });

  it('não mistura o saldo de outro usuário', async () => {
    await criarUsuario(app, { email: 'zeca@exemplo.com', nome: 'Zeca' });
    const cookieDoZeca = await logar(app, 'zeca@exemplo.com');

    await aReceber('Pizza', '300.00', '2026-08-10');

    const doZeca = await app.inject({
      method: 'GET',
      url: '/participantes/saldos?mes=2026-08',
      headers: { cookie: cookieDoZeca },
    });

    expect(doZeca.json().participantes).toHaveLength(0);
  });
});
