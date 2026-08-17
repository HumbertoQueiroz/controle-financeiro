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

## Pagamento pendente de confirmação

Numa dívida entre **duas contas do sistema**, quem deve pode registrar que pagou — mas quem
recebe é quem sabe se o dinheiro chegou. `Payment.confirmed` guarda essa diferença.

| Quem dá a baixa                 | Nasce              |
| ------------------------------- | ------------------ |
| O credor                        | `confirmed: true`  |
| O devedor, com credor com conta | `confirmed: false` |

`recalcularSituacao` soma **apenas os confirmados**. É a regra inteira: um pagamento
declarado e não reconhecido não abate nada, o título continua `OPEN` e segue na lista de a
receber do credor. Se abatesse, o devedor quitaria o próprio débito sozinho e o título
sumiria da lista de quem não recebeu nada.

Quatro decisões que valem o registro:

- **O padrão da coluna é `true`.** É o que torna a migration segura: todo pagamento que já
  existia foi registrado por quem tinha autoridade para isso, e tratá-los como pendentes
  reabriria dívidas quitadas. É também o caso comum — o credor dando a baixa.
- **`DadosDoPagamento.confirmed` não tem valor padrão.** Quem cria um pagamento é obrigado a
  decidir de que lado da dívida está quem registra. Um padrão implícito faria o caminho do
  devedor nascer confirmado no primeiro lugar onde alguém esquecesse o campo, e o
  esquecimento não quebraria teste nenhum — tudo continuaria funcionando, só que sem a
  confirmação.
- **A pendência só existe quando há outra conta para confirmar.** Credor nulo (a instituição
  do cartão), credor sem `userId`, ou credor que é o próprio usuário: nasce confirmado. Um
  pendente sem quem confirme ficaria pendente para sempre, travando um título que nunca mais
  quitaria.
- **O teto da baixa é o que já foi declarado**, não o que foi confirmado. Sem isso o devedor
  declararia o valor cheio quantas vezes quisesse enquanto o credor não olha.

A confirmação é `POST /lancamentos/:id/pagamentos/:pagamentoId/confirmar`, restrita ao
credor, e usa `updateMany` filtrando por `confirmed: false` — dois cliques no botão chegam
juntos e passariam pelos dois `if` de um `update` precedido de verificação.

Estornar continua apagando os pagamentos, e é assim que o credor **recusa** um pagamento que
não reconhece. Por isso o guard do estorno olha para a lista de pagamentos, e não para
`settledAmount`: um título com só uma declaração pendente tem liquidado zero e mesmo assim
tem o que estornar.

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

## O valor da baixa pode ser outro

A baixa vem preenchida com o que falta e continua editável. Pagar valor diferente do título
é o normal, não a exceção — atraso gera juros, negociação gera desconto —, e obrigar o valor
exato faria a pessoa mentir o número para conseguir dar a baixa.

**Pagar a mais é aceito sem pergunta.** O pagamento entra pelo valor cheio, porque foi ele
que saiu do banco; `settledAmount` continua limitado ao devido, que é o que o CHECK exige.
O excedente é juros ou multa e não precisa de marca nenhuma: é dinheiro de verdade.

**Pagar a menos é uma pergunta**, e a tela faz: desconto ou parcela? São duas coisas
diferentes — numa o título acabou, na outra ele continua devendo o resto — e só quem deu a
baixa sabe qual foi. Deduzir pelo valor seria escolher por ela.

Escolhido "desconto", a diferença vira uma **segunda linha de pagamento** com
`adjustment = true`. Duas decisões aí:

- **Não se mexe no valor do título.** Reduzi-lo apagaria quanto a dívida era de verdade, e o
  histórico deixaria de explicar por que um título de R$ 100 foi quitado com R$ 90.
- **O desconto abate a dívida, mas não passa pelo banco.** Ele fica de fora do saldo da conta
  bancária; sem a distinção, conceder um desconto tiraria dinheiro do saldo como se tivesse
  sido pago.

## Quem convida entra na agenda de quem aceita

Aceitar um convite cria, na agenda do convidado, a ficha de quem convidou — com `userId`
apontando para a conta real, e não uma ficha solta.

O convite já **é** a relação: alguém compartilhou as próprias contas com esta pessoa, e a
primeira coisa que ela vai querer fazer é lançar algo com essa mesma pessoa. Sem isso a
agenda nasce vazia e ela cadastra à mão alguém que o sistema já conhece — e o cadastro à mão
nasce sem a ligação, que é justamente o que faz o fechamento entre os dois enxergar as duas
pontas da mesma dívida.

## O dashboard

`GET /dashboard?mes=AAAA-MM`, e a tela inicial `/app`.

Ele **compõe** o que já existe — orçamento, relatório por categoria e saldo por participante
— em vez de recalcular cada número por conta própria. Um total que o dashboard soma de um
jeito e a tela de destino de outro é a pior falha possível aqui: quem toca no card vê um
número diferente do que tocou, e para de confiar nos dois.

### Cada bloco carrega o filtro que o abre

O bloco devolve `filtro`, e a tela monta `/app/a-pagar?mes=…&filtro=…`. O link nasce ao lado
do número que ele promete, e não numa tabela de rotas noutro arquivo que ninguém lembra de
atualizar quando o recorte muda.

### Os blocos de "a pagar" particionam a lista

Por **forma de pagamento**: ou a conta sai do caixa (dinheiro, vale, permuta), ou entra na
fatura. Nunca as duas, e nada fica de fora — os dois blocos somam exatamente o total da
seção.

A primeira versão tinha um terceiro bloco por origem (rateio), e ele cruzava o eixo: a mesma
pizza, paga em dinheiro num rolê, aparecia em dois blocos da mesma seção, que juntos somavam
mais que o total logo acima. Rateio continua existindo como filtro na lista — só não é um
irmão dos outros dois ali.

Pelo mesmo motivo o filtro `caixa` lista as **três** formas que não são cartão. Faltando a
permuta, o total do bloco deixaria de bater com o da lista que ele abre.

### O que ficou onde

A tela inicial passou a ser o dashboard; o **Orçamento do mês** continua em
`/app/orcamento`, na barra lateral e no menu. Um responde "como está este mês?" em três
números; o outro é onde se confere, lançamento por lançamento, de onde esses números vieram.
