import { defineConfig } from 'prisma/config';
import { config as carregarEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// Com prisma.config.ts o Prisma deixa de carregar .env sozinho, o que aqui é vantagem:
// o .env mora na raiz do monorepo e o CLI roda a partir de apps/api. Resolver pelo
// caminho do arquivo funciona igual pelo turbo, pelo pnpm --filter ou direto da pasta.
const esteDiretorio = dirname(fileURLToPath(import.meta.url));
carregarEnv({ path: resolve(esteDiretorio, '../../.env'), quiet: true });

export default defineConfig({
  schema: join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
