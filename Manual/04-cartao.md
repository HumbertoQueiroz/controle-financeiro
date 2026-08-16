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
| **Mês da fatura** | O mês que você espera que o arquivo seja                                    |
| **Arquivo CSV**   | O arquivo baixado do seu banco                                              |

O cadastro de cartão na hora existe para o caminho não travar: baixar a fatura, abrir a
importação e descobrir que precisa sair para cadastrar o cartão faria você recomeçar.

### Etapa 2 — conferir e classificar

O sistema lê o arquivo e mostra o que encontrou, separado em seções.

#### Lançamentos

As compras avulsas. Para cada uma:

- **Quem paga** — o padrão é **Meu**. Escolha a pessoa quando o gasto foi de outra pessoa,
  ou use **+ Cadastrar pessoa…** para criar na hora, sem sair da tela.
- **Fatura** — vem sugerida pela data da compra e pelo fechamento do cartão. Se alguma
  divergir do mês que você escolheu, o rótulo avisa **"difere do mês escolhido"**.

Marcar alguém como responsável faz duas coisas ao mesmo tempo: a dívida com o cartão
continua sendo sua, e o valor vira uma **conta a receber daquela pessoa**. As duas coexistem
porque as duas são verdade — você deve ao banco, e ela deve a você.

#### Novo parcelamento

As compras parceladas que aparecem pela primeira vez. Além de quem paga, a linha mostra
quantas parcelas serão criadas.

**Ao confirmar, todas as parcelas restantes são lançadas nas faturas futuras.** Uma compra
em 10 vezes na parcela 3 cria as parcelas de 3 a 10, cada uma no seu mês. É o que faz o
compromisso inteiro aparecer no seu orçamento, em vez de surgir como surpresa a cada mês.

#### Parcelamentos anteriores

Parcelas de compras que o sistema já conhece. **Não serão lançadas de novo** — elas já
foram criadas quando o parcelamento apareceu pela primeira vez.

Esta seção existe só para você entender por que aquelas linhas do extrato não estão sendo
importadas. Sem ela, pareceria que o sistema perdeu parte do arquivo.

#### Pagamentos da fatura

Se o arquivo tiver linhas de pagamento da fatura, elas aparecem aqui. São registradas
**apenas se a fatura estiver em aberto** no sistema; numa fatura já paga ou fechada, são
ignoradas.

### O aviso de divergência

Ao confirmar, se alguma linha for para uma fatura diferente do mês que você escolheu, o
sistema **recusa e avisa**, dizendo quantas linhas e para qual mês.

O botão muda para **Confirmar mesmo assim**. Se a divergência faz sentido — a compra
depois do fechamento, por exemplo —, confirme. Se não, volte e corrija a fatura das linhas
marcadas.

O aviso existe porque escolher agosto e o arquivo ser de julho é o erro mais comum, e sem
ele o problema só apareceria quando o total da fatura não batesse com o do banco.

### Etapa 3 — o resultado

Mostra o que aconteceu:

| Número                     | Significado                          |
| -------------------------- | ------------------------------------ |
| **Lançamentos novos**      | Entraram agora                       |
| **Já existiam**            | Reconhecidos e não duplicados        |
| **Parcelamentos criados**  | Com a quantidade de parcelas geradas |
| **Pagamentos registrados** | Baixas na fatura                     |
| **Pagamentos ignorados**   | A fatura não estava em aberto        |
| **Faturas afetadas**       | Cada mês tocado e o total dele       |

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
