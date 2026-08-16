import type { PrismaClient } from '@prisma/client';
import { deCentavos, paraCentavos, somarCentavos, type Lancamento } from '@controle/shared';
import { fichasDoUsuario, listar } from './entries.service.js';
import { gerarParcelasDoMes } from './recorrencias.service.js';

function montarBloco(itens: Lancamento[]) {
  const previsto = somarCentavos(itens.map((item) => paraCentavos(item.valor)));
  const realizado = somarCentavos(itens.map((item) => paraCentavos(item.valorLiquidado)));

  return {
    previsto: deCentavos(previsto),
    realizado: deCentavos(realizado),
    emAberto: deCentavos(previsto - realizado),
    itens,
  };
}

/**
 * O orçamento do mês: tudo que vence nele, o que já teve baixa e o que segue em aberto.
 *
 * O mês é delimitado pelo **vencimento**, não pela baixa. Uma conta de agosto paga em
 * setembro pertence ao orçamento de agosto — foi ali que ela foi assumida. O que a baixa
 * responde é outra pergunta: quanto de fato entrou e saiu. As duas leituras convivem
 * porque as duas datas existem separadas.
 *
 * Antes de somar, as parcelas das recorrências vigentes são geradas. É o que faz o salário
 * aparecer no mês que ainda não chegou, sem ninguém precisar lançar nada.
 */
export async function gerarOrcamento(prisma: PrismaClient, userId: string, mes: string) {
  await gerarParcelasDoMes(prisma, userId, mes);

  const [entradas, saidas] = await Promise.all([
    listar(prisma, userId, { direcao: 'RECEIVABLE', mes, situacao: 'TODAS' }),
    listar(prisma, userId, { direcao: 'PAYABLE', mes, situacao: 'TODAS' }),
  ]);

  const blocoDeEntradas = montarBloco(entradas);
  const blocoDeSaidas = montarBloco(saidas);

  return {
    mes,
    entradas: blocoDeEntradas,
    saidas: blocoDeSaidas,
    saldoPrevisto: deCentavos(
      paraCentavos(blocoDeEntradas.previsto) - paraCentavos(blocoDeSaidas.previsto),
    ),
    // O caixa do mês: só o que se moveu de verdade.
    saldoRealizado: deCentavos(
      paraCentavos(blocoDeEntradas.realizado) - paraCentavos(blocoDeSaidas.realizado),
    ),
    atrasados: [...entradas, ...saidas].filter((item) => item.atrasado).length,
  };
}

/** Números do painel: o mês corrente mais o que ficou para trás. */
export async function gerarResumo(prisma: PrismaClient, userId: string, mes: string) {
  const orcamento = await gerarOrcamento(prisma, userId, mes);
  const idsDasFichas = await fichasDoUsuario(prisma, userId);

  const faturasEmAberto = await prisma.invoice.count({
    where: { card: { ownerUserId: userId }, status: 'OPEN' },
  });

  const proximo = await prisma.obligation.findFirst({
    where: {
      debtorId: { in: idsDasFichas },
      status: { in: ['OPEN', 'PARTIAL'] },
      dueDate: { gte: new Date() },
    },
    orderBy: { dueDate: 'asc' },
    select: { dueDate: true },
  });

  return {
    aPagar: orcamento.saidas.emAberto,
    aReceber: orcamento.entradas.emAberto,
    saldo: orcamento.saldoPrevisto,
    faturasEmAberto,
    proximoVencimento: proximo?.dueDate ?? null,
  };
}
