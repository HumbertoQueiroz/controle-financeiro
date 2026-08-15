import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  cadastroSchema,
  credenciaisSchema,
  trocaDeSenhaSchema,
  usuarioAutenticadoSchema,
} from '@controle/shared';
import { z } from 'zod';
import { NOME_DO_COOKIE, opcoesDoCookie } from '../../plugins/auth.js';
import * as service from './auth.service.js';

export async function authRoutes(app: FastifyInstance) {
  const rotas = app.withTypeProvider<ZodTypeProvider>();

  const dadosDaRequisicao = (request: { ip: string; headers: Record<string, unknown> }) => ({
    ip: request.ip,
    userAgent:
      typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
  });

  rotas.post(
    '/auth/login',
    { schema: { body: credenciaisSchema, response: { 200: usuarioAutenticadoSchema } } },
    async (request, reply) => {
      const usuario = await service.autenticar(app.prisma, request.body);
      const token = app.jwt.sign({ sub: usuario.id, papel: usuario.papel });

      return reply.setCookie(NOME_DO_COOKIE, token, opcoesDoCookie()).send(usuario);
    },
  );

  rotas.post(
    '/auth/cadastro',
    { schema: { body: cadastroSchema, response: { 201: usuarioAutenticadoSchema } } },
    async (request, reply) => {
      const usuario = await service.cadastrar(app.prisma, request.body, dadosDaRequisicao(request));
      const token = app.jwt.sign({ sub: usuario.id, papel: usuario.papel });

      return reply.status(201).setCookie(NOME_DO_COOKIE, token, opcoesDoCookie()).send(usuario);
    },
  );

  rotas.post('/auth/logout', async (_request, reply) => {
    // Apagar o cookie com as MESMAS opções com que foi criado. Um path diferente cria um
    // segundo cookie vazio e deixa o original de pé — a pessoa clica em sair e continua logada.
    return reply
      .clearCookie(NOME_DO_COOKIE, { ...opcoesDoCookie(), maxAge: undefined })
      .send({ ok: true });
  });

  rotas.get(
    '/auth/eu',
    { preHandler: app.requireAuth, schema: { response: { 200: usuarioAutenticadoSchema } } },
    async (request) => service.obterSessao(app.prisma, request.usuario!.id),
  );

  rotas.post(
    '/auth/aceitar-termos',
    { preHandler: app.requireAuth, schema: { response: { 200: usuarioAutenticadoSchema } } },
    async (request) =>
      service.aceitarTermos(app.prisma, request.usuario!.id, dadosDaRequisicao(request)),
  );

  rotas.post(
    '/auth/trocar-senha',
    {
      preHandler: app.requireAuth,
      schema: { body: trocaDeSenhaSchema, response: { 200: z.object({ ok: z.boolean() }) } },
    },
    async (request) => {
      await service.trocarSenha(app.prisma, request.usuario!.id, request.body);
      return { ok: true };
    },
  );
}
