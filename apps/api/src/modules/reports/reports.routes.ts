import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  filtroDoRelatorioSchema,
  mesDeReferenciaSchema,
  relatorioSchema,
  resumoSchema,
} from '@controle/shared';
import { z } from 'zod';
import * as service from './reports.service.js';
import { gerarResumo } from '../entries/orcamento.service.js';

/** Mês corrente em AAAA-MM, usado quando a chamada não informa um. */
function mesAtual(): string {
  const agora = new Date();

  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function reportsRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.get(
    '/resumo',
    {
      preHandler: app.requireAuth,
      schema: {
        querystring: z.object({ mes: mesDeReferenciaSchema.optional() }),
        response: { 200: resumoSchema },
      },
    },
    async (request) =>
      gerarResumo(app.prisma, request.usuario!.id, request.query.mes ?? mesAtual()),
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
    async (request, reply) =>
      reply.send(
        await service.gerarRelatorio(
          app.prisma,
          request.params.ownerId,
          request.escopoDeRelatorio!,
          request.query,
        ),
      ),
  );
}
