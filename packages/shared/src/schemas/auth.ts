import { z } from 'zod';
import { senhaSchema } from './senha.js';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('E-mail inválido')
  .max(254, 'E-mail longo demais');

export const credenciaisSchema = z.object({
  email: emailSchema,
  // No login não se valida força de senha: a senha ou confere com o hash ou não. Aplicar
  // a regra aqui só ajudaria um atacante a descartar tentativas antes de enviá-las.
  senha: z.string().min(1, 'Informe a senha'),
});

export const aceiteDeTermosSchema = z.object({
  aceitaTermos: z.literal(true, {
    errorMap: () => ({ message: 'É preciso aceitar os Termos de Uso' }),
  }),
  aceitaPrivacidade: z.literal(true, {
    errorMap: () => ({ message: 'É preciso aceitar a Política de Privacidade' }),
  }),
});

export const cadastroSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome'),
    email: emailSchema,
    senha: senhaSchema,
  })
  .merge(aceiteDeTermosSchema);

export const trocaDeSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual'),
  novaSenha: senhaSchema,
});

export const usuarioAutenticadoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  email: z.string(),
  papel: z.enum(['ADMIN', 'USER']),
  precisaTrocarSenha: z.boolean(),
  precisaAceitarTermos: z.boolean(),
});

export type Credenciais = z.infer<typeof credenciaisSchema>;
export type Cadastro = z.infer<typeof cadastroSchema>;
export type TrocaDeSenha = z.infer<typeof trocaDeSenhaSchema>;
export type UsuarioAutenticado = z.infer<typeof usuarioAutenticadoSchema>;
