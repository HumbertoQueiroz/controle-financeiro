import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  atualizarContaSchema,
  avisosSchema,
  buscaSchema,
  confirmarLeituraSchema,
  criarContaSchema,
  resultadoDaLeituraSchema,
  resultadosDaBuscaSchema,
  resumoDeContasSchema,
} from '@controle/shared';
import { z } from 'zod';
import * as service from './accounts.service.js';
import * as avisos from '../avisos/avisos.service.js';
import * as busca from '../busca/busca.service.js';

const paramsId = z.object({ id: z.string().uuid() });
const ok = z.object({ ok: z.boolean() });

/**
 * Contas, avisos e busca.
 *
 * Os três moram juntos porque são as rotas de "estado geral da conta" — nenhuma pertence a
 * um domínio próprio grande o bastante para um módulo, e três arquivos de rota com dois
 * endpoints cada seriam mais cerimônia que organização.
 */
export async function accountsRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.addHook('preHandler', app.requireAuth);

  rotas.get(
    '/contas',
    {
      schema: {
        querystring: z.object({ arquivadas: z.coerce.boolean().default(false) }),
        response: { 200: resumoDeContasSchema },
      },
    },
    async (request) => service.listar(app.prisma, request.usuario!.id, request.query.arquivadas),
  );

  rotas.post(
    '/contas',
    { schema: { body: criarContaSchema, response: { 201: z.object({ id: z.string().uuid() }) } } },
    async (request, reply) =>
      reply.status(201).send(await service.criar(app.prisma, request.usuario!.id, request.body)),
  );

  rotas.patch(
    '/contas/:id',
    { schema: { params: paramsId, body: atualizarContaSchema, response: { 200: ok } } },
    async (request) =>
      service.atualizar(app.prisma, request.params.id, request.usuario!.id, request.body),
  );

  /** Avisos derivados. Não há tabela de notificação — veja `avisos.service.ts`. */
  rotas.get('/avisos', { schema: { response: { 200: avisosSchema } } }, async (request) =>
    avisos.listarAvisos(app.prisma, request.usuario!.id),
  );

  /**
   * Confirma a leitura. O aviso sai da lista ativa e do contador, mas não é silenciado:
   * se o motivo mudar, ele volta — veja `assinaturaDoAviso`.
   */
  rotas.post(
    '/avisos/leitura',
    { schema: { body: confirmarLeituraSchema, response: { 200: resultadoDaLeituraSchema } } },
    async (request) => avisos.confirmarLeitura(app.prisma, request.usuario!.id, request.body),
  );

  rotas.delete(
    '/avisos/leitura/:avisoId',
    {
      schema: {
        params: z.object({ avisoId: z.string().min(1) }),
        response: { 200: ok },
      },
    },
    async (request) =>
      avisos.desfazerLeitura(app.prisma, request.usuario!.id, request.params.avisoId),
  );

  rotas.get(
    '/busca',
    { schema: { querystring: buscaSchema, response: { 200: resultadosDaBuscaSchema } } },
    async (request) => busca.buscar(app.prisma, request.usuario!.id, request.query.q),
  );
}
