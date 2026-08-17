# 3. Contas a receber e a pagar

São duas telas com o mesmo funcionamento, trocando apenas o lado do dinheiro.

- **A receber** — salário, reembolsos, o que alguém lhe deve.
- **A pagar** — aluguel, assinaturas, a fatura do cartão, sua parte no rateio.

## Filtrar o que aparece

No topo, as setas escolhem o mês. Abaixo, três filtros:

| Filtro        | Mostra                            |
| ------------- | --------------------------------- |
| **Em aberto** | O que ainda não foi pago (padrão) |
| **Baixadas**  | O que já foi pago                 |
| **Todas**     | Tudo                              |

## Lançar uma conta

Toque em **Nova entrada** ou **Nova saída**.

| Campo                   | Observação                                      |
| ----------------------- | ----------------------------------------------- |
| **Descrição**           | O que é: "Salário", "Aluguel", "Conta de luz"   |
| **Valor**               | Maior que zero                                  |
| **De quem / Para quem** | Opcional. Quem paga ou recebe                   |
| **Forma de pagamento**  | Dinheiro, permuta, vale alimentação ou cartão   |
| **Se repete todo mês**  | Marque para criar uma recorrência (veja abaixo) |
| **Categoria**           | Opcional. Em quê o dinheiro entra ou sai        |
| **Vencimento**          | Quando vence                                    |

O campo de contraparte é livre e opcional: para lançar o salário você escreve "Empresa X"
sem precisar cadastrar a empresa como pessoa. A lista de pessoas é para quem participa das
suas contas, não para toda origem de dinheiro.

## Cadastrar o que se repete todo mês

Ao marcar **Se repete todo mês**, os campos mudam:

| Campo                 | Observação                                              |
| --------------------- | ------------------------------------------------------- |
| **Dia do vencimento** | Em meses que não têm esse dia, cai no último dia do mês |
| **A partir de**       | Primeiro mês em que passa a valer                       |
| **Até**               | Opcional. Sem preencher, não tem prazo                  |

A partir daí, toda vez que você abrir um mês dentro da vigência, a parcela daquele mês é
criada sozinha.

**Cada parcela é um lançamento de verdade**, não um cálculo de tela. Isso significa que
você pode dar baixa em uma delas, corrigir o valor de um mês específico (o mês que veio
menor) e ver o que de fato aconteceu, mês a mês.

Abrir o mesmo mês duas vezes, ou em duas abas, não duplica nada.

## Filtrar a lista

Abaixo dos botões de situação há uma segunda linha: **Tudo**, **Dinheiro e vale**,
**Faturas**, **Rateio**, **Repasse de cartão** e **Recorrentes**. Ela separa a lista por
**de onde o lançamento veio**.

São dois eixos independentes: "Em aberto" continua valendo quando você escolhe "Faturas".

> **O que você está vendo fica no endereço.** Mês, situação e filtro entram na URL, então o
> botão voltar do navegador funciona, recarregar a página não perde o lugar, e o link que
> você copiar abre exatamente a mesma lista para quem receber.

## Dar baixa

É o registro de que o dinheiro se moveu. Toque em **Dar baixa** no lançamento.

| Campo             | Observação                                           |
| ----------------- | ---------------------------------------------------- |
| **Data da baixa** | Vem preenchida com hoje, mas é editável              |
| **Valor pago**    | Vem com o valor do título. Mude se pagou outro valor |
| **Observação**    | Opcional                                             |

**Mude a data quando o pagamento não foi hoje.** Se você paga na sexta e registra no
domingo, deixar a data de hoje joga o valor para o caixa da semana errada — e na virada do
mês, para o mês errado.

A observação é opcional mas útil: "paguei em dinheiro", "o Bruno me pagou por Pix". É o que
resolve a dúvida quando você reler isso daqui a três meses.

### Quando o valor pago é diferente

Pagar valor diferente do título é normal, e o campo aceita.

**Pagou a mais?** A diferença são juros ou multa. A tela avisa quanto foi, e o título fica
quitado. Nada mais a fazer.

**Pagou a menos?** A tela pergunta o que aconteceu, porque só você sabe:

| Escolha                 | O que acontece                                       |
| ----------------------- | ---------------------------------------------------- |
| **Desconto**            | O título fica quitado. A diferença é registrada      |
| **Paguei só uma parte** | O título fica **Parcial** e o resto continua devendo |

No caso da parcela, você pode dar baixa quantas vezes precisar, cada uma com sua data e
observação. O lançamento só sai do "em aberto" quando o total é atingido, e a data da baixa
passa a ser a do último pagamento — o que quitou.

> **O desconto não reduz o valor do título.** Ele entra como uma linha à parte, e é isso que
> mantém no histórico quanto a dívida era de verdade. Ele também **não** mexe no saldo da sua
> conta bancária: nada saiu do banco.

## Quando a dívida é com outra pessoa do sistema

Se quem lhe deve — ou a quem você deve — também tem conta aqui, a baixa tem uma etapa a
mais: **quem recebe confirma**.

| Quem dá a baixa | O que acontece                                                       |
| --------------- | -------------------------------------------------------------------- |
| Você, credor    | Vale na hora. A dívida é abatida                                     |
| Quem lhe deve   | Fica **pendente de confirmação** e não abate nada até você confirmar |

A razão é simples: quem paga sabe que pagou, mas só quem recebe sabe se o dinheiro chegou.
Sem a confirmação, a outra pessoa quitaria a dívida com você sozinha, e a conta sumiria da
sua lista de a receber sem nada ter entrado.

O pagamento pendente **aparece para os dois**, com a etiqueta "Pendente de confirmação".
Quem declarou precisa ver que o anúncio foi registrado; quem recebe precisa ver que há algo
esperando.

### Confirmar ou recusar

No lançamento, toque em **Pagamentos** para ver o histórico. Em cada pagamento pendente:

- **Confirmar pagamento** — reconhece que o dinheiro chegou. A dívida é abatida na hora.
- **Não recebi** — apaga a declaração e a conta continua em aberto.

Enquanto houver uma declaração pendente do valor todo, a outra pessoa não consegue declarar
de novo. Isso evita a lista encher de anúncios repetidos enquanto você não olha.

> Se a pessoa **não** tem conta no sistema, nada disso se aplica: você é quem controla o
> lançamento dos dois lados, e a baixa vale assim que você a registra.

## Estornar uma baixa

Toque em **Estornar baixa**. O lançamento volta ao previsto e todos os pagamentos dele são
apagados — inclusive os que ainda aguardavam confirmação.

Estornar é o caminho para corrigir erros: enquanto houver baixa, o sistema recusa alterar o
valor e excluir o lançamento. Não é implicância — apagar um lançamento pago sumiria com o
registro de um dinheiro que trocou de mãos, e mudar o valor para menos do que já foi pago
deixaria a conta com um saldo impossível.

## Excluir

Só aparece em lançamentos que você criou à mão (avulsos e recorrentes) e que ainda não têm
baixa.

Fatura, rateio e repasse **não se editam aqui**: eles vêm de outra tela, e alterar por aqui
deixaria o valor diferente do que os originou. Corrija na origem — na fatura do cartão, na
despesa do grupo.

## O que significam as etiquetas

| Etiqueta     | Significado                                   |
| ------------ | --------------------------------------------- |
| **Baixado**  | Pago por inteiro                              |
| **Parcial**  | Pago em parte; o valor mostrado é o que falta |
| **Atrasado** | Venceu e ainda não foi pago                   |

"Atrasado" vem escrito, e não só em vermelho, para não depender da cor.
