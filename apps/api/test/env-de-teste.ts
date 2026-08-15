import { config as carregarEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Aponta a suíte para o banco de teste, antes de qualquer import que abra conexão.
 *
 * O redirecionamento é explícito e falha alto quando TEST_DATABASE_URL não existe. O
 * modo silencioso seria cair no DATABASE_URL de desenvolvimento — e a primeira coisa que
 * a suíte faz é truncar todas as tabelas.
 */
export function apontarParaBancoDeTeste(): string {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  carregarEnv({ path: resolve(raiz, '.env'), quiet: true });

  const urlDeTeste = process.env.TEST_DATABASE_URL;

  if (!urlDeTeste) {
    throw new Error(
      'TEST_DATABASE_URL não definida. A suíte se recusa a rodar contra o banco de ' +
        'desenvolvimento porque ela trunca todas as tabelas.',
    );
  }

  process.env.DATABASE_URL = urlDeTeste;
  process.env.NODE_ENV = 'test';

  return urlDeTeste;
}
