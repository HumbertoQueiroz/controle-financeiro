# Cartão, importação e parcelamento

## O cartão

Além de nome, bandeira e os quatro últimos dígitos, o cartão tem **dia de fechamento** e
**dia de vencimento**, e a marca de **compartilhado**.

O compartilhado não muda regra nenhuma — todo lançamento sempre pôde ser repassado. Ele
diz à tela de classificação que separar responsáveis é o caso comum naquele cartão, e não
a exceção.

## A fatura tem duas datas

`closingDate` e `dueDate`. O fechamento é o que decide em qual fatura uma compra entra:
**compra feita depois do fechamento vai para a fatura seguinte**. É a regra de todo cartão
e a que mais confunde quem confere o extrato, porque a compra do dia 28 aparece na fatura
do mês que vem.

## Importação em duas fases

### Fase 1 — prévia

`POST /cartoes/:id/importacoes/previa` (multipart). Lê o arquivo e devolve o que encontrou,
**sem gravar nada**.

O cartão é escolhido antes, e pode ser cadastrado ali mesmo. Sem isso, o caminho trava: a
pessoa baixa a fatura, abre a importação e descobre que precisa sair para cadastrar o
cartão — voltando tendo de recomeçar.

A resposta vem separada em grupos, que são as seções da tela:

| Grupo                     | O que é                                   | Nasce   | O que se faz                         |
| ------------------------- | ----------------------------------------- | ------- | ------------------------------------ |
| `lancamentos`             | Compras avulsas novas                     | aberto  | Responsável, categoria e fatura      |
| `lancamentosConhecidos`   | Compras que já estão nesta fatura         | fechado | Nada — o banco as descarta           |
| `novosParcelamentos`      | Parceladas que aparecem pela primeira vez | aberto  | Idem, e as parcelas seguintes nascem |
| `parcelamentosAnteriores` | Parcelas de compras já conhecidas         | fechado | Nada — serão ignoradas               |
| `pagamentos`              | O pagamento da fatura anterior            | aberto  | Escolher o que fazer com ele         |

**O que exige decisão nasce aberto; o que é só informação nasce fechado.** Um extrato de
trinta linhas com tudo aberto empurra o botão de confirmar para fora da tela, e o que
precisa de atenção se perde no meio do que já está resolvido. Fechada, a seção continua
dizendo quantas linhas e quanto somam — que é a informação pela qual alguém a abriria.

As duas seções de "já conhecido" existem para a pessoa **entender por que aquelas linhas
não estão sendo lançadas**. Silêncio ali pareceria que o sistema perdeu parte do extrato.

Ao fim, um **resumo** com o total de cada seção e o total da fatura. É a conta que se faz
com o extrato do banco ao lado; sem ela, a única forma de saber se a importação bate seria
confirmar e conferir depois — quando corrigir já custa apagar lançamento. O pagamento fica
**fora** do total, com a razão escrita: ele é da fatura anterior, e somá-lo daria um número
que não existe em extrato nenhum.

#### O que já está na fatura

A separação usa **o mesmo `dedupeHash` que a gravação vai usar**, e não uma comparação por
descrição: qualquer critério diferente faria a tela prometer uma coisa e o banco fazer
outra — linha anunciada como nova que o `skipDuplicates` descarta, ou o contrário.

Os já conhecidos **vão junto na confirmação**, e o banco os descarta. Filtrá-los no cliente
faria a tela e a gravação usarem critérios diferentes para a mesma pergunta, e o contador
de "já existiam" do resultado deixaria de dizer a verdade.

##### A ocorrência viaja da prévia até a gravação

`inserirLancamento` fixava `ocorrencia: 0`. Com isso os dois cafés de R$ 12 do mesmo dia —
o caso que a `ocorrencia` existe para resolver — tinham a mesma chave, e o `skipDuplicates`
descartava o segundo em silêncio. A pessoa perdia uma despesa real e só descobriria
conferindo o total.

O valor agora vai no payload da confirmação, e não é recalculado lá: recalcular seria
recalcular sobre uma lista que a tela pode ter reordenado, e a ordem no arquivo é
justamente o que define a ocorrência.

#### A fatura de cada linha é o mês escolhido na tela

Toda linha da prévia nasce no **mês que a pessoa escolheu antes de enviar o arquivo**. O mês
viaja no mesmo multipart do CSV, e é o único insumo dessa decisão.

Já foi diferente: a fatura de cada linha era recalculada a partir da data da compra e do dia
de fechamento do cartão. A regra parecia correta e produzia um resultado errado — o extrato
de agosto do Nubank traz as compras de 30 e 31 de julho, porque foi nele que elas caíram, e o
sistema mandava todas para julho e ainda avisava de uma divergência que ele mesmo tinha
inventado.

O erro de fundo era de autoridade: **o arquivo baixado do banco já é a fatura daquele mês**.
O banco fez o fechamento; recalcular é o sistema discordar do extrato que está importando, e
para isso ele teria de saber melhor que a instituição quando a compra entrou.

O seletor por linha continua ali para o caso raro de um arquivo misturar meses de verdade.
Aí a divergência é escolha de quem importa, não palpite do sistema — e é isso que o aviso da
fase 2 passou a significar.

#### A linha de pagamento é a exceção: ela é do mês anterior

O pagamento que aparece no extrato **quitou a fatura anterior**, nunca a que está sendo
importada. O cartão só cobra depois de fechar o ciclo, então o débito de 05/08 pagou julho.
É a única linha do arquivo que pertence a outro mês, e por isso `faturaSugerida` dela é
`somarMeses(mesSelecionado, -1)`.

Mandá-la para o mês escolhido produzia o pior resultado possível: um extrato de agosto com
R$ 956,29 em compras e um pagamento de R$ 2.613,30 quitava a fatura de agosto inteira, com o
dinheiro de julho. A fatura nascia paga e o excedente evaporava, porque `settledAmount` é
limitado ao valor devido.

Três regras vieram junto:

- **Pagamento não cria fatura.** Fatura nasce de lançamento. Criar aqui deixava para trás
  uma fatura vazia de R$ 0,00 no a pagar — a segunda passada de `sincronizarFatura` gerava
  a obrigação — e o pagamento sumia logo depois, por não haver a que se anexar.
- **Pagamento maior que o saldo em aberto é recusado**, com `excedenteAceito` liberando a
  gravação. Excesso é o sintoma de o pagamento ter ido para a fatura errada, e antes disso
  passava calado.
- **`excedenteAceito` é separado de `divergenciaAceita`.** Um flag só faria aceitar um
  alerta silenciar o outro, que a pessoa nunca chegou a ver.

##### Quando a fatura anterior não existe

É o caso da **primeira importação de todo cartão**: julho é de antes de a pessoa usar o
sistema. A linha vira uma escolha explícita na tela, com três ações:

| Ação             | O que faz                                                        |
| ---------------- | ---------------------------------------------------------------- |
| `IGNORAR`        | Descarta a linha. **Padrão** quando a fatura anterior não existe |
| `REGISTRAR`      | Abate da fatura de destino. Padrão quando ela existe             |
| `SALDO_ANTERIOR` | Cria a fatura que falta com um único lançamento do valor pago    |

Ignorar é o padrão porque é a única opção que não inventa dado nenhum. Mas nunca em
silêncio: o silêncio que o README pede é sobre fatura já fechada — caso conhecido e
repetido. Este acontece uma vez na vida do cartão, justamente na importação em que ninguém
ainda confia no sistema.

`SALDO_ANTERIOR` existe pelo caixa. O dinheiro saiu do banco de verdade, e ignorar deixa o
saldo da conta alto naquele valor para sempre — uma diferença que ninguém consegue explicar
meses depois. Ela cria a fatura com um lançamento chamado `Saldo anterior (não importado)`,
que nasce e morre no mesmo instante. O que ela **não** faz, e a tela diz: não reconstrói o
mês. Não há detalhe do que foi gasto, e se o pagamento foi parcial o total fica menor que a
fatura real. Por isso não é o padrão.

### Fase 2 — confirmação

`POST /cartoes/:id/importacoes` com o que foi classificado.

**A divergência é verificada antes de gravar.** Como toda linha nasce no mês escolhido,
divergir aqui só acontece quando **a pessoa trocou** a fatura de alguma delas na tela. A
gravação é recusada com a mensagem dizendo quantas e para qual mês, e a tela oferece
"confirmar mesmo assim".

O aviso continua valendo depois da mudança de regra: mandar um lançamento para outro mês é
decisão de peso, e o erro só apareceria quando o total da fatura não batesse com o do banco.
O que mudou é que ele nunca mais dispara por conta própria.

A idempotência continua garantida pelo banco — único em `(fatura, dedupeHash)` com
`skipDuplicates` —, então reimportar o mesmo arquivo depois de confirmar não duplica nada.

### Desfazer uma importação

`DELETE /cartoes/:id/importacoes/:importacaoId`.

Apaga **exatamente o que aquela importação criou** — os lançamentos, as parcelas que ela
projetou nas faturas seguintes, os parcelamentos que nasceram nela e os pagamentos que ela
registrou —, recalcula as faturas e remove as que ficaram sem nada.

O recorte é o `importBatchId`, e não a fatura: uma importação posterior que tenha
acrescentado linhas à mesma fatura continua intacta. Quem errou o arquivo de agosto não
deveria perder o de setembro junto.

Três decisões:

- **Os repasses saem primeiro, explicitamente.** Eles apontam para o lançamento por
  `originId`, que não é chave estrangeira — nada os apagaria em cascata, e sobrariam
  cobranças contra um gasto que já não existe.
- **Recusa quando o repasse já tem pagamento.** Apagar o título sumiria com o registro de um
  dinheiro que trocou de mãos, e quem pagou ficaria sem prova nenhuma. Estornar o pagamento
  é o caminho, e a mensagem diz isso.
- **Todas as faturas do cartão são sincronizadas**, não só as que perderam lançamento: a
  fatura que teve o pagamento removido não perdeu linha nenhuma e mesmo assim deixou de
  estar quitada.

Fatura vazia é apagada junto com a obrigação dela — uma dívida de R$ 0,00 no a pagar é
resto de importação desfeita, não histórico. Mas só se não tiver pagamento: pagamento sem
lançamento ainda é dinheiro pago.

#### O CHECK que a exclusão acordou

`sincronizarFatura` atualizava `amount` sem tocar em `settledAmount`, que é cache dos
pagamentos. Quando o total encolhe — um estorno, ou esta exclusão —, o estado intermediário
viola o CHECK de `settledAmount <= amount` e a transação inteira falha **antes** de o
`recalcularSituacao` seguinte ter chance de corrigir o cache. A atualização agora prende o
`settledAmount` ao novo total na mesma escrita.

## Parcelamento

`Installment` é a compra parcelada; as parcelas são `InvoiceEntry` ligadas a ela.

Ao importar uma parcela nova, **todas as parcelas restantes são criadas nas faturas
futuras**, marcadas como `projected`. É o que faz o compromisso inteiro aparecer no
orçamento dos próximos meses em vez de surgir como surpresa a cada fatura.

No mês seguinte, a parcela que vier no extrato é **reconhecida e ignorada**, porque já
existe. O reconhecimento usa uma chave que **remove o número da parcela da descrição**:

```
"FARMACIA POPULAR - 3/10"  →  chave "FARMACIA POPULAR"
"FARMACIA POPULAR - 4/10"  →  chave "FARMACIA POPULAR"
```

Sem tirar o número, cada mês pareceria um parcelamento novo e a compra seria lançada de
novo — em setembro com mais sete parcelas projetadas por cima das que já existiam. Foi
exatamente o que o teste pegou.

A chave completa é `(cartão, descrição sem parcela, quantidade de parcelas, primeiro mês)`.

### A tela de parcelamentos

Responde o que não cabe na fatura: quanto ainda falta de cada compra e em que meses ela vai
continuar aparecendo. Cada parcelamento traz a **etiqueta do cartão** e cada parcela a
**etiqueta do mês da fatura** — olhando um lançamento solto não se sabe de onde ele veio.

Parcela **projetada** aparece com borda tracejada; a que já veio de extrato, preenchida. Só
as que vieram contam como pagas, senão o restante pareceria menor do que é.

Trocar o responsável vale para **todas** as parcelas, inclusive as futuras: se a compra era
do Bruno, todas as doze são dele. Excluir remove apenas as projetadas — as que já vieram do
banco são fato consumado, e apagá-las mudaria o total de faturas passadas.

## Pagamento

Um só conceito no sistema: a tabela `Payment`, ligada à obrigação.

Antes havia dois — a baixa da obrigação (colunas) e o pagamento de fatura vindo do CSV
(tabela própria). Unificar resolveu duas coisas: um título pode ser pago **em partes e em
datas diferentes** (com colunas, a segunda data sobrescreveria a primeira), e cada
pagamento guarda a própria **observação**, que costuma ser o que resolve a dúvida meses
depois.

`settledAmount` e `settledAt` na obrigação passaram a ser **cache** do que os pagamentos
dizem, recalculado a cada alteração. Manter os dois lados por conta própria faria eles
divergirem no primeiro estorno.

A data da baixa é a do **último** pagamento — o que quitou. Para a fatura, é a data do
último pagamento do extrato: usar "hoje" faria uma fatura antiga importada agora cair no
caixa do mês errado.
