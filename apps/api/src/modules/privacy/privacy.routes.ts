import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NOME_DO_COOKIE, opcoesDoCookie } from '../../plugins/auth.js';
import * as service from './privacy.service.js';

export async function privacyRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.addHook('preHandler', app.requireAuth);

  rotas.get('/eu/dados', async (request, reply) => {
    const dados = await service.exportarDados(app.prisma, request.usuario!.id);

    // Content-Disposition para o navegador salvar em vez de renderizar: o direito de
    // portabilidade só é útil se a pessoa consegue guardar o arquivo.
    return reply
      .header('Content-Disposition', 'attachment; filename="meus-dados.json"')
      .type('application/json')
      .send(dados);
  });

  rotas.delete(
    '/eu',
    { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
    async (request, reply) => {
      await service.anonimizarConta(app.prisma, request.usuario!.id);

      // Encerrar a sessão junto: a conta deixou de existir, o cookie não pode sobreviver a ela.
      return reply
        .clearCookie(NOME_DO_COOKIE, { ...opcoesDoCookie(), maxAge: undefined })
        .send({ ok: true });
    },
  );
}
