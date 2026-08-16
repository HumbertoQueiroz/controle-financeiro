import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { limparBanco, prismaDeTeste as prisma } from './db.js';

/**
 * Estas garantias vivem no SQL da migration, não no schema.prisma — o Prisma não sabe
 * declarar índice parcial nem CHECK. Sem teste, elas somem numa migration futura e
 * ninguém percebe até o saldo de alguém fechar errado.
 */

async function criarUsuarioComPessoa(nome: string, email: string) {
  const usuario = await prisma.user.create({
    data: { name: nome, email, passwordHash: 'hash-irrelevante-para-este-teste' },
  });

  const pessoa = await prisma.person.create({
    data: { name: nome, email, ownerId: usuario.id, userId: usuario.id },
  });

  return { usuario, pessoa };
}

beforeEach(limparBanco);
afterAll(() => prisma.$disconnect());

describe('garantias do banco', () => {
  it('permite só um convite pendente por dono e e-mail, ignorando a caixa', async () => {
    const { usuario } = await criarUsuarioComPessoa('Dono', 'dono@exemplo.com');

    const base = {
      ownerId: usuario.id,
      scope: 'BOTH' as const,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    };

    await prisma.reportInvite.create({
      data: { ...base, email: 'convidado@exemplo.com', tokenHash: 'hash-1' },
    });

    // Dois cliques no botão convidar não podem virar dois convites válidos: revogar um
    // deixaria o outro de pé, e o dono acharia que tirou o acesso.
    await expect(
      prisma.reportInvite.create({
        data: { ...base, email: 'Convidado@Exemplo.com', tokenHash: 'hash-2' },
      }),
    ).rejects.toThrow();
  });

  it('libera novo convite depois que o anterior deixa de estar pendente', async () => {
    const { usuario } = await criarUsuarioComPessoa('Dono', 'dono@exemplo.com');

    const base = {
      ownerId: usuario.id,
      scope: 'BOTH' as const,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      email: 'convidado@exemplo.com',
    };

    const primeiro = await prisma.reportInvite.create({ data: { ...base, tokenHash: 'hash-1' } });
    await prisma.reportInvite.update({
      where: { id: primeiro.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    // O índice é PARCIAL justamente para isto: um unique comum impediria convidar de novo
    // quem já teve o convite revogado ou expirado.
    await expect(
      prisma.reportInvite.create({ data: { ...base, tokenHash: 'hash-2' } }),
    ).resolves.toBeDefined();
  });

  it('recusa obrigação com valor negativo', async () => {
    const { pessoa } = await criarUsuarioComPessoa('Devedor', 'devedor@exemplo.com');

    // "deve -50" é uma forma silenciosa de inverter credor e devedor.
    await expect(
      prisma.obligation.create({
        data: {
          debtorId: pessoa.id,
          description: 'valor negativo',
          amount: -50,
          dueDate: new Date(),
          paymentMethod: 'CASH',
          originType: 'MANUAL',
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa liquidado maior que o valor da obrigação', async () => {
    const { pessoa } = await criarUsuarioComPessoa('Devedor', 'devedor@exemplo.com');

    await expect(
      prisma.obligation.create({
        data: {
          debtorId: pessoa.id,
          description: 'pagou mais do que devia',
          amount: 100,
          settledAmount: 150,
          dueDate: new Date(),
          paymentMethod: 'CASH',
          originType: 'MANUAL',
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa obrigação de alguém consigo mesmo', async () => {
    const { pessoa } = await criarUsuarioComPessoa('Sozinho', 'sozinho@exemplo.com');

    // Sai de rateio mal montado e produz saldo que nunca zera no fechamento.
    await expect(
      prisma.obligation.create({
        data: {
          debtorId: pessoa.id,
          creditorId: pessoa.id,
          description: 'deve a si mesmo',
          amount: 10,
          dueDate: new Date(),
          paymentMethod: 'CASH',
          originType: 'GROUP_EXPENSE',
        },
      }),
    ).rejects.toThrow();
  });

  it('recusa mês de referência fora do formato YYYY-MM', async () => {
    const { usuario } = await criarUsuarioComPessoa('Dono', 'dono@exemplo.com');
    const cartao = await prisma.creditCard.create({
      data: { ownerUserId: usuario.id, name: 'Cartão', closingDay: 5, dueDay: 12 },
    });

    await expect(
      prisma.invoice.create({
        data: {
          cardId: cartao.id,
          referenceMonth: '2026-13',
          closingDate: new Date(),
          dueDate: new Date(),
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.invoice.create({
        data: {
          cardId: cartao.id,
          referenceMonth: '2026-08',
          closingDate: new Date(),
          dueDate: new Date(),
        },
      }),
    ).resolves.toBeDefined();
  });

  it('recusa dia de fechamento inexistente no calendário', async () => {
    const { usuario } = await criarUsuarioComPessoa('Dono', 'dono@exemplo.com');

    await expect(
      prisma.creditCard.create({
        data: { ownerUserId: usuario.id, name: 'Cartão', closingDay: 45, dueDay: 12 },
      }),
    ).rejects.toThrow();
  });

  it('impede dois lançamentos idênticos na mesma fatura', async () => {
    const { usuario } = await criarUsuarioComPessoa('Dono', 'dono@exemplo.com');
    const cartao = await prisma.creditCard.create({
      data: { ownerUserId: usuario.id, name: 'Cartão', closingDay: 5, dueDay: 12 },
    });
    const fatura = await prisma.invoice.create({
      data: {
        cardId: cartao.id,
        referenceMonth: '2026-08',
        closingDate: new Date(),
        dueDate: new Date(),
      },
    });

    const lancamento = {
      invoiceId: fatura.id,
      date: new Date('2026-08-03'),
      description: 'MERCADO',
      amount: 120.5,
      dedupeHash: 'hash-estavel-da-linha',
    };

    await prisma.invoiceEntry.create({ data: lancamento });

    // É esta restrição que sustenta a reimportação idempotente da fatura. Ela precisa
    // estar no banco: checar-antes-de-inserir no código tem race condition.
    await expect(prisma.invoiceEntry.create({ data: lancamento })).rejects.toThrow();
  });
});
