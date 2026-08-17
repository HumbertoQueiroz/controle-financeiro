import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  AtualizarCategoria,
  ClassificarEmLote,
  CriarCategoria,
  DefinirLimite,
  Direcao,
} from '@controle/shared';
import { LIMITE_DE_GRUPOS, deCentavos, paraCentavos, somarCentavos } from '@controle/shared';
import { ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';
import { normalizarDescricao } from '../../lib/dedupe.js';
import { fichasDoUsuario } from '../entries/entries.service.js';

const CAMPOS = {
  id: true,
  name: true,
  color: true,
  direction: true,
  archived: true,
  budgets: { where: { month: null }, select: { amount: true } },
} as const;

type CategoriaDoBanco = Prisma.CategoryGetPayload<{ select: typeof CAMPOS }>;

function paraSaida(categoria: CategoriaDoBanco) {
  return {
    id: categoria.id,
    nome: categoria.name,
    cor: categoria.color,
    direcao: categoria.direction as Direcao | null,
    arquivada: categoria.archived,
    // `deCentavos(paraCentavos(...))` e não `toString()`: o Decimal do Prisma devolve
    // '900' para um valor gravado como 900.00, e a tela mostraria os limites em formatos
    // diferentes conforme os centavos do número.
    limite: categoria.budgets[0]
      ? deCentavos(paraCentavos(categoria.budgets[0].amount.toString()))
      : null,
  };
}

export async function listar(prisma: PrismaClient, userId: string, incluirArquivadas = false) {
  const categorias = await prisma.category.findMany({
    where: { ownerId: userId, ...(incluirArquivadas ? {} : { archived: false }) },
    select: CAMPOS,
    orderBy: [{ archived: 'asc' }, { name: 'asc' }],
  });

  return categorias.map(paraSaida);
}

export async function criar(prisma: PrismaClient, userId: string, dados: CriarCategoria) {
  const existente = await prisma.category.findFirst({
    where: { ownerId: userId, name: dados.nome },
    select: { id: true, archived: true },
  });

  if (existente) {
    // Recriar uma categoria arquivada é o que a pessoa quer dizer ao digitar o mesmo nome:
    // desarquivar devolve os lançamentos antigos à mesma classificação, e um erro de nome
    // duplicado só a mandaria procurar onde a categoria se escondeu.
    if (existente.archived) {
      const revivida = await prisma.category.update({
        where: { id: existente.id },
        data: { archived: false, color: dados.cor ?? null, direction: dados.direcao ?? null },
        select: CAMPOS,
      });

      return paraSaida(revivida);
    }

    throw new ErroDeRegra('Já existe uma categoria com esse nome');
  }

  const categoria = await prisma.category.create({
    data: {
      ownerId: userId,
      name: dados.nome,
      color: dados.cor ?? null,
      direction: dados.direcao ?? null,
    },
    select: CAMPOS,
  });

  return paraSaida(categoria);
}

async function carregarDoDono(prisma: PrismaClient, id: string, userId: string) {
  const categoria = await prisma.category.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });

  if (!categoria) {
    throw new ErroNaoEncontrado('Categoria não encontrada');
  }

  return categoria;
}

export async function atualizar(
  prisma: PrismaClient,
  id: string,
  userId: string,
  dados: AtualizarCategoria,
) {
  await carregarDoDono(prisma, id, userId);

  const categoria = await prisma.category.update({
    where: { id },
    data: {
      ...(dados.nome !== undefined && { name: dados.nome }),
      ...(dados.cor !== undefined && { color: dados.cor || null }),
      ...(dados.direcao !== undefined && { direction: dados.direcao }),
      ...(dados.arquivada !== undefined && { archived: dados.arquivada }),
    },
    select: CAMPOS,
  });

  return paraSaida(categoria);
}

/**
 * Arquiva em vez de excluir.
 *
 * Apagar tiraria a classificação dos lançamentos antigos — o `SET NULL` do banco os
 * deixaria sem categoria —, e o relatório do ano passado mudaria retroativamente. Arquivar
 * some das listas de escolha e mantém a história inteira.
 */
export async function arquivar(prisma: PrismaClient, id: string, userId: string) {
  await carregarDoDono(prisma, id, userId);

  await prisma.category.update({ where: { id }, data: { archived: true } });

  return { ok: true };
}

/** Define, altera ou remove o limite — do mês, ou o padrão quando `mes` é ausente. */
export async function definirLimite(
  prisma: PrismaClient,
  id: string,
  userId: string,
  dados: DefinirLimite,
) {
  await carregarDoDono(prisma, id, userId);

  const mes = dados.mes ?? null;

  if (dados.valor === null) {
    await prisma.categoryBudget.deleteMany({ where: { categoryId: id, month: mes } });

    return { ok: true };
  }

  // `upsert` não aceita nulo na chave composta, e o limite padrão é justamente o de mês
  // nulo. Buscar e decidir resolve; a corrida é irrelevante aqui, porque duas gravações
  // simultâneas do mesmo limite acabam no mesmo valor.
  const existente = await prisma.categoryBudget.findFirst({
    where: { categoryId: id, month: mes },
    select: { id: true },
  });

  if (existente) {
    await prisma.categoryBudget.update({
      where: { id: existente.id },
      data: { amount: dados.valor },
    });
  } else {
    await prisma.categoryBudget.create({
      data: { categoryId: id, month: mes, amount: dados.valor },
    });
  }

  return { ok: true };
}

/**
 * Os lançamentos sem categoria, agrupados por descrição.
 *
 * O agrupamento é a funcionalidade: classificar um a um é o que faz ninguém classificar —
 * doze corridas de Uber viram doze decisões idênticas. Pela descrição normalizada, viram
 * uma.
 *
 * A normalização é a mesma da deduplicação de fatura (trim, espaços colapsados, caixa alta):
 * o extrato do banco varia o espaçamento entre exportações, e sem isso "UBER  TRIP" e
 * "UBER TRIP" virariam dois grupos que a pessoa teria de classificar duas vezes.
 */
export async function listarParaClassificar(
  prisma: PrismaClient,
  userId: string,
  filtro: { direcao?: Direcao; mes?: string },
) {
  const idsDasFichas = await fichasDoUsuario(prisma, userId);

  const periodo = filtro.mes
    ? {
        gte: new Date(
          Date.UTC(Number(filtro.mes.slice(0, 4)), Number(filtro.mes.slice(5, 7)) - 1, 1),
        ),
        lt: new Date(Date.UTC(Number(filtro.mes.slice(0, 4)), Number(filtro.mes.slice(5, 7)), 1)),
      }
    : undefined;

  const ondeEstou = filtro.direcao
    ? filtro.direcao === 'RECEIVABLE'
      ? { creditorId: { in: idsDasFichas } }
      : { debtorId: { in: idsDasFichas } }
    : { OR: [{ debtorId: { in: idsDasFichas } }, { creditorId: { in: idsDasFichas } }] };

  const [semCategoria, jaClassificados] = await Promise.all([
    prisma.obligation.findMany({
      where: {
        ...ondeEstou,
        categoryId: null,
        ...(periodo ? { dueDate: periodo } : {}),
        NOT: { status: 'CANCELLED' },
      },
      select: { id: true, description: true, amount: true, dueDate: true, creditorId: true },
      orderBy: { dueDate: 'desc' },
    }),
    // A memória do que já foi decidido: um lançamento igual classificado antes vira a
    // sugestão de agora. É o que faz a tela ser rápida a partir do segundo mês.
    prisma.obligation.findMany({
      where: {
        ...ondeEstou,
        categoryId: { not: null },
        NOT: { status: 'CANCELLED' },
      },
      select: {
        description: true,
        categoryId: true,
        category: { select: { name: true, archived: true } },
      },
      orderBy: { dueDate: 'desc' },
    }),
  ]);

  // Os lançamentos do cartão entram na mesma lista, e não numa tela à parte: para quem
  // classifica, "Uber" é uma decisão só, tenha vindo do extrato ou de um lançamento à mão.
  // Sem eles, a linha "Sem categoria" do relatório teria uma parte que nada nesta tela
  // consegue limpar.
  const lancamentosDeCartao =
    filtro.direcao === 'RECEIVABLE'
      ? []
      : await prisma.invoiceEntry.findMany({
          where: {
            invoice: {
              card: { ownerUserId: userId },
              ...(periodo ? { dueDate: periodo } : {}),
            },
            categoryId: null,
          },
          select: {
            id: true,
            description: true,
            amount: true,
            invoice: { select: { dueDate: true } },
          },
          orderBy: { date: 'desc' },
        });

  // A primeira ocorrência vence porque a lista vem do mais recente: a classificação mais
  // nova é a que reflete a decisão atual de quem classificou.
  const sugestoes = new Map<string, { id: string; nome: string }>();

  for (const obrigacao of jaClassificados) {
    const chave = normalizarDescricao(obrigacao.description);

    // Categoria arquivada não vira sugestão: seria oferecer de volta o que a pessoa
    // deliberadamente tirou das listas.
    if (sugestoes.has(chave) || !obrigacao.categoryId || obrigacao.category?.archived) continue;

    sugestoes.set(chave, { id: obrigacao.categoryId, nome: obrigacao.category!.name });
  }

  const grupos = new Map<
    string,
    {
      descricao: string;
      direcao: Direcao;
      valores: number[];
      ids: string[];
      vencimentos: Date[];
    }
  >();

  for (const obrigacao of semCategoria) {
    const ehReceber = obrigacao.creditorId !== null && idsDasFichas.includes(obrigacao.creditorId);
    const chave = `${ehReceber ? 'R' : 'P'}:${normalizarDescricao(obrigacao.description)}`;
    const atual = grupos.get(chave) ?? {
      // A descrição mostrada é a do mais recente, e não a normalizada: ninguém reconhece
      // "CONTA DE LUZ" tão bem quanto "Conta de luz".
      descricao: obrigacao.description,
      direcao: (ehReceber ? 'RECEIVABLE' : 'PAYABLE') as Direcao,
      valores: [] as number[],
      ids: [] as string[],
      vencimentos: [] as Date[],
    };

    atual.valores.push(paraCentavos(obrigacao.amount.toString()));
    atual.ids.push(obrigacao.id);
    atual.vencimentos.push(obrigacao.dueDate);
    grupos.set(chave, atual);
  }

  for (const lancamento of lancamentosDeCartao) {
    // Compra de cartão é sempre saída — o estorno vem como valor negativo dentro dela.
    const chave = `P:${normalizarDescricao(lancamento.description)}`;
    const atual = grupos.get(chave) ?? {
      descricao: lancamento.description,
      direcao: 'PAYABLE' as Direcao,
      valores: [] as number[],
      ids: [] as string[],
      vencimentos: [] as Date[],
    };

    atual.valores.push(paraCentavos(lancamento.amount.toString()));
    atual.ids.push(lancamento.id);
    atual.vencimentos.push(lancamento.invoice.dueDate);
    grupos.set(chave, atual);
  }

  const lista = [...grupos.entries()]
    .map(([chave, dados]) => {
      const ordenados = [...dados.vencimentos].sort((a, b) => a.getTime() - b.getTime());
      const sugestao = sugestoes.get(chave.slice(2)) ?? null;

      return {
        chave,
        descricao: dados.descricao,
        direcao: dados.direcao,
        quantidade: dados.ids.length,
        total: deCentavos(somarCentavos(dados.valores)),
        primeiroVencimento: ordenados[0]!,
        ultimoVencimento: ordenados[ordenados.length - 1]!,
        lancamentosIds: dados.ids,
        sugestaoCategoriaId: sugestao?.id ?? null,
        sugestaoCategoria: sugestao?.nome ?? null,
      };
    })
    // Os grupos maiores primeiro: são os que mais reduzem a lista a cada decisão.
    .sort((a, b) => b.quantidade - a.quantidade || paraCentavos(b.total) - paraCentavos(a.total));

  return {
    grupos: lista.slice(0, LIMITE_DE_GRUPOS),
    totalDeLancamentos: semCategoria.length + lancamentosDeCartao.length,
    truncado: lista.length > LIMITE_DE_GRUPOS,
  };
}

/**
 * Aplica uma categoria a vários lançamentos de uma vez.
 *
 * `updateMany` com o dono no filtro, e não um laço de `update`: a checagem de posse vira
 * parte da própria escrita, e um id de outra pessoa simplesmente não casa em vez de
 * depender de uma verificação anterior que alguém pode esquecer de fazer.
 */
export async function classificarEmLote(
  prisma: PrismaClient,
  userId: string,
  dados: ClassificarEmLote,
) {
  if (dados.categoriaId) {
    await carregarDoDono(prisma, dados.categoriaId, userId);
  }

  const idsDasFichas = await fichasDoUsuario(prisma, userId);

  // Os ids podem ser de obrigação ou de lançamento de cartão. As duas escritas rodam com o
  // mesmo conjunto: um id existe numa tabela ou na outra, nunca nas duas, então não há
  // ambiguidade a resolver — e a tela não precisa carregar de onde cada linha veio.
  const [obrigacoes, lancamentos] = await Promise.all([
    prisma.obligation.updateMany({
      where: {
        id: { in: dados.lancamentosIds },
        OR: [{ debtorId: { in: idsDasFichas } }, { creditorId: { in: idsDasFichas } }],
      },
      data: { categoryId: dados.categoriaId },
    }),
    prisma.invoiceEntry.updateMany({
      where: {
        id: { in: dados.lancamentosIds },
        invoice: { card: { ownerUserId: userId } },
      },
      data: { categoryId: dados.categoriaId },
    }),
  ]);

  return { classificados: obrigacoes.count + lancamentos.count };
}

/**
 * Quanto entrou ou saiu por categoria no mês, com o limite ao lado.
 *
 * O recorte é o **vencimento**, como no orçamento: a categoria responde "quanto assumi de
 * mercado neste mês", e trocar para a data da baixa faria a conta de agosto paga em
 * setembro sair do mês em que foi assumida.
 */
/**
 * Os lançamentos das faturas do mês, no formato de obrigação, para entrarem no relatório.
 *
 * A obrigação do cartão é a **fatura inteira**, e por isso não responde em que se gastou —
 * ela diria só "mil reais de cartão". Quem sabe disso é a linha do extrato, e é ela que o
 * relatório precisa enxergar.
 *
 * O recorte é o vencimento da fatura, o mesmo da obrigação que ela substitui: a compra de
 * 30 de julho que caiu na fatura de agosto pesa em agosto, que é quando ela será paga.
 */
async function lancamentosDasFaturas(
  prisma: PrismaClient,
  idsDasFichas: string[],
  inicio: Date,
  fim: Date,
  direcao: Direcao,
) {
  // Fatura é sempre dívida de quem tem o cartão; do lado de receber não existe.
  if (direcao === 'RECEIVABLE') return [];

  const faturas = await prisma.obligation.findMany({
    where: {
      debtorId: { in: idsDasFichas },
      originType: 'INVOICE',
      dueDate: { gte: inicio, lt: fim },
      NOT: { status: 'CANCELLED' },
    },
    select: { originId: true, status: true },
  });

  if (faturas.length === 0) return [];

  const quitadas = new Set(
    faturas.filter((fatura) => fatura.status === 'SETTLED').map((fatura) => fatura.originId),
  );

  const lancamentos = await prisma.invoiceEntry.findMany({
    where: { invoiceId: { in: faturas.map((fatura) => fatura.originId!) } },
    select: {
      invoiceId: true,
      amount: true,
      categoryId: true,
      category: { select: { name: true, color: true } },
    },
  });

  return lancamentos.map((lancamento) => ({
    amount: lancamento.amount,
    // Ninguém paga uma linha da fatura: ou a fatura foi quitada, e aí tudo que está nela
    // foi pago, ou não. Ratear um pagamento parcial entre as compras inventaria uma
    // precisão que não existe no extrato.
    settledAmount: quitadas.has(lancamento.invoiceId) ? lancamento.amount : new Prisma.Decimal(0),
    categoryId: lancamento.categoryId,
    category: lancamento.category,
  }));
}

export async function relatorioPorCategoria(
  prisma: PrismaClient,
  userId: string,
  mes: string,
  direcao: Direcao,
) {
  const idsDasFichas = await fichasDoUsuario(prisma, userId);
  const inicio = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1));
  const fim = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1));

  const [obrigacoes, categorias] = await Promise.all([
    prisma.obligation.findMany({
      where: {
        ...(direcao === 'RECEIVABLE'
          ? { creditorId: { in: idsDasFichas } }
          : { debtorId: { in: idsDasFichas } }),
        dueDate: { gte: inicio, lt: fim },
        // A obrigação da fatura fica de fora, e entra pelos lançamentos dela logo abaixo.
        // Ela é o agregado do cartão inteiro: contar as duas coisas somaria o mês duas
        // vezes, e contar só ela daria uma linha de "sem categoria" do tamanho da fatura.
        NOT: [{ status: 'CANCELLED' }, { originType: 'INVOICE' }],
      },
      select: {
        amount: true,
        settledAmount: true,
        categoryId: true,
        category: { select: { name: true, color: true } },
      },
    }),
    prisma.category.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        // O limite do mês tem precedência sobre o padrão. Buscar os dois e escolher aqui
        // evita duas consultas e mantém a regra num lugar só.
        budgets: {
          where: { OR: [{ month: mes }, { month: null }] },
          select: { month: true, amount: true },
        },
      },
    }),
  ]);

  const limitePorCategoria = new Map(
    categorias.map((categoria) => {
      const doMes = categoria.budgets.find((limite) => limite.month === mes);
      const padrao = categoria.budgets.find((limite) => limite.month === null);

      const vigente = doMes ?? padrao;

      return [categoria.id, vigente ? deCentavos(paraCentavos(vigente.amount.toString())) : null];
    }),
  );

  const agrupado = new Map<
    string | null,
    { nome: string; cor: string | null; previsto: number[]; realizado: number[] }
  >();

  const lancamentosDoCartao = await lancamentosDasFaturas(
    prisma,
    idsDasFichas,
    inicio,
    fim,
    direcao,
  );

  for (const obrigacao of [...obrigacoes, ...lancamentosDoCartao]) {
    const chave = obrigacao.categoryId;
    const atual = agrupado.get(chave) ?? {
      // Sem categoria é uma linha de verdade, e não uma omissão: é ela que mostra quanto
      // do mês ainda não foi classificado, e some sozinha quando tudo estiver.
      nome: obrigacao.category?.name ?? 'Sem categoria',
      cor: obrigacao.category?.color ?? null,
      previsto: [],
      realizado: [],
    };

    atual.previsto.push(paraCentavos(obrigacao.amount.toString()));
    atual.realizado.push(paraCentavos(obrigacao.settledAmount.toString()));
    agrupado.set(chave, atual);
  }

  const linhas = [...agrupado.entries()]
    .map(([categoriaId, dados]) => {
      const previsto = somarCentavos(dados.previsto);
      const limite = categoriaId ? limitePorCategoria.get(categoriaId) : null;

      return {
        categoriaId,
        nome: dados.nome,
        cor: dados.cor,
        previsto: deCentavos(previsto),
        realizado: deCentavos(somarCentavos(dados.realizado)),
        limite: limite ?? null,
        consumo: limite ? previsto / paraCentavos(limite) : null,
      };
    })
    .sort((a, b) => paraCentavos(b.previsto) - paraCentavos(a.previsto));

  return {
    mes,
    direcao,
    total: deCentavos(somarCentavos(linhas.map((linha) => paraCentavos(linha.previsto)))),
    linhas,
  };
}
