import { createHash } from 'node:crypto';

/**
 * Normaliza a descrição para tolerar variação de formatação entre exportações.
 *
 * O mesmo lançamento sai como "MERCADO  SAO JOAO" numa exportação e "Mercado Sao Joao" na
 * seguinte. Sem normalizar, a reimportação criaria uma cópia de cada linha, que é
 * exatamente o que o README proíbe.
 */
export function normalizarDescricao(descricao: string): string {
  return descricao.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Chave que identifica uma compra parcelada entre extratos de meses diferentes.
 *
 * O número da parcela **precisa sair** da chave: o extrato de agosto traz
 * "FARMACIA POPULAR - 3/10" e o de setembro, "FARMACIA POPULAR - 4/10". Mantendo o número,
 * cada mês pareceria um parcelamento novo, e a compra seria lançada de novo — em setembro
 * com mais sete parcelas projetadas por cima das que já existiam.
 */
export function chaveDoParcelamento(descricao: string): string {
  const semParcela = descricao
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
    .replace(/\bparcela\s+\d{1,2}\s+de\s+\d{1,2}\b/gi, ' ')
    .replace(/\b\d{1,2}\s+de\s+\d{1,2}\b/gi, ' ')
    // Sobra o separador que ligava a descrição ao número: "Farmácia -  " vira "Farmácia".
    .replace(/[\s\-–—:]+$/, '');

  return normalizarDescricao(semParcela);
}

export interface DadosDaDeduplicacao {
  cartaoId: string;
  mesDeReferencia: string;
  data: Date;
  descricao: string;
  valor: string;
  parcelaNumero?: number | null;
  parcelaTotal?: number | null;
  /**
   * Índice desta linha entre as linhas **idênticas** do mesmo arquivo (0, 1, 2…).
   *
   * É o componente que salva a regra de um erro caro: dois cafés de R$ 12,00 no mesmo dia
   * são duas despesas reais e produziriam a mesma chave sem ele. A segunda seria
   * descartada como duplicata, o usuário perderia uma despesa e só descobriria ao conferir
   * o total. Como o índice vem da ordem dentro do arquivo, o mesmo extrato reimportado
   * gera a mesma sequência e a idempotência continua valendo.
   */
  ocorrencia: number;
}

export function calcularDedupeHash(dados: DadosDaDeduplicacao): string {
  const partes = [
    dados.cartaoId,
    dados.mesDeReferencia,
    dados.data.toISOString().slice(0, 10),
    normalizarDescricao(dados.descricao),
    dados.valor,
    dados.parcelaNumero ?? '',
    dados.parcelaTotal ?? '',
    dados.ocorrencia,
  ];

  return createHash('sha256').update(partes.join('|')).digest('hex');
}

/**
 * Atribui o índice de ocorrência a cada linha, na ordem em que aparecem no arquivo.
 *
 * A chave do agrupamento é tudo que define uma linha "idêntica" — se duas diferem em
 * qualquer campo, cada uma começa a própria contagem.
 */
export function atribuirOcorrencias<T extends Omit<DadosDaDeduplicacao, 'ocorrencia'>>(
  linhas: T[],
): (T & { ocorrencia: number })[] {
  const contagem = new Map<string, number>();

  return linhas.map((linha) => {
    const chave = [
      linha.data.toISOString().slice(0, 10),
      normalizarDescricao(linha.descricao),
      linha.valor,
      linha.parcelaNumero ?? '',
      linha.parcelaTotal ?? '',
    ].join('|');

    const ocorrencia = contagem.get(chave) ?? 0;
    contagem.set(chave, ocorrencia + 1);

    return { ...linha, ocorrencia };
  });
}
