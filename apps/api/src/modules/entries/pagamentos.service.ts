import type { Prisma, PrismaClient } from '@prisma/client';
import { deCentavos, paraCentavos, somarCentavos } from '@controle/shared';

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * Recalcula a situação do título a partir dos pagamentos.
 *
 * `settledAmount` e `settledAt` na obrigação deixaram de ser a fonte da verdade e passaram
 * a ser cache do que a tabela de pagamentos diz. Manter os dois lados por conta própria
 * faria eles divergirem no primeiro estorno; recalcular sempre é mais barato que descobrir
 * meses depois que o saldo não bate.
 *
 * A data da baixa é a do **último** pagamento, o que quitou. É esse o momento em que o
 * título saiu do previsto e entrou no caixa.
 */
export async function recalcularSituacao(tx: Cliente, obligationId: string) {
  const [obrigacao, pagamentos] = await Promise.all([
    tx.obligation.findUniqueOrThrow({
      where: { id: obligationId },
      select: { amount: true, status: true },
    }),
    tx.payment.findMany({
      where: { obligationId },
      select: { amount: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    }),
  ]);

  const total = paraCentavos(obrigacao.amount.toString());
  const pago = somarCentavos(pagamentos.map((p) => paraCentavos(p.amount.toString())));
  const quitou = pago >= total && total > 0;

  // Cancelada continua cancelada: um pagamento não ressuscita um título desfeito.
  const status =
    obrigacao.status === 'CANCELLED'
      ? 'CANCELLED'
      : quitou
        ? 'SETTLED'
        : pago > 0
          ? 'PARTIAL'
          : 'OPEN';

  await tx.obligation.update({
    where: { id: obligationId },
    data: {
      // Nunca liquidar mais que o devido: o CHECK do banco recusaria, e um pagamento a
      // maior acontece de verdade quando o CSV traz dois meses juntos.
      settledAmount: deCentavos(Math.min(pago, total)),
      settledAt:
        quitou && obrigacao.status !== 'CANCELLED'
          ? (pagamentos[pagamentos.length - 1]?.paidAt ?? new Date())
          : null,
      status,
    },
  });
}

export interface DadosDoPagamento {
  valor: string;
  pagoEm: Date;
  observacao?: string | null;
  dedupeHash?: string | null;
  importBatchId?: string | null;
}

export async function registrarPagamento(
  tx: Cliente,
  obligationId: string,
  dados: DadosDoPagamento,
) {
  const pagamento = await tx.payment.create({
    data: {
      obligationId,
      amount: dados.valor,
      paidAt: dados.pagoEm,
      note: dados.observacao ?? null,
      dedupeHash: dados.dedupeHash ?? null,
      importBatchId: dados.importBatchId ?? null,
    },
  });

  await recalcularSituacao(tx, obligationId);

  return pagamento;
}

export async function removerPagamento(tx: Cliente, pagamentoId: string) {
  const pagamento = await tx.payment.delete({ where: { id: pagamentoId } });

  await recalcularSituacao(tx, pagamento.obligationId);

  return pagamento;
}

export function paraSaidaDePagamento(pagamento: {
  id: string;
  amount: Prisma.Decimal;
  paidAt: Date;
  note: string | null;
}) {
  return {
    id: pagamento.id,
    valor: pagamento.amount.toString(),
    pagoEm: pagamento.paidAt,
    observacao: pagamento.note,
  };
}
