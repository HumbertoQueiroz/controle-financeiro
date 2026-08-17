# 13. Fechamento com um participante

## Com quem as contas estão abertas

Em **Mais → Participantes**. É a lista de todo mundo com quem você tem conta pendente, com o
saldo de cada um: positivo quem deve a você, negativo quem você deve.

No topo, os dois totais do mês. Tocar numa pessoa abre o fechamento dela, já no mês que você
estava vendo.

> **Quem está quite continua na lista**, numa faixa de "sem pendência" no fim. Sumir da tela
> e não dever nada são coisas diferentes, e a primeira faz procurar o cadastro achando que
> ele se perdeu.

O recorte é **até** o fim do mês escolhido, e não só dentro dele: uma conta de junho que
ninguém pagou continua devida em agosto e precisa aparecer.

É o acerto de contas com **uma pessoa**: junta tudo que está em aberto entre vocês dois,
mostra o saldo, permite quitar em lote e imprimir o papel.

> Não confunda com o [fechamento de grupo](06-grupos.md), que resolve quem paga quem entre
> vários participantes de um rolê. Aqui são só vocês dois.

## Abrir

Em **Mais → Pessoas**, toque em **Fechamento** ao lado da pessoa.

## O que entra

Tudo que está em aberto com aquela pessoa e vence **até o fim do mês escolhido** — inclusive
o que ficou dos meses anteriores.

As contas antigas entram de propósito. Uma dívida de junho que ninguém pagou continua devida
em agosto, e um fechamento que a ignorasse produziria um acerto que não acerta nada: a conta
velha seguiria pendurada, fora de qualquer papel.

Cada linha mostra **o que falta**, não o valor original. Uma conta de R$ 100 com R$ 40 já
pagos entra por R$ 60 — pelo valor cheio, o acerto cobraria de novo o que já foi pago.

## Pular uma conta

Cada linha tem uma marca de seleção, e a **linha inteira** é o alvo do toque. Desmarcar tira
a conta deste fechamento; ela continua em aberto para o próximo.

É o caminho para fechar o mês deixando de lado uma conta ainda em discussão.

**O saldo é recalculado na hora**, a cada marca que você tira ou põe. O número que você
confirma é o número que está vendo.

## Imprimir

O botão **Imprimir relatório** abre a impressão do navegador — de onde você também consegue
salvar em PDF, escolhendo "Salvar como PDF" no destino.

A folha sai limpa: sem menus, sem botões, sem as marcas de seleção, em preto sobre branco
mesmo se você usa o tema escuro. No fim há **espaço para as duas assinaturas**.

Como a folha é a própria tela, o que você conferiu é exatamente o que sai impresso.

## Quitar

O botão **Quitar** abre a confirmação, com:

| Campo                   | Observação                                     |
| ----------------------- | ---------------------------------------------- |
| **Data da quitação**    | Fica registrada em cada baixa deste fechamento |
| **Lançar a diferença**  | Marcado por padrão quando sobra saldo          |
| **Descrição do acerto** | Vem pronta, e você pode reescrever             |
| **Vencimento e forma**  | Do título novo da diferença                    |

Ao confirmar:

1. Cada conta marcada recebe uma baixa com a observação
   **"Quitado no fechamento nº 5 - Agosto/2026"** — é por ela que você reencontra o que
   entrou em cada acerto.
2. Se sobrar diferença e você tiver deixado marcado, nasce uma conta nova com o saldo, no
   nome de quem ficou devendo.

## O número do fechamento

Cada acerto seu recebe um número em sequência: `nº 1`, `nº 2`, e assim por diante. É o número
que aparece no papel e nas observações das baixas, e é **seu** — não é compartilhado com
outros usuários do sistema.

## Se a pessoa também tem conta

Quitar uma dívida **sua** com alguém que usa o sistema continua dependendo da confirmação
dela, como em qualquer baixa. O fechamento organiza o acerto; ele não transforma uma dívida
sua em paga sem quem recebe reconhecer. Veja
[Contas a receber e a pagar](03-contas.md#quando-a-dívida-é-com-outra-pessoa-do-sistema).

O que ela deve a você é quitado na hora — ali quem recebe é você.

## Se algo mudou enquanto você conferia

Se uma das contas selecionadas foi quitada ou alterada em outra aba, o sistema **recusa o
fechamento inteiro** e pede para recarregar. Quitar só o que sobrou mudaria o saldo, e o
acerto sairia de um total diferente do que você viu na tela.
