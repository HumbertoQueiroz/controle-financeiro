import type { PrismaClient } from '@prisma/client';
import type { ResultadoDaBusca } from '@controle/shared';
import { LIMITE_POR_TIPO, deCentavos, paraCentavos } from '@controle/shared';
import { fichasDoUsuario } from '../entries/entries.service.js';

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10).split('-').reverse().join('/');
}

/**
 * Busca por texto em lançamentos, pessoas, cartões e grupos.
 *
 * `contains` com `insensitive`, e não busca full-text: o volume aqui é o de um controle
 * pessoal, e um índice GIN com `tsvector` traria configuração de dicionário, stemming em
 * português e uma migration só para isso — custo que o tamanho do problema não justifica.
 * Se um dia a busca ficar lenta, o caminho está anotado aqui.
 *
 * O corte é **por tipo**, não no total: trezentos lançamentos empurrariam para fora a única
 * pessoa que casava com o termo, que costuma ser exatamente o que se procurava.
 */
export async function buscar(prisma: PrismaClient, userId: string, termo: string) {
  const idsDasFichas = await fichasDoUsuario(prisma, userId);
  const contem = { contains: termo, mode: 'insensitive' as const };
  const teto = LIMITE_POR_TIPO + 1;

  const [lancamentos, pessoas, cartoes, grupos] = await Promise.all([
    prisma.obligation.findMany({
      where: {
        OR: [{ debtorId: { in: idsDasFichas } }, { creditorId: { in: idsDasFichas } }],
        AND: [
          {
            OR: [
              { description: contem },
              { counterpartyLabel: contem },
              { debtor: { name: contem } },
              { creditor: { name: contem } },
            ],
          },
        ],
        NOT: { status: 'CANCELLED' },
      },
      select: {
        id: true,
        description: true,
        amount: true,
        settledAmount: true,
        dueDate: true,
        status: true,
        creditorId: true,
        counterpartyLabel: true,
        debtor: { select: { name: true } },
        creditor: { select: { name: true } },
      },
      // Do mais recente para o mais antigo: procurar um lançamento quase sempre é
      // procurar um lançamento recente.
      orderBy: { dueDate: 'desc' },
      take: teto,
    }),
    prisma.person.findMany({
      where: { ownerId: userId, OR: [{ name: contem }, { email: contem }] },
      select: { id: true, name: true, email: true },
      take: teto,
    }),
    prisma.creditCard.findMany({
      where: { ownerUserId: userId, OR: [{ name: contem }, { brand: contem }] },
      select: { id: true, name: true, brand: true, lastFour: true },
      take: teto,
    }),
    prisma.group.findMany({
      where: { ownerUserId: userId, name: contem },
      select: { id: true, name: true },
      take: teto,
    }),
  ]);

  let truncado = false;
  const cortar = <T>(itens: T[]): T[] => {
    if (itens.length > LIMITE_POR_TIPO) truncado = true;

    return itens.slice(0, LIMITE_POR_TIPO);
  };

  const itens: ResultadoDaBusca[] = [
    ...cortar(lancamentos).map((obrigacao): ResultadoDaBusca => {
      const ehReceber =
        obrigacao.creditorId !== null && idsDasFichas.includes(obrigacao.creditorId);
      const restante =
        paraCentavos(obrigacao.amount.toString()) -
        paraCentavos(obrigacao.settledAmount.toString());

      return {
        tipo: 'LANCAMENTO',
        id: obrigacao.id,
        titulo: obrigacao.description,
        detalhe: [
          ehReceber ? 'A receber' : 'A pagar',
          obrigacao.counterpartyLabel ??
            (ehReceber ? obrigacao.debtor?.name : obrigacao.creditor?.name) ??
            null,
          `vence ${formatarData(obrigacao.dueDate)}`,
          obrigacao.status === 'SETTLED' ? 'baixado' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        valor: deCentavos(obrigacao.status === 'SETTLED' ? 0 : restante),
        link: ehReceber ? '/app/a-receber' : '/app/a-pagar',
      };
    }),
    ...cortar(pessoas).map((pessoa): ResultadoDaBusca => ({
      tipo: 'PESSOA',
      id: pessoa.id,
      titulo: pessoa.name,
      detalhe: pessoa.email ?? 'Pessoa da sua lista',
      valor: null,
      link: `/app/pessoas/${pessoa.id}/fechamento`,
    })),
    ...cortar(cartoes).map((cartao): ResultadoDaBusca => ({
      tipo: 'CARTAO',
      id: cartao.id,
      titulo: cartao.name,
      detalhe: [cartao.brand, cartao.lastFour && `final ${cartao.lastFour}`]
        .filter(Boolean)
        .join(' · '),
      valor: null,
      link: `/app/cartoes/${cartao.id}`,
    })),
    ...cortar(grupos).map((grupo): ResultadoDaBusca => ({
      tipo: 'GRUPO',
      id: grupo.id,
      titulo: grupo.name,
      detalhe: 'Grupo',
      valor: null,
      link: `/app/grupos/${grupo.id}`,
    })),
  ];

  return { termo, itens, truncado };
}
