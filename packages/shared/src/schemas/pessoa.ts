import { z } from 'zod';
import { emailSchema } from './auth.js';

/** DDD + nove dígitos: o formato de celular brasileiro, e o único que o WhatsApp usa. */
export const DIGITOS_DO_TELEFONE = 11;

/** Código do país. Fica fora do banco e entra só na hora de montar o link. */
export const CODIGO_DO_PAIS = '55';

/**
 * Telefone só serve para montar o link do WhatsApp, então o banco guarda dígitos —
 * a máscara é assunto da interface.
 *
 * Exigimos exatamente {@link DIGITOS_DO_TELEFONE} porque um número curto demais não é um
 * celular, e um número comprido demais só pode ser o mesmo celular com o código do país
 * junto. Aceitar as duas formas faria dois registros do mesmo contato gerarem links
 * diferentes, um deles quebrado, e ninguém descobriria isso até o convite não chegar.
 */
export const telefoneSchema = z
  .string()
  .trim()
  .transform((valor) => {
    const digitos = valor.replace(/\D/g, '');

    // `+55 65 99645-2787` é como a agenda do celular guarda. Guardar o `55` junto faria o
    // link virar `wa.me/555565…`, com o código do país duas vezes.
    return digitos.length > DIGITOS_DO_TELEFONE && digitos.startsWith(CODIGO_DO_PAIS)
      ? digitos.slice(CODIGO_DO_PAIS.length)
      : digitos;
  })
  .refine(
    (digitos) => digitos.length === 0 || digitos.length === DIGITOS_DO_TELEFONE,
    `O WhatsApp precisa de ${DIGITOS_DO_TELEFONE} dígitos: DDD e o número, sem o código do país`,
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
