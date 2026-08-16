-- Pagamento como tabela propria, parcelamento com vida propria, e cartao compartilhado.
--
-- 1) Payment substitui InvoicePayment e passa a valer para QUALQUER titulo.
--    Um titulo pode ser pago em partes e em datas diferentes; com colunas na obrigacao a
--    segunda data sobrescreveria a primeira e o historico do que foi pago se perderia.
--    Existiam dois conceitos de pagamento no sistema (o da fatura, vindo do CSV, e a baixa
--    da obrigacao) — agora e um so.
--
-- 2) Installment guarda a compra parcelada, nao so as parcelas.
--    E o que permite reconhecer, no extrato do mes seguinte, que aquela parcela ja foi
--    gerada. Sem isso cada importacao traria a mesma compra de novo e ela entraria em dobro.
--
-- 3) Invoice ganha data de fechamento, que e o que permite sugerir a fatura de destino de
--    cada lancamento a partir da data da compra.

-- ---------------------------------------------------------------------------
ALTER TABLE "CreditCard" ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Data de fechamento: preenchida a partir do dia de fechamento do cartao.
--
-- `to_date` rola o excedente (31 de fevereiro vira 3 de marco), e o LEAST corta no ultimo
-- dia do mes — que e exatamente a regra desejada para cartao que fecha dia 31.
ALTER TABLE "Invoice" ADD COLUMN "closingDate" TIMESTAMP(3);

UPDATE "Invoice" i
SET "closingDate" = LEAST(
  to_date(i."referenceMonth" || '-' || lpad(c."closingDay"::text, 2, '0'), 'YYYY-MM-DD'),
  (to_date(i."referenceMonth" || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date
)
FROM "CreditCard" c
WHERE c.id = i."cardId";

ALTER TABLE "Invoice" ALTER COLUMN "closingDate" SET NOT NULL;

-- ---------------------------------------------------------------------------
CREATE TABLE "Installment" (
  "id"                  TEXT NOT NULL,
  "cardId"              TEXT NOT NULL,
  "description"         TEXT NOT NULL,
  "descriptionKey"      TEXT NOT NULL,
  "amount"              DECIMAL(14,2) NOT NULL,
  "installments"        INTEGER NOT NULL,
  "firstMonth"          CHAR(7) NOT NULL,
  "firstNumber"         INTEGER NOT NULL,
  "responsiblePersonId" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Installment_cardId_descriptionKey_installments_firstMonth_key"
  ON "Installment" ("cardId", "descriptionKey", "installments", "firstMonth");

CREATE INDEX "Installment_cardId_idx" ON "Installment" ("cardId");

ALTER TABLE "Installment"
  ADD CONSTRAINT "Installment_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Installment_responsiblePersonId_fkey"
    FOREIGN KEY ("responsiblePersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Installment_installments_valido" CHECK ("installments" > 1),
  ADD CONSTRAINT "Installment_firstNumber_valido"
    CHECK ("firstNumber" >= 1 AND "firstNumber" <= "installments"),
  ADD CONSTRAINT "Installment_firstMonth_formato"
    CHECK ("firstMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "InvoiceEntry"
  ADD COLUMN "installmentId" TEXT,
  ADD COLUMN "projected" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "InvoiceEntry_installmentId_idx" ON "InvoiceEntry" ("installmentId");

ALTER TABLE "InvoiceEntry"
  ADD CONSTRAINT "InvoiceEntry_installmentId_fkey"
  FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
CREATE TABLE "Payment" (
  "id"            TEXT NOT NULL,
  "obligationId"  TEXT NOT NULL,
  "amount"        DECIMAL(14,2) NOT NULL,
  "paidAt"        TIMESTAMP(3) NOT NULL,
  "note"          TEXT,
  "dedupeHash"    TEXT,
  "importBatchId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Pagamento de valor zero ou negativo nao e pagamento; entraria no somatorio distorcendo
-- o quanto falta do titulo.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positivo" CHECK ("amount" > 0);

-- Com dedupeHash nulo (pagamento lancado a mao) o Postgres permite varias linhas, que e o
-- comportamento desejado: paguei metade dia 5 e o resto dia 20.
CREATE UNIQUE INDEX "Payment_obligationId_dedupeHash_key" ON "Payment" ("obligationId", "dedupeHash");
CREATE INDEX "Payment_obligationId_paidAt_idx" ON "Payment" ("obligationId", "paidAt");
CREATE INDEX "Payment_paidAt_idx" ON "Payment" ("paidAt");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_obligationId_fkey"
    FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Payment_importBatchId_fkey"
    FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Os pagamentos de fatura ja registrados passam para a tabela nova, ligados a obrigacao
-- daquela fatura. A obrigacao sempre existe: ela e criada junto com a fatura.
INSERT INTO "Payment" ("id", "obligationId", "amount", "paidAt", "dedupeHash", "importBatchId", "createdAt")
SELECT ip."id", o."id", ip."amount", ip."date", ip."dedupeHash", ip."importBatchId", ip."createdAt"
FROM "InvoicePayment" ip
JOIN "Obligation" o ON o."originType" = 'INVOICE' AND o."originId" = ip."invoiceId";

-- As baixas que estavam so como coluna na obrigacao viram pagamento de verdade, para o
-- historico nao se perder ao trocar de modelo.
INSERT INTO "Payment" ("id", "obligationId", "amount", "paidAt", "note", "createdAt")
SELECT gen_random_uuid(), o."id", o."settledAmount", o."settledAt", 'Baixa registrada antes do histórico de pagamentos', o."updatedAt"
FROM "Obligation" o
WHERE o."settledAt" IS NOT NULL
  AND o."settledAmount" > 0
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."obligationId" = o."id");

DROP TABLE "InvoicePayment";
