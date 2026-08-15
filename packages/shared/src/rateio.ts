/**
 * Divisão de valores entre participantes.
 *
 * Toda a aritmética acontece em **centavos inteiros**. Dividir em reais com ponto
 * flutuante perde centavo (R$ 10,00 ÷ 3 = 3,333… e três vezes isso não volta a 10,00), e
 * centavo perdido num rateio é saldo que nunca fecha no fim do mês.
 *
 * Um valor cabe com folga em `number`: o teto do domínio é `Decimal(14,2)`, ou seja
 * 99.999.999.999.999 centavos, abaixo do inteiro seguro do JavaScript.
 */

export function paraCentavos(valor: string | number): number {
  const texto = typeof valor === 'number' ? valor.toFixed(2) : valor.trim();
  const negativo = texto.startsWith('-');
  const [inteira = '0', decimal = ''] = texto.replace('-', '').split('.');
  const centavos = Number(inteira) * 100 + Number(decimal.padEnd(2, '0').slice(0, 2));

  return negativo ? -centavos : centavos;
}

export function deCentavos(centavos: number): string {
  const negativo = centavos < 0;
  const absoluto = Math.abs(centavos);

  return `${negativo ? '-' : ''}${Math.floor(absoluto / 100)}.${String(absoluto % 100).padStart(2, '0')}`;
}

/**
 * Divide um valor em partes iguais, distribuindo o resto.
 *
 * O resto **não** é descartado nem jogado todo em cima de uma pessoa: R$ 10,00 entre 3 vira
 * 3,34 / 3,33 / 3,33, e a soma volta a ser exatamente 10,00. Truncar daria 9,99 e o grupo
 * ficaria devendo um centavo a ninguém, para sempre.
 *
 * Os centavos sobrando vão para os primeiros da lista — determinístico, para que recalcular
 * o mesmo rateio dê sempre o mesmo resultado.
 */
export function dividirEmPartesIguais(totalEmCentavos: number, quantidade: number): number[] {
  if (quantidade <= 0) return [];

  const base = Math.trunc(totalEmCentavos / quantidade);
  const resto = totalEmCentavos - base * quantidade;
  const sinal = resto < 0 ? -1 : 1;

  return Array.from({ length: quantidade }, (_, indice) =>
    indice < Math.abs(resto) ? base + sinal : base,
  );
}

/** Soma cotas informadas à mão, para conferir se batem com o total da despesa. */
export function somarCentavos(valores: number[]): number {
  return valores.reduce((soma, valor) => soma + valor, 0);
}
