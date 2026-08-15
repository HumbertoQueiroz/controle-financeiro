import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco } from './db.js';
import { criarApp, criarUsuario, logar, type App } from './helpers.js';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/csv');

let app: App;

beforeEach(async () => {
  await limparBanco();
  app = await criarApp();
});

afterEach(() => app.close());

/** Monta o corpo multipart à mão: o inject não tem helper para upload. */
function corpoMultipart(nomeDoArquivo: string, mesDeReferencia: string) {
  const limite = '----ControleFinanceiroTeste';
  const conteudo = readFileSync(resolve(fixtures, nomeDoArquivo));

  const cabecalho = Buffer.from(
    `--${limite}\r\n` +
      `Content-Disposition: form-data; name="mesDeReferencia"\r\n\r\n${mesDeReferencia}\r\n` +
      `--${limite}\r\n` +
      `Content-Disposition: form-data; name="arquivo"; filename="${nomeDoArquivo}"\r\n` +
      'Content-Type: text/csv\r\n\r\n',
  );

  return {
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
    payload: Buffer.concat([cabecalho, conteudo, Buffer.from(`\r\n--${limite}--\r\n`)]),
  };
}

async function prepararCartao(app: App) {
  await criarUsuario(app, { email: 'ana@exemplo.com', nome: 'Ana' });
  const cookie = await logar(app, 'ana@exemplo.com');

  const cartao = await app.inject({
    method: 'POST',
    url: '/cartoes',
    headers: { cookie },
    payload: { nome: 'Nubank', diaDeFechamento: 25, diaDeVencimento: 5 },
  });

  return { cookie, cartaoId: cartao.json().id as string };
}

async function importar(app: App, cookie: string, cartaoId: string, arquivo: string, mes: string) {
  const { headers, payload } = corpoMultipart(arquivo, mes);

  return app.inject({
    method: 'POST',
    url: `/cartoes/${cartaoId}/importacoes`,
    headers: { ...headers, cookie },
    payload,
  });
}

describe('importação de fatura', () => {
  it('importa os lançamentos e calcula o total', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);

    const resposta = await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      layout: 'nubank',
      lancamentosInseridos: 5,
      lancamentosIgnorados: 0,
    });

    // 120,50 + 12,00 + 12,00 + 89,90 - 45,00 (estorno reduz o total)
    expect(resposta.json().totalDaFatura).toBe('189.4');
  });

  it('é idempotente: reimportar o mesmo arquivo não duplica nada', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);

    const primeira = await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');
    const segunda = await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');

    expect(primeira.json().lancamentosInseridos).toBe(5);
    // Este é o teste que mais importa: o README permite importar a mesma fatura várias
    // vezes no mesmo mês, e proíbe duplicar lançamentos idênticos.
    expect(segunda.json().lancamentosInseridos).toBe(0);
    expect(segunda.json().lancamentosIgnorados).toBe(5);
    expect(await app.prisma.invoiceEntry.count()).toBe(5);
    expect(segunda.json().totalDaFatura).toBe('189.4');
  });

  it('não colapsa duas compras iguais no mesmo dia', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);
    await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');

    const cafes = await app.prisma.invoiceEntry.findMany({
      where: { description: { contains: 'Cafe' } },
    });

    // Dois cafés de R$ 12 no mesmo dia são duas despesas reais. Uma dedupe ingênua
    // descartaria a segunda e o usuário perderia uma despesa sem perceber.
    expect(cafes).toHaveLength(2);
  });

  it('importa incrementalmente: só as linhas novas entram', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);

    await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');
    const atualizada = await importar(
      app,
      cookie,
      cartaoId,
      'nubank-agosto-atualizada.csv',
      '2026-08',
    );

    // O arquivo novo tem as 5 linhas anteriores (uma com espaçamento diferente) e 2 novas.
    expect(atualizada.json().lancamentosInseridos).toBe(2);
    expect(atualizada.json().lancamentosIgnorados).toBe(5);
    expect(await app.prisma.invoiceEntry.count()).toBe(7);
  });

  it('gera uma obrigação por fatura, não uma por lançamento', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);
    await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');

    const obrigacoes = await app.prisma.obligation.findMany({ where: { originType: 'INVOICE' } });

    // Ninguém paga cada compra, paga a fatura. Uma obrigação por lançamento duplicaria a
    // dívida e faria o relatório listar linhas que não correspondem a pagamento nenhum.
    expect(obrigacoes).toHaveLength(1);
    expect(obrigacoes[0]!.amount.toString()).toBe('189.4');
    expect(obrigacoes[0]!.creditorId).toBeNull();
    expect(obrigacoes[0]!.dueDate.toISOString().slice(0, 10)).toBe('2026-08-05');
  });

  it('recusa importar em cartão de outra pessoa', async () => {
    const { cartaoId } = await prepararCartao(app);
    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const bruno = await logar(app, 'bruno@exemplo.com');

    const resposta = await importar(app, bruno, cartaoId, 'nubank-agosto.csv', '2026-08');

    expect(resposta.statusCode).toBe(404);
  });

  it('recusa arquivo de formato desconhecido', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);

    const resposta = await importar(app, cookie, cartaoId, 'formato-desconhecido.csv', '2026-08');

    expect(resposta.statusCode).toBe(422);
  });

  it('registra a importação para auditoria, inclusive o que foi ignorado', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);
    await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');
    await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');

    const lista = await app.inject({
      method: 'GET',
      url: `/cartoes/${cartaoId}/importacoes`,
      headers: { cookie },
    });

    expect(lista.json()).toHaveLength(2);
    expect(lista.json()[0]).toMatchObject({ rowsInserted: 0, rowsSkipped: 5 });
  });
});

describe('pagamento vindo no CSV', () => {
  it('registra o pagamento quando a fatura está em aberto', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);

    const resposta = await importar(
      app,
      cookie,
      cartaoId,
      'brasileiro-com-pagamento.csv',
      '2026-08',
    );

    expect(resposta.json().pagamentosRegistrados).toBe(1);
    expect(resposta.json().pagamentosIgnorados).toBe(0);
    expect(await app.prisma.invoicePayment.count()).toBe(1);
  });

  it('ignora em silêncio quando a fatura não está aberta, mas deixa registro', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);

    // Primeira importação sem o pagamento, para a fatura existir e poder ser fechada.
    await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');
    const fatura = await app.prisma.invoice.findFirstOrThrow();
    await app.inject({ method: 'POST', url: `/faturas/${fatura.id}/fechar`, headers: { cookie } });

    const resposta = await importar(
      app,
      cookie,
      cartaoId,
      'brasileiro-com-pagamento.csv',
      '2026-08',
    );

    // O README manda ignorar em silêncio — silêncio para o usuário, não amnésia para o
    // sistema: sem o contador, "sumiu um pagamento" vira investigação sem pista.
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().pagamentosRegistrados).toBe(0);
    expect(resposta.json().pagamentosIgnorados).toBe(1);
    expect(await app.prisma.invoicePayment.count()).toBe(0);
  });

  it('não duplica o pagamento na reimportação e liquida a obrigação', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);

    await importar(app, cookie, cartaoId, 'brasileiro-com-pagamento.csv', '2026-08');
    const segunda = await importar(
      app,
      cookie,
      cartaoId,
      'brasileiro-com-pagamento.csv',
      '2026-08',
    );

    expect(segunda.json().pagamentosRegistrados).toBe(0);
    expect(await app.prisma.invoicePayment.count()).toBe(1);

    const obrigacao = await app.prisma.obligation.findFirstOrThrow({
      where: { originType: 'INVOICE' },
    });

    // Total 1120,50 + 89,90 - 75,30 = 1135,10; pago 500,00 → parcialmente liquidada.
    expect(obrigacao.amount.toString()).toBe('1135.1');
    expect(obrigacao.settledAmount.toString()).toBe('500');
    expect(obrigacao.status).toBe('PARTIAL');
  });
});

describe('repasse de lançamento a terceiro', () => {
  it('cria o a receber sem tirar a dívida da fatura', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);
    await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');

    const pessoa = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie },
      payload: { nome: 'Bruno' },
    });

    const lancamento = await app.prisma.invoiceEntry.findFirstOrThrow({
      where: { description: { contains: 'Mercado' } },
    });

    const resposta = await app.inject({
      method: 'PATCH',
      url: `/lancamentos/${lancamento.id}/repasse`,
      headers: { cookie },
      payload: { pessoaId: pessoa.json().id },
    });

    expect(resposta.statusCode).toBe(200);

    const aReceber = await app.prisma.obligation.findFirstOrThrow({
      where: { originType: 'CARD_ENTRY' },
    });
    const fatura = await app.prisma.obligation.findFirstOrThrow({
      where: { originType: 'INVOICE' },
    });

    // As duas coexistem e não se anulam: o dono continua devendo à fatura, e o terceiro
    // passa a dever ao dono. Anular uma com a outra faria a fatura parecer menor do que é.
    expect(aReceber.amount.toString()).toBe('120.5');
    expect(aReceber.debtorId).toBe(pessoa.json().id);
    expect(fatura.amount.toString()).toBe('189.4');
  });

  it('cancela o a receber ao desfazer o repasse', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);
    await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');

    const pessoa = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie },
      payload: { nome: 'Bruno' },
    });
    const lancamento = await app.prisma.invoiceEntry.findFirstOrThrow({
      where: { description: { contains: 'Mercado' } },
    });

    const repassar = (pessoaId: string | null) =>
      app.inject({
        method: 'PATCH',
        url: `/lancamentos/${lancamento.id}/repasse`,
        headers: { cookie },
        payload: { pessoaId },
      });

    await repassar(pessoa.json().id);
    await repassar(null);

    const aReceber = await app.prisma.obligation.findFirstOrThrow({
      where: { originType: 'CARD_ENTRY' },
    });

    // Cancelada, não apagada: se já houvesse pagamento parcial, apagar sumiria com o
    // registro de um dinheiro que trocou de mãos.
    expect(aReceber.status).toBe('CANCELLED');
  });

  it('recusa repassar um estorno', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);
    await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');

    const pessoa = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie },
      payload: { nome: 'Bruno' },
    });
    const estorno = await app.prisma.invoiceEntry.findFirstOrThrow({
      where: { description: { contains: 'Estorno' } },
    });

    // Estorno é crédito, não gasto: repassar criaria uma cobrança invertida, em que o
    // terceiro passaria a ter a receber por uma compra que não fez.
    const resposta = await app.inject({
      method: 'PATCH',
      url: `/lancamentos/${estorno.id}/repasse`,
      headers: { cookie },
      payload: { pessoaId: pessoa.json().id },
    });

    expect(resposta.statusCode).toBe(422);
  });

  it('recusa repassar para pessoa de outra agenda', async () => {
    const { cookie, cartaoId } = await prepararCartao(app);
    await importar(app, cookie, cartaoId, 'nubank-agosto.csv', '2026-08');

    await criarUsuario(app, { email: 'bruno@exemplo.com' });
    const bruno = await logar(app, 'bruno@exemplo.com');
    const pessoaDoBruno = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { cookie: bruno },
      payload: { nome: 'Carla' },
    });

    const lancamento = await app.prisma.invoiceEntry.findFirstOrThrow();

    const resposta = await app.inject({
      method: 'PATCH',
      url: `/lancamentos/${lancamento.id}/repasse`,
      headers: { cookie },
      payload: { pessoaId: pessoaDoBruno.json().id },
    });

    expect(resposta.statusCode).toBe(404);
  });
});
