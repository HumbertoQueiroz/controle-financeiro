-- Pagamento pendente de confirmação.
--
-- Numa dívida entre duas pessoas, quem deve pode registrar que pagou, mas quem recebe é
-- quem sabe se o dinheiro chegou. O pagamento não confirmado existe e aparece para os dois
-- lados, e fica de fora da soma que abate a dívida.
--
-- O DEFAULT true é o que torna esta migration segura sobre a base existente: todo pagamento
-- já gravado foi registrado por quem tinha autoridade para isso, e passar a tratá-los como
-- pendentes reabriria dívidas que estão quitadas.
ALTER TABLE "Payment" ADD COLUMN "confirmed" BOOLEAN NOT NULL DEFAULT true;

-- A consulta que interessa é "o que falta confirmar nesta obrigação". Sem o índice, cada
-- recálculo de situação varre todos os pagamentos do título para descartar os pendentes.
CREATE INDEX "Payment_obligationId_confirmed_idx" ON "Payment" ("obligationId", "confirmed");
