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
function corpoMultipart(nomeDoArquivo: string) {
  const limite = '----ControleFinanceiroTeste';
  const conteudo = readFileSync(resolve(fixtures, nomeDoArquivo));

  const cabecalho = Buffer.from(
    `--${limite}\r\n` +
      `Content-Disposition: form-data; name="arquivo"; filename="${nomeDoArquivo}"\r\n` +
      'Content-Type: text/csv\r\n\r\n',
  );

  return {
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
    payload: Buffer.concat([cabecalho, conteudo, Buffer.from(`\r\n--${limite}--\r\n`)]),
  };
}

function analisar(arquivo: string, cookieDoUsuario = cookie, cartao = cartaoId) {
  const { headers, payload } = corpoMultipart(arquivo);

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
}

/** Confirma aceitando as sugestões da prévia, com o responsável que for informado. */
function confirmar(
  previa: {
    lancamentos: LinhaDaPrevia[];
    novosParcelamentos: LinhaDaPrevia[];
    pagamentos: LinhaDaPrevia[];
  },
  opcoes: {
    mesSelecionado: string;
    responsaveis?: Record<string, string | null>;
    divergenciaAceita?: boolean;
  },
) {
  const classificar = (linha: LinhaDaPrevia) => ({
    chave: linha.chave,
    data: linha.data,
    descricao: linha.descricao,
    valor: linha.valor,
    fatura: linha.faturaSugerida,
    responsavelPessoaId: opcoes.responsaveis?.[linha.descricao] ?? null,
    parcelaNumero: linha.parcelaNumero,
    parcelaTotal: linha.parcelaTotal,
  });

  return app.inject({
    method: 'POST',
    url: `/cartoes/${cartaoId}/importacoes`,
    headers: { cookie },
    payload: {
      nomeDoArquivo: 'fatura.csv',
      mesSelecionado: opcoes.mesSelecionado,
      lancamentos: previa.lancamentos.map(classificar),
      novosParcelamentos: previa.novosParcelamentos.map(classificar),
      pagamentos: previa.pagamentos.map((linha) => ({
        chave: linha.chave,
        data: linha.data,
        descricao: linha.descricao,
        valor: linha.valor,
        fatura: linha.faturaSugerida,
      })),
      divergenciaAceita: opcoes.divergenciaAceita ?? true,
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

  it('sugere a fatura de cada compra pela data e pelo fechamento do cartão', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();

    // O cartão fecha dia 25: tudo antes disso cai na fatura de agosto.
    for (const linha of previa.lancamentos) {
      expect(linha.faturaSugerida).toBe('2026-08');
    }
    expect(previa.faturaSugerida).toBe('2026-08');
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

  it('alerta antes de gravar quando a fatura diverge do mês escolhido', async () => {
    const previa = (await analisar('nubank-agosto.csv')).json();

    const recusada = await confirmar(previa, {
      mesSelecionado: '2026-07',
      divergenciaAceita: false,
    });

    // O alerta é o ponto: escolher agosto e o arquivo ser de julho é o erro comum, e ele
    // só apareceria quando o total da fatura não batesse.
    expect(recusada.statusCode).toBe(422);
    expect(recusada.json().mensagem).toContain('2026-08');
    expect(await app.prisma.invoiceEntry.count()).toBe(0);

    const aceita = await confirmar(previa, { mesSelecionado: '2026-07', divergenciaAceita: true });
    expect(aceita.statusCode).toBe(201);
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

describe('pagamento da fatura', () => {
  it('registra o pagamento na fatura em aberto', async () => {
    const previa = (await analisar('brasileiro-com-pagamento.csv')).json();
    const resposta = await confirmar(previa, { mesSelecionado: '2026-08' });

    expect(resposta.json().pagamentosRegistrados).toBe(1);

    const pagamento = await app.prisma.payment.findFirstOrThrow();
    expect(pagamento.amount.toString()).toBe('500');
    expect(pagamento.paidAt.toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('não duplica o pagamento ao reimportar', async () => {
    const previa = (await analisar('brasileiro-com-pagamento.csv')).json();
    await confirmar(previa, { mesSelecionado: '2026-08' });

    const segunda = (await analisar('brasileiro-com-pagamento.csv')).json();
    const resposta = await confirmar(segunda, { mesSelecionado: '2026-08' });

    expect(resposta.json().pagamentosIgnorados).toBe(1);
    expect(await app.prisma.payment.count()).toBe(1);
  });
});
