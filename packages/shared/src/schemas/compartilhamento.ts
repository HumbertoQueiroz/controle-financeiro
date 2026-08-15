import { z } from 'zod';
import { emailSchema } from './auth.js';
import { senhaSchema } from './senha.js';
import { aceiteDeTermosSchema } from './auth.js';
import { telefoneSchema } from './pessoa.js';

export const escopoSchema = z.enum(['PAYABLE', 'RECEIVABLE', 'BOTH']);

export const ROTULO_DO_ESCOPO: Record<z.infer<typeof escopoSchema>, string> = {
  PAYABLE: 'Somente contas a pagar',
  RECEIVABLE: 'Somente contas a receber',
  BOTH: 'A pagar, a receber e o saldo',
};

export const compartilharSchema = z.object({
  email: emailSchema,
  escopo: escopoSchema,
  /** Opcional, e usado só para montar o link do WhatsApp quando vira convite. */
  telefone: telefoneSchema.optional(),
  /** A pessoa do seu cadastro que corresponde a quem está sendo convidado. */
  pessoaId: z.string().uuid().optional(),
});

/**
 * Resposta de `POST /compartilhamentos`. Uma chamada resolve os dois casos, e o
 * `status` diz qual deles aconteceu — é o que a interface usa para decidir entre
 * "pronto, acesso concedido" e "copiei o link, quer enviar pelo WhatsApp?".
 */
export const resultadoDoCompartilhamentoSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('GRANT_CREATED'),
    escopo: escopoSchema,
    email: z.string(),
  }),
  z.object({
    status: z.literal('INVITE_CREATED'),
    escopo: escopoSchema,
    email: z.string(),
    conviteId: z.string().uuid(),
    /** O link completo. Aparece **uma única vez**: o banco guarda só o hash do token. */
    urlDoConvite: z.string().url(),
    /** Já montado com a mensagem; vazio de telefone abre o WhatsApp para escolher o contato. */
    urlDoWhatsApp: z.string().url(),
    expiraEm: z.date(),
  }),
]);

export const compartilhamentoSchema = z.object({
  id: z.string().uuid(),
  tipo: z.enum(['GRANT', 'CONVITE']),
  email: z.string(),
  nome: z.string().nullable(),
  escopo: escopoSchema,
  criadoEm: z.date(),
  expiraEm: z.date().nullable(),
});

/** Dados públicos do convite, mostrados antes do cadastro. */
export const convitePublicoSchema = z.object({
  email: z.string(),
  escopo: escopoSchema,
  convidadoPor: z.string(),
  expiraEm: z.date(),
  /** Verdadeiro quando quem foi convidado já tem conta: aí é só entrar. */
  jaTemConta: z.boolean(),
});

export const aceitarConviteSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome'),
    senha: senhaSchema,
  })
  .merge(aceiteDeTermosSchema);

export type Escopo = z.infer<typeof escopoSchema>;
export type Compartilhar = z.infer<typeof compartilharSchema>;
export type ResultadoDoCompartilhamento = z.infer<typeof resultadoDoCompartilhamentoSchema>;
export type Compartilhamento = z.infer<typeof compartilhamentoSchema>;
export type ConvitePublico = z.infer<typeof convitePublicoSchema>;
export type AceitarConvite = z.infer<typeof aceitarConviteSchema>;
