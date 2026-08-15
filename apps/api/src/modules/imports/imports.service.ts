import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { atribuirOcorrencias, calcularDedupeHash } from '../../lib/dedupe.js';
import { lerCsv } from '../../lib/csv/parser.js';
import {
  carregarCartaoDoDono,
  obterOuCriarFatura,
  sincronizarFatura,
} from '../cards/faturas.service.js';

export interface ArquivoImportado {
  nome: string;
  conteudo: Buffer;
}

/**
 * Importa a fatura em CSV.
 *
 * O README permite importar **a mesma fatura várias vezes no mesmo mês** para atualização
 * incremental, e proíbe duplicar lançamentos idênticos. A idempotência é garantida pelo
 * banco — único em (fatura, dedupeHash) com `skipDuplicates` — e não por consulta prévia:
 * checar-antes-de-inserir tem corrida, e duas importações simultâneas do mesmo arquivo
 * passariam as duas pela verificação.
 */
export async function importarFatura(
  prisma: PrismaClient,
  donoId: string,
  cartaoId: string,
  mesDeReferencia: string,
  arquivo: ArquivoImportado,
) {
  const cartao = await carregarCartaoDoDono(prisma, cartaoId, donoId);
  const leitura = lerCsv(arquivo.conteudo);

  const hashDoArquivo = createHash('sha256').update(arquivo.conteudo).digest('hex');

  const lancamentos = leitura.linhas.filter((linha) => linha.tipo === 'LANCAMENTO');
  const pagamentos = leitura.linhas.filter((linha) => linha.tipo === 'PAGAMENTO');

  // A ocorrência é atribuída por grupo de linhas idênticas, separadamente para lançamentos
  // e pagamentos, na ordem em que aparecem no arquivo. O mesmo extrato reimportado produz
  // a mesma sequência, e duas compras iguais no mesmo dia continuam sendo duas.
  const lancamentosComOcorrencia = atribuirOcorrencias(
    lancamentos.map((linha) => ({
      cartaoId,
      mesDeReferencia,
      data: linha.data,
      descricao: linha.descricao,
      valor: linha.valor,
      parcelaNumero: linha.parcelaNumero,
      parcelaTotal: linha.parcelaTotal,
    })),
  );

  const pagamentosComOcorrencia = atribuirOcorrencias(
    pagamentos.map((linha) => ({
      cartaoId,
      mesDeReferencia,
      data: linha.data,
      descricao: linha.descricao,
      valor: linha.valor,
    })),
  );

  return prisma.$transaction(async (tx) => {
    const fatura = await obterOuCriarFatura(tx, cartaoId, mesDeReferencia, cartao.dueDay);

    // Lido ANTES de qualquer escrita: é o estado da fatura "no sistema" que o README manda
    // consultar para decidir sobre o pagamento. Depois da sincronização ela pode virar
    // PAID, e aí a resposta seria outra.
    const faturaEstavaAberta = fatura.status === 'OPEN';

    const importacao = await tx.importBatch.create({
      data: {
        cardId: cartaoId,
        userId: donoId,
        fileName: arquivo.nome,
        fileHash: hashDoArquivo,
        rowsTotal: leitura.linhas.length,
      },
    });

    const inseridos = await tx.invoiceEntry.createMany({
      data: lancamentosComOcorrencia.map((linha) => ({
        invoiceId: fatura.id,
        date: linha.data,
        description: linha.descricao,
        amount: linha.valor,
        installmentNumber: linha.parcelaNumero ?? null,
        installmentTotal: linha.parcelaTotal ?? null,
        dedupeHash: calcularDedupeHash(linha),
        importBatchId: importacao.id,
      })),
      skipDuplicates: true,
    });

    // Pagamento só entra se a fatura estiver em aberto. Fora disso o README manda ignorar
    // em silêncio — silêncio para o usuário, não amnésia para o sistema: o contador abaixo
    // é o que transforma "sumiu um pagamento" em uma pergunta respondível.
    const pagamentosRegistrados = faturaEstavaAberta
      ? (
          await tx.invoicePayment.createMany({
            data: pagamentosComOcorrencia.map((linha) => ({
              invoiceId: fatura.id,
              date: linha.data,
              amount: linha.valor,
              paymentMethod: 'CASH' as const,
              dedupeHash: calcularDedupeHash(linha),
              importBatchId: importacao.id,
            })),
            skipDuplicates: true,
          })
        ).count
      : 0;

    const pagamentosIgnorados = faturaEstavaAberta
      ? pagamentosComOcorrencia.length - pagamentosRegistrados
      : pagamentosComOcorrencia.length;

    await tx.importBatch.update({
      where: { id: importacao.id },
      data: {
        rowsInserted: inseridos.count,
        rowsSkipped: lancamentosComOcorrencia.length - inseridos.count,
        paymentsIgnored: pagamentosIgnorados,
      },
    });

    await sincronizarFatura(tx, fatura.id);

    const atualizada = await tx.invoice.findUniqueOrThrow({
      where: { id: fatura.id },
      select: { total: true },
    });

    return {
      importacaoId: importacao.id,
      faturaId: fatura.id,
      layout: leitura.layout,
      linhasNoArquivo: leitura.linhas.length,
      lancamentosInseridos: inseridos.count,
      lancamentosIgnorados: lancamentosComOcorrencia.length - inseridos.count,
      pagamentosRegistrados,
      pagamentosIgnorados,
      linhasNaoReconhecidas: leitura.ignoradas,
      totalDaFatura: atualizada.total.toString(),
    };
  });
}

export async function listarImportacoes(prisma: PrismaClient, cartaoId: string, donoId: string) {
  await carregarCartaoDoDono(prisma, cartaoId, donoId);

  return prisma.importBatch.findMany({
    where: { cardId: cartaoId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      fileName: true,
      rowsTotal: true,
      rowsInserted: true,
      rowsSkipped: true,
      paymentsIgnored: true,
      createdAt: true,
    },
  });
}
