# Modelo de dados

Schema em `apps/api/prisma/schema.prisma`.

## A decisão central: uma única `Obligation`

O README trata "a pagar" e "a receber" como o par que sustenta as duas funcionalidades do
produto. **São a mesma linha vista das duas pontas**, e é assim que estão modeladas.

Duas tabelas separadas divergem: um acerto lançado de um lado e esquecido do outro produz
saldos que não fecham, e o erro só aparece no fechamento do mês, longe da causa. Com uma
linha só, o relatório de quem deve e o de quem recebe leem a mesma verdade.

Os três modos de relatório do README saem daí:

| Modo            | Consulta                      |
| --------------- | ----------------------------- |
| Só a pagar      | `debtorId = pessoa`           |
| Só a receber    | `creditorId = pessoa`         |
| Ambos com saldo | soma a receber − soma a pagar |

`creditorId` é nulo quando a contraparte é a instituição do cartão, e não uma pessoa.

Todo valor monetário é `Decimal(14,2)`. Nunca `Float`: erro de arredondamento em
fechamento de saldo é bug que aparece como centavo faltando e ninguém consegue explicar.

## `Person` e `User` são coisas diferentes

`Person` é a contraparte de qualquer obrigação e existe sozinha. `User` é quem autentica.

Isso resolve o "o terceiro pode ou não ser usuário do sistema" do README: a despesa do
amigo do rolê é registrada sem obrigar esse amigo a criar conta. Quando ele cria, o campo
`Person.userId` faz o vínculo, e a partir daí ele enxerga o que deve — que é exatamente o
que o README pede.

Todo `User` tem uma `Person` espelho. Sem ela, o admin existiria para autenticar mas não
poderia participar de um rateio, e o modelo teria dois tipos de gente.

`Person.ownerId` registra quem cadastrou aquela pessoa — é quem responde pelos dados dela
perante a LGPD, já que o titular não aceitou termo nenhum.

## Permissão: `ReportGrant` e `ReportInvite`

`ReportGrant` é o consentimento que libera um terceiro a ver o relatório de alguém, com
escopo (`PAYABLE`, `RECEIVABLE`, `BOTH`). Existe **no máximo uma linha por par
(dono, convidado)**: revogar preenche `revokedAt`, conceder de novo limpa o campo. Guardar
histórico como linhas novas faria a consulta de permissão precisar escolher entre várias, e
ambiguidade na consulta de permissão é vazamento de dado.

`ReportInvite` é o consentimento pendente para quem ainda não tem conta. O `scope` fica
gravado **dentro do convite** — é o que faz a permissão viajar embutida nele e o convidado
já entrar enxergando o relatório. Do token guarda-se só o hash.

## Garantias que vivem no SQL, não no schema

O Prisma não sabe declarar índice parcial nem `CHECK`. Estas foram acrescentadas à mão no
fim da migration inicial, e cada uma tem teste em `apps/api/test/schema.test.ts` — sem
teste, sumiriam numa migration futura sem ninguém perceber:

| Garantia                                                      | Por que existe                                                                                                                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Único parcial de convite `PENDING` por (dono, `lower(email)`) | Dois cliques no botão convidar criariam dois convites válidos; revogar um deixaria o outro de pé. Um `@@unique` comum impediria reconvidar quem teve o convite revogado ou expirado |
| `Obligation.amount >= 0`                                      | "deve −50" inverte credor e devedor em silêncio                                                                                                                                     |
| `settledAmount` entre 0 e `amount`                            | Liquidar mais do que se deve produz saldo negativo que nunca fecha                                                                                                                  |
| Credor ≠ devedor, origem ≠ destino da transferência           | Saem de rateio mal montado e geram saldo que não zera                                                                                                                               |
| `closingDay`/`dueDay` entre 1 e 31                            | Dia que não existe no calendário                                                                                                                                                    |
| `referenceMonth` e `period` no formato `YYYY-MM`              | Mês de referência é chave de negócio                                                                                                                                                |
| Único `(invoiceId, dedupeHash)` — este via Prisma             | Sustenta a reimportação idempotente da fatura                                                                                                                                       |

O e-mail de `User` tem unique simples, sensível a caixa. A normalização para minúsculas
acontece na aplicação (`src/lib/email.ts`), e não num índice funcional `lower(email)`,
porque o Prisma não representa índice funcional no schema e passaria a acusar divergência
em toda migration.

## Datas de referência são texto

`Invoice.referenceMonth` e `Settlement.period` são `CHAR(7)` no formato `YYYY-MM`, não
`DateTime`. "A fatura de agosto" é a mesma em qualquer fuso; um `DateTime` não é, e a
diferença aparece como lançamento caindo no mês errado para quem estiver em outro
timezone.

## Seed do admin

`apps/api/prisma/seed.ts`, reexecutável. Se o admin já existe, **não altera nada** — um
`upsert` que regravasse a senha trocaria a senha de um admin em uso, e o efeito só
apareceria no próximo login de quem já estava trabalhando.

Sem `ADMIN_PASSWORD` no ambiente, gera senha aleatória, imprime uma única vez e marca
`mustChangePassword`.
