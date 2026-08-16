import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ConfirmarImportacao, ParcelamentoConhecido } from '@controle/shared';
import { deCentavos, paraCentavos } from '@controle/shared';
import {
  atribuirOcorrencias,
  calcularDedupeHash,
  chaveDoParcelamento,
  normalizarDescricao,
} from '../../lib/dedupe.js';
import { lerCsv } from '../../lib/csv/parser.js';
import { ErroDeRegra } from '../../lib/erros.js';
import {
  carregarCartaoDoDono,
  faturaDaCompra,
  obterOuCriarFatura,
  sincronizarFatura,
  sincronizarRepasse,
  somarMeses,
} from '../cards/faturas.service.js';
import { registrarPagamento } from '../entries/pagamentos.service.js';

export interface ArquivoImportado {
  nome: string;
  conteudo: Buffer;
}

/** Identifica uma linha entre a prévia e a confirmação, sem depender de índice. */
function chaveDaLinha(dados: {
  data: Date;
  descricao: string;
  valor: string;
  ocorrencia: number;
}): string {
  return createHash('sha1')
    .update(
      [
        dados.data.toISOString().slice(0, 10),
        normalizarDescricao(dados.descricao),
        dados.valor,
        dados.ocorrencia,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 16);
}

/**
 * Lê o arquivo e devolve o que encontrou, **sem gravar nada**.
 *
 * Separar leitura de gravação é o que permite a tela de classificação existir: a pessoa vê
 * o que veio, diz de quem é cada gasto e para qual fatura vai, e só então confirma. Gravar
 * primeiro e perguntar depois deixaria lançamento errado no sistema no intervalo.
 */
export async function analisarArquivo(
  prisma: PrismaClient,
  donoId: string,
  cartaoId: string,
  arquivo: ArquivoImportado,
) {
  const cartao = await carregarCartaoDoDono(prisma, cartaoId, donoId);
  const leitura = lerCsv(arquivo.conteudo);

  const lancamentos = leitura.linhas.filter((linha) => linha.tipo === 'LANCAMENTO');
  const pagamentos = leitura.linhas.filter((linha) => linha.tipo === 'PAGAMENTO');

  const comOcorrencia = atribuirOcorrencias(
    lancamentos.map((linha) => ({
      cartaoId,
      // A fatura de cada linha sai da data da compra, então o mês não entra na ocorrência.
      mesDeReferencia: '',
      data: linha.data,
      descricao: linha.descricao,
      valor: linha.valor,
      parcelaNumero: linha.parcelaNumero,
      parcelaTotal: linha.parcelaTotal,
    })),
  );

  // Parcelamentos que este cartão já conhece: é a lista que evita lançar de novo, no mês
  // seguinte, a mesma compra parcelada que já teve todas as parcelas projetadas.
  const conhecidos = await prisma.installment.findMany({
    where: { cardId: cartaoId },
    select: {
      id: true,
      descriptionKey: true,
      installments: true,
      amount: true,
      firstMonth: true,
      firstNumber: true,
      responsible: { select: { name: true } },
    },
  });

  const porChave = new Map(
    conhecidos.map((parcelamento) => [
      `${parcelamento.descriptionKey}|${parcelamento.installments}`,
      parcelamento,
    ]),
  );

  const avulsos: ReturnType<typeof montarLinha>[] = [];
  const novosParcelamentos: (ReturnType<typeof montarLinha> & {
    parcelaNumero: number;
    parcelaTotal: number;
    mesesDasParcelas: string[];
  })[] = [];
  const parcelamentosAnteriores: ParcelamentoConhecido[] = [];

  function montarLinha(linha: {
    data: Date;
    descricao: string;
    valor: string;
    ocorrencia: number;
    parcelaNumero?: number | null;
    parcelaTotal?: number | null;
  }) {
    return {
      chave: chaveDaLinha(linha),
      data: linha.data,
      descricao: linha.descricao,
      valor: linha.valor,
      faturaSugerida: faturaDaCompra(linha.data, cartao.closingDay),
      parcelaNumero: linha.parcelaNumero ?? null,
      parcelaTotal: linha.parcelaTotal ?? null,
    };
  }

  for (const linha of comOcorrencia) {
    const montada = montarLinha(linha);

    if (!linha.parcelaNumero || !linha.parcelaTotal) {
      avulsos.push(montada);
      continue;
    }

    const conhecido = porChave.get(`${chaveDoParcelamento(linha.descricao)}|${linha.parcelaTotal}`);

    if (conhecido) {
      // Já projetada numa importação anterior. Aparece na tela como "parcelamento
      // anterior" para a pessoa entender por que não está sendo lançada — silêncio aqui
      // pareceria que o sistema perdeu a linha.
      parcelamentosAnteriores.push({
        parcelamentoId: conhecido.id,
        descricao: linha.descricao,
        valor: linha.valor,
        parcelaNumero: linha.parcelaNumero,
        parcelaTotal: linha.parcelaTotal,
        faturaDaParcela: somarMeses(
          conhecido.firstMonth.trim(),
          linha.parcelaNumero - conhecido.firstNumber,
        ),
        responsavel: conhecido.responsible?.name ?? null,
      });

      continue;
    }

    // Parcelamento novo: as parcelas que faltam são projetadas nas faturas futuras.
    const restantes = linha.parcelaTotal - linha.parcelaNumero;

    novosParcelamentos.push({
      ...montada,
      parcelaNumero: linha.parcelaNumero,
      parcelaTotal: linha.parcelaTotal,
      mesesDasParcelas: Array.from({ length: restantes + 1 }, (_, indice) =>
        somarMeses(montada.faturaSugerida, indice),
      ),
    });
  }

  const pagamentosComOcorrencia = atribuirOcorrencias(
    pagamentos.map((linha) => ({
      cartaoId,
      mesDeReferencia: '',
      data: linha.data,
      descricao: linha.descricao,
      valor: linha.valor,
    })),
  );

  return {
    cartaoId,
    layout: leitura.layout,
    faturaSugerida: faturaMaisFrequente(
      [...avulsos, ...novosParcelamentos].map((linha) => linha.faturaSugerida),
      cartao.closingDay,
    ),
    lancamentos: avulsos,
    novosParcelamentos,
    parcelamentosAnteriores,
    pagamentos: pagamentosComOcorrencia.map(montarLinha),
    linhasNaoReconhecidas: leitura.ignoradas,
  };
}

/** A fatura do arquivo é a que aparece em mais linhas — o resto é exceção. */
function faturaMaisFrequente(meses: string[], _diaDeFechamento: number): string {
  if (meses.length === 0) {
    const agora = new Date();

    return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  const contagem = new Map<string, number>();

  for (const mes of meses) {
    contagem.set(mes, (contagem.get(mes) ?? 0) + 1);
  }

  return [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}

/**
 * Grava o que foi classificado.
 *
 * A idempotência continua garantida pelo banco — único em (fatura, dedupeHash) com
 * `skipDuplicates` —, então reimportar o mesmo arquivo depois de confirmar não duplica nada.
 */
export async function confirmarImportacao(
  prisma: PrismaClient,
  donoId: string,
  cartaoId: string,
  dados: ConfirmarImportacao,
) {
  const cartao = await carregarCartaoDoDono(prisma, cartaoId, donoId);

  const divergentes = [...dados.lancamentos, ...dados.novosParcelamentos].filter(
    (linha) => linha.fatura !== dados.mesSelecionado,
  );

  // A divergência precisa ser vista antes de gravar: o caso comum é escolher agosto e o
  // arquivo ser de julho, e o erro só apareceria quando o total da fatura não batesse.
  if (divergentes.length > 0 && !dados.divergenciaAceita) {
    const encontrada = faturaMaisFrequente(
      divergentes.map((linha) => linha.fatura),
      cartao.closingDay,
    );

    throw new ErroDeRegra(
      `${divergentes.length} lançamento(s) vão para a fatura de ${encontrada}, e não ${dados.mesSelecionado}. Confirme para prosseguir.`,
    );
  }

  const pessoasValidas = new Set(
    (await prisma.person.findMany({ where: { ownerId: donoId }, select: { id: true } })).map(
      (pessoa) => pessoa.id,
    ),
  );

  for (const linha of [...dados.lancamentos, ...dados.novosParcelamentos]) {
    if (linha.responsavelPessoaId && !pessoasValidas.has(linha.responsavelPessoaId)) {
      throw new ErroDeRegra('Responsável não encontrado entre as suas pessoas');
    }
  }

  return prisma.$transaction(
    async (tx) => {
      const importacao = await tx.importBatch.create({
        data: {
          cardId: cartaoId,
          userId: donoId,
          fileName: dados.nomeDoArquivo,
          fileHash: createHash('sha256')
            .update(JSON.stringify([dados.lancamentos, dados.novosParcelamentos]))
            .digest('hex'),
          rowsTotal:
            dados.lancamentos.length + dados.novosParcelamentos.length + dados.pagamentos.length,
        },
      });

      const faturas = new Map<string, string>();

      const faturaDe = async (mes: string) => {
        const existente = faturas.get(mes);

        if (existente) return existente;

        const fatura = await obterOuCriarFatura(tx, cartaoId, mes, cartao);
        faturas.set(mes, fatura.id);

        return fatura.id;
      };

      let inseridos = 0;
      let ignorados = 0;

      // ---- Lançamentos avulsos ----
      for (const linha of dados.lancamentos) {
        const faturaId = await faturaDe(linha.fatura);

        const criado = await inserirLancamento(tx, {
          faturaId,
          cartaoId,
          mes: linha.fatura,
          linha,
          importacaoId: importacao.id,
          projetada: false,
          parcelamentoId: null,
        });

        if (criado) inseridos += 1;
        else ignorados += 1;
      }

      // ---- Parcelamentos novos ----
      let parcelasGeradas = 0;
      let parcelamentosCriados = 0;

      for (const linha of dados.novosParcelamentos) {
        const total = linha.parcelaTotal ?? 1;
        const numero = linha.parcelaNumero ?? 1;

        const parcelamento = await tx.installment.upsert({
          where: {
            cardId_descriptionKey_installments_firstMonth: {
              cardId: cartaoId,
              descriptionKey: chaveDoParcelamento(linha.descricao),
              installments: total,
              firstMonth: linha.fatura,
            },
          },
          create: {
            cardId: cartaoId,
            description: linha.descricao,
            descriptionKey: chaveDoParcelamento(linha.descricao),
            amount: linha.valor,
            installments: total,
            firstMonth: linha.fatura,
            firstNumber: numero,
            responsiblePersonId: linha.responsavelPessoaId,
          },
          update: { responsiblePersonId: linha.responsavelPessoaId },
        });

        parcelamentosCriados += 1;

        // A parcela do extrato e todas as seguintes, até a última. É isso que faz o
        // compromisso inteiro aparecer no orçamento dos próximos meses em vez de surgir
        // como surpresa a cada fatura.
        for (let passo = 0; numero + passo <= total; passo += 1) {
          const mes = somarMeses(linha.fatura, passo);
          const faturaId = await faturaDe(mes);

          const criado = await inserirLancamento(tx, {
            faturaId,
            cartaoId,
            mes,
            linha: { ...linha, parcelaNumero: numero + passo, parcelaTotal: total },
            importacaoId: importacao.id,
            // Só a primeira veio do extrato; as demais são projeção.
            projetada: passo > 0,
            parcelamentoId: parcelamento.id,
          });

          if (criado) {
            inseridos += 1;
            parcelasGeradas += 1;
          } else {
            ignorados += 1;
          }
        }
      }

      // ---- Pagamentos ----
      //
      // As faturas são sincronizadas antes: é a sincronização que cria a obrigação de cada
      // fatura, e sem ela não haveria a que anexar o pagamento — o pagamento seria
      // descartado em silêncio e o usuário veria "0 registrados" sem entender por quê.
      for (const faturaId of faturas.values()) {
        await sincronizarFatura(tx, faturaId);
      }

      let pagamentosRegistrados = 0;
      let pagamentosIgnorados = 0;

      for (const linha of dados.pagamentos) {
        const faturaId = await faturaDe(linha.fatura);

        const fatura = await tx.invoice.findUniqueOrThrow({
          where: { id: faturaId },
          select: { status: true },
        });

        // O README manda registrar o pagamento apenas se a fatura estiver em aberto.
        if (fatura.status !== 'OPEN') {
          pagamentosIgnorados += 1;
          continue;
        }

        const obrigacao = await tx.obligation.findFirst({
          where: { originType: 'INVOICE', originId: faturaId },
          select: { id: true },
        });

        if (!obrigacao) {
          pagamentosIgnorados += 1;
          continue;
        }

        const dedupeHash = calcularDedupeHash({
          cartaoId,
          mesDeReferencia: linha.fatura,
          data: linha.data,
          descricao: linha.descricao,
          valor: linha.valor,
          ocorrencia: 0,
        });

        const jaExiste = await tx.payment.findFirst({
          where: { obligationId: obrigacao.id, dedupeHash },
          select: { id: true },
        });

        if (jaExiste) {
          pagamentosIgnorados += 1;
          continue;
        }

        await registrarPagamento(tx, obrigacao.id, {
          valor: linha.valor,
          pagoEm: linha.data,
          dedupeHash,
          importBatchId: importacao.id,
        });

        pagamentosRegistrados += 1;
      }

      await tx.importBatch.update({
        where: { id: importacao.id },
        data: {
          rowsInserted: inseridos,
          rowsSkipped: ignorados,
          paymentsIgnored: pagamentosIgnorados,
        },
      });

      // Segunda passada: os pagamentos mudaram a situação das faturas que quitaram.
      for (const faturaId of faturas.values()) {
        await sincronizarFatura(tx, faturaId);
      }

      const afetadas = await tx.invoice.findMany({
        where: { id: { in: [...faturas.values()] } },
        select: { id: true, referenceMonth: true, total: true },
        orderBy: { referenceMonth: 'asc' },
      });

      return {
        importacaoId: importacao.id,
        layout: 'confirmado',
        lancamentosInseridos: inseridos,
        lancamentosIgnorados: ignorados,
        parcelasGeradas,
        parcelamentosCriados,
        pagamentosRegistrados,
        pagamentosIgnorados,
        faturasAfetadas: afetadas.map((fatura) => ({
          mes: fatura.referenceMonth.trim(),
          faturaId: fatura.id,
          total: fatura.total.toString(),
        })),
      };
    },
    // Um parcelamento de 24 vezes cria 24 lançamentos e 24 faturas; o padrão de 5s do
    // Prisma não cobre isso e a importação falharia no meio.
    { timeout: 30_000 },
  );
}

async function inserirLancamento(
  tx: Prisma.TransactionClient,
  dados: {
    faturaId: string;
    cartaoId: string;
    mes: string;
    linha: {
      data: Date;
      descricao: string;
      valor: string;
      responsavelPessoaId: string | null;
      parcelaNumero?: number | null;
      parcelaTotal?: number | null;
    };
    importacaoId: string;
    projetada: boolean;
    parcelamentoId: string | null;
  },
): Promise<boolean> {
  const dedupeHash = calcularDedupeHash({
    cartaoId: dados.cartaoId,
    mesDeReferencia: dados.mes,
    data: dados.linha.data,
    descricao: dados.linha.descricao,
    valor: dados.linha.valor,
    parcelaNumero: dados.linha.parcelaNumero ?? null,
    parcelaTotal: dados.linha.parcelaTotal ?? null,
    ocorrencia: 0,
  });

  const { count } = await tx.invoiceEntry.createMany({
    data: [
      {
        invoiceId: dados.faturaId,
        date: dados.linha.data,
        description: dados.linha.descricao,
        amount: dados.linha.valor,
        installmentNumber: dados.linha.parcelaNumero ?? null,
        installmentTotal: dados.linha.parcelaTotal ?? null,
        installmentId: dados.parcelamentoId,
        projected: dados.projetada,
        dedupeHash,
        // "Meu" não gera repasse; o resto vira um a receber daquela pessoa.
        forwardedToPersonId: dados.linha.responsavelPessoaId,
        importBatchId: dados.importacaoId,
      },
    ],
    skipDuplicates: true,
  });

  if (count === 0) return false;

  if (dados.linha.responsavelPessoaId) {
    const criado = await tx.invoiceEntry.findFirstOrThrow({
      where: { invoiceId: dados.faturaId, dedupeHash },
      select: { id: true },
    });

    await sincronizarRepasse(tx, criado.id);
  }

  return true;
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

/** Quanto ainda falta de um parcelamento, em reais. */
export function restanteDoParcelamento(
  valorDaParcela: string,
  total: number,
  pagas: number,
): string {
  return deCentavos(paraCentavos(valorDaParcela) * Math.max(total - pagas, 0));
}
