import { z } from 'zod';
import { mesDeReferenciaSchema } from './cartao.js';

/**
 * A importação acontece em duas fases: prévia e confirmação.
 *
 * A prévia lê o arquivo e devolve o que encontrou, sem gravar nada. Quem confirma é a
 * pessoa, depois de classificar responsáveis e conferir as faturas de destino — gravar
 * primeiro e perguntar depois deixaria lançamento errado no sistema no intervalo.
 */

export const linhaDaPreviaSchema = z.object({
  /** Identifica a linha entre a prévia e a confirmação. */
  chave: z.string(),
  data: z.date(),
  descricao: z.string(),
  valor: z.string(),
  /** Calculada a partir da data da compra e do dia de fechamento; pode ser trocada. */
  faturaSugerida: mesDeReferenciaSchema,
  parcelaNumero: z.number().nullable(),
  parcelaTotal: z.number().nullable(),
});

export const parcelamentoDaPreviaSchema = linhaDaPreviaSchema.extend({
  parcelaNumero: z.number(),
  parcelaTotal: z.number(),
  /** Meses das parcelas que serão criadas, da atual até a última. */
  mesesDasParcelas: z.array(mesDeReferenciaSchema),
});

export const parcelamentoConhecidoSchema = z.object({
  parcelamentoId: z.string().uuid(),
  descricao: z.string(),
  valor: z.string(),
  parcelaNumero: z.number(),
  parcelaTotal: z.number(),
  /** A parcela que já existe no sistema, e por isso não será lançada de novo. */
  faturaDaParcela: mesDeReferenciaSchema,
  responsavel: z.string().nullable(),
});

export const previaDaImportacaoSchema = z.object({
  cartaoId: z.string().uuid(),
  layout: z.string(),
  /** O mês que a análise sugere para o arquivo inteiro, pela maioria dos lançamentos. */
  faturaSugerida: mesDeReferenciaSchema,
  /** Compras avulsas, para classificar responsável. */
  lancamentos: z.array(linhaDaPreviaSchema),
  /** Parcelamentos que aparecem pela primeira vez neste extrato. */
  novosParcelamentos: z.array(parcelamentoDaPreviaSchema),
  /** Parcelas de compras já conhecidas — serão ignoradas para não duplicar. */
  parcelamentosAnteriores: z.array(parcelamentoConhecidoSchema),
  /** Linhas de pagamento da fatura encontradas no arquivo. */
  pagamentos: z.array(linhaDaPreviaSchema),
  linhasNaoReconhecidas: z.number(),
});

/** `null` no responsável significa "meu": a compra é de quem é dono do cartão. */
const responsavelSchema = z.string().uuid().nullable();

export const classificacaoDeLancamentoSchema = z.object({
  chave: z.string(),
  data: z.coerce.date(),
  descricao: z.string(),
  valor: z.string(),
  fatura: mesDeReferenciaSchema,
  responsavelPessoaId: responsavelSchema,
  parcelaNumero: z.number().nullable().optional(),
  parcelaTotal: z.number().nullable().optional(),
});

export const confirmarImportacaoSchema = z.object({
  nomeDoArquivo: z.string().max(255).default('fatura.csv'),
  /** O mês que a pessoa escolheu antes de importar, usado para detectar divergência. */
  mesSelecionado: mesDeReferenciaSchema,
  lancamentos: z.array(classificacaoDeLancamentoSchema),
  novosParcelamentos: z.array(classificacaoDeLancamentoSchema),
  pagamentos: z.array(
    z.object({
      chave: z.string(),
      data: z.coerce.date(),
      descricao: z.string(),
      valor: z.string(),
      fatura: mesDeReferenciaSchema,
    }),
  ),
  /**
   * Confirma que a pessoa viu o alerta de divergência entre o mês escolhido e o que o
   * arquivo indica. Sem isso a gravação é recusada — o alerta é o ponto, não o aviso.
   */
  divergenciaAceita: z.boolean().default(false),
});

export const divergenciaSchema = z.object({
  mesSelecionado: z.string(),
  mesEncontrado: z.string(),
  quantidade: z.number(),
});

export const resultadoDaImportacaoSchema = z.object({
  importacaoId: z.string().uuid(),
  layout: z.string(),
  lancamentosInseridos: z.number(),
  lancamentosIgnorados: z.number(),
  parcelasGeradas: z.number(),
  parcelamentosCriados: z.number(),
  pagamentosRegistrados: z.number(),
  pagamentosIgnorados: z.number(),
  faturasAfetadas: z.array(
    z.object({ mes: z.string(), faturaId: z.string().uuid(), total: z.string() }),
  ),
});

export type PreviaDaImportacao = z.infer<typeof previaDaImportacaoSchema>;
export type LinhaDaPrevia = z.infer<typeof linhaDaPreviaSchema>;
export type ParcelamentoDaPrevia = z.infer<typeof parcelamentoDaPreviaSchema>;
export type ParcelamentoConhecido = z.infer<typeof parcelamentoConhecidoSchema>;
export type ConfirmarImportacao = z.infer<typeof confirmarImportacaoSchema>;
export type ClassificacaoDeLancamento = z.infer<typeof classificacaoDeLancamentoSchema>;
export type ResultadoDaImportacao = z.infer<typeof resultadoDaImportacaoSchema>;

// ---------------------------------------------------------------------------
// Parcelamentos
// ---------------------------------------------------------------------------

export const parcelaSchema = z.object({
  id: z.string().uuid(),
  numero: z.number().nullable(),
  fatura: z.string(),
  valor: z.string(),
  /** Ainda não apareceu em extrato: foi projetada na importação. */
  projetada: z.boolean(),
});

export const parcelamentoSchema = z.object({
  id: z.string().uuid(),
  descricao: z.string(),
  valorDaParcela: z.string(),
  valorTotal: z.string(),
  quantidadeDeParcelas: z.number(),
  cartaoId: z.string().uuid(),
  cartao: z.string(),
  responsavelPessoaId: z.string().uuid().nullable(),
  responsavel: z.string().nullable(),
  parcelasPagas: z.number(),
  restante: z.string(),
  parcelas: z.array(parcelaSchema),
});

export const atualizarParcelamentoSchema = z.object({
  responsavelPessoaId: z.string().uuid().nullable(),
});

export type Parcelamento = z.infer<typeof parcelamentoSchema>;
export type Parcela = z.infer<typeof parcelaSchema>;
