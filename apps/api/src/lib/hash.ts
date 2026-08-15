import bcrypt from 'bcrypt';
import { TAMANHO_MAXIMO_SENHA_BYTES, tamanhoEmBytes } from '@controle/shared';

/**
 * Custo do bcrypt. 12 é o ponto atual entre segurança e latência de login aceitável.
 * Fica isolado aqui porque subir o custo é a manutenção esperada com o tempo — hardware
 * melhora, e o número precisa acompanhar sem caçar chamadas espalhadas pelo código.
 */
const CUSTO = 12;

/**
 * O bcrypt trunca a senha em 72 BYTES e ignora tudo depois disso, silenciosamente.
 * Duas senhas longas que só diferem no fim viram o mesmo hash. O limite é em bytes, não
 * em caracteres: cada acentuada ocupa 2 em UTF-8, então "senha com acentuação" cabe menos
 * do que parece. Rejeitar acima do limite é melhor que aceitar e validar só o começo.
 *
 * O limite e a contagem vêm de @controle/shared, os mesmos que o formulário usa.
 */
export { TAMANHO_MAXIMO_SENHA_BYTES };

/**
 * Hash usado quando o e-mail não existe, para o login gastar o mesmo tempo dos dois lados.
 * Sem isso, responder "não existe" em 1ms e "senha errada" em 250ms entrega ao atacante
 * a lista de quem tem conta, sem ele precisar acertar senha nenhuma.
 *
 * É gerado sob demanda e memorizado, em vez de constante escrita à mão: um hash literal
 * com um caractere errado nunca falha em teste — só faz o compare retornar rápido demais,
 * devolvendo justamente a diferença de tempo que ele deveria esconder.
 */
let hashDescartavel: Promise<string> | null = null;

function obterHashDescartavel(): Promise<string> {
  hashDescartavel ??= bcrypt.hash('senha-que-nao-pertence-a-ninguem', CUSTO);
  return hashDescartavel;
}

export function excedeTamanhoMaximo(senha: string): boolean {
  return tamanhoEmBytes(senha) > TAMANHO_MAXIMO_SENHA_BYTES;
}

export async function hashPassword(senha: string): Promise<string> {
  if (excedeTamanhoMaximo(senha)) {
    throw new Error(
      `A senha excede ${TAMANHO_MAXIMO_SENHA_BYTES} bytes, o limite do bcrypt. ` +
        'Caracteres acentuados ocupam mais de um byte.',
    );
  }

  return bcrypt.hash(senha, CUSTO);
}

export async function verifyPassword(senha: string, hash: string | null): Promise<boolean> {
  // Compara mesmo sem hash real, para que o custo em tempo não revele se a conta existe.
  if (hash === null) {
    await bcrypt.compare(senha, await obterHashDescartavel());
    return false;
  }

  return bcrypt.compare(senha, hash);
}
