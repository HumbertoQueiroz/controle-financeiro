-- Duas datas em todo lancamento, contraparte livre, e recorrencia.
--
-- 1) settledAt: a data da BAIXA, separada do vencimento.
--    Com uma data so, uma conta vencida em agosto e paga em setembro obrigaria a escolher
--    entre aparecer no orcamento de agosto ou no caixa de setembro — e as duas leituras
--    sao verdadeiras. Separando, "previsto" sai de dueDate e "realizado" de settledAt.
--
-- 2) debtorId passa a aceitar nulo e ganha counterpartyLabel.
--    O salario nao tem devedor cadastrado: quem paga e o empregador. Exigir que ele vire
--    uma Person so para lancar a receita seria atrito sem ganho. O CHECK abaixo garante
--    que ao menos um dos lados exista, para nao nascer obrigacao sem ninguem.
--
-- 3) Recurrence: o molde do lancamento que se repete.
--    As parcelas continuam sendo obrigacoes de verdade, geradas mes a mes. Guardar so o
--    molde e calcular na exibicao impediria dar baixa numa parcela ou corrigir o valor de
--    um mes especifico.

-- ---------------------------------------------------------------------------
ALTER TYPE "OriginType" ADD VALUE IF NOT EXISTS 'RECURRENCE' BEFORE 'MANUAL';

CREATE TYPE "Direction" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- ---------------------------------------------------------------------------
ALTER TABLE "Obligation"
  ADD COLUMN "settledAt" TIMESTAMP(3),
  ADD COLUMN "counterpartyLabel" TEXT,
  ADD COLUMN "recurrenceId" TEXT,
  ADD COLUMN "referenceMonth" CHAR(7),
  ALTER COLUMN "debtorId" DROP NOT NULL;

-- A chave estrangeira precisa ser recriada porque a coluna mudou de obrigatoria para
-- opcional; o comportamento de cascata continua o mesmo.
ALTER TABLE "Obligation" DROP CONSTRAINT "Obligation_debtorId_fkey";
ALTER TABLE "Obligation"
  ADD CONSTRAINT "Obligation_debtorId_fkey"
  FOREIGN KEY ("debtorId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Obrigacao sem nenhuma das duas pontas nao pertence a ninguem e nunca apareceria em
-- relatorio algum — seria uma linha invisivel somando errado em nada.
ALTER TABLE "Obligation"
  ADD CONSTRAINT "Obligation_tem_alguma_parte"
  CHECK ("debtorId" IS NOT NULL OR "creditorId" IS NOT NULL);

-- Baixa e status andam juntos: liquidada tem data, e em aberto nao tem. Sem isto, uma
-- baixa acidental deixaria a conta paga sem dizer quando, e o caixa do mes nao fecharia.
ALTER TABLE "Obligation"
  ADD CONSTRAINT "Obligation_baixa_coerente"
  CHECK (("status" = 'SETTLED' AND "settledAt" IS NOT NULL)
      OR ("status" <> 'SETTLED' AND "settledAt" IS NULL));

CREATE INDEX "Obligation_settledAt_idx" ON "Obligation" ("settledAt");

-- ---------------------------------------------------------------------------
CREATE TABLE "Recurrence" (
  "id"                TEXT NOT NULL,
  "ownerUserId"       TEXT NOT NULL,
  "personId"          TEXT NOT NULL,
  "direction"         "Direction" NOT NULL,
  "description"       TEXT NOT NULL,
  "amount"            DECIMAL(14,2) NOT NULL,
  "paymentMethod"     "PaymentMethod" NOT NULL,
  "counterpartyLabel" TEXT,
  "dayOfMonth"        INTEGER NOT NULL,
  "startsOn"          CHAR(7) NOT NULL,
  "endsOn"            CHAR(7),
  "active"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Recurrence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Recurrence_ownerUserId_active_idx" ON "Recurrence" ("ownerUserId", "active");

ALTER TABLE "Recurrence"
  ADD CONSTRAINT "Recurrence_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Recurrence"
  ADD CONSTRAINT "Recurrence_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Recurrence"
  ADD CONSTRAINT "Recurrence_dayOfMonth_valido" CHECK ("dayOfMonth" BETWEEN 1 AND 31),
  ADD CONSTRAINT "Recurrence_amount_positivo" CHECK ("amount" > 0),
  ADD CONSTRAINT "Recurrence_startsOn_formato" CHECK ("startsOn" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "Recurrence_endsOn_formato"
    CHECK ("endsOn" IS NULL OR "endsOn" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- Vigencia invertida geraria zero parcelas em silencio, e a pessoa acharia que
  -- cadastrou o salario.
  ADD CONSTRAINT "Recurrence_vigencia_valida" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn");

ALTER TABLE "Obligation"
  ADD CONSTRAINT "Obligation_recurrenceId_fkey"
  FOREIGN KEY ("recurrenceId") REFERENCES "Recurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Uma parcela por recorrencia por mes. E o que torna a geracao idempotente: abrir o
-- orcamento do mes duas vezes nao pode lancar o salario duas vezes.
CREATE UNIQUE INDEX "Obligation_recurrenceId_referenceMonth_key"
  ON "Obligation" ("recurrenceId", "referenceMonth");
