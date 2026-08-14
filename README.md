# Projeto de controle financeiro;

## idéia do projeto

Projeto para controle financeiro por usuário.

Controle financeiro total, contas a receber e a pagar, a forma de pagamento é relevante, dinheiro, permuta, vale alimentação e cartão de crédito.

Ao lançar algo no cartão vai para fatura, mas pode ou não ser obrigação do usuário, pode também ser obrigação de outro pagar, ese valor vai no a receber de outra pessoa que pode ou não ser outro usuário.

A ideia aqui são duas.

A primeira é controle do cartão de crédito.

Podendo importar planilha cvs para fatura do cartão:
- Poderá ser importado várias vezes a mesma fatura, em momentos diferentes do mÊs para atualizar de forma automática.
- deve validar se os dados exatamente iguais já foram lançados, caso sim, não duplicar.
 - Caso tenha registro do pagamento da fatura, deve verificar se ela esta em aberto no sistema ou não, caso sim deve registrar o pagamento, caso não, apenas ignore.
 - Os lançamentos do cartão sempre vai ser uma dívida para o usuário, mas pode ser que tenha passado para um terceiro e vai receber deste terceiro depois, gerando um a receber desta outra pessoa que pode ou não ser outro usuário, caso seja deve ter uma forma de vincular, sendo possível que o terceiro veja o que tem a pagar.

A segunda é organizar gastos de um grupo de amigos, ou seja as vezes um paga para todo mundo, em outro role é  outro usuário, as ezes tem compra coletiva etc, a ideia é fazer um apagar e a receber para no final do mês quem tem que pagar quem, o que tem que abater e o saldo final.

Deve ser possível gerar relatórios sobre cada participantes, com só contas a pagar, só contas a receber e ambos com saldo final.

## tecnologias
React orientado a função para o frontend com typescript, para estilização o tailwind, para componentes prontos shadcn ui e radix-ui, para ícones o phosphor icon.

Seguir as boas práticas e convenções.

Clean code.

### Padrão de commit utilizado

Será utilizado o Padrão Conventional Commits, adicionado o numero da issues e emoji.
(Conventional Commits) [https://www.conventionalcommits.org/pt-br/v1.0.0/]

## Padrão de emoji
Será usado a base do (gitmoji) [https://gitmoji.dev/] com alterações:
✅ - Tests;
✨ - Features;
💄 - Alteração visual;
