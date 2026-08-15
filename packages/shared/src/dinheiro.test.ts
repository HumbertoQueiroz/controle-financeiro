import { describe, expect, it } from 'vitest';
import { converterValor } from './dinheiro.js';

describe('conversão de valor de CSV', () => {
  it('lê o formato brasileiro com separador de milhar', () => {
    expect(converterValor('1.234,56')).toBe('1234.56');
    expect(converterValor('R$ 1.120,50')).toBe('1120.50');
    expect(converterValor('89,90')).toBe('89.90');
  });

  it('lê o formato ISO', () => {
    expect(converterValor('120.50')).toBe('120.50');
    expect(converterValor('12')).toBe('12');
  });

  it('entende parênteses como negativo, que é a notação contábil', () => {
    expect(converterValor('(75,30)')).toBe('-75.30');
    expect(converterValor('-45.00')).toBe('-45.00');
  });

  it('devolve string para não perder centavo em ponto flutuante', () => {
    // 0.1 + 0.2 em ponto flutuante já erra na segunda casa. Guardar o valor como texto
    // até a coluna Decimal é o que impede o centavo de sumir no fechamento de saldo.
    expect(typeof converterValor('0,10')).toBe('string');
    expect(converterValor('0,10')).toBe('0.10');
  });

  it('recusa o que não é valor', () => {
    expect(converterValor('')).toBeNull();
    expect(converterValor('abc')).toBeNull();
    expect(converterValor('12,34,56')).toBeNull();
  });
});
