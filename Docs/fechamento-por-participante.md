# Fechamento por participante

O acerto de contas com **uma pessoa**, num mês. Não confundir com o
[fechamento de grupo](rateio-de-grupo.md), que resolve quem paga quem entre vários.

`GET /participantes/:id/fechamento?mes=AAAA-MM` monta a conferência;
`POST /participantes/:id/fechamento/quitar` executa.

## O recorte é até o mês, não dentro dele

`dueDate < primeiro dia do mês seguinte`, sem piso.

Uma dívida de junho que ninguém pagou continua devida em agosto. Um fechamento que só
olhasse agosto produziria um acerto que não acerta nada: a conta velha seguiria pendurada,
fora de qualquer papel, para sempre. O corte por baixo existiria para separar períodos — mas
períodos já foram separados pelos fechamentos anteriores, que quitaram o que entrou neles.

## As duas pontas, e todas as fichas

A busca cobre os dois sentidos: `(devedor = participante, credor = eu)` e o inverso. Um
fechamento de um lado só não é um fechamento.

Do lado do participante, quando ele **tem conta**, entram todas as `Person` que apontam para
o mesmo `userId` — não só a ficha da minha agenda. É o mesmo princípio de `fichasDoUsuario`:
sem isso, a dívida que ele lançou no meu nome ficaria de fora, e o acerto sairia errado
justamente no caso em que os dois lados usam o sistema.

## O que entra na conta é o restante

`amount − settledAmount`, nunca o valor cheio. Um título pago pela metade entra pela metade
que falta; pelo cheio, o acerto cobraria de novo o que já foi pago.

## Numeração

`User.nextSettlementNumber`, com `@default(1)`.

Por **usuário**, e não global: "o fechamento nº 3" precisa ser um número que a pessoa
reconheça no próprio papel, e um contador compartilhado faria os números dela saltarem
conforme outros usuários fechassem contas.

O incremento é `{ increment: 1 }` dentro da transação, e o número usado é o valor devolvido
menos um. Ler, somar e gravar daria o mesmo número a dois fechamentos simultâneos, e dois
papéis diferentes passariam a se chamar "fechamento nº 7".

## Textos padrão

Moram em `packages/shared/src/schemas/fechamento.ts`, e são os mesmos na tela e no servidor:

| Função                 | Resultado                                      |
| ---------------------- | ---------------------------------------------- |
| `observacaoDaQuitacao` | `Quitado no fechamento nº 5 - Agosto/2026`     |
| `descricaoDoAcerto`    | `Acerto do fechamento nº 5 do mês Agosto/2026` |

Duas cópias divergiriam na primeira correção de texto, e o histórico ficaria com duas
redações para a mesma coisa — justo no campo que a pessoa usa para achar o acerto meses
depois.

## Seleção e recusa

O corpo traz `lancamentosIds`, e o serviço **recusa** se algum id não for encontrado entre
os títulos abertos daquele participante. Quitar só o que deu para achar mudaria o saldo, e o
acerto sairia de um total que a pessoa não viu na tela — um id que já foi quitado noutra aba
é exatamente esse caso.

O que fica de fora continua em aberto, e é o que permite fechar o mês deixando de lado uma
conta ainda em discussão.

## A baixa segue a regra da confirmação

O fechamento usa `nasceConfirmado`, o mesmo de
[a baixa avulsa](lancamentos-e-orcamento.md#pagamento-pendente-de-confirmação): quitar uma
dívida **minha** com quem tem conta continua dependendo da palavra de quem recebe. O
fechamento organiza o acerto; ele não dá ao devedor um atalho para dar a própria dívida por
paga.

## O título do acerto

Nasce só quando o saldo dos selecionados é diferente de zero, e o valor é sempre **absoluto**
— quem deve a quem está nas duas pontas, e um valor negativo faria a mesma informação existir
em dois lugares.

Origem `MANUAL`, portanto editável e excluível como qualquer lançamento à mão. É de
propósito: um acerto combinado no papel muda de valor com uma conversa, e travá-lo obrigaria
a desfazer o fechamento inteiro para corrigir uma vírgula.

## Impressão

A folha é a **mesma tela**, com `@media print` escondendo a navegação (`.sem-impressao`) e
revelando o bloco de assinaturas (`.apenas-impressao`). O tema é forçado a preto sobre
branco: o escuro imprimiria uma página inteira de toner, e os cinzas do claro somem no papel.

Montar um segundo HTML só para o PDF divergiria da tela no primeiro ajuste, e o número
conferido deixaria de ser o número impresso — que é o que ninguém pode descobrir depois de
assinar.

## A lista de saldos

`GET /participantes/saldos?mes=AAAA-MM`, e a tela `/app/participantes`.

O fechamento já respondia "quanto eu tenho com fulano", mas para **uma** pessoa por vez —
descobrir com quem havia pendência exigia abrir uma tela por participante, que é a primeira
pergunta que se faz.

O recorte é o mesmo do fechamento: tudo que vence **até** o fim do mês. Uma conta de junho
que ninguém pagou continua devida em agosto, e uma lista que só olhasse dentro do mês
esconderia justamente a dívida mais antiga.

Três decisões:

- **Uma consulta, agrupada em memória.** Uma por pessoa seria N consultas para montar uma
  tela, e a agenda cresce.
- **Um saldo com sinal**, e não dois campos e uma bandeira. Quem varre a lista quer saber de
  que lado está; somar duas colunas de cabeça a cada linha é o que a tela existe para
  evitar. As duas pontas ficam ao lado, em texto pequeno.
- **Quem está quite continua na tela**, numa faixa separada. "Não aparece" e "não deve nada"
  são coisas diferentes, e confundi-las faz procurar o cadastro achando que ele sumiu.

O mapa de ficha → participante é o mesmo do fechamento: quem tem conta aparece na agenda de
várias pessoas, e todas essas fichas são a mesma pessoa. Sem o mapa, a dívida que ele lançou
no meu nome ficaria fora do saldo — o caso em que os dois lados usam o sistema.
