import { z } from 'zod';
import { emailSchema } from './auth.js';

/**
 * Telefone só serve para montar o link do WhatsApp, então basta guardar dígitos.
 * A máscara é assunto da interface; o banco guarda o que o `wa.me` consegue usar.
 */
export const telefoneSchema = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\D/g, ''))
  .refine(
    (digitos) => digitos.length === 0 || (digitos.length >= 10 && digitos.length <= 13),
    'Telefone inválido',
  );

export const criarPessoaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome'),
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  telefone: telefoneSchema.optional(),
});

export const atualizarPessoaSchema = criarPessoaSchema
  .partial()
  .refine((dados) => Object.keys(dados).length > 0, 'Informe ao menos um campo');

export const vincularPessoaSchema = z.object({
  email: emailSchema,
});

export const pessoaSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  /** Preenchido quando esta pessoa já tem conta no sistema. */
  usuarioId: z.string().uuid().nullable(),
  /** Falso para a Person espelho do próprio dono, que não pode ser apagada. */
  editavel: z.boolean(),
});

export type CriarPessoa = z.infer<typeof criarPessoaSchema>;
export type AtualizarPessoa = z.infer<typeof atualizarPessoaSchema>;
export type Pessoa = z.infer<typeof pessoaSchema>;
