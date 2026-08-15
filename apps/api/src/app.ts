import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';

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
  });

  await app.register(cors, {
    origin: env.APP_URL,
    credentials: true,
  });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
