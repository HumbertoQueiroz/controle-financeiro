import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './env.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import errorHandler from './plugins/error-handler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { privacyRoutes } from './modules/privacy/privacy.routes.js';

/**
 * Monta a aplicação sem escutar porta.
 *
 * A separação entre montar e escutar é o que permite os testes de integração usarem
 * `app.inject()` — a requisição atravessa rota, validação, guards e serviço sem abrir
 * socket, o que deixa a suíte rápida e sem porta ocupada em paralelo.
 */
export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
  }).withTypeProvider<ZodTypeProvider>();

  // O mesmo schema Zod que valida a entrada descreve a saída — é o que impede um campo
  // novo no banco de vazar na resposta só por estar no objeto do Prisma.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(errorHandler);
  await app.register(cors, { origin: env.APP_URL, credentials: true });
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(privacyRoutes);

  return app;
}
