import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  atualizarCartaoSchema,
  atualizarParcelamentoSchema,
  cartaoSchema,
  confirmarImportacaoSchema,
  criarCartaoSchema,
  faturaSchema,
  lancamentoDaFaturaSchema,
  mesDeReferenciaSchema,
  parcelamentoSchema,
  previaDaImportacaoSchema,
  repassarLancamentoSchema,
  resultadoDaExclusaoSchema,
  resultadoDaImportacaoSchema,
} from '@controle/shared';
import { z } from 'zod';
import { ErroDeRegra } from '../../lib/erros.js';
import * as service from './cards.service.js';
import * as importacao from '../imports/imports.service.js';
import * as parcelamentos from '../imports/parcelamentos.service.js';

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
    { schema: { params: paramsId, response: { 200: z.array(lancamentoDaFaturaSchema) } } },
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
   * Primeira fase: lê o arquivo e devolve o que encontrou, sem gravar.
   *
   * `multipart` em vez de JSON com o CSV embutido: o arquivo vem do disco do usuário e
   * pode ter alguns megabytes, e base64 dentro de JSON o inflaria em um terço sem ganho.
   */
  rotas.post(
    '/cartoes/:id/importacoes/previa',
    { schema: { params: paramsId, response: { 200: previaDaImportacaoSchema } } },
    async (request) => {
      const arquivo = await request.file({ limits: { fileSize: TAMANHO_MAXIMO_DO_ARQUIVO } });

      if (!arquivo) {
        throw new ErroDeRegra('Envie o arquivo CSV da fatura');
      }

      const conteudo = await arquivo.toBuffer();

      if (arquivo.file.truncated) {
        throw new ErroDeRegra('O arquivo excede o tamanho máximo de 5 MB');
      }

      // O mês vem junto do arquivo, no mesmo multipart: é ele que define a fatura de
      // todas as linhas, e sem ele a prévia teria de adivinhar.
      //
      // O tipo de `fields` cobre o caso de um campo repetido, que aqui não acontece — daí
      // a checagem em vez do acesso direto.
      const campoDoMes = arquivo.fields.mes;
      const mes = mesDeReferenciaSchema.parse(
        campoDoMes && !Array.isArray(campoDoMes) && campoDoMes.type === 'field'
          ? String(campoDoMes.value)
          : '',
      );

      return importacao.analisarArquivo(
        app.prisma,
        request.usuario!.id,
        request.params.id,
        { nome: arquivo.filename, conteudo },
        mes,
      );
    },
  );

  /** Segunda fase: grava o que a pessoa classificou. */
  rotas.post(
    '/cartoes/:id/importacoes',
    {
      schema: {
        params: paramsId,
        body: confirmarImportacaoSchema,
        response: { 201: resultadoDaImportacaoSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await importacao.confirmarImportacao(
            app.prisma,
            request.usuario!.id,
            request.params.id,
            request.body,
          ),
        ),
  );

  rotas.get('/cartoes/:id/importacoes', { schema: { params: paramsId } }, async (request) =>
    importacao.listarImportacoes(app.prisma, request.params.id, request.usuario!.id),
  );

  /** Desfaz uma importação: apaga o que ela criou e recalcula as faturas. */
  rotas.delete(
    '/cartoes/:id/importacoes/:importacaoId',
    {
      schema: {
        params: z.object({ id: z.string().uuid(), importacaoId: z.string().uuid() }),
        response: { 200: resultadoDaExclusaoSchema },
      },
    },
    async (request) =>
      importacao.excluirImportacao(
        app.prisma,
        request.params.id,
        request.usuario!.id,
        request.params.importacaoId,
      ),
  );

  // ------------------------------------------------------------------
  // Parcelamentos
  // ------------------------------------------------------------------
  rotas.get(
    '/parcelamentos',
    { schema: { response: { 200: z.array(parcelamentoSchema) } } },
    async (request) => parcelamentos.listar(app.prisma, request.usuario!.id),
  );

  rotas.patch(
    '/parcelamentos/:id',
    {
      schema: { params: paramsId, body: atualizarParcelamentoSchema, response: { 200: ok } },
    },
    async (request) =>
      parcelamentos.trocarResponsavel(
        app.prisma,
        request.params.id,
        request.usuario!.id,
        request.body.responsavelPessoaId,
      ),
  );

  rotas.delete(
    '/parcelamentos/:id',
    {
      schema: {
        params: paramsId,
        response: { 200: z.object({ ok: z.boolean(), parcelasRemovidas: z.number() }) },
      },
    },
    async (request) => parcelamentos.excluir(app.prisma, request.params.id, request.usuario!.id),
  );
}
