import { converterValor } from '@controle/shared';
import { coluna, converterData, ehPagamento, extrairParcela } from './comum.js';
import type { LayoutDeCsv, LinhaDaFatura } from './tipos.js';

/**
 * Monta a linha a partir dos três dados que todo layout tem: data, descrição e valor.
 *
 * O sinal do valor é descartado aqui e o significado fica no `tipo`. Bancos discordam da
 * convenção — uns exportam compra positiva e pagamento negativo, outros o contrário — e
 * deixar o sinal entrar no domínio faria o total da fatura depender de qual banco exportou.
 */
function montar(
  data: string | undefined,
  descricao: string | undefined,
  valor: string | undefined,
): LinhaDaFatura | null {
  if (!data || !descricao || !valor) return null;

  const dataConvertida = converterData(data);
  const valorConvertido = converterValor(valor);

  if (!dataConvertida || valorConvertido === null) return null;

  const pagamento = ehPagamento(descricao);
  const parcela = extrairParcela(descricao);

  return {
    tipo: pagamento ? 'PAGAMENTO' : 'LANCAMENTO',
    data: dataConvertida,
    descricao: descricao.trim(),
    // Pagamento é sempre positivo (quanto se pagou). Lançamento mantém o sinal, porque
    // negativo aqui é estorno, e estorno precisa reduzir o total da fatura.
    valor: pagamento ? valorConvertido.replace('-', '') : valorConvertido,
    parcelaNumero: parcela.numero,
    parcelaTotal: parcela.total,
  };
}

/** Nubank: `date,title,amount` (ou `category`). */
const nubank: LayoutDeCsv = {
  nome: 'nubank',
  detectar: (cabecalhos) =>
    cabecalhos.includes('date') && cabecalhos.includes('title') && cabecalhos.includes('amount'),
  converter: (linha) => montar(linha.date, linha.title, linha.amount),
};

/**
 * Formato brasileiro genérico, que cobre a maioria das exportações e os arquivos que o
 * usuário monta à mão numa planilha.
 */
const brasileiroGenerico: LayoutDeCsv = {
  nome: 'brasileiro-generico',
  detectar: (cabecalhos) => {
    const temData = cabecalhos.some((c) => ['data', 'data da compra', 'dt'].includes(c));
    const temDescricao = cabecalhos.some((c) =>
      ['descricao', 'lancamento', 'historico', 'estabelecimento', 'titulo'].includes(c),
    );
    const temValor = cabecalhos.some((c) => ['valor', 'valor (r$)', 'montante'].includes(c));

    return temData && temDescricao && temValor;
  },
  converter: (linha) =>
    montar(
      coluna(linha, 'data', 'data da compra', 'dt'),
      coluna(linha, 'descricao', 'lancamento', 'historico', 'estabelecimento', 'titulo'),
      coluna(linha, 'valor', 'valor (r$)', 'montante'),
    ),
};

/**
 * A ordem importa: o primeiro que reconhecer os cabeçalhos vence. O genérico fica por
 * último de propósito, para não sequestrar um arquivo que um layout específico leria
 * melhor.
 */
export const LAYOUTS: LayoutDeCsv[] = [nubank, brasileiroGenerico];

export function detectarLayout(cabecalhos: string[]): LayoutDeCsv | null {
  return LAYOUTS.find((layout) => layout.detectar(cabecalhos)) ?? null;
}
