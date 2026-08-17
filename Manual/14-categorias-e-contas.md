# 14. Categorias, contas, avisos e busca

Quatro recursos que respondem perguntas que o orçamento sozinho não responde.

> **Nada aqui é obrigatório.** O sistema funciona inteiro sem você classificar um lançamento
> ou cadastrar uma conta. Use o que ajudar.

## Categorias

Em **Mais → Categorias**. É o que faz o sistema responder **em quê** você gasta, e não só
quanto você deve.

### Criar

| Campo             | Observação                                                 |
| ----------------- | ---------------------------------------------------------- |
| **Nome**          | "Mercado", "Transporte", "Salário"                         |
| **Cor**           | Aparece como um ponto ao lado do lançamento e no relatório |
| **Serve para**    | A receber, a pagar, ou os dois                             |
| **Limite mensal** | Opcional. Passando dele, um aviso aparece                  |

### Classificar um lançamento

O campo **Categoria** está no painel de nova entrada e nova saída. Também dá para deixar em
branco e classificar depois, editando o lançamento.

**Na fatura do cartão, a categoria é de cada compra**, e você a escolhe na tela de
classificação da importação (veja [o capítulo 4](04-cartao.md)). É assim porque a fatura
inteira é uma dívida só: classificá-la diria apenas "mil reais de cartão", que não responde
em que o mês foi gasto.

> **Uma compra do cartão conta como paga quando a fatura é paga.** Ninguém paga uma linha
> da fatura, e ratear um pagamento parcial entre as compras inventaria uma precisão que o
> extrato não tem.

Nas contas recorrentes, a categoria fica no cadastro e **toda parcela a herda** — classificar
o salário uma vez basta.

### O relatório

A própria tela de Categorias mostra, para o mês escolhido: o total, quanto foi para cada
categoria, e uma barra de consumo quando há limite.

Uma linha se chama **"Sem categoria"**: é quanto do mês ainda não foi classificado. Ela some
sozinha quando você classificar tudo.

> **A barra para em 100%, mas o texto não.** Um mês com 150% do limite mostra "150% ·
> estourou". Cortar o número em 100% esconderia o tamanho do estouro, que é justamente o que
> faz alguém mudar de comportamento.

### Classificar em lote

Quando a linha **"Sem categoria"** aparece no relatório, um botão **Classificar em lote**
aparece junto dela. Ele abre a tela que resolve o acúmulo de uma vez.

Os lançamentos vêm **agrupados pela descrição**: as doze corridas de Uber são um grupo só,
com o total e o período que cobrem. Uma escolha classifica as doze.

| O que a tela faz                | Por quê                                              |
| ------------------------------- | ---------------------------------------------------- |
| Agrupa por descrição            | Classificar um a um é o que faz ninguém classificar  |
| Junta cartão e lançamento à mão | "Uber" é uma decisão só, venha do extrato ou não     |
| Ignora espaçamento e maiúsculas | O extrato do banco varia a escrita entre exportações |
| Separa entrada de saída         | Uma categoria de saída não serve a uma entrada       |
| Mostra os maiores grupos antes  | São os que mais diminuem a lista a cada escolha      |
| **Sugere** o que você já usou   | Quem classificou "Uber" uma vez não decide de novo   |

A sugestão vem **já marcada** — se estiver certa, é só aplicar; se não, troque no seletor. O
botão só grava quando você toca nele, então dá para decidir tudo com calma e aplicar de uma
vez.

Se aparecer "há mais grupos do que cabe numa tela", aplique os que estão e os próximos
surgem.

### Arquivar

Não existe excluir categoria, e é de propósito: apagar tiraria a classificação dos
lançamentos antigos, e o relatório do ano passado mudaria sozinho. **Arquivar** tira a
categoria das listas de escolha e mantém a história inteira.

Para trazer de volta, abra **Categorias arquivadas** no fim da tela e toque na seta de
desfazer. Criar uma categoria com o nome de uma arquivada também a traz de volta.

## Contas

Em **Mais → Contas**. É onde o dinheiro fica: conta corrente, poupança, carteira, vale.

| Campo             | Observação                                                |
| ----------------- | --------------------------------------------------------- |
| **Nome**          | "Conta corrente", "Nubank", "Dinheiro na carteira"        |
| **Tipo**          | Corrente, poupança, carteira ou vale alimentação          |
| **Saldo inicial** | O saldo de **hoje**. O que aconteceu antes não entra aqui |

### Como o saldo se move

Ao dar baixa num lançamento, escolha a **conta** por onde o dinheiro passou. O saldo dela
acompanha: entra o que você recebe, sai o que você paga.

O campo só aparece depois que existe pelo menos uma conta, e nunca é obrigatório — uma baixa
sem conta continua valendo, só não mexe em saldo nenhum.

> **O saldo é sempre calculado, nunca guardado.** Estornar uma baixa devolve o valor à conta
> na hora. Não há um número que possa ficar diferente do que aconteceu.

**Pagamento pendente de confirmação não entra no saldo.** Enquanto quem recebe não confirma,
o dinheiro não se moveu — e mostrar na conta um valor que o banco não tem seria pior que não
mostrar nada.

## Avisos

O **sino** no topo. O número em vermelho é o que exige ação hoje.

| Aviso              | Quando aparece                                    |
| ------------------ | ------------------------------------------------- |
| **Atrasado**       | Venceu e ninguém pagou                            |
| **Limite**         | O gasto do mês passou do limite de uma categoria  |
| **Vence em breve** | Vence nos próximos 7 dias                         |
| **Confirmar**      | Alguém disse que pagou e espera a sua confirmação |
| **Fechamento**     | Um acerto combinado para repetir está esperando   |

Tocar num aviso leva direto para a tela que resolve.

Os avisos são **calculados na hora** e somem sozinhos quando o motivo deixa de existir — a
conta paga não precisa ser removida da lista.

### Confirmar leitura

O **✓** ao lado de cada aviso confirma que você o leu, e ele sai da lista e do contador. O
botão **Confirmar todos** faz isso de uma vez.

Os confirmados não são apagados: ficam numa seção no fim do painel, que você abre quando
quiser conferir. O botão de voltar traz o aviso de volta à lista ativa.

> **Confirmar não é silenciar.** Se o motivo do aviso mudar — outro valor, outra data —, ele
> volta a aparecer como novo. Uma dívida de R$ 1.850 que você deu por lida e depois recebeu
> um pagamento parcial vira um aviso de R$ 1.000, e esse você ainda não viu.

O toque no corpo do aviso leva à tela; o ✓ apenas confirma. São ações separadas de propósito:
"eu vi" e "vou resolver" não são a mesma coisa, e quem só quer olhar do que se trata não
deveria perder o aviso por isso.

> **Os avisos só aparecem dentro do app.** Não enviamos e-mail, SMS nem notificação de
> celular. Se você não abrir o sistema, não será avisado. Para contas críticas, mantenha o
> débito automático ou um lembrete no seu calendário.

## Busca

A **lupa** no topo. Procura ao mesmo tempo em lançamentos, pessoas, cartões e grupos.

Digite ao menos dois caracteres. A busca ignora maiúsculas e acentos do que você digitou, e
procura tanto na descrição quanto no nome de quem está do outro lado — "bruno" acha as
contas do Bruno e a ficha dele.

Se aparecer "há mais resultados", refine o termo: a lista é cortada para o resultado caber
na tela, e o aviso existe para você não confundir "não achei" com "achei demais".

## Contas que se repetem

Em **Mais → Recorrentes**. É a lista do que nasce todo mês sozinho: salário, aluguel,
internet, água, luz.

**O cadastro continua no lançamento**, marcando "Se repete todo mês" — é ali que você está
quando percebe que a conta é recorrente. Esta tela é para depois: ver o que está ativo,
corrigir o valor que mudou e encerrar o que acabou.

Cada uma mostra o **próximo vencimento** e quantas parcelas já foram geradas.

**Editar vale para as próximas parcelas.** A conta de luz que subiu se corrige aqui, e os
meses já lançados ficam com o valor que tiveram.

**Encerrar** desativa e apaga só as parcelas **futuras sem baixa** — aquelas eram previsão.
As passadas ficam: apagá-las mudaria o caixa de meses já fechados.

## Fechamento todo mês

Na tela de fechamento de uma pessoa (veja [o capítulo 13](13-fechamento.md)), marque
**"Acertar as contas com … todo mês"** e escolha o dia.

A partir daquele dia de cada mês, o acerto do **mês anterior** aparece nos avisos. É a
situação de quem racha aluguel ou internet e refaz o mesmo fechamento sempre.

> **A agenda não fecha nada sozinha.** Ela avisa; quem confere e confirma é você. Quitar
> títulos sem ninguém olhar seria o oposto do motivo de o fechamento existir.
