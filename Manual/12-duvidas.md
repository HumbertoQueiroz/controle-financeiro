# 12. Dúvidas comuns

## Contas e valores

### Paguei uma conta e ela sumiu do mês. Onde está?

Ela continua no mês em que **venceu**, não no mês em que você pagou. Volte ao mês do
vencimento e use o filtro **Baixadas** ou **Todas**.

### Por que existem dois saldos no orçamento?

O **previsto** considera tudo que vence no mês, pago ou não — responde "quanto vou ter no
fim do mês". O **realizado** considera só o que já se moveu — responde "quanto entrou e saiu
até agora". As duas perguntas são diferentes e as duas importam.

### O sistema não deixa eu mudar o valor de um lançamento

Porque ele já tem baixa. **Estorne a baixa primeiro**, corrija o valor e dê baixa de novo.

Mudar o valor para menos do que já foi pago deixaria a conta com um saldo impossível, e a
mensagem de erro seria incompreensível.

### Não consigo excluir um lançamento

Duas possibilidades:

- **Ele tem baixa.** Estorne primeiro. Apagar sumiria com o registro de um dinheiro que
  trocou de mãos.
- **Ele veio de outra tela** — fatura, rateio ou repasse. Corrija na origem: alterar aqui
  deixaria o valor diferente do que o gerou.

### Registrei a baixa com a data errada

Estorne e registre de novo com a data certa. A data importa: é ela que coloca o valor no
caixa do mês correto.

## Cartão e fatura

### Importei a mesma fatura duas vezes. Duplicou?

Não. O sistema reconhece o que já entrou e acrescenta só o que é novo — a tela de resultado
mostra quantas linhas foram reconhecidas como já existentes.

Importar várias vezes no mesmo mês é o uso esperado: no meio do mês e de novo no fim.

### Uma compra foi para a fatura do mês seguinte

Está certo, se ela foi feita **depois do dia de fechamento** do cartão. Com fechamento no
dia 25, a compra do dia 28 de agosto entra na fatura de setembro.

Se estiver errado, confira o dia de fechamento cadastrado no cartão.

### O sistema avisou que os lançamentos vão para outro mês

É o aviso de divergência. Ele compara o mês que você escolheu com o que as datas do arquivo
indicam.

Se faz sentido — compras após o fechamento —, use **Confirmar mesmo assim**. Se não, volte e
corrija a fatura das linhas marcadas, ou recomece escolhendo o mês certo.

### Uma parcela do meu parcelamento não foi importada

É o esperado. Ela já foi criada quando o parcelamento apareceu pela primeira vez, e aparece
na seção **Parcelamentos anteriores** justamente para você saber disso.

### Duas compras iguais no mesmo dia viraram uma só?

Não deveriam. Dois cafés de R$ 12 no mesmo dia são reconhecidos como duas despesas
distintas. Se você viu isso acontecer, é um defeito — relate.

### Marquei o gasto como de outra pessoa mas a fatura não diminuiu

Está correto. **A dívida com o cartão continua sua** — você é quem vai pagar o banco. O que a
marcação faz é criar uma conta a receber daquela pessoa.

As duas coexistem porque as duas são verdade. Se uma anulasse a outra, a fatura pareceria
menor do que ela é.

## Grupos

### Fechei o mês e as dívidas individuais sumiram

Sim: elas foram substituídas pelo plano de transferências, que é o resultado compensado.
Mantê-las abertas cobraria duas vezes a mesma coisa.

### Não consigo remover alguém do grupo

Se a pessoa já participou de alguma despesa, remover apagaria a cota dela e mudaria o saldo
de todo mundo retroativamente, sem ninguém ter pago nada.

### O rolê entrou no mês errado

O mês vem da **data do rolê**, não da data em que você o cadastrou. Confira a data do rolê.

## Acesso e compartilhamento

### Compartilhei mas a pessoa diz que não vê nada

Três possibilidades:

1. **Ela ainda não aceitou o convite.** Convites pendentes aparecem na lista de
   compartilhamentos com a data de expiração.
2. **O escopo não cobre o que ela procura.** Um acesso de "somente a pagar" não mostra as
   contas a receber.
3. **Ela não está vinculada à ficha dela.** Se você lançou dívidas no nome dela antes de ela
   ter conta, é preciso indicar isso no convite, no campo **É alguém da sua lista?**. Sem o
   vínculo, ela entra e vê uma tela vazia.

### O convite expirou

Convites valem 7 dias. Compartilhe de novo com o mesmo e-mail: um link novo é gerado e o
antigo deixa de valer.

### Enviei o convite para o e-mail errado

Retire o convite pendente na lista (ícone de lixeira) e compartilhe de novo com o endereço
certo. O link antigo para de funcionar.

### Tirei o acesso de alguém. Quando começa a valer?

Imediatamente, na consulta seguinte da pessoa.

## Conta e privacidade

### Esqueci minha senha

Não há recuperação por e-mail nesta versão. Peça a quem administra o sistema para criar uma
senha provisória — você será obrigado a trocá-la no primeiro acesso.

### Quero apagar tudo sobre mim

Use **Excluir minha conta**, em Minha conta. Seus dados pessoais são removidos e o acesso
encerrado; os valores das dívidas permanecem, sem identificar você, porque são também de
outras pessoas. O capítulo [Minha conta](10-minha-conta.md) explica em detalhe.

### O sistema guarda o número do meu cartão?

Não. Apenas os **quatro últimos dígitos**, e mesmo assim opcionalmente. Número completo, CVV
e validade não têm campo em lugar nenhum do sistema.

### O sistema acessa minha conta bancária?

Não. Não há conexão com banco nenhum, e o sistema não movimenta dinheiro. Tudo aqui é
anotação: os pagamentos acontecem fora, entre as pessoas.

## Interface

### A tela ficou apertada no celular

Listas viram cartões empilhados abaixo de uma certa largura, e não deve haver rolagem
lateral em nenhuma tela. Se você encontrou uma que rola para o lado, é um defeito — relate.

### Como mudo para o tema escuro?

O ícone de lua no topo, no celular, ou na barra lateral no computador. A escolha fica
guardada. Sem escolher, o sistema segue a preferência do seu aparelho.
