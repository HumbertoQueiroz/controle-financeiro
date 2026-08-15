import { describe, expect, it } from 'vitest';
import { resolverTransferencias, type SaldoDeParticipante } from './netting.js';

/** Aplica as transferências aos saldos: todos precisam terminar zerados. */
function aplicar(saldos: SaldoDeParticipante[]) {
  const resultado = new Map(saldos.map((saldo) => [saldo.pessoaId, saldo.saldoEmCentavos]));

  for (const transferencia of resolverTransferencias(saldos)) {
    resultado.set(
      transferencia.dePessoaId,
      (resultado.get(transferencia.dePessoaId) ?? 0) + transferencia.centavos,
    );
    resultado.set(
      transferencia.paraPessoaId,
      (resultado.get(transferencia.paraPessoaId) ?? 0) - transferencia.centavos,
    );
  }

  return resultado;
}

describe('compensação do fechamento', () => {
  it('zera todos os saldos', () => {
    const saldos: SaldoDeParticipante[] = [
      { pessoaId: 'ana', saldoEmCentavos: 6000 },
      { pessoaId: 'bruno', saldoEmCentavos: -2500 },
      { pessoaId: 'carla', saldoEmCentavos: -1500 },
      { pessoaId: 'diego', saldoEmCentavos: -2000 },
    ];

    for (const [, saldo] of aplicar(saldos)) {
      expect(saldo).toBe(0);
    }
  });

  it('nunca gera transferência de valor negativo ou zero', () => {
    const transferencias = resolverTransferencias([
      { pessoaId: 'ana', saldoEmCentavos: 1 },
      { pessoaId: 'bruno', saldoEmCentavos: -1 },
    ]);

    for (const transferencia of transferencias) {
      expect(transferencia.centavos).toBeGreaterThan(0);
    }
  });

  it('usa no máximo n−1 transferências', () => {
    const saldos: SaldoDeParticipante[] = [
      { pessoaId: 'a', saldoEmCentavos: 5000 },
      { pessoaId: 'b', saldoEmCentavos: 3000 },
      { pessoaId: 'c', saldoEmCentavos: -2000 },
      { pessoaId: 'd', saldoEmCentavos: -3000 },
      { pessoaId: 'e', saldoEmCentavos: -3000 },
    ];

    // É a diferença entre "quatro pagamentos" e "quatorze": sem compensação, cada despesa
    // vira uma cobrança separada e ninguém executa isso na vida real.
    expect(resolverTransferencias(saldos).length).toBeLessThanOrEqual(saldos.length - 1);
  });

  it('não gera transferência quando ninguém deve nada', () => {
    expect(
      resolverTransferencias([
        { pessoaId: 'ana', saldoEmCentavos: 0 },
        { pessoaId: 'bruno', saldoEmCentavos: 0 },
      ]),
    ).toEqual([]);
  });

  it('ninguém transfere para si mesmo', () => {
    const transferencias = resolverTransferencias([
      { pessoaId: 'ana', saldoEmCentavos: 3000 },
      { pessoaId: 'bruno', saldoEmCentavos: -1000 },
      { pessoaId: 'carla', saldoEmCentavos: -2000 },
    ]);

    for (const transferencia of transferencias) {
      expect(transferencia.dePessoaId).not.toBe(transferencia.paraPessoaId);
    }
  });

  it('é determinística: o mesmo conjunto de saldos dá sempre o mesmo plano', () => {
    const saldos: SaldoDeParticipante[] = [
      { pessoaId: 'ana', saldoEmCentavos: 2000 },
      { pessoaId: 'bruno', saldoEmCentavos: 2000 },
      { pessoaId: 'carla', saldoEmCentavos: -4000 },
    ];

    // Fechamento que muda de resultado a cada execução é impossível de conferir.
    expect(resolverTransferencias(saldos)).toEqual(resolverTransferencias([...saldos].reverse()));
  });

  it('resolve saldos com centavos que não dividem exato', () => {
    // R$ 10,00 entre 3: 334 / 333 / 333. Quem pagou tem 666 a receber.
    const saldos: SaldoDeParticipante[] = [
      { pessoaId: 'ana', saldoEmCentavos: 666 },
      { pessoaId: 'bruno', saldoEmCentavos: -333 },
      { pessoaId: 'carla', saldoEmCentavos: -333 },
    ];

    for (const [, saldo] of aplicar(saldos)) {
      expect(saldo).toBe(0);
    }
  });
});
