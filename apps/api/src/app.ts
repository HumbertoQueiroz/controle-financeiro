import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
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
import { peopleRoutes } from './modules/people/people.routes.js';
import { sharingRoutes } from './modules/sharing/sharing.routes.js';
import { cardsRoutes } from './modules/cards/cards.routes.js';
import { groupsRoutes } from './modules/groups/groups.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';

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
  // `attachFieldsToBody: false` mantém o arquivo como stream: carregar o CSV inteiro na
  // memória antes de saber se o usuário pode importar seria trabalho jogado fora.
  await app.register(multipart, { limits: { files: 1, fileSize: 5 * 1024 * 1024 } });

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(privacyRoutes);
  await app.register(peopleRoutes);
  await app.register(sharingRoutes);
  await app.register(cardsRoutes);
  await app.register(groupsRoutes);
  await app.register(reportsRoutes);

  return app;
}
