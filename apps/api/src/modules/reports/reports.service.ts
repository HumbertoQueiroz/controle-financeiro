import type { GrantScope, Prisma, PrismaClient } from '@prisma/client';
import type { FiltroDoRelatorio } from '@controle/shared';
import { deCentavos, paraCentavos, somarCentavos } from '@controle/shared';

const CAMPOS = {
  id: true,
  description: true,
  amount: true,
  settledAmount: true,
  dueDate: true,
  status: true,
  paymentMethod: true,
  originType: true,
  counterpartyLabel: true,
  debtor: { select: { name: true } },
  creditor: { select: { name: true } },
} as const;

type ObrigacaoDoBanco = Prisma.ObligationGetPayload<{ select: typeof CAMPOS }>;

function paraItem(obrigacao: ObrigacaoDoBanco, lado: 'PAGAR' | 'RECEBER') {
  const valor = paraCentavos(obrigacao.amount.toString());
  const liquidado = paraCentavos(obrigacao.settledAmount.toString());

  return {
    id: obrigacao.id,
    descricao: obrigacao.description,
    valor: obrigacao.amount.toString(),
    valorLiquidado: obrigacao.settledAmount.toString(),
    restante: deCentavos(valor - liquidado),
    vencimento: obrigacao.dueDate,
    status: obrigacao.status,
    formaDePagamento: obrigacao.paymentMethod,
    origem: obrigacao.originType,
    // A contraparte é a outra ponta da mesma linha. O rótulo livre vem primeiro porque é
    // o que existe quando a contraparte não é pessoa cadastrada — o salário, o aluguel.
    // Nulo em "a pagar" significa dívida com a instituição do cartão.
    contraparte:
      obrigacao.counterpartyLabel ??
      (lado === 'PAGAR' ? (obrigacao.creditor?.name ?? null) : (obrigacao.debtor?.name ?? null)),
  };
}

function montarBloco(obrigacoes: ObrigacaoDoBanco[], lado: 'PAGAR' | 'RECEBER') {
  const itens = obrigacoes.map((obrigacao) => paraItem(obrigacao, lado));

  return {
    // O total é do que ainda falta, não do valor original: uma dívida de R$ 100 com R$ 60
    // já pagos pesa R$ 40 no saldo, e somar o valor cheio faria a pessoa parecer dever
    // mais do que deve.
    total: deCentavos(somarCentavos(itens.map((item) => paraCentavos(item.restante)))),
    quantidade: itens.length,
    itens,
  };
}

/**
 * Relatório de uma pessoa, nos três modos do README.
 *
 * O escopo recebido aqui é o **efetivo**, já resolvido pelo guard a partir do
 * consentimento. Ele decide qual consulta roda: um escopo de "a pagar" não chega a
 * perguntar ao banco pelas linhas de "a receber". Filtrar depois de buscar deixaria os
 * dados na memória do processo, e bastaria um `select` esquecido para vazarem.
 */
export async function gerarRelatorio(
  prisma: PrismaClient,
  donoId: string,
  escopo: GrantScope,
  filtro: FiltroDoRelatorio,
) {
  const dono = await prisma.user.findUniqueOrThrow({
    where: { id: donoId },
    select: { name: true },
  });

  // Todas as fichas que apontam para esta conta: a própria e as que outras pessoas
  // criaram na agenda delas. Consultar só a própria esconderia justamente as dívidas que
  // terceiros lançaram em nome dela — que é o caso de uso do README.
  const fichas = await prisma.person.findMany({
    where: { userId: donoId },
    select: { id: true },
  });
  const idsDasFichas = fichas.map((ficha) => ficha.id);

  const filtroComum: Prisma.ObligationWhereInput = {
    ...(filtro.situacao === 'ABERTAS' ? { status: { in: ['OPEN', 'PARTIAL'] } } : {}),
    ...(filtro.de || filtro.ate
      ? {
          dueDate: {
            ...(filtro.de ? { gte: filtro.de } : {}),
            ...(filtro.ate ? { lte: filtro.ate } : {}),
          },
        }
      : {}),
  };

  const buscar = (lado: 'PAGAR' | 'RECEBER') =>
    prisma.obligation.findMany({
      where: {
        ...filtroComum,
        ...(lado === 'PAGAR'
          ? { debtorId: { in: idsDasFichas } }
          : { creditorId: { in: idsDasFichas } }),
        // Cancelada não é dívida de ninguém, em nenhum modo.
        NOT: { status: 'CANCELLED' },
      },
      select: CAMPOS,
      orderBy: [{ dueDate: 'asc' }, { description: 'asc' }],
    });

  const querPagar = escopo === 'PAYABLE' || escopo === 'BOTH';
  const querReceber = escopo === 'RECEIVABLE' || escopo === 'BOTH';

  const [pagar, receber] = await Promise.all([
    querPagar ? buscar('PAGAR') : Promise.resolve(null),
    querReceber ? buscar('RECEBER') : Promise.resolve(null),
  ]);

  const aPagar = pagar ? montarBloco(pagar, 'PAGAR') : null;
  const aReceber = receber ? montarBloco(receber, 'RECEBER') : null;

  return {
    donoId,
    dono: dono.name,
    escopo,
    situacao: filtro.situacao,
    aPagar,
    aReceber,
    // O saldo só existe quando os dois lados foram consultados. Calculá-lo com um lado
    // faltando devolveria um número que parece saldo e não é.
    saldo:
      aPagar && aReceber
        ? deCentavos(paraCentavos(aReceber.total) - paraCentavos(aPagar.total))
        : null,
  };
}
