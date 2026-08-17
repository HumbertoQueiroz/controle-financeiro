-- Categoria no lançamento do cartão.
--
-- Fica na linha do extrato, e não na obrigação: a obrigação do cartão é a fatura inteira,
-- e categorizar ali só permitiria dizer "mil reais de cartão". A pergunta que a categoria
-- responde é em que o mês foi gasto, e isso só a linha sabe.
ALTER TABLE "InvoiceEntry" ADD COLUMN "categoryId" TEXT;

-- SET NULL, como nas demais: arquivar é o caminho, mas se um dia uma categoria for
-- apagada o lançamento não pode ir junto.
ALTER TABLE "InvoiceEntry"
  ADD CONSTRAINT "InvoiceEntry_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InvoiceEntry_categoryId_idx" ON "InvoiceEntry"("categoryId");
