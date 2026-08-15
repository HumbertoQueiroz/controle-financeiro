import { describe, expect, it } from 'vitest';
import { excedeTamanhoMaximo, hashPassword, verifyPassword } from './hash.js';

describe('hash de senha', () => {
  it('valida a senha correta e rejeita a errada', async () => {
    const hash = await hashPassword('senha-do-usuario');

    expect(await verifyPassword('senha-do-usuario', hash)).toBe(true);
    expect(await verifyPassword('senha-errada', hash)).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha', async () => {
    // Salt por hash: duas contas com a mesma senha não podem produzir a mesma linha,
    // senão o banco vazado revela quem compartilha senha.
    expect(await hashPassword('igual')).not.toBe(await hashPassword('igual'));
  });

  it('conta o limite de 72 bytes em bytes, não em caracteres', () => {
    // 72 caracteres ASCII cabem; 72 caracteres acentuados ocupam 144 bytes e não cabem.
    // Aceitar a segunda faria o bcrypt validar só os primeiros 72 bytes em silêncio.
    expect(excedeTamanhoMaximo('a'.repeat(72))).toBe(false);
    expect(excedeTamanhoMaximo('a'.repeat(73))).toBe(true);
    expect(excedeTamanhoMaximo('ç'.repeat(37))).toBe(true);
  });

  it('recusa senha acima do limite em vez de truncar', async () => {
    await expect(hashPassword('ç'.repeat(40))).rejects.toThrow(/72 bytes/);
  });

  it('gasta tempo comparável quando não há hash, para não revelar contas inexistentes', async () => {
    const inicio = performance.now();
    const resultado = await verifyPassword('qualquer', null);
    const decorrido = performance.now() - inicio;

    expect(resultado).toBe(false);
    // Um retorno imediato entregaria "este e-mail não existe" só pelo tempo de resposta.
    // O piso é folgado de propósito: mede-se a ordem de grandeza, não o custo exato.
    expect(decorrido).toBeGreaterThan(20);
  });
});
