/** O que uma linha do CSV representa depois de interpretada. */
export type TipoDaLinha = 'LANCAMENTO' | 'PAGAMENTO';

export interface LinhaDaFatura {
  tipo: TipoDaLinha;
  data: Date;
  descricao: string;
  /** String para preservar os centavos até chegar na coluna Decimal. */
  valor: string;
  parcelaNumero?: number | null;
  parcelaTotal?: number | null;
}

/**
 * Estratégia de leitura de um formato de fatura.
 *
 * Cada banco exporta colunas diferentes. Isolar a leitura atrás desta interface permite
 * acrescentar um banco novo sem tocar no serviço de importação — que é onde mora a regra
 * de idempotência, a parte que não se quer mexer.
 */
export interface LayoutDeCsv {
  nome: string;
  /** Reconhece o layout pelos cabeçalhos, já normalizados para minúsculas sem acento. */
  detectar(cabecalhos: string[]): boolean;
  /** Devolve `null` para linha que não é lançamento (totais, rodapé, linha vazia). */
  converter(linha: Record<string, string>): LinhaDaFatura | null;
}
