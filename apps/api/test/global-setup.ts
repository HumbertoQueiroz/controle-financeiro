import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { apontarParaBancoDeTeste } from './env-de-teste.js';

/**
 * Roda uma vez antes de toda a suíte: aplica as migrations no banco de teste.
 *
 * `migrate deploy` e não `migrate dev` — deploy só aplica o que já existe, nunca gera
 * migration nova nem faz pergunta. Em CI, uma migration criada automaticamente seria um
 * arquivo que ninguém revisou entrando no repositório.
 */
export default function setup() {
  const url = apontarParaBancoDeTeste();
  const raizDaApi = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  execFileSync(
    'node',
    [resolve(raizDaApi, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: raizDaApi,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    },
  );
}
