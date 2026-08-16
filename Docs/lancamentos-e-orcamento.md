# Lançamentos, baixa e orçamento do mês

## As duas datas

Todo lançamento financeiro tem **duas** datas, e elas respondem perguntas diferentes:

| Data                   | O que é                    | Responde                        |
| ---------------------- | -------------------------- | ------------------------------- |
| `dueDate` — vencimento | Quando foi combinado       | "O que tenho neste mês?"        |
| `settledAt` — baixa    | Quando o dinheiro se moveu | "Quanto de fato entrou e saiu?" |

Com uma data só seria preciso escolher: uma conta vencida em agosto e paga em setembro
apareceria em agosto **ou** em setembro, e as duas leituras são verdadeiras. Separando, ela
pertence ao orçamento de agosto — foi ali que foi assumida — e ao caixa de setembro.

A data da baixa é **informada**, não assumida como hoje: quem registra no domingo o que
pagou na sexta precisa que o caixa mostre sexta, senão o fechamento erra na virada do mês.

O banco impõe a coerência entre as duas: `SETTLED` exige `settledAt`, e qualquer outro
status exige `settledAt` nulo. Uma baixa acidental não pode deixar a conta paga sem dizer
quando.

**Baixa parcial não preenche `settledAt`.** Pagar metade não é o momento em que o
lançamento saiu do previsto; o status vira `PARTIAL` e o restante continua em aberto.

## Contraparte sem cadastro

`debtorId` aceita nulo, e existe `counterpartyLabel` para o nome em texto livre.

Quem paga o salário é o empregador. Obrigar a cadastrá-lo como `Person` só para lançar a
receita seria atrito sem ganho — a agenda de pessoas existe para quem participa das suas
contas, não para toda origem de dinheiro. Um `CHECK` garante que ao menos um dos dois lados
exista, para não nascer obrigação que não pertence a ninguém.

## Recorrência

`Recurrence` é o **molde**, não o lançamento. As parcelas são obrigações de verdade,
criadas mês a mês.

Guardar só o molde e calcular na exibição impediria dar baixa numa parcela, corrigir o
valor de um mês específico, ou saber o que de fato aconteceu — e "este mês recebi menos"
é exatamente o tipo de coisa que precisa ser registrável.

A geração acontece quando o mês é aberto (orçamento ou lista). É idempotente pelo único
`(recurrenceId, referenceMonth)` combinado com `skipDuplicates`: abrir a tela duas vezes,
ou em duas abas, não lança o salário duas vezes. Checar antes e criar depois teria corrida.

O vencimento usa `Math.min` com o último dia do mês: um salário no dia 31 cairia em 3 de
março se o `Date` "corrigisse" 31 de fevereiro sozinho, e a parcela mudaria de mês.

**Encerrar uma recorrência** desativa o molde e apaga apenas as parcelas **futuras sem
baixa** — aquelas eram só previsão. As passadas ficam: apagá-las mudaria o caixa de meses
anteriores retroativamente.

## Orçamento do mês

`GET /orcamento?mes=AAAA-MM` — a tela inicial.

O mês é delimitado pelo **vencimento**. Para cada lado:

| Número    | O que é                                 |
| --------- | --------------------------------------- |
| Previsto  | Tudo que vence no mês, com baixa ou sem |
| Realizado | Só o que já teve baixa                  |
| Em aberto | A diferença — o que falta acontecer     |

E dois saldos: **previsto** (entradas − saídas do mês inteiro) e **realizado** (só o que se
moveu). Mostrar um só esconderia metade da resposta.

`atrasados` conta o que venceu e segue sem baixa — é o número que merece aparecer em
destaque, porque é o que exige ação.

## O que se edita aqui e o que não

Só lançamentos de origem `MANUAL` e `RECURRENCE` são editáveis nesta tela. Fatura, rateio e
repasse têm origem própria: alterar a obrigação deixaria o valor divergente do que a gerou.

Baixa bloqueia edição de valor e exclusão. Alterar o valor para menos que o já liquidado
violaria o `CHECK` do banco com uma mensagem incompreensível; apagar sumiria com o registro
de um dinheiro que trocou de mãos. Nos dois casos, o caminho é estornar a baixa primeiro.

## Efeito nas outras telas

A obrigação da fatura e as do fechamento de grupo passaram a registrar `settledAt`:

- **Fatura quitada**: a data do último pagamento. Usar "hoje" faria uma fatura antiga
  importada agora cair no caixa do mês errado.
- **Fechamento de grupo**: a data do fechamento. Foi ele que resolveu quem paga quem, e é
  o momento em que aquelas dívidas deixaram de existir individualmente.
