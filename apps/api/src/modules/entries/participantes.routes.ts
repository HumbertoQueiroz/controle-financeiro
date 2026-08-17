import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  agendaDeFechamentoSchema,
  definirAgendaSchema,
  fechamentoDoHistoricoSchema,
  fechamentoDoParticipanteSchema,
  mesDeReferenciaSchema,
  quitarFechamentoSchema,
  resultadoDoFechamentoSchema,
  saldosDosParticipantesSchema,
} from '@controle/shared';
import { z } from 'zod';
import * as service from './participantes.service.js';
import * as agenda from './agenda.service.js';

const paramsId = z.object({ id: z.string().uuid() });

/**
 * Acerto de contas com um participante.
 *
 * O fechamento é sempre da agenda de quem pede — o `:id` é uma `Person` do próprio
 * usuário, e o serviço recusa a de outra pessoa. Não há visão de terceiro aqui: quem
 * compartilhou relatório concedeu leitura, não o direito de quitar dívida alheia.
 */
export async function participantesRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.addHook('preHandler', app.requireAuth);

  /** O saldo com cada participante, para não precisar abrir uma tela por pessoa. */
  rotas.get(
    '/participantes/saldos',
    {
      schema: {
        querystring: z.object({ mes: mesDeReferenciaSchema }),
        response: { 200: saldosDosParticipantesSchema },
      },
    },
    async (request) => service.listarSaldos(app.prisma, request.usuario!.id, request.query.mes),
  );

  rotas.get(
    '/participantes/:id/fechamento',
    {
      schema: {
        params: paramsId,
        querystring: z.object({ mes: mesDeReferenciaSchema }),
        response: { 200: fechamentoDoParticipanteSchema },
      },
    },
    async (request) =>
      service.obterDadosFechamento(
        app.prisma,
        request.usuario!.id,
        request.params.id,
        request.query.mes,
      ),
  );

  /** Histórico: todos os fechamentos, ou só os de um participante. */
  rotas.get(
    '/fechamentos',
    {
      schema: {
        querystring: z.object({ participanteId: z.string().uuid().optional() }),
        response: { 200: z.array(fechamentoDoHistoricoSchema) },
      },
    },
    async (request) =>
      service.listarHistorico(app.prisma, request.usuario!.id, request.query.participanteId),
  );

  /** Liga ou desliga a repetição do fechamento com uma pessoa. */
  rotas.put(
    '/participantes/:id/fechamento/agenda',
    {
      schema: {
        params: paramsId,
        body: definirAgendaSchema,
        response: { 200: agendaDeFechamentoSchema },
      },
    },
    async (request) =>
      agenda.definirAgenda(app.prisma, request.usuario!.id, request.params.id, request.body),
  );

  rotas.post(
    '/participantes/:id/fechamento/quitar',
    {
      schema: {
        params: paramsId,
        body: quitarFechamentoSchema,
        response: { 200: resultadoDoFechamentoSchema },
      },
    },
    async (request) =>
      service.quitarFechamento(app.prisma, request.usuario!.id, request.params.id, request.body),
  );
}
