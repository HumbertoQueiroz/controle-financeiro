import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lerCsv } from './parser.js';
import { converterData, ehPagamento, extrairParcela } from './comum.js';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../../../test/fixtures/csv');
const ler = (nome: string) => readFileSync(resolve(fixtures, nome));

describe('leitura de CSV', () => {
  it('reconhece o layout do Nubank', () => {
    const resultado = lerCsv(ler('nubank-agosto.csv'));

    expect(resultado.layout).toBe('nubank');
    // Seis linhas, incluindo a compra de 30/07 que o banco pôs na fatura de agosto por ter
    // sido feita depois do fechamento.
    expect(resultado.linhas).toHaveLength(6);
  });

  it('reconhece o layout brasileiro com ponto e vírgula e valor em reais', () => {
    const resultado = lerCsv(ler('brasileiro-com-pagamento.csv'));

    expect(resultado.layout).toBe('brasileiro-generico');
    // O ';' é o delimitador padrão do Excel em português; tratá-lo é o que faz o arquivo
    // que o usuário salvou da planilha funcionar.
    expect(resultado.linhas.map((l) => l.valor)).toEqual(['1120.50', '89.90', '500.00', '-75.30']);
  });

  it('separa pagamento de lançamento pela descrição, nunca pelo sinal', () => {
    const resultado = lerCsv(ler('brasileiro-com-pagamento.csv'));
    const pagamentos = resultado.linhas.filter((l) => l.tipo === 'PAGAMENTO');
    const estornoOuCompra = resultado.linhas.filter((l) => l.tipo === 'LANCAMENTO');

    // Estorno e cashback também vêm negativos. Tratá-los como pagamento faria a fatura
    // constar como paga sem que ninguém tivesse pago.
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0]!.valor).toBe('500.00');
    expect(estornoOuCompra.some((l) => l.valor === '-75.30')).toBe(true);
  });

  it('extrai o parcelamento da descrição', () => {
    const resultado = lerCsv(ler('nubank-agosto.csv'));
    const parcelado = resultado.linhas.find((l) => l.descricao.includes('Farmacia'));

    expect(parcelado).toMatchObject({ parcelaNumero: 3, parcelaTotal: 10 });
  });

  it('recusa formato não reconhecido dizendo quais colunas encontrou', () => {
    // "Formato não reconhecido" sozinho não diz o que fazer em seguida.
    expect(() => lerCsv(ler('formato-desconhecido.csv'))).toThrow(/coluna_a/);
  });

  it('recusa arquivo vazio', () => {
    expect(() => lerCsv('')).toThrow(/vazio/);
  });
});

describe('conversão de data', () => {
  it('lê o formato brasileiro e o ISO no mesmo dia do calendário', () => {
    expect(converterData('03/08/2026')?.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    expect(converterData('2026-08-03')?.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    expect(converterData('03/08/26')?.toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });

  it('recusa data que não existe em vez de deixar o Date corrigir sozinho', () => {
    // `new Date(2026, 1, 31)` vira 3 de março em silêncio, e o lançamento mudaria de mês.
    expect(converterData('31/02/2026')).toBeNull();
  });
});

describe('detecção de pagamento e parcela', () => {
  it('reconhece as formas usuais de pagamento de fatura', () => {
    expect(ehPagamento('Pagamento recebido')).toBe(true);
    expect(ehPagamento('PGTO FATURA')).toBe(true);
    expect(ehPagamento('Débito automático')).toBe(true);
    expect(ehPagamento('Mercado Sao Joao')).toBe(false);
    // "Pagamento" dentro do nome de um estabelecimento não deveria virar quitação, mas o
    // reconhecimento é por descrição: fica registrado como limitação conhecida.
  });

  it('não confunde fração com parcelamento', () => {
    expect(extrairParcela('Farmacia - 3/10')).toEqual({ numero: 3, total: 10 });
    expect(extrairParcela('Parcela 2 de 6')).toEqual({ numero: 2, total: 6 });
    // "1/1" não é parcelamento, e "2/1" é impossível.
    expect(extrairParcela('Queijo 1/1 KG')).toEqual({ numero: null, total: null });
    expect(extrairParcela('Item 2/1')).toEqual({ numero: null, total: null });
  });
});
