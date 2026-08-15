# Importação de fatura em CSV

`POST /cartoes/:id/importacoes` — `multipart/form-data` com o arquivo e o campo
`mesDeReferencia` (`AAAA-MM`).

## A regra que sustenta tudo

O README permite importar **a mesma fatura várias vezes no mesmo mês**, para atualização
incremental, e proíbe duplicar lançamentos idênticos.

A garantia está no **banco**, não no código: único em `(invoiceId, dedupeHash)` combinado
com `createMany({ skipDuplicates: true })` dentro de uma transação. Consultar antes de
inserir teria corrida — duas importações simultâneas do mesmo arquivo passariam as duas
pela verificação e gravariam tudo em dobro.

## A chave de deduplicação

`SHA-256` de:

```
cartaoId | mesDeReferencia | data (ISO) | descrição normalizada | valor | parcela | ocorrência
```

**Descrição normalizada** = trim + colapso de espaços + maiúsculas. O mesmo lançamento sai
como `MERCADO  SAO JOAO` numa exportação e `Mercado Sao Joao` na seguinte; sem normalizar,
a reimportação criaria uma cópia de cada linha.

**Ocorrência** é o índice da linha entre as linhas idênticas _dentro do arquivo_ (0, 1,
2…). É o componente que evita o erro caro: dois cafés de R$ 12,00 no mesmo dia são duas
despesas reais e produziriam a mesma chave sem ele. A segunda seria descartada como
duplicata, o usuário perderia uma despesa e só descobriria ao conferir o total.

Como a ocorrência vem da ordem no arquivo, o mesmo extrato reimportado gera a mesma
sequência — e linhas novas acrescentadas ao final não deslocam as antigas. É isso que faz a
importação incremental funcionar.

## Layouts

Estratégia por layout em `apps/api/src/lib/csv/layouts.ts`. Cada banco exporta colunas
diferentes; a interface `LayoutDeCsv` (`detectar` + `converter`) permite acrescentar um
banco novo sem tocar no serviço de importação, que é onde mora a regra de idempotência.

| Layout                | Reconhecido por                                                                |
| --------------------- | ------------------------------------------------------------------------------ |
| `nubank`              | `date`, `title`, `amount`                                                      |
| `brasileiro-generico` | `data`/`dt` + `descricao`/`lancamento`/`historico`/`estabelecimento` + `valor` |

O genérico fica por último na lista, para não sequestrar um arquivo que um layout
específico leria melhor.

**Delimitador** é detectado pela linha de cabeçalho. Passar a lista inteira ao `csv-parse`
não funciona: ele trata todos os candidatos como válidos ao mesmo tempo, e `R$ 1.120,50`
quebraria na vírgula decimal, chegando truncado em `1.120`. O cabeçalho é a linha segura
para contar, porque nele os candidatos só aparecem como separador.

**Valores** são convertidos para **string**, nunca `number`: `0.1 + 0.2` já erra na segunda
casa em ponto flutuante, e centavo perdido em fechamento de saldo é bug que ninguém
consegue explicar. A string vai direto para a coluna `Decimal(14,2)`.

**Datas** são construídas com `Date.UTC`. `new Date('2026-08-03')` é meia-noite UTC, que em
fuso negativo cai no dia 2 lido em horário local — o lançamento apareceria no dia anterior,
às vezes no mês anterior. `31/02` é recusado em vez de deixar o `Date` "corrigir" para 3 de
março sozinho.

## Pagamento da fatura

Uma linha é pagamento quando a **descrição** casa com `pagamento`, `pgto`, `pagto` ou
`débito automático`. Nunca pelo sinal do valor: estorno e cashback também vêm negativos, e
tratá-los como pagamento faria a fatura constar como paga sem ninguém ter pago.

O README manda registrar o pagamento **apenas se a fatura estiver em aberto**; caso
contrário, ignorar. O estado consultado é o de **antes** de qualquer escrita da importação
— depois da sincronização a fatura pode virar `PAID`, e a resposta seria outra.

Ignorar é silencioso para o usuário, mas não para o sistema: `ImportBatch.paymentsIgnored`
registra quantos foram descartados. Sem isso, "sumiu um pagamento" vira investigação sem
pista.

## Obrigações geradas

**Uma obrigação por fatura**, com o total e o vencimento dela, e não uma por lançamento.
Ninguém paga cada compra: paga a fatura. Uma por lançamento duplicaria a dívida (a fatura
já é o agregado), faria o relatório de contas a pagar listar dezenas de linhas que não
correspondem a pagamento nenhum, e obrigaria o estorno a cancelar obrigação individual em
vez de simplesmente reduzir o total.

**Mais uma obrigação por lançamento repassado** (`PATCH /lancamentos/:id/repasse`): o
terceiro passa a dever ao dono. As duas coexistem e **não se anulam** — o dono continua
devendo à fatura, e anular uma com a outra faria a fatura parecer menor do que é.

Desfazer o repasse **cancela** a obrigação em vez de apagá-la: se já houve pagamento
parcial, apagar sumiria com o registro de um dinheiro que trocou de mãos. Estorno não pode
ser repassado — seria uma cobrança invertida, com o terceiro a receber por uma compra que
não fez.

## Limitações conhecidas

- Um estabelecimento cujo nome contenha "pagamento" seria lido como quitação da fatura. O
  reconhecimento é por descrição, e não há campo de tipo nos CSVs de banco.
- O total da fatura pode ficar negativo quando há mais estorno que compra no mês. A
  obrigação nesse caso fica em zero — não se "deve menos que zero" —, e o crédito não é
  transportado automaticamente para o mês seguinte.
