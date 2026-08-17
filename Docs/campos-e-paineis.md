# Campos e painéis

As correções que valem para o app inteiro e por isso moram no componente, não na tela.

## O campo numérico

`type="number"` do navegador tem três defeitos que aparecem justo em tela de dinheiro. O
componente `Input` corrige os três quando o tipo é numérico, e nenhuma tela precisa saber
disso.

- **A roda do mouse alterava o valor.** Bastava o campo estar com foco e a pessoa rolar a
  página: o valor mudava sem ninguém digitar nada. É o pior dos três porque não deixa
  rastro — só aparece ao conferir o extrato. A correção é tirar o foco no `wheel`;
  `preventDefault` travaria a rolagem da página e o valor mudaria do mesmo jeito.
- **As setinhas** ocupavam a lateral e convidavam a um clique que ninguém quer numa tela em
  que o valor é digitado. Saíram por CSS (`appearance: textfield`).
- **`e`, `E` e `+` passavam**, porque o `number` aceita notação científica. "1e5" é valor
  válido para o navegador e lixo para quem preencheu.

**Campo de dinheiro corta na segunda casa decimal**, na digitação. Dinheiro tem duas casas;
a terceira seria arredondada pelo backend e a tela mostraria um número que não é o que foi
gravado. O corte reescreve o valor no próprio elemento, e não em estado, porque os
formulários daqui são não-controlados — um `useState` quebraria o `form.reset()`.

O que identifica um campo de dinheiro é `step="0.01"`, que já era a convenção do projeto.

## O painel

**Folga lateral para o contorno de foco.** `overflow-y-auto` recorta nos dois eixos, e o
`:focus-visible` desenha 2px de contorno com 2px de deslocamento **fora** da borda do campo
— que, num campo de largura cheia, cai exatamente na aresta do recorte. O sintoma era o
contorno aparecer em cima e embaixo e sumir dos lados. `-mx-1 px-1` na área de rolagem dá os
4px que faltavam.

**Folga no fim.** Colado na aresta inferior, o botão de salvar parecia cortado e virava alvo
de toque na borda da tela. `pb-6` na área de rolagem resolve para todos os painéis de uma
vez.

## As cores da navegação

Azul no que entra, laranja no que sai — e a seta apontando para o **movimento do dinheiro em
relação a você**: entra, seta para baixo; sai, seta para cima, como em extrato bancário.

Separado de positivo/negativo de propósito. Verde e vermelho dizem "bom" e "ruim", e uma
conta a pagar não é má notícia — é uma das duas metades do orçamento. Aqui a cor só diz de
que lado a tela está, vem sempre com o rótulo escrito ao lado, e some na impressão.

## O estado da tela na URL

`useParametroDaUrl` (`apps/web/src/lib/url.ts`) guarda mês, situação, filtro, direção e modo
na querystring, em vez de `useState`.

Isto existe para o link poder apontar para **um recorte**, e não só para uma página. Sem
isso, um "ver todos" levaria à tela certa mostrando outro mês e outro filtro — pior que não
ter link, porque o número visto não seria o número prometido. De quebra, o botão voltar do
navegador passa a funcionar e a tela sobrevive a um recarregamento.

Duas regras:

- **O valor padrão some da URL.** Uma URL que carrega o estado inicial inteiro é ilegível, e
  qualquer link compartilhado vira uma parede de parâmetros.
- **A troca usa `replace`.** Mudar de mês é ajuste da mesma tela, não navegação: empilhando
  no histórico, sair da página depois de olhar seis meses exigiria seis toques no voltar.

O valor lido da URL é texto e pode ser qualquer coisa. Cada tela normaliza o que aceita e cai
no padrão quando não reconhece, em vez de quebrar para quem colou um link editado à mão.

## O filtro de origem em a pagar

A lista aceita `?filtro=faturas|caixa|rateio|cartao|recorrentes`, traduzido na tela para os
parâmetros da API (`origem` e `formaDePagamento`).

O nome na URL é de produto, não de coluna: mudar o que "dinheiro e vale" abrange no futuro
não quebra nenhum link já compartilhado. E o filtro vive numa linha própria, separado de
"em aberto / baixadas / todas" — misturados, escolher "Faturas" pareceria desmarcar "Em
aberto".
