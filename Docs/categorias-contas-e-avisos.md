# Categorias, contas, avisos e busca

Quatro assuntos pequenos que compartilham um princípio: **nada aqui é obrigatório**.
`Obligation.categoryId` e `Payment.accountId` são nulos, e o sistema inteiro funciona sem
que ninguém classifique nada. Uma coluna obrigatória exigiria inventar uma categoria "Sem
categoria" e carimbá-la em tudo — o mesmo que nulo, com mais trabalho e menos honestidade.

## Categoria

`Category` é do **usuário**, não global: cada um organiza as próprias contas do jeito que
pensa nelas, e uma lista imposta viraria a categoria "Outros" levando metade dos
lançamentos.

- **Arquiva, não exclui.** Apagar acionaria o `SET NULL` e tiraria a classificação dos
  lançamentos antigos — o relatório do ano passado mudaria retroativamente. Arquivar some
  das listas de escolha e mantém a história inteira.
- **Criar com o nome de uma arquivada a desarquiva.** É o que a pessoa quer dizer ao digitar
  o mesmo nome; um erro de duplicidade só a mandaria procurar onde a categoria se escondeu,
  e criar uma homônima deixaria os lançamentos antigos órfãos da nova.
- **`direction` nula serve aos dois lados.** "Transporte" pode ser gasto e reembolso.
- A recorrência também tem categoria, e as parcelas a **herdam**: classificar o salário uma
  vez basta.

### A categoria do cartão fica no lançamento, não na obrigação

`InvoiceEntry.categoryId`. A obrigação do cartão é a **fatura inteira**, e categorizá-la só
permitiria dizer "mil reais de cartão" — que não responde nada. A pergunta que a categoria
existe para responder é em que o mês foi gasto, e isso só a linha do extrato sabe.

Duas consequências:

- **O relatório troca a obrigação da fatura pelos lançamentos dela.** Contar as duas coisas
  somaria o mês duas vezes; contar só a obrigação daria uma linha "Sem categoria" do
  tamanho da fatura.
- **O realizado de uma compra é tudo ou nada.** Ninguém paga uma linha da fatura: ou ela foi
  quitada, e aí tudo que está nela foi pago, ou não. Ratear um pagamento parcial entre as
  compras inventaria uma precisão que o extrato não tem.

A classificação acontece **na tela de importação**, junto do responsável: é ali que se sabe
o que a compra foi. Duas semanas depois, "PG *IFD" não diz nada a ninguém. E a sugestão vem
do que descrições iguais já receberam naquele cartão, como na classificação em lote.

O repasse a terceiro **herda** a categoria da compra: é o mesmo gasto visto do outro lado, e
classificar duas vezes a mesma coisa só cria chance de divergir.

## Limite por categoria

`CategoryBudget` com `month` nulo é o limite **padrão**, que vale para todo mês sem ajuste
próprio; com mês preenchido, é o daquele mês, e ele tem precedência. Assim o limite de
mercado se define uma vez, e dezembro ainda pode ter o seu.

O `upsert` do Prisma não aceita nulo em chave composta, então `definirLimite` busca e
decide. A corrida é irrelevante: duas gravações simultâneas do mesmo limite acabam no
mesmo valor.

## Relatório por categoria

`GET /relatorios/categorias?mes=AAAA-MM&direcao=`.

O recorte é o **vencimento**, como no orçamento: a categoria responde "quanto assumi de
mercado neste mês". Pela data da baixa, a conta de agosto paga em setembro sairia do mês em
que foi assumida.

Duas decisões de apresentação:

- **"Sem categoria" é uma linha de verdade**, e não uma omissão: é ela que mostra quanto do
  mês ainda não foi classificado, e some sozinha quando tudo estiver.
- **`consumo` passa de 1 quando estoura.** Cortar em 1 esconderia o tamanho do estouro, que
  é justamente o que faz alguém mudar de comportamento. Na tela, a barra para em 100% da
  largura (senão quebra o layout) mas o texto diz a porcentagem real.

## Classificação em lote

`GET /classificar` devolve os lançamentos **sem categoria** agrupados pela descrição
normalizada; `POST /classificar` aplica uma categoria a vários de uma vez.

O agrupamento é a funcionalidade inteira. Classificar um a um é o que faz ninguém
classificar: doze corridas de Uber são doze decisões idênticas, e pela descrição viram uma.

- **A normalização é a mesma da deduplicação de fatura** — trim, espaços colapsados, caixa
  alta. O extrato do banco varia o espaçamento entre exportações, e sem isso "UBER TRIP" e
  "UBER TRIP" seriam dois grupos para a pessoa classificar duas vezes.
- **A chave inclui o lado.** Uma categoria de saída não serve a uma entrada; juntar os dois
  lados obrigaria a escolher uma categoria que só faz sentido para metade do grupo.
- **A sugestão vem do que já foi classificado.** Um lançamento com a mesma descrição que já
  recebeu categoria vira a sugestão, marcada de saída — quem não concordar troca, o que é
  menos trabalho que confirmar uma a uma. Categoria arquivada não sugere: seria oferecer de
  volta o que a pessoa tirou das listas de propósito.
- **Grupos maiores primeiro**, porque são os que mais reduzem a lista a cada decisão.
- **`updateMany` com o dono no filtro**, e não um laço de `update`: a checagem de posse vira
  parte da própria escrita, e um id de outra pessoa simplesmente não casa — em vez de
  depender de uma verificação anterior que alguém pode esquecer de fazer.
- **Os lançamentos de cartão entram na mesma lista.** Para quem classifica, "Uber" é uma
  decisão só, tenha vindo do extrato ou de um lançamento à mão. Sem eles, a linha "Sem
  categoria" do relatório teria uma parte que nada nesta tela consegue limpar. A escrita
  roda o mesmo conjunto de ids nas duas tabelas: um id existe numa ou na outra, nunca nas
  duas, então não há ambiguidade a resolver e a tela não precisa carregar de onde cada
  linha veio.

Na tela, a escolha de cada grupo fica no estado local até aplicar. Gravar a cada seleção
faria a lista se reordenar debaixo do dedo — o grupo classificado sai dela — e a próxima
escolha cairia no grupo errado.

## Conta bancária e saldo

`BankAccount` responde a pergunta que o orçamento sozinho não responde: **quanto eu tenho**.

O saldo **não é coluna**. É `initialBalance` mais os pagamentos que entraram, menos os que
saíram. Guardar o número faria ele divergir do extrato no primeiro estorno, e a divergência
só apareceria quando alguém conferisse — tarde demais para saber o que aconteceu.

Duas regras no cálculo:

- **O lado da obrigação define o sentido.** Pagar um título em que sou o credor é dinheiro
  entrando; em que sou o devedor, saindo.
- **Só entram pagamentos confirmados.** Um pagamento que o devedor declarou e ninguém
  reconheceu não moveu dinheiro, e somá-lo mostraria na conta um saldo que o banco não tem.

`initialBalance` aceita negativo (cheque especial), ao contrário dos valores de título.

## Avisos

`GET /avisos`, **derivados**. Não há tabela de notificação: nada aqui gera ou guarda aviso,
tudo é calculado na consulta. Derivar garante que o aviso suma sozinho quando a causa deixa
de existir, sem ninguém precisar apagá-lo.

| Tipo                  | Quando                                         | Gravidade |
| --------------------- | ---------------------------------------------- | --------- |
| `ATRASADO`            | Venceu e ninguém pagou                         | alta      |
| `LIMITE_ESTOURADO`    | O gasto do mês passou do limite da categoria   | alta      |
| `VENCE_EM_BREVE`      | Vence nos próximos 7 dias                      | média     |
| `CONFIRMAR_PAGAMENTO` | Alguém declarou pagamento e você é quem recebe | média     |
| `FECHAMENTO_PENDENTE` | Uma agenda de fechamento tem mês esperando     | média     |

**A entrega é dentro do app.** Não há SMTP, push nem fila neste sistema, por decisão de
arquitetura — quem não abre o app não é avisado, e o Manual diz isso. Prometer aviso que não
chega é pior que não prometer.

O contador do sino só fica vermelho com gravidade alta: um contador sempre vermelho vira
ruído, e o dia em que a cor importa passa despercebido.

### Confirmação de leitura

`POST /avisos/leitura` (um id, uma lista, ou `todos`) e `DELETE /avisos/leitura/:avisoId`.

`NoticeRead` é a **única** coisa persistida do domínio de avisos, e guarda a leitura, nunca o
aviso: qual aviso a pessoa viu, e em que estado ele estava.

Esse "em que estado" é a `assinatura` — `detalhe|valor` —, e é o que impede a confirmação de
virar um silenciador permanente. Um aviso só conta como lido quando o id **e** a assinatura
batem; se o motivo mudou, ele volta como não lido. A dívida atrasada de R$ 1.850 que recebeu
um pagamento parcial passa a cobrar R$ 1.000: é outro problema, e o "já vi" do anterior não
vale para ele.

Três detalhes que caem por terra se invertidos:

- **O título fica fora da assinatura.** Ele é o nome do lançamento e muda com uma correção
  de digitação, o que ressuscitaria o aviso sem nada ter acontecido.
- **`upsert`, e não `createMany` com `skipDuplicates`.** Reconfirmar precisa sobrescrever a
  assinatura; ignorando o conflito, o aviso que mudou e voltou continuaria batendo com a
  leitura antiga e sumiria de novo.
- **Só confirma o que está na lista.** Um id inventado, ou de um aviso que deixou de
  existir, não cria leitura — senão ela ficaria guardada esperando para calar o aviso de
  verdade se um dia o id coincidisse.

Confirmar não ressuscita nada: um aviso cuja causa acabou some da lista ativa **e** da de
confirmados. A leitura guardada fica órfã e inofensiva.

O `DELETE` existe porque confirmar é um clique fácil de dar sem querer, e sem o caminho de
volta a única saída seria esperar o motivo mudar sozinho.

## Busca

`GET /busca?q=` sobre lançamentos, pessoas, cartões e grupos.

`contains` com `insensitive`, e não busca full-text: o volume é o de um controle pessoal, e
um índice GIN com `tsvector` traria configuração de dicionário, stemming em português e uma
migration só para isso. Se um dia ficar lento, o caminho está anotado no serviço.

O mínimo é **dois caracteres**: com um só, quase todo lançamento casa e o resultado é a
lista inteira — o que parece uma busca quebrada e custa uma varredura completa a cada tecla.

O corte é **por tipo**, e não no total: trezentos lançamentos empurrariam para fora a única
pessoa que casava com o termo, que costuma ser exatamente o que se procurava. Quando corta,
`truncado` avisa — sem isso, "não achei" e "achei demais e escondi" ficam iguais na tela.

## Fechamento recorrente

`SettlementSchedule`, uma por pessoa. Ela **não fecha nada sozinha**: marca a partir de que
dia o acerto passa a ser cobrado na tela e nos avisos. Fechar por conta própria quitaria
títulos sem ninguém conferir, e a conferência é a razão de o fechamento existir.

O mês devido é sempre o **anterior** ao corrente, e só depois do dia combinado: o fechamento
de agosto só faz sentido quando agosto acabou. Cobrar o acerto de agosto no dia 5 de agosto
pediria para conferir contas que ainda vão nascer.

Desligar preserva `lastMonth`. Religar meses depois não deve cobrar de uma vez todos os
acertos que não foram feitos enquanto a agenda estava desligada.
