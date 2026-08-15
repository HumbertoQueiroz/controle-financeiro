import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

// O .env fica na raiz do monorepo, mas o processo roda com cwd em apps/api. Resolver
// pelo caminho do arquivo, e não pelo cwd, faz o carregamento funcionar igual quando
// a API é iniciada pelo turbo, pelo pnpm --filter ou direto pela pasta.
const raizDoMonorepo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
config({ path: resolve(raizDoMonorepo, '.env'), quiet: true });

/**
 * Validação da configuração na subida do processo.
 *
 * Falhar aqui é de propósito: uma variável ausente vira erro de conexão obscuro no meio
 * de uma requisição horas depois, e a mensagem não aponta para a causa. Melhor não subir.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa de pelo menos 32 caracteres'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET precisa de pelo menos 32 caracteres'),
  /** Validade da sessão. Sete dias por padrão — o suficiente para não deslogar no uso diário. */
  JWT_EXPIRACAO_SEGUNDOS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
  APP_URL: z.string().url().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detalhes = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Configuração inválida no .env:\n${detalhes}`);
}

export const env = parsed.data;
