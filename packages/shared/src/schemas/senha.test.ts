import { describe, expect, it } from 'vitest';
import { TAMANHO_MAXIMO_SENHA_BYTES, requisitosDaSenha, senhaSchema } from './senha.js';

/** Os ids das regras que a senha não cumpre. */
function pendencias(senha: string): string[] {
  return requisitosDaSenha(senha)
    .filter((requisito) => !requisito.atendido)
    .map((requisito) => requisito.id);
}

describe('exigência de senha forte', () => {
  it('aceita uma senha com as quatro classes e tamanho suficiente', () => {
    expect(senhaSchema.safeParse('Chuva-Azul-2026').success).toBe(true);
  });

  it('recusa a senha curta mesmo quando tem tudo o mais', () => {
    expect(pendencias('Ab1!cde')).toEqual(['tamanho']);
  });

  it('cobra maiúscula, número e símbolo', () => {
    expect(pendencias('abacaxiverde')).toEqual(['maiuscula', 'numero', 'simbolo']);
  });

  it('aponta todas as pendências de uma vez, não a primeira', () => {
    // Descobrir uma regra por vez transforma a criação de senha em tentativa e erro.
    const problemas = senhaSchema.safeParse('abc');

    expect(problemas.success).toBe(false);
    expect(problemas.error?.issues.length).toBeGreaterThan(1);
  });

  it('recusa a senha óbvia mesmo temperada com maiúscula, número e símbolo', () => {
    // `Senha@123` cumpre as quatro classes e ainda assim é a primeira tentativa de
    // qualquer dicionário — a régua de composição sozinha não pegaria isso.
    expect(pendencias('Senha@1234')).toContain('obvia');
    expect(pendencias('Qwerty@123')).toContain('obvia');
  });

  it('não confunde uma senha boa que apenas contém a palavra', () => {
    expect(senhaSchema.safeParse('RelatorioDeSenhas!7').success).toBe(true);
  });

  it('recusa um único caractere repetido', () => {
    expect(pendencias('Aaaaaaaaaa1!')).toContain('obvia');
  });

  it('não acusa a senha vazia de ser óbvia', () => {
    // Antes da primeira tecla, o que falta é tamanho — marcar "senha comum" de vermelho
    // acusaria quem ainda não digitou nada.
    expect(pendencias('')).not.toContain('obvia');
  });

  it('continua recusando o que passa dos 72 bytes do bcrypt', () => {
    // Acentuados ocupam 2 bytes: 40 caracteres já estouram o limite.
    const longa = `Ç${'ç'.repeat(40)}a1!`;

    expect(longa.length).toBeLessThan(TAMANHO_MAXIMO_SENHA_BYTES);
    expect(senhaSchema.safeParse(longa).success).toBe(false);
  });
});
