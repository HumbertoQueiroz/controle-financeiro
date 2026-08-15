/**
 * Conversão de valor monetário vindo de CSV de banco.
 *
 * O resultado é **string**, não number: `parseFloat('0.1') + parseFloat('0.2')` já erra na
 * segunda casa, e valor monetário em ponto flutuante vira centavo perdido no fechamento
 * de saldo. A string vai direto para a coluna `Decimal(14,2)`, que faz a conta certa.
 */
export function converterValor(texto: string): string | null {
  const limpo = texto
    .trim()
    .replace(/^R\$\s*/i, '')
    // Parênteses são notação contábil de negativo: (12,34) é -12,34.
    .replace(/^\((.*)\)$/, '-$1')
    .replace(/\s/g, '');

  if (limpo === '') return null;

  const negativo = limpo.startsWith('-');
  const semSinal = limpo.replace(/^[+-]/, '');

  if (!/^[\d.,]+$/.test(semSinal)) return null;

  const temVirgula = semSinal.includes(',');
  const temPonto = semSinal.includes('.');

  let normalizado: string;

  if (temVirgula && temPonto) {
    // Formato brasileiro: 1.234,56. O ponto é milhar, a vírgula é decimal.
    normalizado = semSinal.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    normalizado = semSinal.replace(',', '.');
  } else {
    // Só ponto: tratado como decimal (ISO). Exportações que usam ponto como separador de
    // milhar praticamente sempre usam vírgula no decimal, e teriam caído no caso acima.
    normalizado = semSinal;
  }

  if (!/^\d+(\.\d+)?$/.test(normalizado)) return null;

  const valor = Number(normalizado);

  if (!Number.isFinite(valor)) return null;

  return `${negativo ? '-' : ''}${normalizado}`;
}

/** Formata para exibição em português. */
export function formatarValor(valor: string | number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    typeof valor === 'string' ? Number(valor) : valor,
  );
}
