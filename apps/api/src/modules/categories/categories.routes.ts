import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  atualizarCategoriaSchema,
  categoriaSchema,
  classificarEmLoteSchema,
  criarCategoriaSchema,
  definirLimiteSchema,
  direcaoSchema,
  mesDeReferenciaSchema,
  paraClassificarSchema,
  relatorioPorCategoriaSchema,
  resultadoDaClassificacaoSchema,
} from '@controle/shared';
import { z } from 'zod';
import * as service from './categories.service.js';

const paramsId = z.object({ id: z.string().uuid() });
const ok = z.object({ ok: z.boolean() });

export async function categoriesRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.addHook('preHandler', app.requireAuth);

  rotas.get(
    '/categorias',
    {
      schema: {
        querystring: z.object({ arquivadas: z.coerce.boolean().default(false) }),
        response: { 200: z.array(categoriaSchema) },
      },
    },
    async (request) => service.listar(app.prisma, request.usuario!.id, request.query.arquivadas),
  );

  rotas.post(
    '/categorias',
    { schema: { body: criarCategoriaSchema, response: { 201: categoriaSchema } } },
    async (request, reply) =>
      reply.status(201).send(await service.criar(app.prisma, request.usuario!.id, request.body)),
  );

  rotas.patch(
    '/categorias/:id',
    {
      schema: {
        params: paramsId,
        body: atualizarCategoriaSchema,
        response: { 200: categoriaSchema },
      },
    },
    async (request) =>
      service.atualizar(app.prisma, request.params.id, request.usuario!.id, request.body),
  );

  /** Arquiva. Não há exclusão: apagar tiraria a categoria dos lançamentos antigos. */
  rotas.delete(
    '/categorias/:id',
    { schema: { params: paramsId, response: { 200: ok } } },
    async (request) => service.arquivar(app.prisma, request.params.id, request.usuario!.id),
  );

  rotas.put(
    '/categorias/:id/limite',
    { schema: { params: paramsId, body: definirLimiteSchema, response: { 200: ok } } },
    async (request) =>
      service.definirLimite(app.prisma, request.params.id, request.usuario!.id, request.body),
  );

  /** Os lançamentos sem categoria, agrupados pela descrição. */
  rotas.get(
    '/classificar',
    {
      schema: {
        querystring: z.object({
          direcao: direcaoSchema.optional(),
          mes: mesDeReferenciaSchema.optional(),
        }),
        response: { 200: paraClassificarSchema },
      },
    },
    async (request) =>
      service.listarParaClassificar(app.prisma, request.usuario!.id, request.query),
  );

  rotas.post(
    '/classificar',
    {
      schema: {
        body: classificarEmLoteSchema,
        response: { 200: resultadoDaClassificacaoSchema },
      },
    },
    async (request) => service.classificarEmLote(app.prisma, request.usuario!.id, request.body),
  );

  rotas.get(
    '/relatorios/categorias',
    {
      schema: {
        querystring: z.object({
          mes: mesDeReferenciaSchema,
          direcao: direcaoSchema.default('PAYABLE'),
        }),
        response: { 200: relatorioPorCategoriaSchema },
      },
    },
    async (request) =>
      service.relatorioPorCategoria(
        app.prisma,
        request.usuario!.id,
        request.query.mes,
        request.query.direcao,
      ),
  );
}
