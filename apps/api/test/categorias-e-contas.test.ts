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

function get(url: string) {
  return app.inject({ method: 'GET', url, headers: { cookie } });
}

async function criarCategoria(nome: string, extras: Record<string, unknown> = {}) {
  return (await post('/categorias', { nome, ...extras })).json();
}

function lancar(payload: Record<string, unknown>) {
  return post('/lancamentos', {
    direcao: 'PAYABLE',
    formaDePagamento: 'CASH',
    vencimento: '2026-08-10',
    ...payload,
  });
}

describe('categorias', () => {
  it('cria e lista', async () => {
    await criarCategoria('Mercado', { cor: '#ff0000' });

    const lista = (await get('/categorias')).json();

    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ nome: 'Mercado', cor: '#ff0000', limite: null });
  });

  it('recusa nome repetido', async () => {
    await criarCategoria('Mercado');

    expect((await post('/categorias', { nome: 'Mercado' })).statusCode).toBe(422);
  });

  it('arquiva em vez de excluir, e mantém a categoria no lançamento', async () => {
    const categoria = await criarCategoria('Mercado');
    const conta = await lancar({ descricao: 'Feira', valor: '100.00', categoriaId: categoria.id });

    await app.inject({
      method: 'DELETE',
      url: `/categorias/${categoria.id}`,
      headers: { cookie },
    });

    // Apagar de verdade tiraria a classificação do lançamento antigo, e o relatório do
    // mês passado mudaria retroativamente.
    expect((await get('/categorias')).json()).toHaveLength(0);
    expect((await get('/categorias?arquivadas=true')).json()).toHaveLength(1);

    const lancamentos = (await get('/lancamentos?direcao=PAYABLE&situacao=TODAS')).json();
    expect(lancamentos.find((i: { id: string }) => i.id === conta.json().id).categoria).toBe(
      'Mercado',
    );
  });

  it('desarquiva ao recriar com o mesmo nome', async () => {
    const categoria = await criarCategoria('Mercado');
    await app.inject({ method: 'DELETE', url: `/categorias/${categoria.id}`, headers: { cookie } });

    const recriada = await criarCategoria('Mercado');

    // Mesmo id: os lançamentos antigos voltam à mesma classificação, em vez de ficarem
    // numa categoria homônima e órfã.
    expect(recriada.id).toBe(categoria.id);
    expect(recriada.arquivada).toBe(false);
  });

  it('recusa categoria de outro usuário no lançamento', async () => {
    const { usuario: outro } = await criarUsuario(app, { email: 'outro@exemplo.com' });
    const alheia = await app.prisma.category.create({
      data: { ownerId: outro.id, name: 'Alheia' },
    });

    const resposta = await lancar({ descricao: 'Teste', valor: '10.00', categoriaId: alheia.id });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('relatório por categoria', () => {
  it('agrupa, ordena pelo maior e traz o consumo do limite', async () => {
    const mercado = await criarCategoria('Mercado');
    const transporte = await criarCategoria('Transporte');

    await app.inject({
      method: 'PUT',
      url: `/categorias/${mercado.id}/limite`,
      headers: { cookie },
      payload: { valor: '500.00' },
    });

    await lancar({ descricao: 'Feira', valor: '600.00', categoriaId: mercado.id });
    await lancar({ descricao: 'Uber', valor: '100.00', categoriaId: transporte.id });

    const relatorio = (await get('/relatorios/categorias?mes=2026-08&direcao=PAYABLE')).json();

    expect(relatorio.total).toBe('700.00');
    expect(relatorio.linhas[0]).toMatchObject({ nome: 'Mercado', previsto: '600.00' });
    // Passa de 1 de propósito: cortar esconderia o tamanho do estouro, que é a informação
    // que faz alguém mudar de comportamento.
    expect(relatorio.linhas[0].consumo).toBeCloseTo(1.2);
    expect(relatorio.linhas[1].consumo).toBeNull();
  });

  it('mostra o que ainda não foi classificado como linha própria', async () => {
    await lancar({ descricao: 'Sem classificar', valor: '80.00' });

    const relatorio = (await get('/relatorios/categorias?mes=2026-08&direcao=PAYABLE')).json();

    expect(relatorio.linhas[0]).toMatchObject({ nome: 'Sem categoria', categoriaId: null });
  });

  it('o limite do mês tem precedência sobre o padrão', async () => {
    const mercado = await criarCategoria('Mercado');

    for (const payload of [{ valor: '500.00' }, { mes: '2026-08', valor: '900.00' }]) {
      await app.inject({
        method: 'PUT',
        url: `/categorias/${mercado.id}/limite`,
        headers: { cookie },
        payload,
      });
    }

    await lancar({ descricao: 'Feira', valor: '600.00', categoriaId: mercado.id });

    const agosto = (await get('/relatorios/categorias?mes=2026-08&direcao=PAYABLE')).json();

    expect(agosto.linhas[0].limite).toBe('900.00');
  });
});

describe('contas bancárias', () => {
  async function criarConta(nome: string, saldoInicial = '1000.00') {
    return (await post('/contas', { nome, saldoInicial })).json();
  }

  it('calcula o saldo a partir do inicial e dos pagamentos', async () => {
    const conta = await criarConta('Corrente');
    const aluguel = await lancar({ descricao: 'Aluguel', valor: '300.00' });

    await post(`/lancamentos/${aluguel.json().id}/baixa`, {
      dataDaBaixa: '2026-08-10',
      contaId: conta.id,
    });

    const resumo = (await get('/contas')).json();

    expect(resumo.contas[0]).toMatchObject({ saldo: '700.00', saidas: '300.00' });
    expect(resumo.total).toBe('700.00');
  });

  it('soma o que entra e subtrai o que sai', async () => {
    const conta = await criarConta('Corrente', '0');

    const salario = await post('/lancamentos', {
      direcao: 'RECEIVABLE',
      descricao: 'Salário',
      valor: '5000.00',
      vencimento: '2026-08-05',
      formaDePagamento: 'CASH',
      contraparte: 'Empresa X',
    });
    const aluguel = await lancar({ descricao: 'Aluguel', valor: '1800.00' });

    for (const id of [salario.json().id, aluguel.json().id]) {
      await post(`/lancamentos/${id}/baixa`, { dataDaBaixa: '2026-08-10', contaId: conta.id });
    }

    const resumo = (await get('/contas')).json();

    expect(resumo.contas[0]).toMatchObject({
      entradas: '5000.00',
      saidas: '1800.00',
      saldo: '3200.00',
    });
  });

  it('ignora pagamento pendente de confirmação', async () => {
    const { usuario: bruno } = await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const cookieDoBruno = await logar(app, 'bruno@exemplo.com');
    const ana = await app.prisma.user.findFirstOrThrow({ where: { email: 'ana@exemplo.com' } });

    const ficha = await app.prisma.person.create({
      data: { name: 'Bruno', ownerId: ana.id, userId: bruno.id },
    });

    const divida = await post('/lancamentos', {
      direcao: 'RECEIVABLE',
      descricao: 'Churrasco',
      valor: '100.00',
      vencimento: '2026-08-10',
      formaDePagamento: 'CASH',
      pessoaId: ficha.id,
    });

    const contaDoBruno = (
      await app.inject({
        method: 'POST',
        url: '/contas',
        headers: { cookie: cookieDoBruno },
        payload: { nome: 'Corrente', saldoInicial: '500.00' },
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: `/lancamentos/${divida.json().id}/baixa`,
      headers: { cookie: cookieDoBruno },
      payload: { dataDaBaixa: '2026-08-11', contaId: contaDoBruno.id },
    });

    const resumo = (
      await app.inject({ method: 'GET', url: '/contas', headers: { cookie: cookieDoBruno } })
    ).json();

    // Um pagamento que ninguém reconheceu não moveu dinheiro: somá-lo mostraria na conta
    // um saldo que o banco não tem.
    expect(resumo.contas[0].saldo).toBe('500.00');
  });

  it('recusa conta de outro usuário na baixa', async () => {
    const { usuario: outro } = await criarUsuario(app, { email: 'outro@exemplo.com' });
    const alheia = await app.prisma.bankAccount.create({
      data: { ownerId: outro.id, name: 'Alheia' },
    });
    const conta = await lancar({ descricao: 'Aluguel', valor: '300.00' });

    const resposta = await post(`/lancamentos/${conta.json().id}/baixa`, {
      dataDaBaixa: '2026-08-10',
      contaId: alheia.id,
    });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('busca', () => {
  it('acha lançamento pela descrição e pessoa pelo nome', async () => {
    const bruno = await app.prisma.person.create({
      data: {
        name: 'Bruno Silva',
        ownerId: (await app.prisma.user.findFirstOrThrow({ where: { email: 'ana@exemplo.com' } }))
          .id,
      },
    });

    await lancar({ descricao: 'Churrasco do Bruno', valor: '150.00', pessoaId: bruno.id });

    const resultado = (await get('/busca?q=bruno')).json();
    const tipos = resultado.itens.map((item: { tipo: string }) => item.tipo);

    expect(tipos).toContain('LANCAMENTO');
    expect(tipos).toContain('PESSOA');
  });

  it('ignora a diferença de caixa', async () => {
    await lancar({ descricao: 'Conta de Luz', valor: '90.00' });

    expect((await get('/busca?q=LUZ')).json().itens).toHaveLength(1);
  });

  it('exige ao menos dois caracteres', async () => {
    // Com um só, quase todo lançamento casa e o resultado é a lista inteira — o que
    // parece uma busca quebrada e custa uma varredura completa a cada tecla.
    expect((await get('/busca?q=a')).statusCode).toBe(400);
  });

  it('não acha o que é de outro usuário', async () => {
    const { usuario: outro } = await criarUsuario(app, { email: 'outro@exemplo.com' });
    await app.prisma.person.create({ data: { name: 'Segredo', ownerId: outro.id } });

    expect((await get('/busca?q=segredo')).json().itens).toHaveLength(0);
  });
});

describe('avisos', () => {
  it('avisa o que está atrasado e o que vence em breve', async () => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const daquiATresDias = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await lancar({ descricao: 'Luz', valor: '90.00', vencimento: ontem });
    await lancar({ descricao: 'Água', valor: '50.00', vencimento: daquiATresDias });

    const avisos = (await get('/avisos')).json();
    const tipos = avisos.itens.map((item: { tipo: string }) => item.tipo);

    expect(tipos).toContain('ATRASADO');
    expect(tipos).toContain('VENCE_EM_BREVE');
    // O contador vermelho conta só os de gravidade alta.
    expect(avisos.urgentes).toBe(1);
  });

  it('não avisa sobre o que vence longe', async () => {
    const daquiAUmMes = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await lancar({ descricao: 'Longe', valor: '10.00', vencimento: daquiAUmMes });

    expect((await get('/avisos')).json().itens).toHaveLength(0);
  });

  it('avisa quando o limite da categoria estoura no mês corrente', async () => {
    const mercado = await criarCategoria('Mercado');
    const hoje = new Date().toISOString().slice(0, 10);

    await app.inject({
      method: 'PUT',
      url: `/categorias/${mercado.id}/limite`,
      headers: { cookie },
      payload: { valor: '100.00' },
    });

    await lancar({
      descricao: 'Feira',
      valor: '150.00',
      vencimento: hoje,
      categoriaId: mercado.id,
    });

    const tipos = (await get('/avisos')).json().itens.map((item: { tipo: string }) => item.tipo);

    expect(tipos).toContain('LIMITE_ESTOURADO');
  });
});

describe('classificação em lote', () => {
  it('agrupa lançamentos com a mesma descrição', async () => {
    for (const dia of ['05', '12', '19']) {
      await lancar({ descricao: 'Uber', valor: '25.00', vencimento: `2026-08-${dia}` });
    }
    await lancar({ descricao: 'Feira', valor: '100.00' });

    const dados = (await get('/classificar')).json();

    expect(dados.totalDeLancamentos).toBe(4);
    // Maiores primeiro: são os grupos que mais reduzem a lista a cada decisão.
    expect(dados.grupos[0]).toMatchObject({
      descricao: 'Uber',
      quantidade: 3,
      total: '75.00',
    });
  });

  it('trata espaçamento e caixa diferentes como o mesmo grupo', async () => {
    await lancar({ descricao: 'Uber  Trip', valor: '25.00' });
    await lancar({ descricao: 'UBER TRIP', valor: '30.00' });

    const dados = (await get('/classificar')).json();

    // O extrato do banco varia o espaçamento entre exportações; sem normalizar, a pessoa
    // classificaria o mesmo estabelecimento duas vezes.
    expect(dados.grupos).toHaveLength(1);
    expect(dados.grupos[0].quantidade).toBe(2);
  });

  it('separa os dois lados mesmo com a descrição igual', async () => {
    await lancar({ descricao: 'Acerto', valor: '50.00' });
    await post('/lancamentos', {
      direcao: 'RECEIVABLE',
      descricao: 'Acerto',
      valor: '80.00',
      vencimento: '2026-08-10',
      formaDePagamento: 'CASH',
      contraparte: 'Alguém',
    });

    const dados = (await get('/classificar')).json();

    // Uma categoria de saída não serve a uma entrada: juntar os dois lados no mesmo grupo
    // obrigaria a escolher uma categoria que só faz sentido para metade dele.
    expect(dados.grupos).toHaveLength(2);
    expect(dados.grupos.map((g: { direcao: string }) => g.direcao).sort()).toEqual([
      'PAYABLE',
      'RECEIVABLE',
    ]);
  });

  it('sugere a categoria que um lançamento igual já recebeu', async () => {
    const transporte = await criarCategoria('Transporte');

    await lancar({ descricao: 'Uber', valor: '25.00', categoriaId: transporte.id });
    await lancar({ descricao: 'Uber', valor: '30.00', vencimento: '2026-09-05' });

    const dados = (await get('/classificar')).json();

    expect(dados.grupos[0]).toMatchObject({
      sugestaoCategoriaId: transporte.id,
      sugestaoCategoria: 'Transporte',
    });
  });

  it('não sugere categoria arquivada', async () => {
    const antiga = await criarCategoria('Antiga');

    await lancar({ descricao: 'Uber', valor: '25.00', categoriaId: antiga.id });
    await app.inject({ method: 'DELETE', url: `/categorias/${antiga.id}`, headers: { cookie } });
    await lancar({ descricao: 'Uber', valor: '30.00', vencimento: '2026-09-05' });

    const dados = (await get('/classificar')).json();

    // Seria oferecer de volta o que a pessoa deliberadamente tirou das listas.
    expect(dados.grupos[0].sugestaoCategoriaId).toBeNull();
  });

  it('classifica todos os lançamentos de um grupo de uma vez', async () => {
    const transporte = await criarCategoria('Transporte');
    const ids: string[] = [];

    for (const dia of ['05', '12', '19']) {
      const conta = await lancar({
        descricao: 'Uber',
        valor: '25.00',
        vencimento: `2026-08-${dia}`,
      });
      ids.push(conta.json().id);
    }

    const resposta = await post('/classificar', {
      categoriaId: transporte.id,
      lancamentosIds: ids,
    });

    expect(resposta.json().classificados).toBe(3);
    expect((await get('/classificar')).json().grupos).toHaveLength(0);

    const relatorio = (await get('/relatorios/categorias?mes=2026-08&direcao=PAYABLE')).json();
    expect(relatorio.linhas[0]).toMatchObject({ nome: 'Transporte', previsto: '75.00' });
  });

  it('remove a categoria quando recebe nulo', async () => {
    const transporte = await criarCategoria('Transporte');
    const conta = await lancar({ descricao: 'Uber', valor: '25.00', categoriaId: transporte.id });

    await post('/classificar', {
      categoriaId: null,
      lancamentosIds: [conta.json().id],
    });

    expect((await get('/classificar')).json().totalDeLancamentos).toBe(1);
  });

  it('ignora lançamento de outro usuário', async () => {
    const transporte = await criarCategoria('Transporte');
    // `criarUsuario` já cria a ficha espelho; criar outra violaria o unique (dono, conta).
    const { pessoa: fichaAlheia } = await criarUsuario(app, { email: 'outro@exemplo.com' });
    const alheio = await app.prisma.obligation.create({
      data: {
        debtorId: fichaAlheia.id,
        description: 'Alheio',
        amount: '10.00',
        dueDate: new Date('2026-08-10'),
        paymentMethod: 'CASH',
        originType: 'MANUAL',
      },
    });

    // O dono entra no filtro do próprio `updateMany`: um id de outra pessoa não casa, em
    // vez de depender de uma verificação anterior que alguém pode esquecer.
    const resposta = await post('/classificar', {
      categoriaId: transporte.id,
      lancamentosIds: [alheio.id],
    });

    expect(resposta.json().classificados).toBe(0);

    const conferencia = await app.prisma.obligation.findUniqueOrThrow({
      where: { id: alheio.id },
    });
    expect(conferencia.categoryId).toBeNull();
  });

  it('recusa categoria de outro usuário', async () => {
    const { usuario: outro } = await criarUsuario(app, { email: 'outro@exemplo.com' });
    const alheia = await app.prisma.category.create({
      data: { ownerId: outro.id, name: 'Alheia' },
    });
    const conta = await lancar({ descricao: 'Uber', valor: '25.00' });

    const resposta = await post('/classificar', {
      categoriaId: alheia.id,
      lancamentosIds: [conta.json().id],
    });

    expect(resposta.statusCode).toBe(404);
  });
});
