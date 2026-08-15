import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { atualizarUsuarioSchema, criarUsuarioSchema, usuarioSchema } from '@controle/shared';
import { z } from 'zod';
import * as service from './users.service.js';

export async function usersRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  // O guard fica no escopo inteiro: rota nova nasce protegida em vez de depender de
  // alguém lembrar de repetir o preHandler.
  rotas.addHook('preHandler', app.requireAdmin);

  rotas.get('/usuarios', { schema: { response: { 200: z.array(usuarioSchema) } } }, async () =>
    service.listar(app.prisma),
  );

  rotas.post(
    '/usuarios',
    { schema: { body: criarUsuarioSchema, response: { 201: usuarioSchema } } },
    async (request, reply) => reply.status(201).send(await service.criar(app.prisma, request.body)),
  );

  rotas.patch(
    '/usuarios/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: atualizarUsuarioSchema,
        response: { 200: usuarioSchema },
      },
    },
    async (request) =>
      service.atualizar(app.prisma, request.params.id, request.usuario!.id, request.body),
  );
}
