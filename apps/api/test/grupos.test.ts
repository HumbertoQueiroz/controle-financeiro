import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, type App } from './helpers.js';

let app: App;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();
});

afterEach(() => app.close());

interface Cenario {
  cookie: string;
  grupoId: string;
  roleId: string;
  ana: string;
  bruno: string;
  carla: string;
}

/**
 * Grupo com Ana (a dona), Bruno e Carla, e um rolê em agosto.
 * Montar isso em cada teste faria o preparo esconder o que o teste verifica.
 */
async function montarGrupo(app: App): Promise<Cenario> {
  await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
  const cookie = await logar(app, 'ana@exemplo.com');

  const grupo = await app.inject({
    method: 'POST',
    url: '/grupos',
    headers: { cookie },
    payload: { nome: 'Amigos' },
  });
  const grupoId = grupo.json().id as string;

  const criarPessoa = async (nome: string) => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie },
      payload: { nome },
    });

    const pessoaId = resposta.json().id as string;

    await app.inject({
      method: 'POST',
      url: `/grupos/${grupoId}/membros`,
      headers: { cookie },
      payload: { pessoaId },
    });

    return pessoaId;
  };

  const bruno = await criarPessoa('Bruno');
  const carla = await criarPessoa('Carla');

  const membros = await app.inject({
    method: 'GET',
    url: `/grupos/${grupoId}/membros`,
    headers: { cookie },
  });
  const ana = membros.json().find((m: { nome: string }) => m.nome === 'Ana').pessoaId as string;

  const role = await app.inject({
    method: 'POST',
    url: `/grupos/${grupoId}/roles`,
    headers: { cookie },
    payload: { nome: 'Churrasco', data: '2026-08-15' },
  });

  return { cookie, grupoId, roleId: role.json().id, ana, bruno, carla };
}

function despesa(cenario: Cenario, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/roles/${cenario.roleId}/despesas`,
    headers: { cookie: cenario.cookie },
    payload,
  });
}

describe('grupo e membros', () => {
  it('coloca quem criou dentro do grupo', async () => {
    const cenario = await montarGrupo(app);

    const membros = await app.inject({
      method: 'GET',
      url: `/grupos/${cenario.grupoId}/membros`,
      headers: { cookie: cenario.cookie },
    });

    // Um grupo sem o criador faria a despesa dele não entrar no rateio, e o saldo do rolê
    // fecharia errado logo na primeira conta.
    expect(membros.json().some((m: { nome: string }) => m.nome === 'Ana')).toBe(true);
    expect(membros.json()).toHaveLength(3);
  });

  it('não deixa remover quem já participou de despesa', async () => {
    const cenario = await montarGrupo(app);
    await despesa(cenario, {
      descricao: 'Carne',
      valor: '150.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
    });

    // Remover apagaria a cota por cascata e o saldo de todo mundo mudaria
    // retroativamente, sem ninguém ter pago nada.
    const resposta = await app.inject({
      method: 'DELETE',
      url: `/grupos/${cenario.grupoId}/membros/${cenario.bruno}`,
      headers: { cookie: cenario.cookie },
    });

    expect(resposta.statusCode).toBe(422);
  });

  it('não enxerga grupo de outra pessoa', async () => {
    const cenario = await montarGrupo(app);
    await criarUsuario(app, { email: 'zeca@exemplo.com' });
    const zeca = await logar(app, 'zeca@exemplo.com');

    const resposta = await app.inject({
      method: 'GET',
      url: `/grupos/${cenario.grupoId}/membros`,
      headers: { cookie: zeca },
    });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('despesa e rateio', () => {
  it('divide entre todos os membros quando não se diz entre quem', async () => {
    const cenario = await montarGrupo(app);

    const resposta = await despesa(cenario, {
      descricao: 'Carne',
      valor: '150.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().cotas).toHaveLength(3);
    expect(resposta.json().cotas.every((c: { valor: string }) => c.valor === '50')).toBe(true);
  });

  it('distribui o centavo que não divide exato', async () => {
    const cenario = await montarGrupo(app);

    const resposta = await despesa(cenario, {
      descricao: 'Gelo',
      valor: '10.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
    });

    const valores = resposta
      .json()
      .cotas.map((c: { valor: string }) => Number(c.valor))
      .sort((a: number, b: number) => b - a);

    // Truncar daria 3,33 cada e a soma seria 9,99: o grupo ficaria devendo um centavo a
    // ninguém, para sempre.
    expect(valores).toEqual([3.34, 3.33, 3.33]);
    expect(valores.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(10, 2);
  });

  it('gera obrigação para cada participante, menos para quem pagou', async () => {
    const cenario = await montarGrupo(app);
    await despesa(cenario, {
      descricao: 'Carne',
      valor: '150.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
    });

    const obrigacoes = await app.prisma.obligation.findMany({
      where: { originType: 'GROUP_EXPENSE' },
    });

    // Ninguém deve a si mesmo — e o banco recusaria a linha de qualquer forma.
    expect(obrigacoes).toHaveLength(2);
    expect(obrigacoes.every((o) => o.creditorId === cenario.ana)).toBe(true);
    expect(obrigacoes.some((o) => o.debtorId === cenario.ana)).toBe(false);
  });

  it('aceita cotas explícitas quando a divisão não é igual', async () => {
    const cenario = await montarGrupo(app);

    const resposta = await despesa(cenario, {
      descricao: 'Bebidas',
      valor: '100.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
      cotas: { [cenario.ana]: '20.00', [cenario.bruno]: '50.00', [cenario.carla]: '30.00' },
    });

    expect(resposta.statusCode).toBe(201);

    const obrigacoes = await app.prisma.obligation.findMany({
      where: { originType: 'GROUP_EXPENSE' },
    });
    expect(obrigacoes.map((o) => o.amount.toString()).sort()).toEqual(['30', '50']);
  });

  it('recusa cotas que não somam o valor da despesa', async () => {
    const cenario = await montarGrupo(app);

    // Aceitar a diferença faria o rateio distribuir um total diferente do que foi gasto, e
    // o erro só apareceria no fechamento, como um saldo que não zera.
    const resposta = await despesa(cenario, {
      descricao: 'Bebidas',
      valor: '100.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
      cotas: { [cenario.ana]: '20.00', [cenario.bruno]: '50.00' },
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().mensagem).toContain('não bate');
  });

  it('recusa quem não é membro do grupo', async () => {
    const cenario = await montarGrupo(app);
    const forasteiro = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie: cenario.cookie },
      payload: { nome: 'Zeca' },
    });

    const resposta = await despesa(cenario, {
      descricao: 'Carvão',
      valor: '30.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
      participantes: [cenario.ana, forasteiro.json().id],
    });

    expect(resposta.statusCode).toBe(422);
  });

  it('divide só entre quem participou, quando informado', async () => {
    const cenario = await montarGrupo(app);

    const resposta = await despesa(cenario, {
      descricao: 'Uber do Bruno e da Carla',
      valor: '40.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
      participantes: [cenario.bruno, cenario.carla],
    });

    expect(resposta.json().cotas).toHaveLength(2);

    const obrigacoes = await app.prisma.obligation.findMany({
      where: { originType: 'GROUP_EXPENSE' },
    });
    expect(obrigacoes.every((o) => o.amount.toString() === '20')).toBe(true);
  });
});

describe('fechamento do mês', () => {
  /** Ana paga 150, Bruno paga 60, Carla não paga nada. Tudo dividido por três. */
  async function comDespesasCruzadas(app: App) {
    const cenario = await montarGrupo(app);

    await despesa(cenario, {
      descricao: 'Carne',
      valor: '150.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
    });
    await despesa(cenario, {
      descricao: 'Bebidas',
      valor: '60.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.bruno,
    });

    return cenario;
  }

  it('mostra a prévia sem gravar nada', async () => {
    const cenario = await comDespesasCruzadas(app);

    const previa = await app.inject({
      method: 'GET',
      url: `/grupos/${cenario.grupoId}/fechamento?periodo=2026-08`,
      headers: { cookie: cenario.cookie },
    });

    expect(previa.statusCode).toBe(200);
    expect(previa.json().totalDoPeriodo).toBe('210.00');

    // Total 210, cota de 70 cada. Ana pagou 150 → +80. Bruno pagou 60 → −10. Carla → −70.
    const saldos = Object.fromEntries(
      previa.json().saldos.map((s: { nome: string; saldo: string }) => [s.nome, s.saldo]),
    );
    expect(saldos).toEqual({ Ana: '80.00', Bruno: '-10.00', Carla: '-70.00' });

    // Prévia não grava: fechar liquida obrigações, e ninguém deve descobrir o resultado
    // depois de ele já ter acontecido.
    expect(await app.prisma.settlement.count()).toBe(0);
  });

  it('compensa: quem deve paga direto a quem tem a receber', async () => {
    const cenario = await comDespesasCruzadas(app);

    const fechamento = await app.inject({
      method: 'POST',
      url: `/grupos/${cenario.grupoId}/fechamento`,
      headers: { cookie: cenario.cookie },
      payload: { periodo: '2026-08' },
    });

    const transferencias = fechamento.json().transferencias;

    // Sem compensação seriam 4 cobranças (cada um devendo a cada pagante). Com ela, 2.
    expect(transferencias).toHaveLength(2);

    const soma = transferencias.reduce(
      (total: number, t: { valor: string }) => total + Number(t.valor),
      0,
    );
    expect(soma).toBeCloseTo(80, 2);
    expect(transferencias.every((t: { para: string }) => t.para === 'Ana')).toBe(true);
  });

  it('liquida as obrigações do período', async () => {
    const cenario = await comDespesasCruzadas(app);

    await app.inject({
      method: 'POST',
      url: `/grupos/${cenario.grupoId}/fechamento`,
      headers: { cookie: cenario.cookie },
      payload: { periodo: '2026-08' },
    });

    const abertas = await app.prisma.obligation.count({
      where: { originType: 'GROUP_EXPENSE', status: { in: ['OPEN', 'PARTIAL'] } },
    });

    // As obrigações individuais foram absorvidas pelas transferências. Mantê-las abertas
    // faria o mês seguinte cobrar de novo o que já foi acertado.
    expect(abertas).toBe(0);
  });

  it('recusa fechar o mesmo período duas vezes', async () => {
    const cenario = await comDespesasCruzadas(app);
    const fechar = () =>
      app.inject({
        method: 'POST',
        url: `/grupos/${cenario.grupoId}/fechamento`,
        headers: { cookie: cenario.cookie },
        payload: { periodo: '2026-08' },
      });

    expect((await fechar()).statusCode).toBe(201);
    expect((await fechar()).statusCode).toBe(422);
  });

  it('recusa fechar período sem nada em aberto', async () => {
    const cenario = await montarGrupo(app);

    const resposta = await app.inject({
      method: 'POST',
      url: `/grupos/${cenario.grupoId}/fechamento`,
      headers: { cookie: cenario.cookie },
      payload: { periodo: '2026-09' },
    });

    expect(resposta.statusCode).toBe(422);
  });

  it('não inclui despesa de outro mês', async () => {
    const cenario = await comDespesasCruzadas(app);

    const roleDeSetembro = await app.inject({
      method: 'POST',
      url: `/grupos/${cenario.grupoId}/roles`,
      headers: { cookie: cenario.cookie },
      payload: { nome: 'Aniversário', data: '2026-09-10' },
    });

    await app.inject({
      method: 'POST',
      url: `/roles/${roleDeSetembro.json().id}/despesas`,
      headers: { cookie: cenario.cookie },
      payload: {
        descricao: 'Bolo',
        valor: '90.00',
        formaDePagamento: 'CASH',
        pagantePessoaId: cenario.carla,
      },
    });

    const previa = await app.inject({
      method: 'GET',
      url: `/grupos/${cenario.grupoId}/fechamento?periodo=2026-08`,
      headers: { cookie: cenario.cookie },
    });

    expect(previa.json().totalDoPeriodo).toBe('210.00');
  });

  it('zera os saldos com valores que não dividem exato', async () => {
    const cenario = await montarGrupo(app);
    await despesa(cenario, {
      descricao: 'Gelo',
      valor: '10.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
    });

    const fechamento = await app.inject({
      method: 'POST',
      url: `/grupos/${cenario.grupoId}/fechamento`,
      headers: { cookie: cenario.cookie },
      payload: { periodo: '2026-08' },
    });

    const total = fechamento
      .json()
      .transferencias.reduce((soma: number, t: { valor: string }) => soma + Number(t.valor), 0);

    // Ana pagou 10,00 e devia 3,34 → tem 6,66 a receber, em dois pagamentos de 3,33.
    expect(total).toBeCloseTo(6.66, 2);
  });
});

describe('exclusão de despesa', () => {
  it('apaga a despesa e as obrigações enquanto nada foi acertado', async () => {
    const cenario = await montarGrupo(app);
    const criada = await despesa(cenario, {
      descricao: 'Carne',
      valor: '150.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
    });

    const resposta = await app.inject({
      method: 'DELETE',
      url: `/despesas/${criada.json().id}`,
      headers: { cookie: cenario.cookie },
    });

    expect(resposta.statusCode).toBe(200);
    expect(await app.prisma.obligation.count({ where: { originType: 'GROUP_EXPENSE' } })).toBe(0);
  });

  it('recusa apagar depois do fechamento', async () => {
    const cenario = await montarGrupo(app);
    const criada = await despesa(cenario, {
      descricao: 'Carne',
      valor: '150.00',
      formaDePagamento: 'CASH',
      pagantePessoaId: cenario.ana,
    });

    await app.inject({
      method: 'POST',
      url: `/grupos/${cenario.grupoId}/fechamento`,
      headers: { cookie: cenario.cookie },
      payload: { periodo: '2026-08' },
    });

    // Apagar depois sumiria com o registro de um dinheiro que já trocou de mãos.
    const resposta = await app.inject({
      method: 'DELETE',
      url: `/despesas/${criada.json().id}`,
      headers: { cookie: cenario.cookie },
    });

    expect(resposta.statusCode).toBe(422);
  });
});
