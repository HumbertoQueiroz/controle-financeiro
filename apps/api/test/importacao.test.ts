import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, type App } from './helpers.js';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/csv');

let app: App;
let cookie: string;
let cartaoId: string;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();
  await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
  cookie = await logar(app, 'ana@exemplo.com');

  const cartao = await app.inject({
    method: 'POST',
    url: '/cartoes',
    headers: { cookie },
    payload: { nome: 'Nubank', diaDeFechamento: 25, diaDeVencimento: 5, compartilhado: true },
  });

  cartaoId = cartao.json().id;
});

afterEach(() => app.close());

/** Monta o corpo multipart à mão: o inject não tem helper para upload. */
function corpoMultipart(nomeDoArquivo: string, mes = '2026-08') {
  const limite = '----ControleFinanceiroTeste';
  const conteudo = readFileSync(resolve(fixtures, nomeDoArquivo));

  // O mês vem antes do arquivo, como no formulário da tela: é ele que define a fatura de
  // todas as linhas, e o servidor consome o arquivo por último.
  const campoDoMes = Buffer.from(
    `--${limite}\r\n` + 'Content-Disposition: form-data; name="mes"\r\n\r\n' + `${mes}\r\n`,
  );

  const cabecalho = Buffer.from(
    `--${limite}\r\n` +
      `Content-Disposition: form-data; name="arquivo"; filename="${nomeDoArquivo}"\r\n` +
      'Content-Type: text/csv\r\n\r\n',
  );

  return {
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
    payload: Buffer.concat([campoDoMes, cabecalho, conteudo, Buffer.from(`\r\n--${limite}--\r\n`)]),
  };
}

function analisar(arquivo: string, cookieDoUsuario = cookie, cartao = cartaoId, mes = '2026-08') {
  const { headers, payload } = corpoMultipart(arquivo, mes);

  return app.inject({
    method: 'POST',
    url: `/cartoes/${cartao}/importacoes/previa`,
    headers: { ...headers, cookie: cookieDoUsuario },
    payload,
  });
}

interface LinhaDaPrevia {
  chave: string;
  data: string;
  descricao: string;
  valor: string;
  faturaSugerida: string;
  parcelaNumero: number | null;
  parcelaTotal: number | null;
  ocorrencia: number;
  categoriaSugerida?: string | null;
  acaoSugerida?: 'REGISTRAR' | 'IGNORAR' | 'SALDO_ANTERIOR';
}

/** Confirma aceitando as sugestões da prévia, com o responsável que for informado. */
function confirmar(
  previa: {
    lancamentos: LinhaDaPrevia[];
    lancamentosConhecidos?: LinhaDaPrevia[];
    novosParcelamentos: LinhaDaPrevia[];
    pagamentos: LinhaDaPrevia[];
  },
  opcoes: {
    mesSelecionado: string;
    responsaveis?: Record<string, string | null>;
    categorias?: Record<string, string | null>;
    divergenciaAceita?: boolean;
    excedenteAceito?: boolean;
    /** O que fazer com as linhas de pagamento; o padrão segue a sugestão da prévia. */
    acaoDoPagamento?: 'REGISTRAR' | 'IGNORAR' | 'SALDO_ANTERIOR';
    /** A fatura de destino do pagamento, quando o teste precisa mandá-lo para outro mês. */
    faturaDoPagamento?: string;
  },
) {
  const classificar = (linha: LinhaDaPrevia) => ({
    chave: linha.chave,
    data: linha.data,
    descricao: linha.descricao,
    valor: linha.valor,
    fatura: linha.faturaSugerida,
    responsavelPessoaId: opcoes.responsaveis?.[linha.descricao] ?? null,
    categoriaId: opcoes.categorias?.[linha.descricao] ?? null,
    parcelaNumero: linha.parcelaNumero,
    parcelaTotal: linha.parcelaTotal,
    ocorrencia: linha.ocorrencia,
  });

  return app.inject({
    method: 'POST',
    url: `/cartoes/${cartaoId}/importacoes`,
    headers: { cookie },
    payload: {
      nomeDoArquivo: 'fatura.csv',
      mesSelecionado: opcoes.mesSelecionado,
      // Como na tela: os já conhecidos vão junto, e o banco os descarta.
      lancamentos: [...previa.lancamentos, ...(previa.lancamentosConhecidos ?? [])].map(
        classificar,
      ),
      novosParcelamentos: previa.novosParcelamentos.map(classificar),
      pagamentos: previa.pagamentos.map((linha) => ({
        chave: linha.chave,
        data: linha.data,
        descricao: linha.descricao,
        valor: linha.valor,
        fatura: opcoes.faturaDoPagamento ?? linha.faturaSugerida,
        acao: opcoes.acaoDoPagamento ?? linha.acaoSugerida,
      })),
      divergenciaAceita: opcoes.divergenciaAceita ?? true,
      excedenteAceito: opcoes.excedenteAceito ?? true,
    },
  });
}

describe('prévia da importação', () => {
  it('lê o arquivo sem gravar nada', async () => {
    const resposta = await analisar('nubank-agosto.csv');

    expect(resposta.statusCode).toBe(200);
    // A tela de classificação existe justamente para a pessoa decidir antes de gravar.
    expect(await app.prisma.invoiceEntry.count()).toBe(0);
    expect(await app.prisma.invoice.count()).toBe(0);
  });

  it('separa lançamentos avulsos de parcelamentos', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();

    expect(previa.lancamentos.map((l: LinhaDaPrevia) => l.descricao)).not.toContain(
      'Farmacia Popular - 3/10',
    );
    expect(previa.novosParcelamentos).toHaveLength(1);
    expect(previa.novosParcelamentos[0]).toMatchObject({ parcelaNumero: 3, parcelaTotal: 10 });
  });

  it('lista os meses das parcelas que serão criadas', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();

    // Da parcela 3 até a 10 são oito parcelas, a atual mais sete.
    expect(previa.novosParcelamentos[0].mesesDasParcelas).toHaveLength(8);
    expect(previa.novosParcelamentos[0].mesesDasParcelas[0]).toBe('2026-08');
    expect(previa.novosParcelamentos[0].mesesDasParcelas[7]).toBe('2027-03');
  });

  it('põe toda linha na fatura do mês escolhido, inclusive as compras de antes do fechamento', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();

    // O arquivo tem uma compra de 30/07, e o cartão fecha dia 25. Ela está no extrato de
    // agosto justamente porque caiu na fatura de agosto: recalcular pela data da compra a
    // mandaria para julho, e o sistema estaria discordando do extrato que importa.
    expect(previa.lancamentos.map((l: LinhaDaPrevia) => l.descricao)).toContain('Posto Beira Rio');

    for (const linha of previa.lancamentos) {
      expect(linha.faturaSugerida).toBe('2026-08');
    }
    expect(previa.faturaSugerida).toBe('2026-08');
  });

  it('segue o mês escolhido, e não o das datas do arquivo', async () => {
    // O mesmo arquivo de agosto, importado como setembro: quem manda é a escolha da tela.
    const previa = (await analisar('nubank-agosto.csv', cookie, cartaoId, '2026-09')).json();

    expect(previa.faturaSugerida).toBe('2026-09');
    for (const linha of previa.lancamentos) {
      expect(linha.faturaSugerida).toBe('2026-09');
    }
    // As parcelas futuras acompanham: a projeção parte da fatura em que a compra entrou.
    expect(previa.novosParcelamentos[0].mesesDasParcelas[0]).toBe('2026-09');
  });

  it('recusa cartão de outra pessoa', async () => {
    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const bruno = await logar(app, 'bruno@exemplo.com');

    expect((await analisar('nubank-agosto.csv', bruno)).statusCode).toBe(404);
  });
});

describe('confirmação da importação', () => {
  it('grava os lançamentos e cria a fatura', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();
    const resposta = await confirmar(previa, { mesSelecionado: '2026-08' });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().lancamentosInseridos).toBeGreaterThan(0);

    const fatura = await app.prisma.invoice.findFirstOrThrow({
      where: { referenceMonth: '2026-08' },
    });
    // A data de fechamento vem do dia configurado no cartão.
    expect(fatura.closingDate.toISOString().slice(0, 10)).toBe('2026-08-25');
    expect(fatura.dueDate.toISOString().slice(0, 10)).toBe('2026-08-05');
  });

  it('gera as parcelas futuras nas faturas seguintes', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();
    await confirmar(previa, { mesSelecionado: '2026-08' });

    const parcelas = await app.prisma.invoiceEntry.findMany({
      where: { installmentId: { not: null } },
      include: { invoice: true },
      orderBy: { installmentNumber: 'asc' },
    });

    // O compromisso inteiro aparece nos próximos meses em vez de surgir como surpresa a
    // cada fatura.
    expect(parcelas).toHaveLength(8);
    expect(parcelas[0]!.projected).toBe(false);
    expect(parcelas[1]!.projected).toBe(true);
    expect(parcelas.map((p) => p.invoice.referenceMonth.trim())).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
    ]);
  });

  it('alerta antes de gravar quando a pessoa manda uma linha para outra fatura', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();

    // A troca é feita na tela, linha a linha. É a única forma de divergir agora: a prévia
    // devolve tudo no mês escolhido.
    const comTroca = {
      ...previa,
      lancamentos: previa.lancamentos.map((linha: LinhaDaPrevia, indice: number) =>
        indice === 0 ? { ...linha, faturaSugerida: '2026-07' } : linha,
      ),
    };

    const recusada = await confirmar(comTroca, {
      mesSelecionado: '2026-08',
      divergenciaAceita: false,
    });

    // Mandar um lançamento para outro mês é decisão de peso, e sem o aviso o erro só
    // apareceria quando o total da fatura não batesse com o do banco.
    expect(recusada.statusCode).toBe(422);
    expect(recusada.json().mensagem).toContain('2026-07');
    expect(await app.prisma.invoiceEntry.count()).toBe(0);

    const aceita = await confirmar(comTroca, {
      mesSelecionado: '2026-08',
      divergenciaAceita: true,
    });
    expect(aceita.statusCode).toBe(201);
  });

  it('não inventa divergência com compras feitas antes do fechamento', async () => {
    // O arquivo de agosto traz compras de 30 e 31 de julho: elas estão nele porque caíram
    // na fatura de agosto. Recalcular pela data da compra as mandaria para julho, e o
    // sistema avisaria de uma divergência que ele mesmo criou.
    const previa = (await analisar('nubank-agosto.csv')).json();

    const resposta = await confirmar(previa, {
      mesSelecionado: '2026-08',
      divergenciaAceita: false,
    });

    expect(resposta.statusCode).toBe(201);
  });

  it('classifica o responsável e gera o a receber', async () => {
    const bruno = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie },
      payload: { nome: 'Bruno' },
    });

    const previa = (await analisar('nubank-agosto.csv')).json();

    await confirmar(previa, {
      mesSelecionado: '2026-08',
      responsaveis: { 'Mercado Sao Joao': bruno.json().id },
    });

    const aReceber = await app.prisma.obligation.findFirstOrThrow({
      where: { originType: 'CARD_ENTRY' },
    });

    expect(aReceber.debtorId).toBe(bruno.json().id);
    expect(aReceber.amount.toString()).toBe('120.5');
  });

  it('recusa responsável que não é do cadastro', async () => {
    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const bruno = await logar(app, 'bruno@exemplo.com');
    const pessoaDoBruno = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie: bruno },
      payload: { nome: 'Carla' },
    });

    const previa = (await analisar('nubank-agosto.csv')).json();

    const resposta = await confirmar(previa, {
      mesSelecionado: '2026-08',
      responsaveis: { 'Mercado Sao Joao': pessoaDoBruno.json().id },
    });

    expect(resposta.statusCode).toBe(422);
  });

  it('continua idempotente: reimportar o mesmo arquivo não duplica', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();

    await confirmar(previa, { mesSelecionado: '2026-08' });
    const total = await app.prisma.invoiceEntry.count();

    const segunda = (await analisar('nubank-agosto.csv')).json();
    await confirmar(segunda, { mesSelecionado: '2026-08' });

    expect(await app.prisma.invoiceEntry.count()).toBe(total);
  });
});

describe('parcelamento já conhecido', () => {
  it('reconhece no mês seguinte e não lança de novo', async () => {
    const agosto = (await analisar('nubank-agosto.csv')).json();
    await confirmar(agosto, { mesSelecionado: '2026-08' });

    const setembro = (await analisar('nubank-setembro.csv')).json();

    // A parcela 4/10 já foi projetada em agosto: aparece como "parcelamento anterior"
    // para a pessoa entender por que não está sendo lançada.
    expect(setembro.parcelamentosAnteriores).toHaveLength(1);
    expect(setembro.parcelamentosAnteriores[0]).toMatchObject({
      parcelaNumero: 4,
      parcelaTotal: 10,
      faturaDaParcela: '2026-09',
    });

    // A compra nova de setembro é um parcelamento novo.
    expect(setembro.novosParcelamentos).toHaveLength(1);
    expect(setembro.novosParcelamentos[0].descricao).toContain('Livraria');
  });

  it('não duplica a parcela ao confirmar o mês seguinte', async () => {
    const agosto = (await analisar('nubank-agosto.csv')).json();
    await confirmar(agosto, { mesSelecionado: '2026-08' });

    const antes = await app.prisma.invoiceEntry.count({
      where: { description: { contains: 'Farmacia' } },
    });

    const setembro = (await analisar('nubank-setembro.csv')).json();
    await confirmar(setembro, { mesSelecionado: '2026-09' });

    expect(
      await app.prisma.invoiceEntry.count({ where: { description: { contains: 'Farmacia' } } }),
    ).toBe(antes);
  });
});

describe('tela de parcelamentos', () => {
  it('traz o cartão, o mês de cada parcela e o quanto falta', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();
    await confirmar(previa, { mesSelecionado: '2026-08' });

    const lista = await app.inject({
      method: 'GET',
      url: '/parcelamentos',
      headers: { cookie },
    });

    const parcelamento = lista.json()[0];

    expect(parcelamento.cartao).toBe('Nubank');
    expect(parcelamento.quantidadeDeParcelas).toBe(10);
    expect(parcelamento.parcelas).toHaveLength(8);
    expect(parcelamento.parcelas[0].fatura).toBe('2026-08');
    // Só a parcela que veio do extrato conta como paga; as projetadas ainda não aconteceram.
    expect(parcelamento.parcelasPagas).toBe(1);
    expect(parcelamento.restante).toBe('809.10');
  });

  it('troca o responsável de todas as parcelas de uma vez', async () => {
    const bruno = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie },
      payload: { nome: 'Bruno' },
    });

    const previa = (await analisar('nubank-agosto.csv')).json();
    await confirmar(previa, { mesSelecionado: '2026-08' });

    const lista = await app.inject({ method: 'GET', url: '/parcelamentos', headers: { cookie } });
    const id = lista.json()[0].id;

    const resposta = await app.inject({
      method: 'PATCH',
      url: `/parcelamentos/${id}`,
      headers: { cookie },
      payload: { responsavelPessoaId: bruno.json().id },
    });

    expect(resposta.statusCode).toBe(200);

    // Se a compra era do Bruno, todas as doze são dele — inclusive as que ainda não venceram.
    const parcelas = await app.prisma.invoiceEntry.findMany({
      where: { installmentId: id },
    });
    expect(parcelas.every((p) => p.forwardedToPersonId === bruno.json().id)).toBe(true);

    expect(await app.prisma.obligation.count({ where: { originType: 'CARD_ENTRY' } })).toBe(8);
  });

  it('excluir remove só as parcelas que ainda não vieram de extrato', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();
    await confirmar(previa, { mesSelecionado: '2026-08' });

    const lista = await app.inject({ method: 'GET', url: '/parcelamentos', headers: { cookie } });
    const id = lista.json()[0].id;

    const resposta = await app.inject({
      method: 'DELETE',
      url: `/parcelamentos/${id}`,
      headers: { cookie },
    });

    expect(resposta.json().parcelasRemovidas).toBe(7);
    // A parcela de agosto veio do banco: é fato consumado e apagá-la mudaria o total
    // daquela fatura.
    expect(
      await app.prisma.invoiceEntry.count({ where: { description: { contains: 'Farmacia' } } }),
    ).toBe(1);
  });

  it('não enxerga parcelamento de outra pessoa', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();
    await confirmar(previa, { mesSelecionado: '2026-08' });

    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const bruno = await logar(app, 'bruno@exemplo.com');

    const lista = await app.inject({
      method: 'GET',
      url: '/parcelamentos',
      headers: { cookie: bruno },
    });

    expect(lista.json()).toHaveLength(0);
  });
});

describe('o que já foi importado', () => {
  it('não colapsa duas compras iguais no mesmo dia', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();
    await confirmar(previa, { mesSelecionado: '2026-08' });

    // Dois cafés de R$ 12 no mesmo dia são duas despesas reais. Com a ocorrência fixa em
    // zero na gravação, as duas linhas tinham a mesma chave e o `skipDuplicates`
    // descartava a segunda em silêncio — a pessoa perdia uma despesa.
    const cafes = await app.prisma.invoiceEntry.count({
      where: { description: { contains: 'Cafe' } },
    });

    expect(cafes).toBe(2);
  });

  it('separa na prévia o que já está na fatura', async () => {
    const primeira = (await analisar('nubank-agosto.csv')).json();
    expect(primeira.lancamentosConhecidos).toHaveLength(0);

    await confirmar(primeira, { mesSelecionado: '2026-08' });

    const segunda = (await analisar('nubank-agosto.csv')).json();

    // A seção fechada de "já importados" só é honesta se usar o mesmo critério da
    // gravação: qualquer outro faria a tela prometer uma coisa e o banco fazer outra.
    expect(segunda.lancamentos).toHaveLength(0);
    expect(segunda.lancamentosConhecidos).toHaveLength(primeira.lancamentos.length);
  });

  it('continua contando os já existentes ao reimportar', async () => {
    const primeira = (await analisar('nubank-agosto.csv')).json();
    await confirmar(primeira, { mesSelecionado: '2026-08' });

    const segunda = (await analisar('nubank-agosto.csv')).json();
    const resposta = await confirmar(segunda, { mesSelecionado: '2026-08' });

    expect(resposta.json().lancamentosInseridos).toBe(0);
    expect(resposta.json().lancamentosIgnorados).toBe(primeira.lancamentos.length);
  });
});

describe('categoria do lançamento', () => {
  async function criarCategoria(nome: string) {
    const resposta = await app.inject({
      method: 'POST',
      url: '/categorias',
      headers: { cookie },
      payload: { nome },
    });

    return resposta.json().id as string;
  }

  it('grava a categoria escolhida no lançamento', async () => {
    const mercado = await criarCategoria('Mercado');
    const previa = (await analisar('nubank-agosto.csv')).json();

    await confirmar(previa, {
      mesSelecionado: '2026-08',
      categorias: { 'Mercado Sao Joao': mercado },
    });

    const lancamento = await app.prisma.invoiceEntry.findFirstOrThrow({
      where: { description: 'Mercado Sao Joao' },
    });

    expect(lancamento.categoryId).toBe(mercado);
  });

  it('sugere na próxima importação o que já foi classificado', async () => {
    const mercado = await criarCategoria('Mercado');
    const agosto = (await analisar('nubank-agosto.csv')).json();

    await confirmar(agosto, {
      mesSelecionado: '2026-08',
      categorias: { 'Mercado Sao Joao': mercado },
    });

    // O mesmo extrato mandado para outro mês: as linhas são novas (a fatura é outra) e o
    // "Mercado Sao Joao" volta a aparecer, agora com a categoria já decidida.
    const setembro = (await analisar('nubank-agosto.csv', cookie, cartaoId, '2026-09')).json();
    const sugerido = [...setembro.lancamentos, ...setembro.lancamentosConhecidos].find(
      (linha: LinhaDaPrevia) => linha.descricao.includes('Mercado'),
    );

    // Quem classificou "Mercado" uma vez não deveria decidir de novo todo mês.
    expect(sugerido?.categoriaSugerida).toBe(mercado);
  });

  it('leva a categoria para o repasse do gasto de terceiro', async () => {
    const mercado = await criarCategoria('Mercado');
    const pessoa = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie },
      payload: { nome: 'Bruno' },
    });

    const previa = (await analisar('nubank-agosto.csv')).json();

    await confirmar(previa, {
      mesSelecionado: '2026-08',
      responsaveis: { 'Mercado Sao Joao': pessoa.json().id },
      categorias: { 'Mercado Sao Joao': mercado },
    });

    const repasse = await app.prisma.obligation.findFirstOrThrow({
      where: { originType: 'CARD_ENTRY' },
    });

    // É o mesmo gasto visto do outro lado; classificar duas vezes só cria divergência.
    expect(repasse.categoryId).toBe(mercado);
  });

  it('recusa categoria de outra pessoa', async () => {
    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const cookieDoBruno = await logar(app, 'bruno@exemplo.com');

    const alheia = await app.inject({
      method: 'POST',
      url: '/categorias',
      headers: { cookie: cookieDoBruno },
      payload: { nome: 'Lazer' },
    });

    const previa = (await analisar('nubank-agosto.csv')).json();
    const resposta = await confirmar(previa, {
      mesSelecionado: '2026-08',
      categorias: { 'Mercado Sao Joao': alheia.json().id },
    });

    expect(resposta.statusCode).toBe(422);
    expect(await app.prisma.invoiceEntry.count()).toBe(0);
  });
});

describe('excluir a importação', () => {
  function excluir(importacaoId: string) {
    return app.inject({
      method: 'DELETE',
      url: `/cartoes/${cartaoId}/importacoes/${importacaoId}`,
      headers: { cookie },
    });
  }

  it('apaga os lançamentos, as parcelas projetadas e o parcelamento', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();
    const importacao = (await confirmar(previa, { mesSelecionado: '2026-08' })).json();

    expect(await app.prisma.invoiceEntry.count()).toBeGreaterThan(0);

    const resposta = await excluir(importacao.importacaoId);

    expect(resposta.statusCode).toBe(200);
    expect(await app.prisma.invoiceEntry.count()).toBe(0);
    // Parcelamento sem parcela é compra fantasma na tela de parcelamentos.
    expect(await app.prisma.installment.count()).toBe(0);
    expect(await app.prisma.importBatch.count()).toBe(0);
  });

  it('remove as faturas que ficaram sem nada', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();
    const importacao = (await confirmar(previa, { mesSelecionado: '2026-08' })).json();

    await excluir(importacao.importacaoId);

    expect(await app.prisma.invoice.count()).toBe(0);
    // A obrigação da fatura sai junto: uma dívida de R$ 0,00 no a pagar é resto da
    // importação desfeita, não histórico.
    expect(await app.prisma.obligation.count({ where: { originType: 'INVOICE' } })).toBe(0);
  });

  it('não leva junto o que outra importação criou', async () => {
    const agosto = (await analisar('nubank-agosto.csv')).json();
    const primeira = (await confirmar(agosto, { mesSelecionado: '2026-08' })).json();

    const setembro = (await analisar('nubank-setembro.csv', cookie, cartaoId, '2026-09')).json();
    await confirmar(setembro, { mesSelecionado: '2026-09' });

    // Tudo que a segunda importação criou, inclusive as parcelas que ela projetou nas
    // faturas seguintes — não só o que caiu na fatura de setembro.
    const daSegunda = await app.prisma.invoiceEntry.count({
      where: { importBatchId: { not: primeira.importacaoId } },
    });

    await excluir(primeira.importacaoId);

    // Quem errou o arquivo de agosto não deveria perder o de setembro junto.
    expect(await app.prisma.invoiceEntry.count()).toBe(daSegunda);
  });

  it('desfaz o pagamento e reabre a fatura anterior', async () => {
    const previa = (await analisar('brasileiro-com-pagamento.csv')).json();
    const importacao = (
      await confirmar(previa, { mesSelecionado: '2026-08', acaoDoPagamento: 'SALDO_ANTERIOR' })
    ).json();

    expect(await app.prisma.payment.count()).toBe(1);

    const resposta = await excluir(importacao.importacaoId);

    expect(resposta.json()).toMatchObject({ pagamentosRemovidos: 1 });
    expect(await app.prisma.payment.count()).toBe(0);
  });

  it('recusa quando o repasse já foi pago', async () => {
    const pessoa = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie },
      payload: { nome: 'Bruno' },
    });

    const previa = (await analisar('nubank-agosto.csv')).json();
    const importacao = (
      await confirmar(previa, {
        mesSelecionado: '2026-08',
        responsaveis: { 'Mercado Sao Joao': pessoa.json().id },
      })
    ).json();

    const repasse = await app.prisma.obligation.findFirstOrThrow({
      where: { originType: 'CARD_ENTRY' },
    });

    await app.inject({
      method: 'POST',
      url: `/lancamentos/${repasse.id}/baixa`,
      headers: { cookie },
      payload: { dataDaBaixa: '2026-08-20', valorPago: '50.00' },
    });

    const resposta = await excluir(importacao.importacaoId);

    // Apagar o título sumiria com o registro de um dinheiro que trocou de mãos, e quem
    // pagou ficaria sem prova nenhuma.
    expect(resposta.statusCode).toBe(422);
    expect(await app.prisma.invoiceEntry.count()).toBeGreaterThan(0);
  });

  it('não exclui importação de outro cartão', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();
    const importacao = (await confirmar(previa, { mesSelecionado: '2026-08' })).json();

    const outro = await app.inject({
      method: 'POST',
      url: '/cartoes',
      headers: { cookie },
      payload: { nome: 'Outro', diaDeFechamento: 10, diaDeVencimento: 20 },
    });

    const resposta = await app.inject({
      method: 'DELETE',
      url: `/cartoes/${outro.json().id}/importacoes/${importacao.importacaoId}`,
      headers: { cookie },
    });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('pagamento da fatura', () => {
  it('manda o pagamento para a fatura do mês anterior', async () => {
    const previa = (await analisar('brasileiro-com-pagamento.csv')).json();

    // O cartão só cobra depois de fechar o ciclo: o pagamento que aparece no extrato de
    // agosto quitou a fatura de julho. Mandá-lo para agosto quitava a fatura que está
    // sendo importada com o dinheiro do mês anterior.
    expect(previa.pagamentos[0].faturaSugerida).toBe('2026-07');
    expect(previa.pagamentos[0].faturaExiste).toBe(false);
    expect(previa.pagamentos[0].acaoSugerida).toBe('IGNORAR');
  });

  it('ignora o pagamento sem fatura anterior, sem criar fatura vazia', async () => {
    const previa = (await analisar('brasileiro-com-pagamento.csv')).json();
    const resposta = await confirmar(previa, { mesSelecionado: '2026-08' });

    expect(resposta.json().pagamentosIgnorados).toBe(1);
    expect(await app.prisma.payment.count()).toBe(0);

    // Fatura nasce de lançamento, nunca de pagamento. Criar aqui deixava para trás uma
    // fatura de R$ 0,00 no a pagar e o pagamento sumia logo depois, por não haver
    // obrigação a que se anexar.
    const julho = await app.prisma.invoice.findFirst({ where: { referenceMonth: '2026-07' } });
    expect(julho).toBeNull();
  });

  it('registra como saldo anterior quando a pessoa escolhe', async () => {
    const previa = (await analisar('brasileiro-com-pagamento.csv')).json();
    const resposta = await confirmar(previa, {
      mesSelecionado: '2026-08',
      acaoDoPagamento: 'SALDO_ANTERIOR',
    });

    expect(resposta.json().saldosAnterioresCriados).toBe(1);
    expect(resposta.json().pagamentosRegistrados).toBe(1);

    // A fatura que falta nasce e morre no mesmo instante: o único dado que temos dela é o
    // valor pago, e é isso que faz o dinheiro que saiu do banco aparecer em algum lugar.
    const julho = await app.prisma.invoice.findFirstOrThrow({
      where: { referenceMonth: '2026-07' },
      include: { entries: true },
    });

    expect(julho.status).toBe('PAID');
    expect(julho.entries).toHaveLength(1);
    expect(julho.entries[0]!.description).toBe('Saldo anterior (não importado)');
    expect(julho.entries[0]!.amount.toString()).toBe('500');
  });

  it('registra o pagamento na fatura anterior que existe e está em aberto', async () => {
    // Julho entra no sistema com R$ 249,40, o suficiente para o pagamento de R$ 500 ser
    // recusado por excesso — daí o `excedenteAceito`.
    const julho = (await analisar('nubank-agosto.csv', cookie, cartaoId, '2026-07')).json();
    await confirmar(julho, { mesSelecionado: '2026-07' });

    const agosto = (await analisar('brasileiro-com-pagamento.csv')).json();
    expect(agosto.pagamentos[0].faturaExiste).toBe(true);
    expect(agosto.pagamentos[0].acaoSugerida).toBe('REGISTRAR');

    const resposta = await confirmar(agosto, { mesSelecionado: '2026-08' });

    expect(resposta.json().pagamentosRegistrados).toBe(1);

    const pagamento = await app.prisma.payment.findFirstOrThrow();
    expect(pagamento.amount.toString()).toBe('500');
    expect(pagamento.paidAt.toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('recusa pagamento maior que o saldo em aberto da fatura', async () => {
    const julho = (await analisar('nubank-agosto.csv', cookie, cartaoId, '2026-07')).json();
    await confirmar(julho, { mesSelecionado: '2026-07' });

    const agosto = (await analisar('brasileiro-com-pagamento.csv')).json();
    const resposta = await confirmar(agosto, {
      mesSelecionado: '2026-08',
      excedenteAceito: false,
    });

    // Pagar mais do que se deve é o sintoma de o pagamento ter ido para a fatura errada.
    // Antes disso passava calado: o excedente evaporava e a fatura virava paga.
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().mensagem).toContain('maior que o saldo em aberto');
    expect(await app.prisma.payment.count()).toBe(0);
  });

  it('não duplica o pagamento ao reimportar', async () => {
    const previa = (await analisar('brasileiro-com-pagamento.csv')).json();
    await confirmar(previa, { mesSelecionado: '2026-08', acaoDoPagamento: 'SALDO_ANTERIOR' });

    const segunda = (await analisar('brasileiro-com-pagamento.csv')).json();
    const resposta = await confirmar(segunda, { mesSelecionado: '2026-08' });

    // A segunda vez cai em "ignorar": a fatura de julho agora existe, mas está paga.
    expect(resposta.json().pagamentosIgnorados).toBe(1);
    expect(await app.prisma.payment.count()).toBe(1);
  });
});
