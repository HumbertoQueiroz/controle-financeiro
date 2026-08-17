import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  atualizarLancamentoSchema,
  atualizarRecorrenciaSchema,
  criarLancamentoSchema,
  criarRecorrenciaSchema,
  darBaixaSchema,
  dashboardSchema,
  filtroDeLancamentosSchema,
  lancamentoSchema,
  mesDeReferenciaSchema,
  orcamentoSchema,
  recorrenciaSchema,
} from '@controle/shared';
import { z } from 'zod';
import * as service from './entries.service.js';
import * as recorrencias from './recorrencias.service.js';
import * as orcamento from './orcamento.service.js';
import * as dashboard from './dashboard.service.js';

const paramsId = z.object({ id: z.string().uuid() });
const ok = z.object({ ok: z.boolean() });

export async function entriesRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.addHook('preHandler', app.requireAuth);

  // ------------------------------------------------------------------
  // Dashboard e orçamento do mês
  // ------------------------------------------------------------------
  rotas.get(
    '/dashboard',
    {
      schema: {
        querystring: z.object({ mes: mesDeReferenciaSchema }),
        response: { 200: dashboardSchema },
      },
    },
    async (request) => dashboard.gerarDashboard(app.prisma, request.usuario!.id, request.query.mes),
  );

  rotas.get(
    '/orcamento',
    {
      schema: {
        querystring: z.object({ mes: mesDeReferenciaSchema }),
        response: { 200: orcamentoSchema },
      },
    },
    async (request) => orcamento.gerarOrcamento(app.prisma, request.usuario!.id, request.query.mes),
  );

  // ------------------------------------------------------------------
  // Lançamentos
  // ------------------------------------------------------------------
  rotas.get(
    '/lancamentos',
    {
      schema: {
        querystring: filtroDeLancamentosSchema,
        response: { 200: z.array(lancamentoSchema) },
      },
    },
    async (request) => {
      // Gera as parcelas antes de listar, para o salário do mês pedido aparecer mesmo
      // que a pessoa nunca tenha aberto o orçamento daquele mês.
      if (request.query.mes) {
        await recorrencias.gerarParcelasDoMes(app.prisma, request.usuario!.id, request.query.mes);
      }

      return service.listar(app.prisma, request.usuario!.id, request.query);
    },
  );

  rotas.post(
    '/lancamentos',
    { schema: { body: criarLancamentoSchema, response: { 201: lancamentoSchema } } },
    async (request, reply) =>
      reply.status(201).send(await service.criar(app.prisma, request.usuario!.id, request.body)),
  );

  rotas.patch(
    '/lancamentos/:id',
    {
      schema: {
        params: paramsId,
        body: atualizarLancamentoSchema,
        response: { 200: lancamentoSchema },
      },
    },
    async (request) =>
      service.atualizar(app.prisma, request.params.id, request.usuario!.id, request.body),
  );

  rotas.delete(
    '/lancamentos/:id',
    { schema: { params: paramsId, response: { 200: ok } } },
    async (request) => service.excluir(app.prisma, request.params.id, request.usuario!.id),
  );

  rotas.post(
    '/lancamentos/:id/baixa',
    { schema: { params: paramsId, body: darBaixaSchema, response: { 200: lancamentoSchema } } },
    async (request) =>
      service.darBaixa(app.prisma, request.params.id, request.usuario!.id, request.body),
  );

  rotas.delete(
    '/lancamentos/:id/baixa',
    { schema: { params: paramsId, response: { 200: lancamentoSchema } } },
    async (request) => service.estornarBaixa(app.prisma, request.params.id, request.usuario!.id),
  );

  /**
   * Confirma um pagamento que o devedor declarou.
   *
   * Só quem recebe pode chamar. A tela esconde o botão para os demais, mas quem decide é
   * o serviço: esconder um botão nunca foi autorização.
   */
  rotas.post(
    '/lancamentos/:id/pagamentos/:pagamentoId/confirmar',
    {
      schema: {
        params: paramsId.extend({ pagamentoId: z.string().uuid() }),
        response: { 200: lancamentoSchema },
      },
    },
    async (request) =>
      service.confirmarPagamentoDoLancamento(
        app.prisma,
        request.params.id,
        request.params.pagamentoId,
        request.usuario!.id,
      ),
  );

  /** Remove um pagamento específico, mantendo os demais do título. */
  rotas.delete(
    '/lancamentos/:id/pagamentos/:pagamentoId',
    {
      schema: {
        params: paramsId.extend({ pagamentoId: z.string().uuid() }),
        response: { 200: lancamentoSchema },
      },
    },
    async (request) =>
      service.removerPagamentoDoLancamento(
        app.prisma,
        request.params.id,
        request.params.pagamentoId,
        request.usuario!.id,
      ),
  );

  // ------------------------------------------------------------------
  // Recorrências
  // ------------------------------------------------------------------
  rotas.get(
    '/recorrencias',
    { schema: { response: { 200: z.array(recorrenciaSchema) } } },
    async (request) => recorrencias.listar(app.prisma, request.usuario!.id),
  );

  rotas.post(
    '/recorrencias',
    { schema: { body: criarRecorrenciaSchema, response: { 201: recorrenciaSchema } } },
    async (request, reply) =>
      reply
        .status(201)
        .send(await recorrencias.criar(app.prisma, request.usuario!.id, request.body)),
  );

  rotas.patch(
    '/recorrencias/:id',
    {
      schema: {
        params: paramsId,
        body: atualizarRecorrenciaSchema,
        response: { 200: recorrenciaSchema },
      },
    },
    async (request) =>
      recorrencias.atualizar(app.prisma, request.params.id, request.usuario!.id, request.body),
  );

  rotas.delete(
    '/recorrencias/:id',
    { schema: { params: paramsId, response: { 200: ok } } },
    async (request) => recorrencias.excluir(app.prisma, request.params.id, request.usuario!.id),
  );
}
