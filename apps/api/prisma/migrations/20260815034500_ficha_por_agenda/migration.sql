-- Person.userId deixa de ser unico global e passa a ser unico por agenda.
--
-- O unique global permitia uma unica ficha por conta no sistema inteiro. Como cada usuario
-- ja nasce com a propria ficha espelho, ninguem mais conseguia registrar aquela pessoa na
-- sua agenda: a Ana nao podia ter "Bruno do role" apontando para a conta do Bruno.
--
-- Com o unique por (ownerId, userId), cada dono tem no maximo uma ficha apontando para
-- cada conta — que e a regra que importa, porque duas fichas na mesma agenda duplicariam
-- o que aquela pessoa deve e o saldo dela apareceria dobrado.
--
-- Consequencia para os relatorios: o conjunto de obrigacoes de alguem e a uniao das
-- obrigacoes de TODAS as fichas com aquele userId, nao as de uma so.
DROP INDEX "Person_userId_key";

CREATE UNIQUE INDEX "Person_ownerId_userId_key" ON "Person" ("ownerId", "userId");
