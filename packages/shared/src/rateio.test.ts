import { describe, expect, it } from 'vitest';
import { deCentavos, dividirEmPartesIguais, paraCentavos, somarCentavos } from './rateio.js';

describe('conversão para centavos', () => {
  it('converte ida e volta sem perder centavo', () => {
    for (const valor of ['10.00', '0.01', '1234.56', '0.10', '999.99']) {
      expect(deCentavos(paraCentavos(valor))).toBe(valor);
    }
  });

  it('trata valor sem casas decimais', () => {
    expect(paraCentavos('12')).toBe(1200);
    expect(paraCentavos('12.5')).toBe(1250);
  });

  it('trata negativo', () => {
    expect(paraCentavos('-75.30')).toBe(-7530);
    expect(deCentavos(-7530)).toBe('-75.30');
  });
});

describe('divisão entre participantes', () => {
  it('distribui o resto em vez de descartá-lo', () => {
    const partes = dividirEmPartesIguais(1000, 3);

    // R$ 10,00 entre 3. Truncar daria 3,33 cada e a soma seria 9,99: o grupo ficaria
    // devendo um centavo a ninguém, para sempre.
    expect(partes).toEqual([334, 333, 333]);
    expect(somarCentavos(partes)).toBe(1000);
  });

  it('a soma sempre volta ao total, para qualquer divisão', () => {
    for (let total = 1; total <= 200; total += 7) {
      for (let pessoas = 1; pessoas <= 9; pessoas += 1) {
        expect(somarCentavos(dividirEmPartesIguais(total, pessoas))).toBe(total);
      }
    }
  });

  it('divide igual quando o valor é divisível', () => {
    expect(dividirEmPartesIguais(1200, 4)).toEqual([300, 300, 300, 300]);
  });

  it('é determinística: o mesmo rateio dá sempre o mesmo resultado', () => {
    expect(dividirEmPartesIguais(1000, 3)).toEqual(dividirEmPartesIguais(1000, 3));
  });

  it('devolve lista vazia sem participante', () => {
    expect(dividirEmPartesIguais(1000, 0)).toEqual([]);
  });
});
