import type { PrismaClient } from '@prisma/client';
import type { Aviso, ConfirmarLeitura } from '@controle/shared';
import {
  DIAS_DE_AVISO_DE_VENCIMENTO,
  GRAVIDADE_DO_AVISO,
  deCentavos,
  formatarValor,
  paraCentavos,
} from '@controle/shared';
import { fichasDoUsuario } from '../entries/entries.service.js';
import { mesPendenteDaAgenda } from '../entries/agenda.service.js';

/** Só a data importa: comparar com o instante atual excluiria o que vence hoje mais cedo. */
function hojeUTC(agora: Date): Date {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
}

/**
 * Os avisos do usuário, calculados na hora.
 *
 * Não há tabela de notificação: derivar garante que o aviso suma sozinho quando a causa
 * deixa de existir. Uma tabela exigiria gerar, entregar, marcar como lida e limpar o que
 * ficou para trás — quatro problemas para responder a uma pergunta que o banco já sabe.
 */
export async function listarAvisos(prisma: PrismaClient, userId: string, agora = new Date()) {
  const idsDasFichas = await fichasDoUsuario(prisma, userId);
  const hoje = hojeUTC(agora);
  const limite = new Date(hoje);
  limite.setUTCDate(limite.getUTCDate() + DIAS_DE_AVISO_DE_VENCIMENTO);

  const mesCorrente = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, '0')}`;

  const [aVencer, aguardando, categorias, agendas] = await Promise.all([
    prisma.obligation.findMany({
      where: {
        debtorId: { in: idsDasFichas },
        status: { in: ['OPEN', 'PARTIAL'] },
        dueDate: { lt: limite },
      },
      select: { id: true, description: true, amount: true, settledAmount: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    }),
    // Pagamento pendente só interessa a quem recebe: quem declarou já sabe que declarou.
    prisma.payment.findMany({
      where: { confirmed: false, obligation: { creditorId: { in: idsDasFichas } } },
      select: {
        id: true,
        amount: true,
        obligation: { select: { id: true, description: true, creditorId: true } },
      },
    }),
    prisma.category.findMany({
      where: { ownerId: userId, archived: false, budgets: { some: {} } },
      select: {
        id: true,
        name: true,
        budgets: {
          where: { OR: [{ month: mesCorrente }, { month: null }] },
          select: { month: true, amount: true },
        },
      },
    }),
    prisma.settlementSchedule.findMany({
      where: { ownerId: userId, active: true },
      select: {
        personId: true,
        dayOfMonth: true,
        lastMonth: true,
        person: { select: { name: true } },
      },
    }),
  ]);

  // Sem `lido` ainda: a leitura é resolvida depois, de uma vez, contra o que foi confirmado.
  const itens: Omit<Aviso, 'lido'>[] = [];

  for (const obrigacao of aVencer) {
    const restante =
      paraCentavos(obrigacao.amount.toString()) - paraCentavos(obrigacao.settledAmount.toString());

    if (restante <= 0) continue;

    const atrasado = obrigacao.dueDate < hoje;

    itens.push({
      id: `venc-${obrigacao.id}`,
      tipo: atrasado ? 'ATRASADO' : 'VENCE_EM_BREVE',
      titulo: obrigacao.description,
      detalhe: atrasado
        ? `Venceu em ${obrigacao.dueDate.toISOString().slice(0, 10).split('-').reverse().join('/')}`
        : `Vence em ${obrigacao.dueDate.toISOString().slice(0, 10).split('-').reverse().join('/')}`,
      link: '/app/a-pagar',
      valor: deCentavos(restante),
    });
  }

  for (const pagamento of aguardando) {
    itens.push({
      id: `conf-${pagamento.id}`,
      tipo: 'CONFIRMAR_PAGAMENTO',
      titulo: pagamento.obligation.description,
      detalhe: 'Alguém informou que pagou e aguarda sua confirmação',
      link: '/app/a-receber',
      valor: pagamento.amount.toString(),
    });
  }

  // O estouro é do mês corrente: avisar sobre meses passados seria cobrar uma decisão que
  // já não pode ser tomada.
  const gastoPorCategoria = await prisma.obligation.groupBy({
    by: ['categoryId'],
    where: {
      debtorId: { in: idsDasFichas },
      categoryId: { in: categorias.map((categoria) => categoria.id) },
      dueDate: {
        gte: new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)),
        lt: new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1)),
      },
      NOT: { status: 'CANCELLED' },
    },
    _sum: { amount: true },
  });

  for (const categoria of categorias) {
    const doMes = categoria.budgets.find((limite) => limite.month === mesCorrente);
    const padrao = categoria.budgets.find((limite) => limite.month === null);
    const limiteVigente = (doMes ?? padrao)?.amount;

    if (!limiteVigente) continue;

    const gasto = gastoPorCategoria.find((linha) => linha.categoryId === categoria.id);
    const total = paraCentavos((gasto?._sum.amount ?? 0).toString());
    const teto = paraCentavos(limiteVigente.toString());

    if (total <= teto) continue;

    itens.push({
      id: `limite-${categoria.id}-${mesCorrente}`,
      tipo: 'LIMITE_ESTOURADO',
      titulo: categoria.name,
      detalhe: `Passou do limite de ${formatarValor(limiteVigente.toString())} neste mês`,
      link: '/app/categorias',
      valor: deCentavos(total - teto),
    });
  }

  for (const agenda of agendas) {
    const pendente = mesPendenteDaAgenda(agenda, hoje);

    if (!pendente) continue;

    itens.push({
      id: `fech-${agenda.personId}-${pendente}`,
      tipo: 'FECHAMENTO_PENDENTE',
      titulo: `Fechamento com ${agenda.person.name}`,
      detalhe: `O acerto de ${pendente} está pronto para ser conferido`,
      link: `/app/pessoas/${agenda.personId}/fechamento`,
      valor: null,
    });
  }

  // Alta gravidade primeiro: o contador vermelho conta esses, e a lista precisa começar
  // por eles para o primeiro item da tela ser o que exige ação hoje.
  itens.sort((a, b) => {
    const peso = (aviso: Pick<Aviso, 'tipo'>) =>
      GRAVIDADE_DO_AVISO[aviso.tipo] === 'alta' ? 0 : 1;

    return peso(a) - peso(b);
  });

  // A leitura é comparada pela **assinatura**, e não só pelo id: se o motivo do aviso mudou
  // desde a confirmação, ele volta a valer como não lido. É o que impede um "já vi" de
  // virar um silenciador permanente de um problema que se transformou noutro.
  const leituras = await prisma.noticeRead.findMany({
    where: { userId, noticeId: { in: itens.map((aviso) => aviso.id) } },
    select: { noticeId: true, assinatura: true },
  });

  const lidos = new Map(leituras.map((leitura) => [leitura.noticeId, leitura.assinatura]));

  const marcados = itens.map((aviso) => ({
    ...aviso,
    lido: lidos.get(aviso.id) === assinaturaDoAviso(aviso),
  }));

  const naoLidos = marcados.filter((aviso) => !aviso.lido);

  return {
    itens: naoLidos,
    lidos: marcados.filter((aviso) => aviso.lido),
    urgentes: naoLidos.filter((aviso) => GRAVIDADE_DO_AVISO[aviso.tipo] === 'alta').length,
  };
}

/**
 * O resumo do estado do aviso, para detectar que ele mudou desde a confirmação.
 *
 * Título de fora: ele é o nome do lançamento e muda com uma correção de digitação, o que
 * ressuscitaria o aviso sem motivo. O que importa é o **detalhe** (a data, a razão) e o
 * **valor** — mudou um dos dois, mudou o problema.
 */
function assinaturaDoAviso(aviso: Pick<Aviso, 'detalhe' | 'valor'>): string {
  return `${aviso.detalhe}|${aviso.valor ?? ''}`;
}

/**
 * Confirma a leitura de avisos.
 *
 * Sem `createMany` com `skipDuplicates`: reconfirmar precisa **sobrescrever** a assinatura,
 * senão o aviso que mudou e voltou continuaria batendo com a leitura antiga e sumiria de
 * novo. Um `upsert` por aviso é o caminho, e a lista aqui é curta por natureza.
 */
export async function confirmarLeitura(
  prisma: PrismaClient,
  userId: string,
  dados: ConfirmarLeitura,
  agora = new Date(),
) {
  const { itens } = await listarAvisos(prisma, userId, agora);

  // Só confirma o que de fato está na tela: um id inventado, ou de um aviso que deixou de
  // existir, não deve criar leitura para um aviso que ninguém viu.
  const alvos = dados.todos ? itens : itens.filter((aviso) => dados.avisoIds?.includes(aviso.id));

  for (const aviso of alvos) {
    const assinatura = assinaturaDoAviso(aviso);

    await prisma.noticeRead.upsert({
      where: { userId_noticeId: { userId, noticeId: aviso.id } },
      create: { userId, noticeId: aviso.id, assinatura },
      update: { assinatura, readAt: agora },
    });
  }

  return { confirmados: alvos.length };
}

/**
 * Apaga a confirmação, devolvendo o aviso à lista ativa.
 *
 * Existe porque confirmar leitura é um clique fácil de dar sem querer, e sem o caminho de
 * volta a única saída seria esperar o motivo do aviso mudar sozinho.
 */
export async function desfazerLeitura(prisma: PrismaClient, userId: string, avisoId: string) {
  await prisma.noticeRead.deleteMany({ where: { userId, noticeId: avisoId } });

  return { ok: true };
}
