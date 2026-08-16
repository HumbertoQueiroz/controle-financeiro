import { z } from 'zod';

export const formaDePagamentoSchema = z.enum(['CASH', 'BARTER', 'MEAL_VOUCHER', 'CREDIT_CARD']);

export const ROTULO_DA_FORMA_DE_PAGAMENTO: Record<
  z.infer<typeof formaDePagamentoSchema>,
  string
> = {
  CASH: 'Dinheiro',
  BARTER: 'Permuta',
  MEAL_VOUCHER: 'Vale alimentação',
  CREDIT_CARD: 'Cartão de crédito',
};

/** Mês de referência no formato YYYY-MM, o mesmo do banco. */
export const mesDeReferenciaSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM)');

const diaDoMes = z.coerce.number().int().min(1).max(31);

export const criarCartaoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do cartão'),
  bandeira: z.string().trim().max(30).optional(),
  /**
   * Apenas os quatro últimos dígitos. Número completo, CVV e validade não entram no
   * sistema — minimização exigida pela LGPD, e o que evita que um vazamento vire fraude.
   */
  finalDoCartao: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Informe apenas os 4 últimos dígitos')
    .optional(),
  diaDeFechamento: diaDoMes,
  diaDeVencimento: diaDoMes,
  /** Cartão usado por mais de uma pessoa. */
  compartilhado: z.boolean().default(false),
});

export const atualizarCartaoSchema = criarCartaoSchema
  .partial()
  .extend({ ativo: z.boolean().optional() })
  .refine((dados) => Object.keys(dados).length > 0, 'Informe ao menos um campo');

export const cartaoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  bandeira: z.string().nullable(),
  finalDoCartao: z.string().nullable(),
  diaDeFechamento: z.number(),
  diaDeVencimento: z.number(),
  ativo: z.boolean(),
  compartilhado: z.boolean(),
});

export const statusDaFaturaSchema = z.enum(['OPEN', 'CLOSED', 'PAID']);

export const faturaSchema = z.object({
  id: z.string().uuid(),
  cartaoId: z.string().uuid(),
  mesDeReferencia: z.string(),
  /** Depois desta data a compra vai para a fatura seguinte. */
  fechamento: z.date(),
  vencimento: z.date(),
  status: statusDaFaturaSchema,
  total: z.string(),
  totalPago: z.string(),
});

export const lancamentoDaFaturaSchema = z.object({
  id: z.string().uuid(),
  data: z.date(),
  descricao: z.string(),
  valor: z.string(),
  parcelaNumero: z.number().nullable(),
  parcelaTotal: z.number().nullable(),
  repassadoParaPessoaId: z.string().uuid().nullable(),
  repassadoPara: z.string().nullable(),
});

export const repassarLancamentoSchema = z.object({
  /** `null` desfaz o repasse e cancela o "a receber" correspondente. */
  pessoaId: z.string().uuid().nullable(),
});

export type FormaDePagamento = z.infer<typeof formaDePagamentoSchema>;
export type CriarCartao = z.infer<typeof criarCartaoSchema>;
export type AtualizarCartao = z.infer<typeof atualizarCartaoSchema>;
export type Cartao = z.infer<typeof cartaoSchema>;
export type Fatura = z.infer<typeof faturaSchema>;
export type LancamentoDaFatura = z.infer<typeof lancamentoDaFaturaSchema>;
