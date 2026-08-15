import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GrantScope, Role } from '@prisma/client';
import { env } from '../env.js';
import { ErroDeAcesso, ErroDeAutenticacao } from '../lib/erros.js';

export const NOME_DO_COOKIE = 'controle_sessao';

/** Conteúdo do token. Só o essencial: o resto se lê do banco, que é a fonte da verdade. */
interface Payload {
  sub: string;
  papel: Role;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Payload;
    user: Payload;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido por `requireAuth`. */
    usuario?: { id: string; papel: Role };
    /**
     * Preenchido por `requireReportAccess`: o escopo que o solicitante pode de fato ver.
     * A consulta do relatório precisa usar este valor, e não o que veio na query.
     */
    escopoDeRelatorio?: GrantScope;
  }

  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireReportAccess: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * O token vai em cookie httpOnly, não em localStorage: script injetado na página não
 * consegue ler cookie httpOnly, e é assim que um XSS deixa de virar roubo de sessão.
 * `sameSite: lax` cobre o CSRF nas requisições que mudam estado.
 */
export function opcoesDoCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: env.JWT_EXPIRACAO_SEGUNDOS,
  };
}

/** Um grant PAYABLE cobre um pedido PAYABLE; BOTH cobre qualquer um. */
function escopoCobre(concedido: GrantScope, pedido: GrantScope): boolean {
  return concedido === 'BOTH' || concedido === pedido;
}

export default fp(async (app) => {
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: NOME_DO_COOKIE, signed: false },
    sign: { expiresIn: env.JWT_EXPIRACAO_SEGUNDOS },
  });

  app.decorate('requireAuth', async (request: FastifyRequest) => {
    let payload: Payload;

    try {
      payload = await request.jwtVerify<Payload>();
    } catch {
      throw new ErroDeAutenticacao('Sessão ausente ou expirada');
    }

    // O papel é relido do banco a cada requisição em vez de confiar no que está no token.
    // Sem isso, rebaixar ou desativar alguém só teria efeito quando o token expirasse, e
    // até lá a pessoa continuaria entrando como admin.
    const usuario = await app.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, active: true, anonymizedAt: true },
    });

    if (!usuario || !usuario.active || usuario.anonymizedAt) {
      throw new ErroDeAutenticacao('Sessão inválida');
    }

    request.usuario = { id: usuario.id, papel: usuario.role };
  });

  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    await app.requireAuth(request, reply);

    if (request.usuario?.papel !== 'ADMIN') {
      throw new ErroDeAcesso('Acesso restrito a administradores');
    }
  });

  /**
   * Libera o relatório de outra pessoa apenas quando há consentimento dela.
   *
   * Resolve o escopo efetivo e o guarda em `request.escopoDeRelatorio`. A consulta tem de
   * usar esse valor: filtrar depois de buscar significaria trazer do banco linhas que a
   * pessoa não pode ver, e basta um `select` esquecido para elas vazarem na resposta.
   */
  app.decorate('requireReportAccess', async (request: FastifyRequest, reply: FastifyReply) => {
    await app.requireAuth(request, reply);

    const solicitante = request.usuario!;
    const { ownerId } = request.params as { ownerId?: string };
    const { escopo } = request.query as { escopo?: GrantScope };
    const pedido: GrantScope = escopo ?? 'BOTH';

    if (!ownerId) {
      throw new ErroDeAcesso('Relatório sem dono identificado');
    }

    if (ownerId === solicitante.id || solicitante.papel === 'ADMIN') {
      request.escopoDeRelatorio = pedido;
      return;
    }

    const grant = await app.prisma.reportGrant.findUnique({
      where: { ownerId_granteeUserId: { ownerId, granteeUserId: solicitante.id } },
      select: { scope: true, revokedAt: true, expiresAt: true },
    });

    const ativo = grant && !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > new Date());

    if (!ativo) {
      throw new ErroDeAcesso('Você não tem autorização para ver este relatório');
    }

    if (!escopoCobre(grant.scope, pedido)) {
      throw new ErroDeAcesso('A autorização concedida não cobre este tipo de relatório');
    }

    request.escopoDeRelatorio = grant.scope === 'BOTH' ? pedido : grant.scope;
  });
});
