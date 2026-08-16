# 6. Grupos e rateio

Para dividir as contas de um rolê: um paga a carne, outro as bebidas, e no fim do mês o
sistema resolve quem paga quem.

## Criar um grupo

Em **Mais → Grupos**, toque em **Novo grupo** e dê um nome.

**Você já entra no grupo automaticamente.** Um grupo sem quem o criou faria a sua despesa
não entrar no rateio, e o saldo fecharia errado na primeira conta.

## Adicionar participantes

Dentro do grupo, em **Participantes**, toque em **Adicionar** e escolha uma pessoa da sua
lista.

Se a pessoa ainda não estiver cadastrada, crie-a antes em **Mais → Pessoas**. Ela **não
precisa ter conta** no sistema para participar: o amigo do rolê entra na conta sem precisar
se cadastrar em lugar nenhum.

> Não é possível remover quem já participou de alguma despesa. A remoção apagaria a cota
> dela e o saldo de todo mundo mudaria retroativamente, sem ninguém ter pago nada.

## Criar um rolê

Um rolê é o evento onde as despesas aconteceram: o churrasco, a viagem, o aniversário.

| Campo    | Observação                                   |
| -------- | -------------------------------------------- |
| **Nome** | "Churrasco", "Praia"                         |
| **Data** | **É ela que define em que mês o rolê entra** |

Lançar hoje uma conta do mês passado é normal — coloque a data do rolê, e ele entra no mês
certo.

## Lançar uma despesa

Dentro do rolê, toque em **Nova despesa**.

| Campo                  | Observação                                    |
| ---------------------- | --------------------------------------------- |
| **Descrição**          | "Carne", "Bebidas"                            |
| **Valor**              | O total gasto                                 |
| **Quem pagou**         | Quem desembolsou na hora                      |
| **Forma de pagamento** | Dinheiro, permuta, vale alimentação ou cartão |

Sem informar mais nada, a despesa é dividida **entre todos os participantes** do grupo — o
caso mais comum. Cada um passa a dever a sua parte a quem pagou; quem pagou não deve nada a
si mesmo.

### Os centavos que não fecham

R$ 10,00 entre 3 pessoas vira **3,34 / 3,33 / 3,33**, e a soma volta a ser exatamente
10,00.

Se o sistema simplesmente arredondasse para baixo, daria 9,99 e o grupo ficaria devendo um
centavo a ninguém — para sempre, e crescendo a cada conta.

## Excluir uma despesa

Toque no ícone de lixeira. Só é possível **antes** do fechamento do mês: depois, apagar
sumiria com o registro de um dinheiro que já trocou de mãos.

## Fechar o mês

Na seção **Fechamento do mês**, escolha o mês. A tela mostra, **sem gravar nada**:

### O saldo de cada um

Quanto a pessoa desembolsou **menos** a soma das cotas dela.

Exemplo, com total de R$ 210,00 e cota de R$ 70,00 cada:

| Participante | Pagou  | Deveria | Saldo      |
| ------------ | ------ | ------- | ---------- |
| Ana          | 150,00 | 70,00   | **+80,00** |
| Bruno        | 60,00  | 70,00   | −10,00     |
| Carla        | 0,00   | 70,00   | −70,00     |

Quem pagou pelos outros tem a receber **a diferença**, não o valor cheio que colocou — é o
que o "abater" significa na prática.

### Para acertar

O plano de pagamentos, já compensado: **quem paga quem, e quanto**.

No exemplo acima, sem compensação seriam quatro cobranças; com ela são duas, ambas para a
Ana. Num grupo de cinco pessoas com contas cruzadas, a diferença é entre quatro pagamentos e
quatorze — e ninguém executa quatorze.

### Confirmar

O botão **Fechar** pede confirmação, dizendo o que vai acontecer: as dívidas do mês são
substituídas pelo plano acima. **Não pode ser desfeito.**

Depois de fechado, as dívidas individuais daquele mês somem — foram absorvidas pelas
transferências. Mantê-las abertas cobraria duas vezes.

Um mês só fecha uma vez.

## O que acontece com as contas do grupo

Cada cota vira uma conta normal: aparece nas suas telas de **a receber** e **a pagar**, e no
**orçamento do mês**, junto com o resto. Não há uma "carteira do grupo" separada — é o mesmo
dinheiro.
