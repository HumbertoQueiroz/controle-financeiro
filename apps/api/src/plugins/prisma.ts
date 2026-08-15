import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

/**
 * Um PrismaClient por instância da aplicação, fechado junto com ela.
 *
 * Sem o onClose, cada `buildApp()` de teste deixaria um pool de conexões aberto e a suíte
 * esgotaria o limite do Postgres depois de algumas dezenas de arquivos.
 */
export default fp(async (app) => {
  const prisma = new PrismaClient();

  await prisma.$connect();

  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
