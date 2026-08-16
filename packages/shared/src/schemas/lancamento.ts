import { z } from 'zod';
import { formaDePagamentoSchema, mesDeReferenciaSchema } from './cartao.js';

export const direcaoSchema = z.enum(['RECEIVABLE', 'PAYABLE']);

export const ROTULO_DA_DIRECAO: Record<z.infer<typeof direcaoSchema>, string> = {
  RECEIVABLE: 'A receber',
  PAYABLE: 'A pagar',
};

const valorSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido')
  .refine((valor) => Number(valor) > 0, 'O valor precisa ser maior que zero');

export const criarLancamentoSchema = z.object({
  direcao: direcaoSchema,
  descricao: z.string().trim().min(2, 'Descreva o lançamento'),
  valor: valorSchema,
  /** Quando vence. A outra data — a baixa — só existe quando o dinheiro se move. */
  vencimento: z.coerce.date(),
  formaDePagamento: formaDePagamentoSchema,
  /** De quem se recebe, ou a quem se paga, quando não é pessoa cadastrada. */
  contraparte: z.string().trim().max(80).optional(),
  /** Pessoa da agenda, quando a contraparte é alguém do sistema. */
  pessoaId: z.string().uuid().optional(),
});

export const atualizarLancamentoSchema = criarLancamentoSchema
  .omit({ direcao: true })
  .partial()
  .refine((dados) => Object.keys(dados).length > 0, 'Informe ao menos um campo');

/**
 * Baixa: registra que o dinheiro se moveu, quando, e opcionalmente por quê.
 *
 * A data é informada, não assumida como hoje: quem lança no domingo o que pagou na
 * sexta precisa que o caixa mostre sexta, senão o fechamento do mês sai errado na virada.
 *
 * Um título aceita vários pagamentos — metade no dia 5, o resto no dia 20 —, e cada um
 * guarda a própria observação.
 */
export const darBaixaSchema = z.object({
  dataDaBaixa: z.coerce.date(),
  /** Ausente significa quitar o que falta. */
  valorPago: valorSchema.optional(),
  observacao: z.string().trim().max(200).optional(),
});

export const pagamentoSchema = z.object({
  id: z.string().uuid(),
  valor: z.string(),
  pagoEm: z.date(),
  observacao: z.string().nullable(),
});

export const lancamentoSchema = z.object({
  id: z.string().uuid(),
  direcao: direcaoSchema,
  descricao: z.string(),
  valor: z.string(),
  valorLiquidado: z.string(),
  restante: z.string(),
  vencimento: z.date(),
  dataDaBaixa: z.date().nullable(),
  status: z.enum(['OPEN', 'PARTIAL', 'SETTLED', 'CANCELLED']),
  formaDePagamento: formaDePagamentoSchema,
  origem: z.enum(['INVOICE', 'CARD_ENTRY', 'GROUP_EXPENSE', 'RECURRENCE', 'MANUAL']),
  contraparte: z.string().nullable(),
  /** Verdadeiro só para o que foi lançado à mão: o resto se edita na origem. */
  editavel: z.boolean(),
  /** Vencido e ainda sem baixa. */
  atrasado: z.boolean(),
  /** O histórico de pagamentos do título, do mais antigo ao mais recente. */
  pagamentos: z.array(pagamentoSchema),
});

export type Pagamento = z.infer<typeof pagamentoSchema>;

export const filtroDeLancamentosSchema = z.object({
  direcao: direcaoSchema,
  /** Mês do vencimento. Ausente traz tudo em aberto. */
  mes: mesDeReferenciaSchema.optional(),
  situacao: z.enum(['ABERTAS', 'BAIXADAS', 'TODAS']).default('ABERTAS'),
});

// ---------------------------------------------------------------------------
// Recorrência
// ---------------------------------------------------------------------------

export const criarRecorrenciaSchema = z.object({
  direcao: direcaoSchema,
  descricao: z.string().trim().min(2, 'Descreva a recorrência'),
  valor: valorSchema,
  diaDoVencimento: z.coerce.number().int().min(1).max(31),
  formaDePagamento: formaDePagamentoSchema,
  contraparte: z.string().trim().max(80).optional(),
  inicioEm: mesDeReferenciaSchema,
  fimEm: mesDeReferenciaSchema.optional(),
});

export const atualizarRecorrenciaSchema = criarRecorrenciaSchema
  .omit({ direcao: true, inicioEm: true })
  .partial()
  .extend({ ativa: z.boolean().optional() })
  .refine((dados) => Object.keys(dados).length > 0, 'Informe ao menos um campo');

export const recorrenciaSchema = z.object({
  id: z.string().uuid(),
  direcao: direcaoSchema,
  descricao: z.string(),
  valor: z.string(),
  diaDoVencimento: z.number(),
  formaDePagamento: formaDePagamentoSchema,
  contraparte: z.string().nullable(),
  inicioEm: z.string(),
  fimEm: z.string().nullable(),
  ativa: z.boolean(),
});

// ---------------------------------------------------------------------------
// Orçamento do mês
// ---------------------------------------------------------------------------

export const blocoDoOrcamentoSchema = z.object({
  /** Tudo que vence no mês, com baixa ou sem. */
  previsto: z.string(),
  /** Só o que já teve baixa. */
  realizado: z.string(),
  /** O que falta acontecer. */
  emAberto: z.string(),
  itens: z.array(lancamentoSchema),
});

export const orcamentoSchema = z.object({
  mes: z.string(),
  entradas: blocoDoOrcamentoSchema,
  saidas: blocoDoOrcamentoSchema,
  /** Entradas − saídas, considerando tudo que vence no mês. */
  saldoPrevisto: z.string(),
  /** Entradas − saídas do que já se moveu. É o caixa do mês. */
  saldoRealizado: z.string(),
  /** Quantos lançamentos venceram e seguem sem baixa. */
  atrasados: z.number(),
});

export type Direcao = z.infer<typeof direcaoSchema>;
export type CriarLancamento = z.infer<typeof criarLancamentoSchema>;
export type AtualizarLancamento = z.infer<typeof atualizarLancamentoSchema>;
export type DarBaixa = z.infer<typeof darBaixaSchema>;
export type Lancamento = z.infer<typeof lancamentoSchema>;
export type CriarRecorrencia = z.infer<typeof criarRecorrenciaSchema>;
export type AtualizarRecorrencia = z.infer<typeof atualizarRecorrenciaSchema>;
export type Recorrencia = z.infer<typeof recorrenciaSchema>;
export type Orcamento = z.infer<typeof orcamentoSchema>;
