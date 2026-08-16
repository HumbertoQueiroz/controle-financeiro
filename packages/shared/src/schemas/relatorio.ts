import { z } from 'zod';
import { escopoSchema } from './compartilhamento.js';
import { formaDePagamentoSchema } from './cartao.js';

export const situacaoSchema = z.enum(['ABERTAS', 'TODAS']);

export const filtroDoRelatorioSchema = z.object({
  /** O escopo pedido. O que vale é o que o consentimento permite, resolvido no guard. */
  escopo: escopoSchema.default('BOTH'),
  /** Filtra por vencimento. Ausente traz tudo. */
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  situacao: situacaoSchema.default('ABERTAS'),
});

export const itemDoRelatorioSchema = z.object({
  id: z.string().uuid(),
  descricao: z.string(),
  valor: z.string(),
  valorLiquidado: z.string(),
  restante: z.string(),
  vencimento: z.date(),
  status: z.enum(['OPEN', 'PARTIAL', 'SETTLED', 'CANCELLED']),
  formaDePagamento: formaDePagamentoSchema,
  origem: z.enum(['INVOICE', 'CARD_ENTRY', 'GROUP_EXPENSE', 'RECURRENCE', 'MANUAL']),
  /** A outra ponta. Nulo quando é a instituição do cartão, e não uma pessoa. */
  contraparte: z.string().nullable(),
});

export const blocoDoRelatorioSchema = z.object({
  total: z.string(),
  quantidade: z.number(),
  itens: z.array(itemDoRelatorioSchema),
});

export const relatorioSchema = z.object({
  donoId: z.string().uuid(),
  dono: z.string(),
  escopo: escopoSchema,
  situacao: situacaoSchema,
  /** Nulo quando o escopo concedido não cobre este lado. */
  aPagar: blocoDoRelatorioSchema.nullable(),
  aReceber: blocoDoRelatorioSchema.nullable(),
  /** Só existe quando os dois lados foram consultados. */
  saldo: z.string().nullable(),
});

export const resumoSchema = z.object({
  aPagar: z.string(),
  aReceber: z.string(),
  saldo: z.string(),
  faturasEmAberto: z.number(),
  proximoVencimento: z.date().nullable(),
});

export type FiltroDoRelatorio = z.infer<typeof filtroDoRelatorioSchema>;
export type ItemDoRelatorio = z.infer<typeof itemDoRelatorioSchema>;
export type Relatorio = z.infer<typeof relatorioSchema>;
export type Resumo = z.infer<typeof resumoSchema>;
