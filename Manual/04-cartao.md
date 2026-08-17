# 4. Cartão de crédito

## Cadastrar um cartão

Em **Cartões**, toque em **Novo cartão**.

| Campo                    | Observação                                            |
| ------------------------ | ----------------------------------------------------- |
| **Nome**                 | Como você chama o cartão: "Nubank", "Cartão do banco" |
| **Bandeira**             | Opcional                                              |
| **4 últimos dígitos**    | Opcional, para diferenciar dois cartões parecidos     |
| **Dia de fechamento**    | O dia em que a fatura fecha                           |
| **Dia de vencimento**    | O dia em que a fatura vence                           |
| **Cartão compartilhado** | Marque se outras pessoas usam este cartão             |

> **Segurança:** o sistema guarda **apenas os quatro últimos dígitos**. Número completo, CVV
> e validade não existem em campo nenhum, nem em log. Não há como um vazamento daqui virar
> fraude no seu cartão.

## Editar um cartão

Toque no **lápis** ao lado do cartão na lista. Todos os campos do cadastro podem ser
corrigidos, mais um:

| Campo             | Observação                                                    |
| ----------------- | ------------------------------------------------------------- |
| **Cartão em uso** | Desmarque para aposentar o cartão sem perder o histórico dele |

Não há exclusão de cartão, e é de propósito: apagá-lo levaria junto as faturas, os
lançamentos e os parcelamentos. Um cartão fora de uso fica marcado como **Inativo** e sai da
frente, com tudo que passou por ele preservado.

> **Mudar o dia de fechamento ou o de vencimento reajusta as faturas ainda em aberto.** As
> fechadas e as pagas ficam como estão — a data delas é o que de fato aconteceu, e reescrever
> o passado para combinar com uma configuração de hoje falsificaria o histórico.

### Por que o dia de fechamento importa

É ele que decide em qual fatura cada compra entra. **Compra feita depois do fechamento vai
para a fatura seguinte.**

Se seu cartão fecha dia 25, a compra do dia 28 de agosto aparece na fatura de **setembro**.
É a regra de todo cartão, e a que mais confunde quem confere o extrato — o sistema aplica
essa regra sozinho ao importar.

### O que muda num cartão compartilhado

Nada nas regras: qualquer gasto, em qualquer cartão, pode ser marcado como de outra pessoa.
A marca serve para você lembrar, e para a tela de classificação tratar a separação de
responsáveis como o caso comum daquele cartão.

## Ver as faturas

Toque no cartão. Cada fatura mostra o mês, a situação (**em aberto**, **fechada** ou
**paga**), a **data de fechamento**, a **data de vencimento** e o total.

Tocar numa fatura abre os lançamentos dela.

## Importar a fatura

Toque em **Importar CSV**. A importação tem três etapas, e **nada é gravado antes de você
confirmar**.

### Etapa 1 — o arquivo

| Campo             | Observação                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| **Cartão**        | Já vem selecionado. A opção **+ Cadastrar cartão…** cria um novo aqui mesmo |
| **Mês da fatura** | **Todos** os lançamentos do arquivo entram nesta fatura                     |
| **Arquivo CSV**   | O arquivo baixado do seu banco                                              |

O cadastro de cartão na hora existe para o caminho não travar: baixar a fatura, abrir a
importação e descobrir que precisa sair para cadastrar o cartão faria você recomeçar.

### Etapa 2 — conferir e classificar

O sistema lê o arquivo e mostra o que encontrou, separado em seções que abrem e fecham.

**O que precisa da sua decisão já vem aberto**; o que é só informação vem fechado, com a
quantidade e o total ao lado. Toque no título para abrir.

Ao final, o **Resumo**: quanto soma cada seção e quanto a fatura vai ficar. É o número para
conferir com o extrato do banco antes de confirmar.

#### Novos lançamentos

As compras avulsas que ainda não estão nesta fatura. Para cada uma:

- **Quem paga** — o padrão é **Meu**. Escolha a pessoa quando o gasto foi de outra pessoa,
  ou use **+ Cadastrar pessoa…** para criar na hora, sem sair da tela.
- **Fatura** — vem preenchida com o mês que você escolheu na tela anterior, para todas as
  linhas. Se você trocar a de alguma, o rótulo avisa **"difere do mês escolhido"**.
- **Categoria** — em que se gastou. Opcional, e é aqui que vale a pena: duas semanas depois,
  "PG \*IFD" não diz nada a ninguém. Falta uma categoria? **+ Cadastrar categoria…** cria na
  hora, sem sair da tela e sem perder o que você já classificou.

Se você já classificou uma compra com a mesma descrição, a categoria dela **já vem
escolhida**. Quem classificou "Uber" uma vez não deveria decidir de novo todo mês.

#### Já importados antes

As linhas que já estão nesta fatura, de uma importação anterior. **Não serão duplicadas.**

Vem fechada, mostrando quantas são e quanto somam. É o que responde "por que o total de
novos lançamentos é menor que o do extrato".

> **Compra de 30 de julho no extrato de agosto é normal**, e entra na fatura de agosto — foi
> nela que o banco a colocou, por ter sido feita depois do fechamento. O sistema não
> recalcula isso: o arquivo que você baixou **é** a fatura daquele mês.

Marcar alguém como responsável faz duas coisas ao mesmo tempo: a dívida com o cartão
continua sendo sua, e o valor vira uma **conta a receber daquela pessoa**. As duas coexistem
porque as duas são verdade — você deve ao banco, e ela deve a você.

#### Novos parcelamentos

As compras parceladas que aparecem pela primeira vez. Além de quem paga e da categoria, a
linha mostra quantas parcelas serão criadas.

**Ao confirmar, todas as parcelas restantes são lançadas nas faturas futuras.** Uma compra
em 10 vezes na parcela 3 cria as parcelas de 3 a 10, cada uma no seu mês. É o que faz o
compromisso inteiro aparecer no seu orçamento, em vez de surgir como surpresa a cada mês.

#### Parcelamentos anteriores

Parcelas de compras que o sistema já conhece. **Não serão lançadas de novo** — elas já
foram criadas quando o parcelamento apareceu pela primeira vez.

Esta seção existe só para você entender por que aquelas linhas do extrato não estão sendo
importadas. Sem ela, pareceria que o sistema perdeu parte do arquivo.

#### Pagamento da fatura anterior

Se o arquivo tiver a linha de pagamento, ela aparece aqui — e vai para o **mês anterior**.

> **O pagamento no extrato de agosto quitou a fatura de julho.** É assim em todo cartão: a
> cobrança só acontece depois de o ciclo fechar. Ele é a única linha do arquivo que pertence
> a outro mês.

Você escolhe o que fazer com ela:

| Escolha                           | Quando usar                                                  |
| --------------------------------- | ------------------------------------------------------------ |
| **Abater da fatura de \<mês\>**   | A fatura anterior está no sistema e em aberto                |
| **Ignorar este pagamento**        | A fatura anterior é de antes de você usar o sistema          |
| **Registrar como saldo anterior** | Você quer o saldo da conta certo, mesmo sem o detalhe do mês |

Na **primeira importação** de um cartão a fatura anterior nunca existe, e a tela avisa
disso. A escolha já vem em "ignorar", que é a única que não inventa dado nenhum.

**Registrar como saldo anterior** cria a fatura que falta com um único lançamento do valor
pago, já quitado. Serve para o dinheiro que saiu da sua conta aparecer em algum lugar — sem
isso, o saldo do app fica alto naquele valor para sempre. O que ela não faz: reconstruir o
mês. Você terá o total, não o que foi gasto. E se você pagou só parte da fatura, o valor
registrado fica menor que a fatura real.

Um pagamento **maior do que falta na fatura** é recusado com aviso. Quase sempre significa
que ele foi para o mês errado.

### O aviso de divergência

Só aparece quando **você** manda alguma linha para outro mês. Ao confirmar, o sistema
**recusa e avisa**, dizendo quantas linhas e para qual mês.

O botão muda para **Confirmar mesmo assim**. Se a troca foi proposital, confirme. Se não,
volte e corrija a fatura das linhas marcadas.

O aviso existe porque mandar um lançamento para outro mês é decisão de peso, e sem ele o
problema só apareceria quando o total da fatura não batesse com o do banco.

### Etapa 3 — o resultado

Mostra o que aconteceu:

| Número                         | Significado                           |
| ------------------------------ | ------------------------------------- |
| **Lançamentos novos**          | Entraram agora                        |
| **Já existiam**                | Reconhecidos e não duplicados         |
| **Parcelamentos criados**      | Com a quantidade de parcelas geradas  |
| **Pagamentos registrados**     | Baixas na fatura anterior             |
| **Faturas anteriores criadas** | Pelo "registrar como saldo anterior"  |
| **Pagamentos ignorados**       | Por escolha sua, ou fatura não aberta |
| **Faturas afetadas**           | Cada mês tocado e o total dele        |

## Desfazer uma importação

Na página do cartão, abaixo das faturas, fica a lista de **Importações** — o arquivo, a data
e quantos lançamentos entraram. O ícone de lixeira desfaz.

Excluir uma importação apaga **o que ela criou**: os lançamentos, as parcelas que ela
projetou nas faturas seguintes e o pagamento que ela registrou. As faturas são recalculadas,
e as que ficarem sem nenhum lançamento saem da lista.

> **As outras importações continuam como estão.** Se você importou agosto e depois setembro,
> desfazer agosto não leva setembro junto.

Um caso é recusado: quando **alguém já pagou um repasse** daquela importação. Apagar o
título sumiria com o registro de um dinheiro que trocou de mãos. Estorne o pagamento antes.

## Importar a mesma fatura várias vezes

Pode, e é o uso esperado: importe no meio do mês e de novo no fim.

O sistema reconhece o que já entrou e acrescenta só o que é novo. Duas compras iguais no
mesmo dia — dois cafés de R$ 12 — continuam sendo duas: elas não são confundidas uma com a
outra.

## Marcar um gasto como de outra pessoa depois

Abra a fatura e use a coluna **Repassado a** de cada lançamento.

Escolher uma pessoa cria a conta a receber; voltar para **Ninguém** cancela essa cobrança.
O cancelamento não apaga o registro — se já houve pagamento parcial, apagar sumiria com o
dinheiro que trocou de mãos.

**Estorno não pode ser repassado.** Estorno é crédito, não gasto: repassá-lo criaria uma
cobrança invertida, com a outra pessoa tendo a receber por uma compra que não fez.
