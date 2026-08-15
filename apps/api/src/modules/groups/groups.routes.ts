import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  adicionarMembroSchema,
  criarDespesaSchema,
  criarEventoSchema,
  criarGrupoSchema,
  despesaSchema,
  eventoSchema,
  fechamentoSchema,
  grupoSchema,
  membroSchema,
  periodoSchema,
  previaDoFechamentoSchema,
} from '@controle/shared';
import { z } from 'zod';
import * as service from './groups.service.js';
import * as fechamento from './fechamento.service.js';

const paramsId = z.object({ id: z.string().uuid() });
const ok = z.object({ ok: z.boolean() });

export async function groupsRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.addHook('preHandler', app.requireAuth);

  rotas.get('/grupos', { schema: { response: { 200: z.array(grupoSchema) } } }, async (request) =>
    service.listar(app.prisma, request.usuario!.id),
  );

  rotas.post(
    '/grupos',
    { schema: { body: criarGrupoSchema, response: { 201: grupoSchema } } },
    async (request, reply) =>
      reply.status(201).send(await service.criar(app.prisma, request.usuario!.id, request.body)),
  );

  rotas.get(
    '/grupos/:id/membros',
    { schema: { params: paramsId, response: { 200: z.array(membroSchema) } } },
    async (request) => service.listarMembros(app.prisma, request.params.id, request.usuario!.id),
  );

  rotas.post(
    '/grupos/:id/membros',
    {
      schema: {
        params: paramsId,
        body: adicionarMembroSchema,
        response: { 201: z.array(membroSchema) },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.adicionarMembro(
            app.prisma,
            request.params.id,
            request.usuario!.id,
            request.body.pessoaId,
          ),
        ),
  );

  rotas.delete(
    '/grupos/:id/membros/:pessoaId',
    {
      schema: {
        params: paramsId.extend({ pessoaId: z.string().uuid() }),
        response: { 200: z.array(membroSchema) },
      },
    },
    async (request) =>
      service.removerMembro(
        app.prisma,
        request.params.id,
        request.usuario!.id,
        request.params.pessoaId,
      ),
  );

  rotas.get(
    '/grupos/:id/roles',
    { schema: { params: paramsId, response: { 200: z.array(eventoSchema) } } },
    async (request) => service.listarEventos(app.prisma, request.params.id, request.usuario!.id),
  );

  rotas.post(
    '/grupos/:id/roles',
    { schema: { params: paramsId, body: criarEventoSchema, response: { 201: eventoSchema } } },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.criarEvento(
            app.prisma,
            request.params.id,
            request.usuario!.id,
            request.body,
          ),
        ),
  );

  rotas.get(
    '/roles/:id/despesas',
    { schema: { params: paramsId, response: { 200: z.array(despesaSchema) } } },
    async (request) => service.listarDespesas(app.prisma, request.params.id, request.usuario!.id),
  );

  rotas.post(
    '/roles/:id/despesas',
    { schema: { params: paramsId, body: criarDespesaSchema, response: { 201: despesaSchema } } },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.criarDespesa(
            app.prisma,
            request.params.id,
            request.usuario!.id,
            request.body,
          ),
        ),
  );

  rotas.delete(
    '/despesas/:id',
    { schema: { params: paramsId, response: { 200: ok } } },
    async (request) => service.excluirDespesa(app.prisma, request.params.id, request.usuario!.id),
  );

  // Prévia antes de fechar: fechar liquida obrigações, e ninguém deve descobrir o
  // resultado depois de ele já ter acontecido.
  rotas.get(
    '/grupos/:id/fechamento',
    {
      schema: {
        params: paramsId,
        querystring: z.object({ periodo: periodoSchema }),
        response: { 200: previaDoFechamentoSchema },
      },
    },
    async (request) =>
      fechamento.preverFechamento(
        app.prisma,
        request.params.id,
        request.usuario!.id,
        request.query.periodo,
      ),
  );

  rotas.post(
    '/grupos/:id/fechamento',
    {
      schema: {
        params: paramsId,
        body: z.object({ periodo: periodoSchema }),
        response: { 201: fechamentoSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await fechamento.fecharPeriodo(
            app.prisma,
            request.params.id,
            request.usuario!.id,
            request.body.periodo,
          ),
        ),
  );

  rotas.get('/grupos/:id/fechamentos', { schema: { params: paramsId } }, async (request) =>
    fechamento.listarFechamentos(app.prisma, request.params.id, request.usuario!.id),
  );
}
