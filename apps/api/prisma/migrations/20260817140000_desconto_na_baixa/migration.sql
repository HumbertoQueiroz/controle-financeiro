-- Desconto na baixa.
--
-- A linha de acerto abate a dívida como qualquer pagamento — é o que faz o título quitar
-- pago a menor —, mas fica de fora do saldo da conta bancária: nada saiu do banco.
--
-- Juros e multa não precisam de coluna: são dinheiro de verdade e entram como pagamento
-- comum, de valor maior que o título.
ALTER TABLE "Payment" ADD COLUMN "adjustment" BOOLEAN NOT NULL DEFAULT false;
