import { describe, expect, it } from 'vitest';
import { normalizarEmail } from './email.js';

describe('normalização de e-mail', () => {
  it('reduz variações de caixa e espaço à mesma forma', () => {
    expect(normalizarEmail('  Ana@Exemplo.COM ')).toBe('ana@exemplo.com');
    expect(normalizarEmail('ana@exemplo.com')).toBe('ana@exemplo.com');
  });
});
