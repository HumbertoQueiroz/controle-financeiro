import { z } from 'zod';

/**
 * O bcrypt trunca em 72 BYTES e ignora o resto sem avisar. Validar aqui, na borda,
 * evita que uma senha longa seja aceita no cadastro e depois valide errado no login —
 * e a contagem é em bytes porque cada caractere acentuado ocupa 2 em UTF-8.
 */
export const TAMANHO_MAXIMO_SENHA_BYTES = 72;
export const TAMANHO_MINIMO_SENHA = 8;

/**
 * Tamanho em bytes UTF-8, contado à mão.
 *
 * Sem `TextEncoder` (não tipado num pacote que roda no navegador e no Node) e sem
 * `Buffer` (só existe no Node). Esta é a função que a API e o formulário usam, para que
 * a senha aceita na tela seja exatamente a senha aceita no servidor — duas contagens
 * diferentes produziriam um cadastro que passa no cliente e falha no servidor.
 */
export function tamanhoEmBytes(texto: string): number {
  let bytes = 0;

  for (const caractere of texto) {
    const ponto = caractere.codePointAt(0) ?? 0;

    if (ponto <= 0x7f) bytes += 1;
    else if (ponto <= 0x7ff) bytes += 2;
    else if (ponto <= 0xffff) bytes += 3;
    else bytes += 4;
  }

  return bytes;
}

export const senhaSchema = z
  .string()
  .min(TAMANHO_MINIMO_SENHA, `A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`)
  .refine(
    (senha) => tamanhoEmBytes(senha) <= TAMANHO_MAXIMO_SENHA_BYTES,
    `A senha é longa demais (limite de ${TAMANHO_MAXIMO_SENHA_BYTES} bytes; acentos ocupam 2)`,
  );
