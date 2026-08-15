# Rateio de grupo

O segundo pilar do README: em cada rolê um participante paga pelos demais, e no fim do mês
o sistema resolve **quem paga quem, o que é abatido e o saldo final**.

## Estrutura

```
Grupo  →  Rolê (evento, com data)  →  Despesa  →  Cotas
```

O grupo nasce com quem o criou já dentro. Um grupo sem o criador faria a despesa dele não
entrar no rateio, e o saldo fecharia errado na primeira conta.

Os membros são **pessoas da agenda do dono** — logo, o amigo do rolê participa sem precisar
ter conta, que é o que o README pede.

## A despesa

`POST /roles/:id/despesas` recebe quem pagou, o valor, e opcionalmente entre quem dividir e
as cotas explícitas.

- **Sem `participantes`**: divide entre todos os membros. É o caso comum, e digitar a lista
  inteira toda vez seria atrito à toa.
- **Com `cotas`**: divisão desigual. A soma tem de bater **exatamente** com o valor da
  despesa — aceitar diferença faria o rateio distribuir um total diferente do que foi
  gasto, e o erro só apareceria no fechamento, como um saldo que não zera.

Cada participante que não pagou passa a dever a sua cota a quem pagou. A cota de quem pagou
não vira obrigação: ninguém deve a si mesmo, e o banco recusaria a linha.

A obrigação aponta para a **cota** (`ExpenseShare`), não para a despesa, então cada uma fica
rastreável até a linha exata que a originou — o que importa quando só uma delas é acertada.

## Centavos

Toda a aritmética acontece em **centavos inteiros** (`packages/shared/src/rateio.ts`).
Dividir em reais com ponto flutuante perde centavo, e centavo perdido num rateio é saldo
que nunca fecha.

R$ 10,00 entre 3 vira **3,34 / 3,33 / 3,33**, e a soma volta a ser exatamente 10,00.
Truncar daria 9,99 e o grupo ficaria devendo um centavo a ninguém, para sempre. Os centavos
sobrando vão para os primeiros da lista — determinístico, para que recalcular o mesmo
rateio dê sempre o mesmo resultado.

## Fechamento

`GET /grupos/:id/fechamento?periodo=AAAA-MM` — prévia, sem gravar nada.
`POST /grupos/:id/fechamento` — fecha.

A prévia existe porque fechar liquida obrigações, e ninguém deve descobrir o resultado
depois de ele já ter acontecido.

### O saldo

Para cada participante: **quanto desembolsou − a soma das cotas dele**. É essa conta que o
README chama de "o que tem que abater" — quem pagou pelos outros tem a receber a diferença,
não o valor cheio que colocou.

Exemplo com Ana, Bruno e Carla, total de R$ 210,00 (cota de R$ 70,00 cada):

| Participante | Pagou  | Deveria | Saldo      |
| ------------ | ------ | ------- | ---------- |
| Ana          | 150,00 | 70,00   | **+80,00** |
| Bruno        | 60,00  | 70,00   | −10,00     |
| Carla        | 0,00   | 70,00   | −70,00     |

### A compensação

Estratégia gulosa: o maior devedor paga o maior credor, e repete
(`apps/api/src/lib/netting.ts`).

No exemplo acima, sem compensação seriam 4 cobranças (cada um devendo a cada pagante); com
ela são 2, ambas para a Ana. Um grupo de 5 pessoas com despesas cruzadas geraria dezenas de
transferências pequenas, e ninguém executa isso na vida real.

A estratégia gulosa **não** garante o mínimo absoluto de transferências — o problema ótimo é
NP-difícil —, mas garante no máximo **n−1** para n participantes, que já é a diferença entre
"quatro pagamentos" e "quatorze".

O desempate é por id, para que o mesmo conjunto de saldos produza sempre o mesmo plano.
Fechamento que muda de resultado a cada execução é impossível de conferir.

### O que o fechamento grava

Tudo numa transação: o `Settlement`, as transferências, e a liquidação das obrigações do
período. Um fechamento pela metade — transferências gravadas, obrigações ainda abertas —
faria o mês seguinte cobrar de novo o que já foi acertado.

As obrigações individuais são marcadas como liquidadas porque foram **absorvidas** pelas
transferências. Mantê-las abertas cobraria duas vezes.

## Restrições

- Não se remove do grupo quem já participou de despesa: apagaria a cota por cascata e o
  saldo de todo mundo mudaria retroativamente, sem ninguém ter pago nada.
- Não se exclui despesa depois do fechamento: sumiria com o registro de um dinheiro que já
  trocou de mãos.
- Um período só fecha uma vez.
- O período é delimitado pela **data do rolê**, não pela data de cadastro da despesa —
  lançar hoje uma conta do mês passado a coloca no mês certo.
