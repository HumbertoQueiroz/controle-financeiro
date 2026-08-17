import type { PrismaClient } from '@prisma/client';
import type { Lancamento } from '@controle/shared';
import { deCentavos, paraCentavos, somarCentavos } from '@controle/shared';
import { relatorioPorCategoria } from '../categories/categories.service.js';
import { gerarOrcamento } from './orcamento.service.js';
import { listarSaldos } from './participantes.service.js';

/** Quantas linhas cabem num bloco antes de "ver todos" virar o caminho. */
const LINHAS_POR_BLOCO = 4;

/**
 * Dinheiro que sai do caixa, e não pela fatura.
 *
 * Os blocos de "a pagar" **particionam** a lista pela forma de pagamento: ou a conta sai do
 * caixa, ou entra na fatura, nunca as duas. Um terceiro bloco por origem — rateio, por
 * exemplo — cruzaria o eixo e mostraria a mesma pizza duas vezes na mesma seção, com os
 * blocos somando mais que o total logo acima.
 */
const FORMAS_DE_CAIXA = ['CASH', 'MEAL_VOUCHER', 'BARTER'] as const;

function totalEmAberto(itens: Lancamento[]): string {
  return deCentavos(somarCentavos(itens.map((item) => paraCentavos(item.restante))));
}

function paraLinhas(itens: Lancamento[]) {
  return itens.slice(0, LINHAS_POR_BLOCO).map((item) => ({
    id: item.id,
    rotulo: item.descricao,
    valor: item.restante,
    atrasado: item.atrasado,
  }));
}

/**
 * O mês inteiro numa consulta só.
 *
 * O dashboard **compõe** o que já existe — orçamento, relatório por categoria e saldo por
 * participante — em vez de recalcular cada número por conta própria. Um total que o
 * dashboard soma de um jeito e a tela de destino de outro é a pior falha possível aqui:
 * quem toca no card vê um número diferente do que tocou e para de confiar nos dois.
 *
 * Cada bloco carrega o **filtro** que abre a lista correspondente. Assim o link nasce ao
 * lado do número que ele promete, e não numa tabela de rotas noutro arquivo que alguém
 * esquece de atualizar quando o recorte muda.
 */
export async function gerarDashboard(prisma: PrismaClient, userId: string, mes: string) {
  const [orcamento, despesas, entradas, saldos] = await Promise.all([
    gerarOrcamento(prisma, userId, mes),
    relatorioPorCategoria(prisma, userId, mes, 'PAYABLE'),
    relatorioPorCategoria(prisma, userId, mes, 'RECEIVABLE'),
    listarSaldos(prisma, userId, mes),
  ]);

  const aPagarEmAberto = orcamento.saidas.itens.filter(
    (item) => item.status === 'OPEN' || item.status === 'PARTIAL',
  );

  const caixa = aPagarEmAberto.filter((item) =>
    FORMAS_DE_CAIXA.includes(item.formaDePagamento as (typeof FORMAS_DE_CAIXA)[number]),
  );
  const cartao = aPagarEmAberto.filter((item) => item.formaDePagamento === 'CREDIT_CARD');

  const comSaldo = saldos.participantes.filter((item) => paraCentavos(item.saldo) !== 0);
  const meDevem = comSaldo.filter((item) => paraCentavos(item.saldo) > 0);
  const euDevo = comSaldo.filter((item) => paraCentavos(item.saldo) < 0);

  const porCategoria = (relatorio: Awaited<ReturnType<typeof relatorioPorCategoria>>) => ({
    total: relatorio.total,
    linhas: relatorio.linhas.slice(0, LINHAS_POR_BLOCO).map((linha) => ({
      id: linha.categoriaId,
      rotulo: linha.nome,
      valor: linha.previsto,
      cor: linha.cor,
    })),
  });

  return {
    mes,
    saldoRealizado: {
      entradas: orcamento.entradas.realizado,
      saidas: orcamento.saidas.realizado,
      saldo: orcamento.saldoRealizado,
    },
    saldoPrevisto: {
      entradas: orcamento.entradas.previsto,
      saidas: orcamento.saidas.previsto,
      saldo: orcamento.saldoPrevisto,
    },
    atrasados: orcamento.atrasados,
    aPagar: {
      total: totalEmAberto(aPagarEmAberto),
      blocos: [
        {
          chave: 'caixa',
          titulo: 'Dinheiro, vale e permuta',
          total: totalEmAberto(caixa),
          quantidade: caixa.length,
          filtro: 'caixa',
          linhas: paraLinhas(caixa),
        },
        {
          chave: 'cartao',
          titulo: 'Cartão de crédito',
          total: totalEmAberto(cartao),
          quantidade: cartao.length,
          filtro: 'cartao',
          linhas: paraLinhas(cartao),
        },
      ],
    },
    categorias: { despesas: porCategoria(despesas), entradas: porCategoria(entradas) },
    participantes: {
      aReceber: {
        total: deCentavos(somarCentavos(meDevem.map((item) => paraCentavos(item.saldo)))),
        quantidade: meDevem.length,
        linhas: meDevem.slice(0, LINHAS_POR_BLOCO).map((item) => ({
          id: item.id,
          rotulo: item.nome,
          valor: item.saldo,
        })),
      },
      aPagar: {
        // O saldo de quem eu devo é negativo; o bloco mostra quanto, e não o sinal.
        total: deCentavos(somarCentavos(euDevo.map((item) => -paraCentavos(item.saldo)))),
        quantidade: euDevo.length,
        linhas: euDevo.slice(0, LINHAS_POR_BLOCO).map((item) => ({
          id: item.id,
          rotulo: item.nome,
          valor: deCentavos(-paraCentavos(item.saldo)),
        })),
      },
    },
  };
}
