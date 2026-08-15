import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  atualizarPessoaSchema,
  criarPessoaSchema,
  pessoaSchema,
  vincularPessoaSchema,
} from '@controle/shared';
import { z } from 'zod';
import * as service from './people.service.js';

const paramsId = z.object({ id: z.string().uuid() });

export async function peopleRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.addHook('preHandler', app.requireAuth);

  rotas.get('/pessoas', { schema: { response: { 200: z.array(pessoaSchema) } } }, async (request) =>
    service.listar(app.prisma, request.usuario!.id),
  );

  rotas.post(
    '/pessoas',
    { schema: { body: criarPessoaSchema, response: { 201: pessoaSchema } } },
    async (request, reply) =>
      reply.status(201).send(await service.criar(app.prisma, request.usuario!.id, request.body)),
  );

  rotas.patch(
    '/pessoas/:id',
    { schema: { params: paramsId, body: atualizarPessoaSchema, response: { 200: pessoaSchema } } },
    async (request) =>
      service.atualizar(app.prisma, request.params.id, request.usuario!.id, request.body),
  );

  rotas.delete(
    '/pessoas/:id',
    { schema: { params: paramsId, response: { 200: z.object({ anonimizada: z.boolean() }) } } },
    async (request) => service.excluir(app.prisma, request.params.id, request.usuario!.id),
  );

  rotas.post(
    '/pessoas/:id/vinculo',
    { schema: { params: paramsId, body: vincularPessoaSchema, response: { 200: pessoaSchema } } },
    async (request) =>
      service.vincularUsuario(
        app.prisma,
        request.params.id,
        request.usuario!.id,
        request.body.email,
      ),
  );

  rotas.delete(
    '/pessoas/:id/vinculo',
    { schema: { params: paramsId, response: { 200: pessoaSchema } } },
    async (request) =>
      service.desvincularUsuario(app.prisma, request.params.id, request.usuario!.id),
  );
}
