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

A resposta vem separada em três grupos, que são as três seções da tela:

| Grupo                     | O que é                                   | O que se faz                                                 |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `lancamentos`             | Compras avulsas                           | Classificar responsável e conferir a fatura                  |
| `novosParcelamentos`      | Parceladas que aparecem pela primeira vez | Classificar responsável; as parcelas seguintes serão criadas |
| `parcelamentosAnteriores` | Parcelas de compras já conhecidas         | Nada — serão ignoradas                                       |

A terceira seção existe para a pessoa **entender por que aquelas linhas não estão sendo
lançadas**. Silêncio ali pareceria que o sistema perdeu parte do extrato.

Cada linha vem com a fatura sugerida pela sua própria data de compra, e cada uma pode ser
trocada individualmente — é o que resolve a compra feita depois do fechamento sem obrigar a
importar duas vezes.

### Fase 2 — confirmação

`POST /cartoes/:id/importacoes` com o que foi classificado.

**A divergência é verificada antes de gravar.** Se alguma linha vai para uma fatura
diferente do mês escolhido, a gravação é recusada com a mensagem dizendo quantas e para
qual mês; a tela então oferece "confirmar mesmo assim". Escolher agosto e o arquivo ser de
julho é o erro comum, e sem o alerta ele só apareceria quando o total da fatura não
batesse com o do banco.

A idempotência continua garantida pelo banco — único em `(fatura, dedupeHash)` com
`skipDuplicates` —, então reimportar o mesmo arquivo depois de confirmar não duplica nada.

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
