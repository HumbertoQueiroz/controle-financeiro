# 5. Parcelamentos

Em **Mais → Parcelamentos** (ou na barra lateral, no computador).

Esta tela responde o que não cabe na fatura: **quanto ainda falta de cada compra parcelada
e em que meses ela vai continuar aparecendo**. Olhando fatura a fatura, você teria de abrir
doze meses e somar à mão.

## Como um parcelamento nasce

Sozinho, ao importar a fatura. Quando o extrato traz uma compra parcelada — "Farmácia 3/10",
"Notebook 1/12" —, o sistema cria o parcelamento e lança **todas as parcelas restantes** nas
faturas futuras.

Nos meses seguintes, quando aquela parcela aparecer no extrato, ela é reconhecida e
ignorada, porque já existe.

## O que cada cartão mostra

| Informação             | Onde aparece                                              |
| ---------------------- | --------------------------------------------------------- |
| **Descrição**          | No topo                                                   |
| **Cartão**             | Etiqueta com o nome do cartão em que a compra foi passada |
| **Progresso**          | "3 de 10 parcelas de R$ 89,90"                            |
| **Valor total**        | À direita                                                 |
| **Quanto falta**       | Abaixo do total                                           |
| **Meses das parcelas** | Uma etiqueta por parcela                                  |

A etiqueta do cartão existe porque, olhando um lançamento solto na fatura, não dá para
saber de onde ele veio quando você tem mais de um cartão.

## As etiquetas das parcelas

| Aparência              | Significado                                         |
| ---------------------- | --------------------------------------------------- |
| **Preenchida**         | A parcela já veio num extrato de verdade            |
| **Contorno tracejado** | A parcela é projeção: ainda não apareceu no extrato |

Só as preenchidas contam como pagas. Se as projetadas contassem, o "quanto falta" pareceria
menor do que é — o sistema estaria dando por concluído um pagamento que ainda não aconteceu.

## Trocar quem paga

Use **Quem paga** no rodapé do cartão. A troca vale para **todas as parcelas, inclusive as
futuras**.

É intencional: se a compra era do Bruno, todas as doze são dele. Corrigir uma a uma seria
trabalho repetido e abriria espaço para metade ficar num responsável e metade em outro.

Ao escolher alguém, cada parcela vira uma conta a receber daquela pessoa, nos respectivos
meses. Ao voltar para **Meu**, essas cobranças são canceladas.

## Remover parcelas futuras

O botão **Remover parcelas futuras** apaga o parcelamento e as parcelas **que ainda não
apareceram em extrato**.

As que já vieram do banco **ficam**: elas são fato consumado, e apagá-las mudaria o total de
faturas passadas que você já conferiu.

Use quando a compra foi cancelada, ou quando você quitou o parcelamento de uma vez e as
parcelas seguintes não vão mais chegar.

> Se todas as parcelas já vieram de extrato, não há o que remover, e o sistema avisa.
