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
import { ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';
import {
  carregarCartaoDoDono,
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
  mesSelecionado: string,
) {
  // O cartão é carregado pela posse, e não pelos dados: nada aqui depende mais do dia de
  // fechamento, mas importar para o cartão de outra pessoa continua tendo de ser recusado.
  await carregarCartaoDoDono(prisma, cartaoId, donoId);

  const leitura = lerCsv(arquivo.conteudo);

  const lancamentos = leitura.linhas.filter((linha) => linha.tipo === 'LANCAMENTO');
  const pagamentos = leitura.linhas.filter((linha) => linha.tipo === 'PAGAMENTO');

  const comOcorrencia = atribuirOcorrencias(
    lancamentos.map((linha) => ({
      cartaoId,
      // A ocorrência distingue linhas idênticas dentro do arquivo; o mês é o mesmo para
      // todas e não acrescenta nada à chave.
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

  // A categoria que descrições iguais já receberam neste cartão. Categoria arquivada fica
  // de fora: sugerir de volta o que a pessoa tirou das listas seria desfazer a decisão dela.
  const classificados = await prisma.invoiceEntry.findMany({
    where: {
      invoice: { cardId: cartaoId },
      categoryId: { not: null },
      category: { archived: false },
    },
    select: { description: true, categoryId: true },
    orderBy: { createdAt: 'desc' },
  });

  const categoriaPorDescricao = new Map<string, string>();

  for (const lancamento of classificados) {
    const chave = normalizarDescricao(lancamento.description);

    // O `orderBy` desc põe o mais recente primeiro; o primeiro a chegar é o que vale.
    if (!categoriaPorDescricao.has(chave)) categoriaPorDescricao.set(chave, lancamento.categoryId!);
  }

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
      // A fatura de toda linha é o **mês escolhido na tela anterior**, e não a calculada a
      // partir da data da compra.
      //
      // O arquivo baixado do banco já **é** a fatura daquele mês: a compra de 30/07 está
      // nele justamente porque caiu na fatura de agosto, depois do fechamento. Recalcular
      // pela data é o sistema discordar do extrato que está importando — e o resultado era
      // um punhado de linhas mandadas para julho com um aviso de divergência que a própria
      // sugestão tinha inventado.
      //
      // O seletor por linha continua ali para o caso raro de o arquivo misturar meses de
      // verdade. Aí a divergência é escolha de quem importa, não palpite do sistema.
      faturaSugerida: mesSelecionado,
      // Quem já classificou "Uber" uma vez não deveria decidir de novo. Mesma ideia da
      // classificação em lote, e a mesma normalização de descrição.
      categoriaSugerida: categoriaPorDescricao.get(normalizarDescricao(linha.descricao)) ?? null,
      parcelaNumero: linha.parcelaNumero ?? null,
      parcelaTotal: linha.parcelaTotal ?? null,
      // Viaja até a gravação porque é o que distingue duas compras legitimamente iguais no
      // mesmo dia. Recalcular lá seria recalcular sobre uma lista que a tela pode ter
      // reordenado, e a ordem é justamente o que define a ocorrência.
      ocorrencia: linha.ocorrencia,
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

  // O que já está na fatura sai da lista de decisões e vira uma seção fechada.
  //
  // A checagem usa **o mesmo hash que a gravação vai usar**, e não uma comparação por
  // descrição: qualquer critério diferente faria a tela prometer uma coisa e o banco fazer
  // outra — linha anunciada como nova que o `skipDuplicates` descarta, ou o contrário.
  const jaNaFatura = await hashesDaFatura(prisma, cartaoId, mesSelecionado);
  const jaExiste = (linha: ReturnType<typeof montarLinha>) =>
    jaNaFatura.has(
      calcularDedupeHash({
        cartaoId,
        mesDeReferencia: linha.faturaSugerida,
        data: linha.data,
        descricao: linha.descricao,
        valor: linha.valor,
        parcelaNumero: linha.parcelaNumero,
        parcelaTotal: linha.parcelaTotal,
        ocorrencia: linha.ocorrencia,
      }),
    );

  // O pagamento que aparece no extrato quitou a fatura **anterior**, nunca a que está sendo
  // importada: o cartão só cobra depois de fechar o ciclo, então o débito de 05/08 é da
  // fatura de julho. É a única linha do arquivo que pertence a outro mês, e mandá-la para o
  // mês escolhido quitava a fatura de agosto com o dinheiro de julho.
  const mesDoPagamento = somarMeses(mesSelecionado, -1);
  const situacaoDaAnterior = await situacaoDaFatura(prisma, cartaoId, mesDoPagamento);

  return {
    cartaoId,
    layout: leitura.layout,
    faturaSugerida: mesSelecionado,
    lancamentos: avulsos.filter((linha) => !jaExiste(linha)),
    lancamentosConhecidos: avulsos.filter(jaExiste),
    novosParcelamentos,
    parcelamentosAnteriores,
    pagamentos: pagamentosComOcorrencia.map((linha) => ({
      ...montarLinha(linha),
      faturaSugerida: mesDoPagamento,
      faturaExiste: situacaoDaAnterior !== null,
      saldoEmAberto: situacaoDaAnterior?.saldoEmAberto ?? null,
      // Ignorar é o padrão quando a fatura anterior não existe, e é o caso da primeira
      // importação de todo cartão. É a única escolha que não inventa dado nenhum: a fatura
      // de julho é de antes de o sistema existir, e não há o que abater.
      acaoSugerida: situacaoDaAnterior === null ? ('IGNORAR' as const) : ('REGISTRAR' as const),
    })),
    linhasNaoReconhecidas: leitura.ignoradas,
  };
}

/** Os hashes de deduplicação já gravados na fatura do mês, para saber o que não é novidade. */
async function hashesDaFatura(
  prisma: PrismaClient,
  cartaoId: string,
  mes: string,
): Promise<Set<string>> {
  const lancamentos = await prisma.invoiceEntry.findMany({
    where: { invoice: { cardId: cartaoId, referenceMonth: mes } },
    select: { dedupeHash: true },
  });

  return new Set(lancamentos.map((lancamento) => lancamento.dedupeHash));
}

/** A fatura do mês e quanto falta pagar nela, ou `null` se ela não existe no sistema. */
async function situacaoDaFatura(
  tx: Prisma.TransactionClient | PrismaClient,
  cartaoId: string,
  mes: string,
) {
  const fatura = await tx.invoice.findUnique({
    where: { cardId_referenceMonth: { cardId: cartaoId, referenceMonth: mes } },
    select: { id: true, status: true },
  });

  if (!fatura) return null;

  const obrigacao = await tx.obligation.findFirst({
    where: { originType: 'INVOICE', originId: fatura.id },
    select: { amount: true, settledAmount: true },
  });

  const emAberto = obrigacao
    ? paraCentavos(obrigacao.amount.toString()) - paraCentavos(obrigacao.settledAmount.toString())
    : 0;

  return {
    id: fatura.id,
    status: fatura.status,
    saldoEmAberto: deCentavos(Math.max(emAberto, 0)),
  };
}

/** O mês que aparece em mais linhas divergentes, para a mensagem do aviso citar um só. */
function faturaMaisFrequente(meses: string[]): string {
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

  // Toda linha nasce no mês escolhido, então divergir aqui significa que **a pessoa
  // trocou** a fatura de alguma delas. O aviso continua valendo: mandar um lançamento para
  // outro mês é decisão de peso, e o erro só apareceria quando o total não batesse com o do
  // banco. O que mudou é que agora ele nunca dispara por conta própria.
  if (divergentes.length > 0 && !dados.divergenciaAceita) {
    const encontrada = faturaMaisFrequente(divergentes.map((linha) => linha.fatura));

    throw new ErroDeRegra(
      `Você mandou ${divergentes.length} lançamento(s) para a fatura de ${encontrada}, e não ${dados.mesSelecionado}. Confirme para prosseguir.`,
    );
  }

  const pessoasValidas = new Set(
    (await prisma.person.findMany({ where: { ownerId: donoId }, select: { id: true } })).map(
      (pessoa) => pessoa.id,
    ),
  );

  const categoriasValidas = new Set(
    (await prisma.category.findMany({ where: { ownerId: donoId }, select: { id: true } })).map(
      (categoria) => categoria.id,
    ),
  );

  for (const linha of [...dados.lancamentos, ...dados.novosParcelamentos]) {
    if (linha.responsavelPessoaId && !pessoasValidas.has(linha.responsavelPessoaId)) {
      throw new ErroDeRegra('Responsável não encontrado entre as suas pessoas');
    }

    if (linha.categoriaId && !categoriasValidas.has(linha.categoriaId)) {
      throw new ErroDeRegra('Categoria não encontrada entre as suas categorias');
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
      let saldosAnterioresCriados = 0;

      for (const linha of dados.pagamentos) {
        if (linha.acao === 'IGNORAR') {
          pagamentosIgnorados += 1;
          continue;
        }

        let situacao = await situacaoDaFatura(tx, cartaoId, linha.fatura);

        if (linha.acao === 'SALDO_ANTERIOR') {
          // A fatura que falta é reconstruída pelo único dado que temos dela: o valor que
          // foi pago. Nasce e morre no mesmo instante, com um lançamento que se identifica
          // como o que é — sem isso, o dinheiro que saiu do banco não apareceria em lugar
          // nenhum e o saldo da conta ficaria alto para sempre.
          const faturaId = await faturaDe(linha.fatura);

          await inserirLancamento(tx, {
            faturaId,
            cartaoId,
            mes: linha.fatura,
            linha: {
              data: linha.data,
              descricao: 'Saldo anterior (não importado)',
              valor: linha.valor,
              responsavelPessoaId: null,
            },
            importacaoId: importacao.id,
            projetada: false,
            parcelamentoId: null,
          });

          await sincronizarFatura(tx, faturaId);
          saldosAnterioresCriados += 1;
          situacao = await situacaoDaFatura(tx, cartaoId, linha.fatura);
        }

        // Nunca criar fatura por causa de pagamento: fatura nasce de lançamento. Criar aqui
        // deixava para trás uma fatura vazia de R$ 0,00 no a pagar, e o pagamento sumia
        // em silêncio logo depois por não haver obrigação a que se anexar.
        if (!situacao) {
          pagamentosIgnorados += 1;
          continue;
        }

        // O README manda registrar o pagamento apenas se a fatura estiver em aberto.
        if (situacao.status !== 'OPEN') {
          pagamentosIgnorados += 1;
          continue;
        }

        const faturaId = situacao.id;
        faturas.set(linha.fatura, faturaId);

        const obrigacao = await tx.obligation.findFirst({
          where: { originType: 'INVOICE', originId: faturaId },
          select: { id: true },
        });

        if (!obrigacao) {
          pagamentosIgnorados += 1;
          continue;
        }

        // Pagar mais do que se deve é o sintoma de o pagamento ter ido para a fatura errada,
        // e antes disso passava calado: o excedente evaporava e a fatura virava paga.
        if (paraCentavos(linha.valor) > paraCentavos(situacao.saldoEmAberto)) {
          if (!dados.excedenteAceito) {
            throw new ErroDeRegra(
              `O pagamento de ${linha.valor} é maior que o saldo em aberto da fatura de ${linha.fatura} (${situacao.saldoEmAberto}). Confirme para prosseguir.`,
            );
          }
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
          // O extrato do banco é a prova do pagamento da fatura, e quem importa é o dono
          // do cartão — o mesmo que deve à instituição. Não há terceiro para confirmar.
          confirmed: true,
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
        saldosAnterioresCriados,
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
      ocorrencia?: number;
      categoriaId?: string | null;
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
    // A ocorrência vem da linha, e não fixa em 0: dois cafés de R$ 12 no mesmo dia são duas
    // despesas reais, e com a chave igual o `skipDuplicates` descartava o segundo em
    // silêncio — a pessoa perdia uma despesa e só descobriria conferindo o total.
    ocorrencia: dados.linha.ocorrencia ?? 0,
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
        categoryId: dados.linha.categoriaId ?? null,
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

/**
 * Desfaz uma importação.
 *
 * Apaga **exatamente o que aquela importação criou** — os lançamentos, as parcelas que ela
 * projetou, os parcelamentos que nasceram nela e os pagamentos que ela registrou —, e
 * recalcula as faturas afetadas. Uma importação posterior que tenha acrescentado linhas à
 * mesma fatura continua intacta: quem errou o arquivo de agosto não deveria perder o de
 * setembro junto.
 *
 * Não é `deleteMany` na fatura inteira nem exclusão de fatura em cascata pelo mesmo motivo.
 */
export async function excluirImportacao(
  prisma: PrismaClient,
  cartaoId: string,
  donoId: string,
  importacaoId: string,
) {
  await carregarCartaoDoDono(prisma, cartaoId, donoId);

  const importacao = await prisma.importBatch.findFirst({
    where: { id: importacaoId, cardId: cartaoId },
    select: { id: true },
  });

  if (!importacao) throw new ErroNaoEncontrado('Importação não encontrada');

  const lancamentos = await prisma.invoiceEntry.findMany({
    where: { importBatchId: importacaoId },
    select: { id: true, invoiceId: true, installmentId: true },
  });

  // Dinheiro que trocou de mãos não se desfaz por aqui. Se alguém já pagou o repasse de um
  // gasto desta importação, apagar o título sumiria com o registro desse pagamento — e a
  // pessoa que pagou ficaria sem prova nenhuma. Cancelar o repasse à mão é o caminho.
  const repassesPagos = await prisma.obligation.count({
    where: {
      originType: 'CARD_ENTRY',
      originId: { in: lancamentos.map((lancamento) => lancamento.id) },
      payments: { some: {} },
    },
  });

  if (repassesPagos > 0) {
    throw new ErroDeRegra(
      'Esta importação tem repasse com pagamento registrado. Estorne o pagamento antes de excluí-la.',
    );
  }

  const faturasAfetadas = [...new Set(lancamentos.map((lancamento) => lancamento.invoiceId))];

  return prisma.$transaction(
    async (tx) => {
      // Os repasses primeiro: eles apontam para os lançamentos por `originId`, que não é
      // chave estrangeira, então nada os apagaria em cascata.
      const { count: repasses } = await tx.obligation.deleteMany({
        where: {
          originType: 'CARD_ENTRY',
          originId: { in: lancamentos.map((lancamento) => lancamento.id) },
        },
      });

      const { count: pagamentos } = await tx.payment.deleteMany({
        where: { importBatchId: importacaoId },
      });

      const { count: removidos } = await tx.invoiceEntry.deleteMany({
        where: { importBatchId: importacaoId },
      });

      // Parcelamento sem nenhuma parcela ficou órfão: ele só existe para agrupar as
      // parcelas, e sozinho apareceria na tela de parcelamentos como uma compra fantasma.
      const parcelamentos = [
        ...new Set(lancamentos.map((lancamento) => lancamento.installmentId).filter(Boolean)),
      ] as string[];

      let parcelamentosRemovidos = 0;

      for (const parcelamentoId of parcelamentos) {
        const restantes = await tx.invoiceEntry.count({ where: { installmentId: parcelamentoId } });

        if (restantes > 0) continue;

        await tx.installment.delete({ where: { id: parcelamentoId } });
        parcelamentosRemovidos += 1;
      }

      // Todas as faturas do cartão, e não só as que perderam lançamento: a fatura que teve
      // o pagamento removido não perdeu linha nenhuma e mesmo assim deixou de estar
      // quitada. São poucas por cartão, e errar para menos aqui deixaria uma fatura
      // marcada como paga sem pagamento.
      const todasAsFaturas = await tx.invoice.findMany({
        where: { cardId: cartaoId },
        select: { id: true },
      });

      let faturasRemovidas = 0;

      for (const fatura of todasAsFaturas) {
        await sincronizarFatura(tx, fatura.id);
      }

      // Fatura que ficou sem nada é resto da importação desfeita, não histórico. Só sai se
      // também não tiver pagamento: um pagamento sem lançamento ainda é dinheiro pago.
      for (const faturaId of faturasAfetadas) {
        const [lancamentosRestantes, obrigacao] = await Promise.all([
          tx.invoiceEntry.count({ where: { invoiceId: faturaId } }),
          tx.obligation.findFirst({
            where: { originType: 'INVOICE', originId: faturaId },
            select: { id: true, _count: { select: { payments: true } } },
          }),
        ]);

        if (lancamentosRestantes > 0 || (obrigacao?._count.payments ?? 0) > 0) continue;

        if (obrigacao) await tx.obligation.delete({ where: { id: obrigacao.id } });
        await tx.invoice.delete({ where: { id: faturaId } });
        faturasRemovidas += 1;
      }

      await tx.importBatch.delete({ where: { id: importacaoId } });

      return {
        lancamentosRemovidos: removidos,
        pagamentosRemovidos: pagamentos,
        repassesRemovidos: repasses,
        parcelamentosRemovidos,
        faturasRemovidas,
      };
    },
    { timeout: 30_000 },
  );
}

/** Quanto ainda falta de um parcelamento, em reais. */
export function restanteDoParcelamento(
  valorDaParcela: string,
  total: number,
  pagas: number,
): string {
  return deCentavos(paraCentavos(valorDaParcela) * Math.max(total - pagas, 0));
}
