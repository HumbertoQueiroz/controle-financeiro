import { createHash, randomBytes } from 'node:crypto';
import { CODIGO_DO_PAIS } from '@controle/shared';
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
 *
 * Com telefone, o `wa.me` exige o número **em formato internacional**: `wa.me/65996452787`
 * não abre a conversa, ou abre a conversa errada em outro país. O banco guarda só o número
 * nacional, então o código do país entra aqui, na montagem do link.
 */
export function urlDoWhatsApp(
  token: string,
  opcoes: { telefone?: string | null; nomeDeQuemConvida: string },
): string {
  const mensagem =
    `${opcoes.nomeDeQuemConvida} compartilhou o controle financeiro com você. ` +
    `Acesse para ver: ${urlDoConvite(token)}`;

  const destino = numeroInternacional(opcoes.telefone);

  return `https://wa.me/${destino}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * Número pronto para o `wa.me`, ou vazio quando não há telefone.
 *
 * Tolera um registro antigo que já tenha o `55` gravado: prefixar de novo produziria
 * `5555…`, e o link falharia justamente para os contatos mais antigos.
 */
function numeroInternacional(telefone?: string | null): string {
  const digitos = (telefone ?? '').replace(/\D/g, '');

  if (digitos.length === 0) return '';

  return digitos.startsWith(CODIGO_DO_PAIS) ? digitos : `${CODIGO_DO_PAIS}${digitos}`;
}

export function calcularExpiracao(agora = new Date()): Date {
  return new Date(agora.getTime() + VALIDADE_DO_CONVITE_DIAS * 24 * 60 * 60 * 1000);
}
