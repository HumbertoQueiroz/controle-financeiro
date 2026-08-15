import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('aplicação', () => {
  it('responde ao health check sem abrir socket', async () => {
    const app = await buildApp();

    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ok' });

    await app.close();
  });
});
