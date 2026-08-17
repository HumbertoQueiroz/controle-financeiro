-- Categoria, orçamento por categoria, conta bancária e histórico de fechamento.
--
-- Tudo opcional sobre o que já existe: `Obligation.categoryId` e `Payment.accountId` são
-- nulos, e nenhum lançamento antigo precisa ser reclassificado para o sistema seguir
-- funcionando. Uma coluna obrigatória exigiria inventar uma categoria "Sem categoria" e
-- carimbá-la em tudo, o que é o mesmo que nulo com mais trabalho e menos honestidade.

CREATE TYPE "AccountKind" AS ENUM ('CHECKING', 'SAVINGS', 'WALLET', 'MEAL_VOUCHER');

CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "direction" "Direction",
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_ownerId_name_key" ON "Category"("ownerId", "name");
CREATE INDEX "Category_ownerId_archived_idx" ON "Category"("ownerId", "archived");

ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CategoryBudget" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    -- Nulo é o limite padrão, que vale para todo mês sem ajuste próprio.
    "month" CHAR(7),
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryBudget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryBudget_categoryId_month_key" ON "CategoryBudget"("categoryId", "month");

ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Um limite negativo não quer dizer nada, e zero seria "não pode gastar", que se expressa
-- não criando o limite. O banco recusa os dois em vez de deixar a tela lidar com eles.
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_valor_positivo" CHECK ("amount" > 0);

CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL DEFAULT 'CHECKING',
    "initialBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankAccount_ownerId_name_key" ON "BankAccount"("ownerId", "name");
CREATE INDEX "BankAccount_ownerId_archived_idx" ON "BankAccount"("ownerId", "archived");

ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ParticipantSettlement" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "month" CHAR(7) NOT NULL,
    "totalReceivable" DECIMAL(14,2) NOT NULL,
    "totalPayable" DECIMAL(14,2) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "adjustmentId" TEXT,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipantSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParticipantSettlement_ownerId_number_key" ON "ParticipantSettlement"("ownerId", "number");
CREATE INDEX "ParticipantSettlement_ownerId_personId_month_idx" ON "ParticipantSettlement"("ownerId", "personId", "month");

ALTER TABLE "ParticipantSettlement" ADD CONSTRAINT "ParticipantSettlement_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipantSettlement" ADD CONSTRAINT "ParticipantSettlement_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ParticipantSettlementEntry" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    -- Descrição e valor são CÓPIAS: o título pode ser editado depois, e o papel assinado
    -- precisa continuar batendo com o que foi assinado.
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "receivable" BOOLEAN NOT NULL,

    CONSTRAINT "ParticipantSettlementEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParticipantSettlementEntry_settlementId_idx" ON "ParticipantSettlementEntry"("settlementId");

ALTER TABLE "ParticipantSettlementEntry" ADD CONSTRAINT "ParticipantSettlementEntry_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "ParticipantSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SettlementSchedule" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastMonth" CHAR(7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SettlementSchedule_personId_key" ON "SettlementSchedule"("personId");
CREATE INDEX "SettlementSchedule_ownerId_active_idx" ON "SettlementSchedule"("ownerId", "active");

ALTER TABLE "SettlementSchedule" ADD CONSTRAINT "SettlementSchedule_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementSchedule" ADD CONSTRAINT "SettlementSchedule_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SettlementSchedule" ADD CONSTRAINT "SettlementSchedule_dia_valido"
    CHECK ("dayOfMonth" BETWEEN 1 AND 31);

-- Classificação e conta nos registros existentes: nulos, e SET NULL ao apagar o pai.
-- Apagar a categoria não pode levar o lançamento junto — o gasto aconteceu.
ALTER TABLE "Obligation" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Obligation_categoryId_dueDate_idx" ON "Obligation"("categoryId", "dueDate");

ALTER TABLE "Recurrence" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "accountId" TEXT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Payment_accountId_paidAt_idx" ON "Payment"("accountId", "paidAt");
