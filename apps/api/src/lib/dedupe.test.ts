import { describe, expect, it } from 'vitest';
import { atribuirOcorrencias, calcularDedupeHash, normalizarDescricao } from './dedupe.js';

const base = {
  cartaoId: 'cartao-1',
  mesDeReferencia: '2026-08',
  data: new Date(Date.UTC(2026, 7, 5)),
  descricao: 'Cafe da esquina',
  valor: '12.00',
  ocorrencia: 0,
};

describe('chave de deduplicação', () => {
  it('ignora variação de espaçamento e caixa na descrição', () => {
    // O mesmo lançamento sai como "MERCADO  SAO JOAO" numa exportação e "Mercado Sao Joao"
    // na seguinte. Sem normalizar, a reimportação criaria uma cópia de cada linha.
    expect(normalizarDescricao('  MERCADO   SAO JOAO ')).toBe('MERCADO SAO JOAO');

    expect(calcularDedupeHash({ ...base, descricao: 'MERCADO  SAO JOAO' })).toBe(
      calcularDedupeHash({ ...base, descricao: 'Mercado Sao Joao' }),
    );
  });

  it('distingue lançamentos que diferem em qualquer campo', () => {
    const original = calcularDedupeHash(base);

    expect(calcularDedupeHash({ ...base, valor: '12.01' })).not.toBe(original);
    expect(calcularDedupeHash({ ...base, data: new Date(Date.UTC(2026, 7, 6)) })).not.toBe(
      original,
    );
    expect(calcularDedupeHash({ ...base, parcelaNumero: 3, parcelaTotal: 10 })).not.toBe(original);
    expect(calcularDedupeHash({ ...base, cartaoId: 'cartao-2' })).not.toBe(original);
    expect(calcularDedupeHash({ ...base, mesDeReferencia: '2026-09' })).not.toBe(original);
  });

  it('não colapsa duas compras iguais no mesmo dia', () => {
    // Dois cafés de R$ 12 no mesmo dia são duas despesas reais. Sem o componente de
    // ocorrência, a segunda seria descartada como duplicata e o usuário perderia uma
    // despesa, descobrindo só ao conferir o total.
    expect(calcularDedupeHash({ ...base, ocorrencia: 0 })).not.toBe(
      calcularDedupeHash({ ...base, ocorrencia: 1 }),
    );
  });
});

describe('atribuição de ocorrências', () => {
  const linha = (descricao: string, valor: string) => ({
    cartaoId: 'cartao-1',
    mesDeReferencia: '2026-08',
    data: new Date(Date.UTC(2026, 7, 5)),
    descricao,
    valor,
  });

  it('numera cada grupo de linhas idênticas a partir do zero', () => {
    const resultado = atribuirOcorrencias([
      linha('Cafe', '12.00'),
      linha('Cafe', '12.00'),
      linha('Mercado', '50.00'),
      linha('Cafe', '12.00'),
    ]);

    expect(resultado.map((r) => r.ocorrencia)).toEqual([0, 1, 0, 2]);
  });

  it('mantém a numeração quando o arquivo é reexportado com linhas novas ao final', () => {
    const primeira = atribuirOcorrencias([linha('Cafe', '12.00'), linha('Mercado', '50.00')]);
    const segunda = atribuirOcorrencias([
      linha('Cafe', '12.00'),
      linha('Mercado', '50.00'),
      linha('Posto', '200.00'),
      linha('Cafe', '12.00'),
    ]);

    // É o que sustenta a reimportação incremental: as linhas que já existiam produzem a
    // mesma chave, e só as novas entram.
    expect(calcularDedupeHash(primeira[0]!)).toBe(calcularDedupeHash(segunda[0]!));
    expect(calcularDedupeHash(primeira[1]!)).toBe(calcularDedupeHash(segunda[1]!));
  });
});
