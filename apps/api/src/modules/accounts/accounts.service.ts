import type { PrismaClient } from '@prisma/client';
import type { AtualizarConta, CriarConta } from '@controle/shared';
import { deCentavos, paraCentavos, somarCentavos } from '@controle/shared';
import { ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';
import { fichasDoUsuario } from '../entries/entries.service.js';

/**
 * Contas com saldo calculado.
 *
 * O saldo **não** é coluna: é `initialBalance` mais os pagamentos que entraram, menos os
 * que saíram. Guardar o número faria ele divergir do extrato no primeiro estorno, e a
 * divergência só apareceria quando alguém conferisse — tarde demais para saber o que
 * aconteceu.
 *
 * Entram só pagamentos **confirmados**: um pagamento que o devedor declarou e ninguém
 * reconheceu não moveu dinheiro nenhum, e somá-lo ao saldo mostraria na conta um valor que
 * o banco não tem.
 */
export async function listar(prisma: PrismaClient, userId: string, incluirArquivadas = false) {
  const idsDasFichas = await fichasDoUsuario(prisma, userId);

  const contas = await prisma.bankAccount.findMany({
    where: { ownerId: userId, ...(incluirArquivadas ? {} : { archived: false }) },
    orderBy: [{ archived: 'asc' }, { name: 'asc' }],
  });

  const pagamentos = await prisma.payment.findMany({
    where: {
      accountId: { in: contas.map((conta) => conta.id) },
      confirmed: true,
      // Desconto abate a dívida, mas não passou pelo banco. Somá-lo aqui faria conceder um
      // desconto tirar dinheiro do saldo, como se ele tivesse sido pago.
      adjustment: false,
    },
    select: {
      accountId: true,
      amount: true,
      obligation: { select: { creditorId: true } },
    },
  });

  const movimento = new Map<string, { entradas: number[]; saidas: number[] }>();

  for (const pagamento of pagamentos) {
    if (!pagamento.accountId) continue;

    const atual = movimento.get(pagamento.accountId) ?? { entradas: [], saidas: [] };
    const valor = paraCentavos(pagamento.amount.toString());

    // O lado da obrigação define o sentido: pagar um título em que eu sou o credor é
    // dinheiro entrando; pagar um em que sou o devedor é dinheiro saindo.
    const ehEntrada =
      pagamento.obligation.creditorId !== null &&
      idsDasFichas.includes(pagamento.obligation.creditorId);

    if (ehEntrada) atual.entradas.push(valor);
    else atual.saidas.push(valor);

    movimento.set(pagamento.accountId, atual);
  }

  const saida = contas.map((conta) => {
    const { entradas = [], saidas = [] } = movimento.get(conta.id) ?? {};
    const totalEntradas = somarCentavos(entradas);
    const totalSaidas = somarCentavos(saidas);

    return {
      id: conta.id,
      nome: conta.name,
      tipo: conta.kind,
      saldoInicial: conta.initialBalance.toString(),
      arquivada: conta.archived,
      saldo: deCentavos(
        paraCentavos(conta.initialBalance.toString()) + totalEntradas - totalSaidas,
      ),
      entradas: deCentavos(totalEntradas),
      saidas: deCentavos(totalSaidas),
    };
  });

  return {
    contas: saida,
    // O total ignora as arquivadas quando elas não foram pedidas, o que é o comportamento
    // certo: uma conta encerrada com saldo residual não é dinheiro disponível.
    total: deCentavos(
      somarCentavos(
        saida.filter((conta) => !conta.arquivada).map((conta) => paraCentavos(conta.saldo)),
      ),
    ),
  };
}

export async function criar(prisma: PrismaClient, userId: string, dados: CriarConta) {
  const existente = await prisma.bankAccount.findFirst({
    where: { ownerId: userId, name: dados.nome },
    select: { id: true },
  });

  if (existente) {
    throw new ErroDeRegra('Já existe uma conta com esse nome');
  }

  const conta = await prisma.bankAccount.create({
    data: {
      ownerId: userId,
      name: dados.nome,
      kind: dados.tipo,
      initialBalance: dados.saldoInicial,
    },
  });

  return { id: conta.id };
}

export async function atualizar(
  prisma: PrismaClient,
  id: string,
  userId: string,
  dados: AtualizarConta,
) {
  const conta = await prisma.bankAccount.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });

  if (!conta) {
    throw new ErroNaoEncontrado('Conta não encontrada');
  }

  await prisma.bankAccount.update({
    where: { id },
    data: {
      ...(dados.nome !== undefined && { name: dados.nome }),
      ...(dados.tipo !== undefined && { kind: dados.tipo }),
      ...(dados.saldoInicial !== undefined && { initialBalance: dados.saldoInicial }),
      ...(dados.arquivada !== undefined && { archived: dados.arquivada }),
    },
  });

  return { ok: true };
}

/** Verifica que a conta é do usuário antes de amarrá-la a um pagamento. */
export async function garantirContaDoUsuario(
  prisma: PrismaClient,
  contaId: string,
  userId: string,
) {
  const conta = await prisma.bankAccount.findFirst({
    where: { id: contaId, ownerId: userId },
    select: { id: true },
  });

  if (!conta) {
    throw new ErroNaoEncontrado('Conta não encontrada');
  }

  return conta;
}
