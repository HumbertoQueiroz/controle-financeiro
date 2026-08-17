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
  /** Classificação. Opcional: exigir travaria o lançamento rápido. */
  categoriaId: z.string().uuid().optional(),
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
  /** Ausente significa quitar o que falta. Pode ser maior que o título: são juros ou multa. */
  valorPago: valorSchema.optional(),
  /**
   * Fecha o título mesmo pagando menos, lançando a diferença como desconto.
   *
   * Sem isto, pagar menos é sempre pagamento parcial — e essas são duas coisas diferentes:
   * numa o título continua devendo o resto, na outra ele acabou. Só quem deu a baixa sabe
   * qual das duas foi, e por isso é uma escolha, não uma dedução do valor digitado.
   */
  quitar: z.boolean().default(false),
  observacao: z.string().trim().max(200).optional(),
  /** Por onde o dinheiro passou. Ausente mantém a baixa possível sem conta cadastrada. */
  contaId: z.string().uuid().optional(),
});

export const pagamentoSchema = z.object({
  id: z.string().uuid(),
  valor: z.string(),
  pagoEm: z.date(),
  observacao: z.string().nullable(),
  /**
   * Falso enquanto aguarda a palavra de quem recebe.
   *
   * Numa dívida entre duas pessoas, quem deve declara que pagou e quem recebe confirma que
   * o dinheiro chegou. Até lá o pagamento aparece para os dois lados e **não** abate nada —
   * `valorLiquidado` e `restante` ignoram o que não está confirmado.
   */
  confirmado: z.boolean(),
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
  /** Verdadeiro quando é você quem recebe — e portanto quem confirma os pagamentos. */
  podeConfirmarPagamentos: z.boolean(),
  categoriaId: z.string().uuid().nullable(),
  categoria: z.string().nullable(),
  categoriaCor: z.string().nullable(),
});

export type Pagamento = z.infer<typeof pagamentoSchema>;

export const origemSchema = z.enum([
  'INVOICE',
  'CARD_ENTRY',
  'GROUP_EXPENSE',
  'RECURRENCE',
  'MANUAL',
]);

export const filtroDeLancamentosSchema = z.object({
  direcao: direcaoSchema,
  /** Mês do vencimento. Ausente traz tudo em aberto. */
  mes: mesDeReferenciaSchema.optional(),
  situacao: z.enum(['ABERTAS', 'BAIXADAS', 'TODAS']).default('ABERTAS'),
  /**
   * De onde o lançamento veio: fatura, rateio, recorrência, à mão.
   *
   * Existe para o dashboard poder abrir a lista **do número que a pessoa tocou**. Sem ele,
   * "faturas de cartão R$ 2.060,00" levaria à lista inteira de R$ 4.190,00, e o total da
   * tela de destino não bateria com o do card — que é exatamente o que faz alguém deixar
   * de confiar no sistema.
   */
  origem: origemSchema.optional(),
  /**
   * Mesma ideia, pelo outro recorte: o bloco de dinheiro e vale do dashboard.
   *
   * Aceita um valor ou vários. Numa querystring, `?formaDePagamento=CASH` chega como
   * string e `?formaDePagamento=CASH&formaDePagamento=MEAL_VOUCHER` como lista — exigir
   * sempre a lista faria o link de um filtro só ser recusado.
   */
  formaDePagamento: z
    .union([formaDePagamentoSchema, z.array(formaDePagamentoSchema)])
    .optional()
    .transform((valor) => (valor === undefined ? undefined : [valor].flat())),
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
  /** Herdada por toda parcela gerada. */
  categoriaId: z.string().uuid().optional(),
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
  categoriaId: z.string().uuid().nullable(),
  categoria: z.string().nullable(),
  /** Quantas parcelas já foram geradas. Encerrar apaga só as futuras sem baixa. */
  parcelasGeradas: z.number().int(),
  /** O mês da próxima parcela, quando a recorrência segue vigente. */
  proximoVencimento: z.date().nullable(),
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

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * Uma linha de bloco do dashboard.
 *
 * Tem só o necessário para a leitura — rótulo e valor —, e não o lançamento inteiro. O
 * dashboard mostra quatro linhas por bloco; carregar o objeto completo de cada uma faria a
 * primeira tela do app pagar por dados que ela não desenha.
 */
export const linhaDoDashboardSchema = z.object({
  id: z.string().nullable(),
  rotulo: z.string(),
  valor: z.string(),
  atrasado: z.boolean().optional(),
  cor: z.string().nullable().optional(),
});

export const blocoDoDashboardSchema = z.object({
  chave: z.string(),
  titulo: z.string(),
  total: z.string(),
  quantidade: z.number(),
  /** O valor de `?filtro=` que abre a lista deste bloco. */
  filtro: z.string(),
  linhas: z.array(linhaDoDashboardSchema),
});

const saldoDoDashboardSchema = z.object({
  entradas: z.string(),
  saidas: z.string(),
  saldo: z.string(),
});

const grupoDeLinhasSchema = z.object({
  total: z.string(),
  linhas: z.array(linhaDoDashboardSchema),
});

const grupoContadoSchema = grupoDeLinhasSchema.extend({ quantidade: z.number() });

export const dashboardSchema = z.object({
  mes: z.string(),
  /** O que de fato entrou e saiu no mês. */
  saldoRealizado: saldoDoDashboardSchema,
  /** O que entra e sai se tudo que vence no mês acontecer. */
  saldoPrevisto: saldoDoDashboardSchema,
  atrasados: z.number(),
  aPagar: z.object({ total: z.string(), blocos: z.array(blocoDoDashboardSchema) }),
  categorias: z.object({ despesas: grupoDeLinhasSchema, entradas: grupoDeLinhasSchema }),
  participantes: z.object({ aReceber: grupoContadoSchema, aPagar: grupoContadoSchema }),
});

export type LinhaDoDashboard = z.infer<typeof linhaDoDashboardSchema>;
export type BlocoDoDashboard = z.infer<typeof blocoDoDashboardSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
