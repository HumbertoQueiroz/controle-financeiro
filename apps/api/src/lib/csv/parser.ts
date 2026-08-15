import { parse } from 'csv-parse/sync';
import { ErroDeRegra } from '../erros.js';
import { normalizarCabecalho } from './comum.js';
import { detectarLayout } from './layouts.js';
import type { LinhaDaFatura } from './tipos.js';

export interface ResultadoDaLeitura {
  layout: string;
  linhas: LinhaDaFatura[];
  /** Linhas que o layout não conseguiu interpretar: totais, rodapés, linhas em branco. */
  ignoradas: number;
}

/** Delimitadores que aparecem na prática. `;` é o padrão do Excel em português. */
const DELIMITADORES = [';', ',', '\t'];

/**
 * Descobre o delimitador pela linha de cabeçalho.
 *
 * Passar a lista inteira para o `csv-parse` não funciona: ele trata todos como válidos ao
 * mesmo tempo, e aí "R$ 1.120,50" quebra em duas colunas na vírgula decimal — o valor
 * chega truncado em 1.120 e os centavos viram uma coluna fantasma.
 *
 * O cabeçalho é a linha segura para contar, porque nele os candidatos só aparecem como
 * separador; numa linha de dados a vírgula decimal falsearia a contagem.
 */
function detectarDelimitador(texto: string): string {
  const cabecalho = texto.split(/\r?\n/, 1)[0] ?? '';

  let escolhido = DELIMITADORES[0]!;
  let maior = 0;

  for (const candidato of DELIMITADORES) {
    const quantidade = cabecalho.split(candidato).length - 1;

    if (quantidade > maior) {
      maior = quantidade;
      escolhido = candidato;
    }
  }

  return escolhido;
}

export function lerCsv(conteudo: Buffer | string): ResultadoDaLeitura {
  const bruto = conteudo.toString('utf8');

  // O BOM que o Excel grava vira parte do primeiro cabeçalho e faria "data" nunca casar.
  // Comparado por código em vez de regex com o caractere literal, que é invisível no
  // editor e fácil de corromper numa edição futura.
  const texto = bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto;

  if (texto.trim() === '') {
    throw new ErroDeRegra('O arquivo está vazio');
  }

  const registros = parse(texto, {
    columns: (cabecalhos: string[]) => cabecalhos.map(normalizarCabecalho),
    delimiter: detectarDelimitador(texto),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];

  const primeiro = registros[0];

  if (!primeiro) {
    throw new ErroDeRegra('O arquivo não tem nenhuma linha de dados');
  }

  const cabecalhos = Object.keys(primeiro);
  const layout = detectarLayout(cabecalhos);

  if (!layout) {
    // A mensagem cita os cabeçalhos encontrados porque é a informação que resolve o
    // problema — sem ela, "formato não reconhecido" não diz o que fazer em seguida.
    throw new ErroDeRegra(
      `Formato de arquivo não reconhecido. Colunas encontradas: ${cabecalhos.join(', ')}`,
    );
  }

  const linhas: LinhaDaFatura[] = [];
  let ignoradas = 0;

  for (const registro of registros) {
    const linha = layout.converter(registro);

    if (linha) {
      linhas.push(linha);
    } else {
      ignoradas += 1;
    }
  }

  if (linhas.length === 0) {
    throw new ErroDeRegra('Nenhum lançamento foi reconhecido no arquivo');
  }

  return { layout: layout.nome, linhas, ignoradas };
}
