import { describe, expect, it } from 'vitest';
import { telefoneSchema } from './pessoa.js';

describe('telefone do whatsapp', () => {
  it('guarda só os dígitos', () => {
    expect(telefoneSchema.parse('(65) 99645-2787')).toBe('65996452787');
  });

  it('descarta o código do país', () => {
    // A agenda do celular guarda assim. Manter o 55 faria o link virar wa.me/5555…,
    // com o código do país duas vezes.
    expect(telefoneSchema.parse('+55 65 99645-2787')).toBe('65996452787');
  });

  it('recusa um número que não tenha onze dígitos', () => {
    expect(telefoneSchema.safeParse('6599645278').success).toBe(false);
    expect(telefoneSchema.safeParse('659964527871').success).toBe(false);
  });

  it('aceita o campo vazio, que é opcional', () => {
    expect(telefoneSchema.parse('')).toBe('');
  });
});
