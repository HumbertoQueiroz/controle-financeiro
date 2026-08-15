/**
 * Peças que todos os layouts compartilham. Cada banco muda o nome das colunas, não o
 * significado do que está nelas.
 */

/**
 * Remove a acentuação para comparar texto sem depender de acento.
 *
 * `\p{M}` casa as marcas combinantes que o `normalize('NFD')` separa das letras. A
 * propriedade Unicode é preferida a um intervalo de escapes porque o intervalo é invisível
 * no editor e fácil de corromper numa edição futura.
 */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Remove acento e caixa para comparar cabeçalho sem depender de como o banco escreveu. */
export function normalizarCabecalho(texto: string): string {
  return semAcento(texto.trim().toLowerCase());
}

/**
 * Data em `dd/mm/aaaa`, `dd/mm/aa` ou ISO.
 *
 * Construída com `Date.UTC` de propósito: `new Date('2026-08-03')` é meia-noite UTC, que
 * em fuso negativo cai no dia 2 quando lida em horário local — o lançamento apareceria no
 * dia anterior, e às vezes no mês anterior.
 */
export function converterData(texto: string): Date | null {
  const limpo = texto.trim();

  const brasileira = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(limpo);

  if (brasileira) {
    const [, dia, mes, ano] = brasileira;
    const anoCompleto = ano!.length === 2 ? 2000 + Number(ano) : Number(ano);
    const data = new Date(Date.UTC(anoCompleto, Number(mes) - 1, Number(dia)));

    // Rejeita 31/02: o Date "corrige" para 03/03 em silêncio, e o lançamento mudaria de mês.
    return data.getUTCMonth() === Number(mes) - 1 && data.getUTCDate() === Number(dia)
      ? data
      : null;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpo);

  if (iso) {
    const [, ano, mes, dia] = iso;
    return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  }

  return null;
}

/**
 * Reconhece pagamento da fatura.
 *
 * Só a descrição decide, nunca o sinal do valor: estorno e crédito de cashback também vêm
 * negativos, e tratá-los como pagamento faria a fatura constar como paga sem que ninguém
 * tivesse pago.
 */
const PADRAO_DE_PAGAMENTO = /\b(pagamento|pgto|pagto)\b|debito automatico/i;

export function ehPagamento(descricao: string): boolean {
  return PADRAO_DE_PAGAMENTO.test(semAcento(descricao));
}

/** Extrai "3/10", "PARCELA 3 DE 10" e "3 de 10" da descrição. */
export function extrairParcela(descricao: string): {
  numero: number | null;
  total: number | null;
} {
  const texto = semAcento(descricao);

  const padroes = [
    /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/,
    /\bparcela\s+(\d{1,2})\s+de\s+(\d{1,2})\b/i,
    /\b(\d{1,2})\s+de\s+(\d{1,2})\b/i,
  ];

  for (const padrao of padroes) {
    const achado = padrao.exec(texto);

    if (achado) {
      const numero = Number(achado[1]);
      const total = Number(achado[2]);

      // "1/2" numa descrição pode ser fração ("1/2 KG"), então exige que faça sentido
      // como parcelamento: total maior que 1 e número dentro do total.
      if (total > 1 && numero >= 1 && numero <= total) {
        return { numero, total };
      }
    }
  }

  return { numero: null, total: null };
}

/** Busca o valor da primeira coluna que existir, tolerando variação de nome. */
export function coluna(linha: Record<string, string>, ...nomes: string[]): string | undefined {
  for (const nome of nomes) {
    const valor = linha[nome];

    if (valor !== undefined && valor.trim() !== '') {
      return valor;
    }
  }

  return undefined;
}
