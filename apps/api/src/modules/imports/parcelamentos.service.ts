import type { PrismaClient } from '@prisma/client';
import { deCentavos, paraCentavos } from '@controle/shared';
import { ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';
import { sincronizarRepasse } from '../cards/faturas.service.js';

const CAMPOS = {
  id: true,
  description: true,
  amount: true,
  installments: true,
  responsiblePersonId: true,
  card: { select: { id: true, name: true } },
  responsible: { select: { name: true } },
  entries: {
    select: {
      id: true,
      installmentNumber: true,
      amount: true,
      projected: true,
      invoice: { select: { referenceMonth: true } },
    },
    orderBy: { installmentNumber: 'asc' as const },
  },
} as const;

/**
 * Lista os parcelamentos do usuário.
 *
 * Cada parcelamento traz o cartão em que foi passado e cada parcela traz o mês da fatura
 * em que caiu — as duas informações que faltam quando se olha um lançamento solto e não se
 * sabe de onde ele veio nem quanto ainda falta.
 */
export async function listar(prisma: PrismaClient, donoId: string) {
  const parcelamentos = await prisma.installment.findMany({
    where: { card: { ownerUserId: donoId } },
    select: CAMPOS,
    orderBy: { createdAt: 'desc' },
  });

  return parcelamentos.map((parcelamento) => {
    const valorDaParcela = paraCentavos(parcelamento.amount.toString());
    // "Paga" aqui é a parcela que já apareceu num extrato de verdade; a projetada ainda
    // não aconteceu, e contá-la faria o restante parecer menor do que é.
    const pagas = parcelamento.entries.filter((parcela) => !parcela.projected).length;

    return {
      id: parcelamento.id,
      descricao: parcelamento.description,
      valorDaParcela: parcelamento.amount.toString(),
      valorTotal: deCentavos(valorDaParcela * parcelamento.installments),
      quantidadeDeParcelas: parcelamento.installments,
      cartaoId: parcelamento.card.id,
      cartao: parcelamento.card.name,
      responsavelPessoaId: parcelamento.responsiblePersonId,
      responsavel: parcelamento.responsible?.name ?? null,
      parcelasPagas: pagas,
      restante: deCentavos(valorDaParcela * Math.max(parcelamento.installments - pagas, 0)),
      parcelas: parcelamento.entries.map((parcela) => ({
        id: parcela.id,
        numero: parcela.installmentNumber,
        fatura: parcela.invoice.referenceMonth.trim(),
        valor: parcela.amount.toString(),
        projetada: parcela.projected,
      })),
    };
  });
}

/**
 * Troca o responsável de um parcelamento inteiro.
 *
 * Vale para todas as parcelas, inclusive as futuras: se a compra era do Bruno, todas as
 * doze são dele. Corrigir uma a uma seria trabalho repetido e abriria espaço para metade
 * ficar num responsável e metade em outro.
 */
export async function trocarResponsavel(
  prisma: PrismaClient,
  id: string,
  donoId: string,
  pessoaId: string | null,
) {
  const parcelamento = await prisma.installment.findFirst({
    where: { id, card: { ownerUserId: donoId } },
    select: { id: true, entries: { select: { id: true } } },
  });

  if (!parcelamento) {
    throw new ErroNaoEncontrado('Parcelamento não encontrado');
  }

  if (pessoaId) {
    const pessoa = await prisma.person.findFirst({
      where: { id: pessoaId, ownerId: donoId },
      select: { id: true },
    });

    if (!pessoa) {
      throw new ErroNaoEncontrado('Pessoa não encontrada');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.installment.update({
      where: { id },
      data: { responsiblePersonId: pessoaId },
    });

    await tx.invoiceEntry.updateMany({
      where: { installmentId: id },
      data: { forwardedToPersonId: pessoaId },
    });

    // Cada parcela tem o próprio "a receber": trocar o responsável precisa refazer todos,
    // senão o antigo continuaria devendo as parcelas que ainda não venceram.
    for (const parcela of parcelamento.entries) {
      await sincronizarRepasse(tx, parcela.id);
    }
  });

  return { ok: true };
}

/**
 * Remove o parcelamento e as parcelas que ainda não apareceram em extrato.
 *
 * As que já vieram do banco ficam: elas são fato consumado, e apagá-las mudaria o total de
 * faturas passadas.
 */
export async function excluir(prisma: PrismaClient, id: string, donoId: string) {
  const parcelamento = await prisma.installment.findFirst({
    where: { id, card: { ownerUserId: donoId } },
    select: { id: true, entries: { select: { id: true, projected: true, invoiceId: true } } },
  });

  if (!parcelamento) {
    throw new ErroNaoEncontrado('Parcelamento não encontrado');
  }

  const projetadas = parcelamento.entries.filter((parcela) => parcela.projected);

  if (projetadas.length === 0) {
    throw new ErroDeRegra('Todas as parcelas já apareceram em extrato e não podem ser removidas');
  }

  const { sincronizarFatura } = await import('../cards/faturas.service.js');

  await prisma.$transaction(async (tx) => {
    await tx.obligation.deleteMany({
      where: { originType: 'CARD_ENTRY', originId: { in: projetadas.map((p) => p.id) } },
    });

    await tx.invoiceEntry.deleteMany({ where: { id: { in: projetadas.map((p) => p.id) } } });

    for (const faturaId of new Set(projetadas.map((p) => p.invoiceId))) {
      await sincronizarFatura(tx, faturaId);
    }

    await tx.installment.delete({ where: { id } });
  });

  return { ok: true, parcelasRemovidas: projetadas.length };
}
