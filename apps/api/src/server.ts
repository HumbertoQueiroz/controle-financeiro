import { buildApp } from './app.js';
import { env } from './env.js';

const app = await buildApp();

try {
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}
