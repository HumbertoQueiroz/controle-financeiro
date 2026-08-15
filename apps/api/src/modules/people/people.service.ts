import type { PrismaClient } from '@prisma/client';
import type { AtualizarPessoa, CriarPessoa } from '@controle/shared';
import { normalizarEmail } from '../../lib/email.js';
import { ErroDeConflito, ErroDeRegra, ErroNaoEncontrado } from '../../lib/erros.js';

interface PessoaDoBanco {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  userId: string | null;
}

function paraSaida(pessoa: PessoaDoBanco, donoId: string) {
  return {
    id: pessoa.id,
    nome: pessoa.name,
    email: pessoa.email,
    telefone: pessoa.phone,
    usuarioId: pessoa.userId,
    // A Person espelho do próprio dono é a identidade dele nas obrigações. Apagá-la ou
    // renomeá-la deixaria o usuário sem contraparte e quebraria os saldos onde ele aparece.
    editavel: pessoa.userId !== donoId,
  };
}

/**
 * Carrega uma pessoa garantindo que ela pertence a quem pediu.
 *
 * Devolve 404 e não 403 quando é de outro dono: responder "existe, mas não é sua" permite
 * varrer ids para descobrir quem está cadastrado no sistema.
 */
async function carregarDoDono(prisma: PrismaClient, id: string, donoId: string) {
  const pessoa = await prisma.person.findFirst({
    where: { id, ownerId: donoId },
    select: { id: true, name: true, email: true, phone: true, userId: true },
  });

  if (!pessoa) {
    throw new ErroNaoEncontrado('Pessoa não encontrada');
  }

  return pessoa;
}

export async function listar(prisma: PrismaClient, donoId: string) {
  const pessoas = await prisma.person.findMany({
    where: { ownerId: donoId, anonymizedAt: null },
    select: { id: true, name: true, email: true, phone: true, userId: true },
    orderBy: { name: 'asc' },
  });

  return pessoas.map((pessoa) => paraSaida(pessoa, donoId));
}

export async function criar(prisma: PrismaClient, donoId: string, dados: CriarPessoa) {
  const email = dados.email ? normalizarEmail(dados.email) : null;

  if (email) {
    const jaExiste = await prisma.person.findFirst({
      where: { ownerId: donoId, email, anonymizedAt: null },
      select: { id: true },
    });

    // Duas pessoas com o mesmo e-mail na mesma agenda tornam ambíguo a quem uma dívida
    // pertence, e o convite não saberia qual delas vincular.
    if (jaExiste) {
      throw new ErroDeConflito('Você já tem alguém cadastrado com este e-mail');
    }
  }

  const pessoa = await prisma.person.create({
    data: { name: dados.nome, email, phone: dados.telefone || null, ownerId: donoId },
    select: { id: true, name: true, email: true, phone: true, userId: true },
  });

  return paraSaida(pessoa, donoId);
}

export async function atualizar(
  prisma: PrismaClient,
  id: string,
  donoId: string,
  dados: AtualizarPessoa,
) {
  const existente = await carregarDoDono(prisma, id, donoId);

  if (existente.userId === donoId) {
    throw new ErroDeRegra('Edite seus próprios dados pelo perfil');
  }

  const pessoa = await prisma.person.update({
    where: { id },
    data: {
      ...(dados.nome !== undefined && { name: dados.nome }),
      ...(dados.email !== undefined && {
        email: dados.email ? normalizarEmail(dados.email) : null,
      }),
      ...(dados.telefone !== undefined && { phone: dados.telefone || null }),
    },
    select: { id: true, name: true, email: true, phone: true, userId: true },
  });

  return paraSaida(pessoa, donoId);
}

/**
 * Exclui a pessoa, ou a anonimiza quando ela é parte de alguma obrigação.
 *
 * Apagar de verdade quem já aparece num saldo faria o outro lado deixar de ter o valor a
 * receber sem ninguém ter pago — o mesmo motivo pelo qual a exclusão de conta anonimiza.
 * Quando não há obrigação nenhuma, não há saldo para proteger e o registro sai inteiro,
 * que é o que o direito de exclusão pede.
 */
export async function excluir(prisma: PrismaClient, id: string, donoId: string) {
  const pessoa = await carregarDoDono(prisma, id, donoId);

  if (pessoa.userId === donoId) {
    throw new ErroDeRegra('Você não pode excluir a si mesmo da lista de pessoas');
  }

  const temObrigacoes = await prisma.obligation.count({
    where: { OR: [{ debtorId: id }, { creditorId: id }] },
  });

  if (temObrigacoes > 0) {
    await prisma.person.update({
      where: { id },
      data: {
        name: 'Pessoa excluída',
        email: null,
        phone: null,
        userId: null,
        anonymizedAt: new Date(),
      },
    });

    return { anonimizada: true };
  }

  await prisma.person.delete({ where: { id } });

  return { anonimizada: false };
}

/**
 * Vincula uma pessoa da agenda a uma conta existente.
 *
 * O vínculo é sempre iniciado pelo dono, nunca automático por coincidência de e-mail. Não
 * há verificação de e-mail no cadastro: alguém que criasse conta com o e-mail de outra
 * pessoa herdaria as dívidas lançadas em nome dela e passaria a enxergá-las. O caminho
 * seguro para o convidado assumir a própria ficha é o convite, onde quem escolhe a pessoa
 * é o dono.
 */
export async function vincularUsuario(
  prisma: PrismaClient,
  id: string,
  donoId: string,
  email: string,
) {
  const pessoa = await carregarDoDono(prisma, id, donoId);

  if (pessoa.userId) {
    throw new ErroDeConflito('Esta pessoa já está vinculada a uma conta');
  }

  const usuario = await prisma.user.findUnique({
    where: { email: normalizarEmail(email) },
    select: { id: true, active: true, anonymizedAt: true },
  });

  if (!usuario || !usuario.active || usuario.anonymizedAt) {
    throw new ErroNaoEncontrado('Não existe conta ativa com este e-mail');
  }

  const jaVinculada = await prisma.person.findFirst({
    where: { ownerId: donoId, userId: usuario.id },
    select: { id: true },
  });

  // Duas pessoas da mesma agenda apontando para a mesma conta duplicariam o que aquela
  // conta deve, e o saldo dela apareceria dobrado.
  if (jaVinculada) {
    throw new ErroDeConflito('Você já tem outra pessoa vinculada a esta conta');
  }

  const atualizada = await prisma.person.update({
    where: { id },
    data: { userId: usuario.id },
    select: { id: true, name: true, email: true, phone: true, userId: true },
  });

  return paraSaida(atualizada, donoId);
}

export async function desvincularUsuario(prisma: PrismaClient, id: string, donoId: string) {
  const pessoa = await carregarDoDono(prisma, id, donoId);

  if (pessoa.userId === donoId) {
    throw new ErroDeRegra('Você não pode desvincular a si mesmo');
  }

  const atualizada = await prisma.person.update({
    where: { id },
    data: { userId: null },
    select: { id: true, name: true, email: true, phone: true, userId: true },
  });

  return paraSaida(atualizada, donoId);
}
