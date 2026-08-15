import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  aceitarConviteSchema,
  compartilhamentoSchema,
  compartilharSchema,
  convitePublicoSchema,
  resultadoDoCompartilhamentoSchema,
  usuarioAutenticadoSchema,
} from '@controle/shared';
import { z } from 'zod';
import { NOME_DO_COOKIE, opcoesDoCookie } from '../../plugins/auth.js';
import { obterSessao } from '../auth/auth.service.js';
import * as service from './sharing.service.js';

const paramsId = z.object({ id: z.string().uuid() });
const ok = z.object({ ok: z.boolean() });

export async function sharingRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  // ------------------------------------------------------------------
  // Rotas do dono dos dados
  // ------------------------------------------------------------------
  rotas.register(async (protegidas) => {
    const r = protegidas.withTypeProvider<ZodTypeProvider>();
    r.addHook('preHandler', app.requireAuth);

    r.get(
      '/compartilhamentos',
      { schema: { response: { 200: z.array(compartilhamentoSchema) } } },
      async (request) => service.listar(app.prisma, request.usuario!.id),
    );

    r.post(
      '/compartilhamentos',
      {
        schema: { body: compartilharSchema, response: { 201: resultadoDoCompartilhamentoSchema } },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(await service.compartilhar(app.prisma, request.usuario!.id, request.body)),
    );

    // Mesmo efeito do caminho acima quando o e-mail não tem conta, mas sem a busca —
    // para quando o dono já sabe que a pessoa não está cadastrada.
    r.post(
      '/convites',
      {
        schema: { body: compartilharSchema, response: { 201: resultadoDoCompartilhamentoSchema } },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(await service.criarConvite(app.prisma, request.usuario!.id, request.body)),
    );

    r.delete(
      '/compartilhamentos/:id',
      { schema: { params: paramsId, response: { 200: ok } } },
      async (request) => {
        await service.revogarGrant(app.prisma, request.params.id, request.usuario!.id);
        return { ok: true };
      },
    );

    r.delete(
      '/convites/:id',
      { schema: { params: paramsId, response: { 200: ok } } },
      async (request) => {
        await service.revogarConvite(app.prisma, request.params.id, request.usuario!.id);
        return { ok: true };
      },
    );
  });

  // ------------------------------------------------------------------
  // Rotas públicas do convite — quem chega por elas ainda não tem sessão
  // ------------------------------------------------------------------
  const paramsToken = z.object({ token: z.string().min(20) });

  rotas.get(
    '/convite/:token',
    { schema: { params: paramsToken, response: { 200: convitePublicoSchema } } },
    async (request, reply) =>
      // O token está no caminho da URL, e o Referer levaria a URL inteira para qualquer
      // recurso externo que a página carregasse. Sem referrer, o link não vaza.
      reply
        .header('Referrer-Policy', 'no-referrer')
        .header('X-Robots-Tag', 'noindex, nofollow')
        .send(await service.verConvite(app.prisma, request.params.token)),
  );

  rotas.post(
    '/convite/:token/aceitar',
    {
      schema: {
        params: paramsToken,
        body: aceitarConviteSchema,
        response: { 200: usuarioAutenticadoSchema },
      },
    },
    async (request, reply) => {
      const aceito = await service.aceitarConvite(app.prisma, request.params.token, request.body, {
        ip: request.ip,
        userAgent:
          typeof request.headers['user-agent'] === 'string'
            ? request.headers['user-agent']
            : undefined,
      });

      const sessao = await obterSessao(app.prisma, aceito.usuarioId);
      const token = app.jwt.sign({ sub: aceito.usuarioId, papel: aceito.papel });

      // Já entra logado: exigir um login logo depois do cadastro é atrito sem ganho, e a
      // pessoa acabou de provar quem é ao abrir um link que só ela recebeu.
      return reply
        .header('Referrer-Policy', 'no-referrer')
        .setCookie(NOME_DO_COOKIE, token, opcoesDoCookie())
        .send(sessao);
    },
  );
}
