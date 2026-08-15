import { createHash, randomBytes } from 'node:crypto';
import { env } from '../env.js';

/** Sete dias: tempo de sobra para a pessoa ver a mensagem, curto o bastante para um link perdido não ficar válido para sempre. */
export const VALIDADE_DO_CONVITE_DIAS = 7;

/**
 * Token de 32 bytes aleatórios.
 *
 * `base64url` porque o token viaja no caminho da URL e depois numa mensagem de WhatsApp —
 * `+`, `/` e `=` do base64 comum precisariam de escape e quebrariam ao ser colados.
 */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * O banco guarda só o hash. Vazamento do banco não pode virar acesso ao dado financeiro
 * de ninguém — e sem o token original nem quem administra o banco reconstrói um link.
 *
 * SHA-256 puro, sem KDF lento: o token tem 256 bits de entropia, então não há dicionário
 * a proteger. bcrypt aqui só tornaria a validação lenta sem ganho nenhum.
 */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function urlDoConvite(token: string): string {
  return `${env.APP_URL}/convite/${token}`;
}

/**
 * Link do WhatsApp já com a mensagem pronta.
 *
 * Sem telefone, `wa.me` abre o app para a pessoa escolher o contato — é o caso comum,
 * porque o dono costuma saber quem é mas não ter o número digitado no sistema.
 */
export function urlDoWhatsApp(
  token: string,
  opcoes: { telefone?: string | null; nomeDeQuemConvida: string },
): string {
  const mensagem =
    `${opcoes.nomeDeQuemConvida} compartilhou o controle financeiro com você. ` +
    `Acesse para ver: ${urlDoConvite(token)}`;

  const destino = opcoes.telefone ? opcoes.telefone.replace(/\D/g, '') : '';

  return `https://wa.me/${destino}?text=${encodeURIComponent(mensagem)}`;
}

export function calcularExpiracao(agora = new Date()): Date {
  return new Date(agora.getTime() + VALIDADE_DO_CONVITE_DIAS * 24 * 60 * 60 * 1000);
}
