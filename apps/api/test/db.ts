import { PrismaClient } from '@prisma/client';
import { apontarParaBancoDeTeste } from './env-de-teste.js';

apontarParaBancoDeTeste();

export const prismaDeTeste = new PrismaClient();

/**
 * Esvazia o banco entre testes.
 *
 * TRUNCATE ... CASCADE em vez de deletar tabela a tabela: a ordem de deleção respeitando
 * chaves estrangeiras é uma lista que envelhece a cada tabela nova, e quando ela sai de
 * sincronia o erro aparece como um teste vermelho sem relação com o que mudou. Ler as
 * tabelas do catálogo mantém a limpeza correta sozinha.
 *
 * `_prisma_migrations` fica de fora — apagá-la faria o Prisma achar que o banco é novo.
 */
export async function limparBanco(): Promise<void> {
  const tabelas = await prismaDeTeste.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tabelas.length === 0) return;

  const lista = tabelas.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prismaDeTeste.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}
