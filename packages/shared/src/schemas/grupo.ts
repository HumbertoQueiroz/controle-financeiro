import { z } from 'zod';
import { formaDePagamentoSchema } from './cartao.js';

export const criarGrupoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do grupo'),
});

export const grupoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  quantidadeDeMembros: z.number(),
});

export const adicionarMembroSchema = z.object({
  pessoaId: z.string().uuid(),
});

export const membroSchema = z.object({
  pessoaId: z.string().uuid(),
  nome: z.string(),
  usuarioId: z.string().uuid().nullable(),
});

export const criarEventoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do rolê'),
  data: z.coerce.date(),
});

export const eventoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  data: z.date(),
  total: z.string(),
});

/** Valor monetário como texto, para não passar por ponto flutuante em momento nenhum. */
const valorSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido')
  .refine((valor) => Number(valor) > 0, 'O valor precisa ser maior que zero');

export const criarDespesaSchema = z
  .object({
    descricao: z.string().trim().min(2, 'Descreva a despesa'),
    valor: valorSchema,
    formaDePagamento: formaDePagamentoSchema,
    /** Quem pagou pelos demais. */
    pagantePessoaId: z.string().uuid(),
    /**
     * Entre quem dividir. Vazio significa dividir entre todos os membros do grupo —
     * o caso mais comum, e digitar a lista inteira toda vez seria atrito à toa.
     */
    participantes: z.array(z.string().uuid()).default([]),
    /**
     * Cotas explícitas, quando a divisão não é igual. As chaves são ids de pessoa e os
     * valores, o quanto cabe a cada uma. A soma precisa bater com o valor da despesa.
     */
    cotas: z.record(z.string().uuid(), valorSchema).optional(),
  })
  .refine(
    (dados) => !dados.cotas || Object.keys(dados.cotas).length > 0,
    'Informe ao menos uma cota',
  );

export const despesaSchema = z.object({
  id: z.string().uuid(),
  descricao: z.string(),
  valor: z.string(),
  formaDePagamento: formaDePagamentoSchema,
  pagantePessoaId: z.string().uuid(),
  pagante: z.string(),
  cotas: z.array(z.object({ pessoaId: z.string().uuid(), nome: z.string(), valor: z.string() })),
});

export const periodoSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Período inválido (use AAAA-MM)');

export const fecharPeriodoSchema = z.object({ periodo: periodoSchema });

export const saldoDoParticipanteSchema = z.object({
  pessoaId: z.string().uuid(),
  nome: z.string(),
  pagou: z.string(),
  deveria: z.string(),
  /** Positivo = tem a receber. Negativo = deve. */
  saldo: z.string(),
});

export const transferenciaSchema = z.object({
  dePessoaId: z.string().uuid(),
  de: z.string(),
  paraPessoaId: z.string().uuid(),
  para: z.string(),
  valor: z.string(),
});

export const previaDoFechamentoSchema = z.object({
  periodo: z.string(),
  totalDoPeriodo: z.string(),
  saldos: z.array(saldoDoParticipanteSchema),
  transferencias: z.array(transferenciaSchema),
});

export const fechamentoSchema = previaDoFechamentoSchema.extend({
  id: z.string().uuid(),
  fechadoEm: z.date().nullable(),
});

export type CriarGrupo = z.infer<typeof criarGrupoSchema>;
export type Grupo = z.infer<typeof grupoSchema>;
export type Membro = z.infer<typeof membroSchema>;
export type Evento = z.infer<typeof eventoSchema>;
export type CriarEvento = z.infer<typeof criarEventoSchema>;
export type CriarDespesa = z.infer<typeof criarDespesaSchema>;
export type Despesa = z.infer<typeof despesaSchema>;
export type PreviaDoFechamento = z.infer<typeof previaDoFechamentoSchema>;
export type Fechamento = z.infer<typeof fechamentoSchema>;
