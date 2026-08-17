-- Numeração de fechamento por usuário.
--
-- Cada acerto de contas com um participante ganha um número que a pessoa vai citar em
-- conversa e reconhecer no próprio papel. Por isso a sequência é da conta, e não global:
-- um contador compartilhado faria os números dela saltarem conforme outros usuários
-- fechassem contas, e "o fechamento nº 3" deixaria de querer dizer o terceiro dela.
--
-- Começa em 1 para todo mundo, inclusive quem já existe: ninguém fechou nada ainda.
ALTER TABLE "User" ADD COLUMN "nextSettlementNumber" INTEGER NOT NULL DEFAULT 1;
