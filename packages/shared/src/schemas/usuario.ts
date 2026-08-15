import { z } from 'zod';
import { emailSchema } from './auth.js';
import { senhaSchema } from './senha.js';

export const papelSchema = z.enum(['ADMIN', 'USER']);

export const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome'),
  email: emailSchema,
  senha: senhaSchema,
  papel: papelSchema.default('USER'),
});

export const atualizarUsuarioSchema = z
  .object({
    nome: z.string().trim().min(2).optional(),
    papel: papelSchema.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((dados) => Object.keys(dados).length > 0, 'Informe ao menos um campo');

export const usuarioSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string(),
  papel: papelSchema,
  ativo: z.boolean(),
  criadoEm: z.date(),
});

export type Papel = z.infer<typeof papelSchema>;
export type CriarUsuario = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuario = z.infer<typeof atualizarUsuarioSchema>;
export type Usuario = z.infer<typeof usuarioSchema>;
