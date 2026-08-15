import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  atualizarCartaoSchema,
  cartaoSchema,
  criarCartaoSchema,
  faturaSchema,
  lancamentoSchema,
  mesDeReferenciaSchema,
  repassarLancamentoSchema,
  resultadoDaImportacaoSchema,
} from '@controle/shared';
import { z } from 'zod';
import { ErroDeRegra } from '../../lib/erros.js';
import * as service from './cards.service.js';
import * as importacao from '../imports/imports.service.js';

const paramsId = z.object({ id: z.string().uuid() });
const ok = z.object({ ok: z.boolean() });

/** Fatura de banco raramente passa de alguns milhares de linhas. */
const TAMANHO_MAXIMO_DO_ARQUIVO = 5 * 1024 * 1024;

export async function cardsRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  rotas.addHook('preHandler', app.requireAuth);

  rotas.get('/cartoes', { schema: { response: { 200: z.array(cartaoSchema) } } }, async (request) =>
    service.listar(app.prisma, request.usuario!.id),
  );

  rotas.post(
    '/cartoes',
    { schema: { body: criarCartaoSchema, response: { 201: cartaoSchema } } },
    async (request, reply) =>
      reply.status(201).send(await service.criar(app.prisma, request.usuario!.id, request.body)),
  );

  rotas.patch(
    '/cartoes/:id',
    { schema: { params: paramsId, body: atualizarCartaoSchema, response: { 200: cartaoSchema } } },
    async (request) =>
      service.atualizar(app.prisma, request.params.id, request.usuario!.id, request.body),
  );

  rotas.get(
    '/cartoes/:id/faturas',
    { schema: { params: paramsId, response: { 200: z.array(faturaSchema) } } },
    async (request) => service.listarFaturas(app.prisma, request.params.id, request.usuario!.id),
  );

  rotas.get(
    '/faturas/:id/lancamentos',
    { schema: { params: paramsId, response: { 200: z.array(lancamentoSchema) } } },
    async (request) =>
      service.listarLancamentos(app.prisma, request.params.id, request.usuario!.id),
  );

  rotas.post(
    '/faturas/:id/fechar',
    { schema: { params: paramsId, response: { 200: ok } } },
    async (request) => service.fecharFatura(app.prisma, request.params.id, request.usuario!.id),
  );

  rotas.patch(
    '/lancamentos/:id/repasse',
    { schema: { params: paramsId, body: repassarLancamentoSchema, response: { 200: ok } } },
    async (request) =>
      service.repassarLancamento(
        app.prisma,
        request.params.id,
        request.usuario!.id,
        request.body.pessoaId,
      ),
  );

  /**
   * Upload da fatura. `multipart` em vez de JSON com o CSV embutido: o arquivo vem do
   * disco do usuário e pode ter alguns megabytes, e base64 dentro de JSON o inflaria em
   * um terço sem nenhum ganho.
   */
  rotas.post(
    '/cartoes/:id/importacoes',
    { schema: { params: paramsId, response: { 201: resultadoDaImportacaoSchema } } },
    async (request, reply) => {
      const arquivo = await request.file({ limits: { fileSize: TAMANHO_MAXIMO_DO_ARQUIVO } });

      if (!arquivo) {
        throw new ErroDeRegra('Envie o arquivo CSV da fatura');
      }

      // O campo de texto vem junto do arquivo no multipart, e pode chegar como lista
      // quando enviado mais de uma vez.
      const campo = arquivo.fields.mesDeReferencia;
      const informado = Array.isArray(campo) ? campo[0] : campo;
      const mes = mesDeReferenciaSchema.safeParse(
        informado && 'value' in informado ? informado.value : undefined,
      );

      if (!mes.success) {
        throw new ErroDeRegra('Informe o mês de referência da fatura no formato AAAA-MM');
      }

      const conteudo = await arquivo.toBuffer();

      if (arquivo.file.truncated) {
        throw new ErroDeRegra('O arquivo excede o tamanho máximo de 5 MB');
      }

      return reply.status(201).send(
        await importacao.importarFatura(
          app.prisma,
          request.usuario!.id,
          request.params.id,
          mes.data,
          {
            nome: arquivo.filename,
            conteudo,
          },
        ),
      );
    },
  );

  rotas.get('/cartoes/:id/importacoes', { schema: { params: paramsId } }, async (request) =>
    importacao.listarImportacoes(app.prisma, request.params.id, request.usuario!.id),
  );
}
