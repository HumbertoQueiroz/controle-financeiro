export interface SaldoDeParticipante {
  pessoaId: string;
  /** Positivo = tem a receber. Negativo = deve. */
  saldoEmCentavos: number;
}

export interface Transferencia {
  dePessoaId: string;
  paraPessoaId: string;
  centavos: number;
}

/**
 * Resolve quem paga quem no fechamento do mês.
 *
 * Sem compensação, um grupo de 5 pessoas com despesas cruzadas gera dezenas de
 * transferências de valores pequenos, e ninguém executa isso na vida real. O que o README
 * pede — "quem tem que pagar quem, o que tem que abater e o saldo final" — é exatamente a
 * compensação: só o líquido troca de mãos.
 *
 * Estratégia gulosa: o maior devedor paga o maior credor, e repete. Ela não garante o
 * mínimo absoluto de transferências (o problema ótimo é NP-difícil), mas garante no máximo
 * n−1 transferências para n participantes, que já é a diferença entre "quatro pagamentos" e
 * "quatorze".
 *
 * A ordenação de desempate é por id para que o mesmo conjunto de saldos produza sempre o
 * mesmo plano — fechamento que muda de resultado a cada execução é impossível de conferir.
 */
export function resolverTransferencias(saldos: SaldoDeParticipante[]): Transferencia[] {
  const devedores = saldos
    .filter((saldo) => saldo.saldoEmCentavos < 0)
    .map((saldo) => ({ pessoaId: saldo.pessoaId, restante: -saldo.saldoEmCentavos }))
    .sort((a, b) => b.restante - a.restante || a.pessoaId.localeCompare(b.pessoaId));

  const credores = saldos
    .filter((saldo) => saldo.saldoEmCentavos > 0)
    .map((saldo) => ({ pessoaId: saldo.pessoaId, restante: saldo.saldoEmCentavos }))
    .sort((a, b) => b.restante - a.restante || a.pessoaId.localeCompare(b.pessoaId));

  const transferencias: Transferencia[] = [];

  let i = 0;
  let j = 0;

  while (i < devedores.length && j < credores.length) {
    const devedor = devedores[i]!;
    const credor = credores[j]!;
    const valor = Math.min(devedor.restante, credor.restante);

    if (valor > 0) {
      transferencias.push({
        dePessoaId: devedor.pessoaId,
        paraPessoaId: credor.pessoaId,
        centavos: valor,
      });
    }

    devedor.restante -= valor;
    credor.restante -= valor;

    // Avança quem zerou. Os dois podem zerar juntos, e aí os dois avançam.
    if (devedor.restante === 0) i += 1;
    if (credor.restante === 0) j += 1;
  }

  return transferencias;
}
