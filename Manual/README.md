# Manual do Controle Financeiro

Manual de uso do sistema. Cada capítulo explica uma tela: o que ela faz, como fazer cada
operação e por que algumas coisas funcionam do jeito que funcionam.

> Este manual é para **quem usa** o sistema. A documentação técnica, para quem desenvolve,
> está em [`Docs/`](../Docs/README.md).

## Índice

| Capítulo                                         | O que você aprende                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| [1. Primeiros passos](01-primeiros-passos.md)    | Criar conta, entrar, trocar senha e o que aparece na tela           |
| [2. Orçamento do mês](02-orcamento.md)           | A tela inicial: quanto tem, quanto já se moveu, o que está atrasado |
| [3. Contas a receber e a pagar](03-contas.md)    | Lançar, dar baixa, estornar, e cadastrar o que se repete todo mês   |
| [4. Cartão de crédito](04-cartao.md)             | Cadastrar cartão, importar a fatura e classificar os gastos         |
| [5. Parcelamentos](05-parcelamentos.md)          | Acompanhar compras parceladas e quanto ainda falta                  |
| [6. Grupos e rateio](06-grupos.md)               | Dividir as contas do rolê e fechar o mês                            |
| [7. Pessoas](07-pessoas.md)                      | Cadastrar quem participa das suas contas                            |
| [8. Compartilhar relatórios](08-compartilhar.md) | Dar e tirar acesso, e convidar por WhatsApp                         |
| [9. Relatórios](09-relatorios.md)                | Os três modos de ver suas contas                                    |
| [10. Minha conta](10-minha-conta.md)             | Senha, baixar seus dados e excluir a conta                          |
| [11. Administração](11-administracao.md)         | Só para administradores: gerenciar usuários                         |
| [12. Dúvidas comuns](12-duvidas.md)              | O que fazer quando algo não sai como esperado                       |

## Os dois conceitos que explicam o resto

Vale ler antes de qualquer capítulo. Quase toda dúvida sobre o sistema se resolve com um
destes dois.

### Todo lançamento tem duas datas

**Vencimento** é quando a conta vence. **Baixa** é quando o dinheiro de fato saiu ou entrou.

São coisas diferentes de propósito. Uma conta que venceu em agosto e você pagou em setembro
pertence ao **orçamento de agosto** — foi ali que ela foi assumida — e ao **caixa de
setembro**, porque foi aí que o dinheiro se moveu. As duas leituras são verdadeiras, e o
sistema mostra as duas.

Por isso, ao dar baixa, você **informa a data** do pagamento em vez de o sistema assumir
hoje. Se você registra no domingo o que pagou na sexta, o caixa precisa mostrar sexta.

### A pagar e a receber são o mesmo registro visto de dois lados

Quando você lança que o Bruno lhe deve R$ 50, o sistema não cria duas coisas: cria **uma**,
que aparece como "a receber" para você e como "a pagar" para o Bruno.

É por isso que, ao acertar a conta com alguém, você não precisa avisar a outra pessoa para
ela dar baixa também — o registro é o mesmo, e o saldo dos dois fecha junto.
