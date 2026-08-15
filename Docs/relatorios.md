# Relatórios

`GET /relatorios/:ownerId` — os três modos que o README pede: só a pagar, só a receber, e
ambos com saldo final.

`GET /resumo` — os números do painel de quem está logado.

## Por que é uma consulta só

A `Obligation` única faz os três modos saírem do mesmo lugar, sem código duplicado:

| Modo         | Consulta                               |
| ------------ | -------------------------------------- |
| Só a pagar   | `debtorId` entre as fichas da pessoa   |
| Só a receber | `creditorId` entre as fichas da pessoa |
| Ambos        | as duas, e o saldo é a diferença       |

## Quais fichas entram

**Todas as `Person` com aquele `userId`**, não apenas a própria.

Uma dívida lançada pela Ana está na ficha que **ela** criou na agenda dela, não na ficha
espelho do Bruno. Consultar só a ficha própria esconderia justamente as dívidas que
terceiros lançaram em nome da pessoa — que é o caso de uso central do README.

## O escopo é aplicado na consulta

O guard `requireReportAccess` resolve o escopo **efetivo** a partir do consentimento e o
publica em `request.escopoDeRelatorio`. O serviço usa esse valor, nunca o que veio na query.

Com escopo `PAYABLE`, a consulta de "a receber" **não roda** — não é filtrada depois. Trazer
as linhas para a memória e filtrar em seguida deixaria o dado dentro do processo, e
bastaria um `select` esquecido numa alteração futura para vazarem na resposta.

Quando um lado não foi consultado, ele vem `null` e o **saldo também**. Calcular saldo com
um lado faltando devolveria um número que parece saldo e não é.

## O que entra na soma

- **O restante**, não o valor original: uma dívida de R$ 100 com R$ 60 já pagos pesa R$ 40.
  Somar o valor cheio faria a pessoa parecer dever mais do que deve.
- **Canceladas ficam de fora sempre** — não são dívida de ninguém, em modo nenhum.
- **Liquidadas** só aparecem com `situacao=TODAS`, e mesmo aí somam zero, porque o restante
  delas é zero. O padrão é `ABERTAS`.

## Filtros

| Parâmetro    | Efeito                                                          |
| ------------ | --------------------------------------------------------------- |
| `escopo`     | `PAYABLE`, `RECEIVABLE` ou `BOTH` — limitado pelo consentimento |
| `de` / `ate` | Faixa de vencimento                                             |
| `situacao`   | `ABERTAS` (padrão) ou `TODAS`                                   |

## A contraparte

Cada item traz o nome da outra ponta. Em "a pagar", contraparte **nula** significa que a
dívida é com a instituição do cartão, e não com uma pessoa — é a obrigação da fatura.
