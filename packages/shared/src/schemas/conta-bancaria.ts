import { z } from 'zod';

export const tipoDeContaSchema = z.enum(['CHECKING', 'SAVINGS', 'WALLET', 'MEAL_VOUCHER']);

export const ROTULO_DO_TIPO_DE_CONTA: Record<z.infer<typeof tipoDeContaSchema>, string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  WALLET: 'Carteira',
  MEAL_VOUCHER: 'Vale alimentação',
};

/** Saldo aceita negativo (cheque especial) e zero, ao contrário dos valores de título. */
const saldoSchema = z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Valor inválido');

export const criarContaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da conta'),
  tipo: tipoDeContaSchema.default('CHECKING'),
  /** O saldo no dia em que a conta entra no sistema. O histórico anterior não existe aqui. */
  saldoInicial: saldoSchema.default('0'),
});

export const atualizarContaSchema = criarContaSchema
  .partial()
  .extend({ arquivada: z.boolean().optional() })
  .refine((dados) => Object.keys(dados).length > 0, 'Informe ao menos um campo');

export const contaBancariaSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  tipo: tipoDeContaSchema,
  saldoInicial: z.string(),
  arquivada: z.boolean(),
  /**
   * Saldo inicial mais tudo que entrou, menos tudo que saiu.
   *
   * É calculado, e não guardado: um saldo em coluna divergiria do extrato no primeiro
   * estorno, e a divergência só apareceria quando alguém conferisse — tarde demais.
   */
  saldo: z.string(),
  /** Quanto entrou e saiu por esta conta, para a tela mostrar o movimento. */
  entradas: z.string(),
  saidas: z.string(),
});

export const resumoDeContasSchema = z.object({
  contas: z.array(contaBancariaSchema),
  /** A soma dos saldos. É o "quanto eu tenho" que o orçamento sozinho não responde. */
  total: z.string(),
});

export type TipoDeConta = z.infer<typeof tipoDeContaSchema>;
export type ContaBancaria = z.infer<typeof contaBancariaSchema>;
export type CriarConta = z.infer<typeof criarContaSchema>;
export type AtualizarConta = z.infer<typeof atualizarContaSchema>;
export type ResumoDeContas = z.infer<typeof resumoDeContasSchema>;
