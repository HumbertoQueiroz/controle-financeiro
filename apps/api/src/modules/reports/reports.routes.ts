import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { filtroDoRelatorioSchema, relatorioSchema, resumoSchema } from '@controle/shared';
import { z } from 'zod';
import * as service from './reports.service.js';

export async function reportsRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.get(
    '/resumo',
    { preHandler: app.requireAuth, schema: { response: { 200: resumoSchema } } },
    async (request) => service.gerarResumo(app.prisma, request.usuario!.id),
  );

  rotas.get(
    '/relatorios/:ownerId',
    {
      // O guard resolve o escopo efetivo a partir do consentimento e o publica na
      // requisição. O serviço usa esse valor, nunca o que veio na query.
      preHandler: app.requireReportAccess,
      schema: {
        params: z.object({ ownerId: z.string().uuid() }),
        querystring: filtroDoRelatorioSchema,
        response: { 200: relatorioSchema },
      },
    },
    async (request) =>
      service.gerarRelatorio(
        app.prisma,
        request.params.ownerId,
        request.escopoDeRelatorio!,
        request.query,
      ),
  );
}
