# 11. Administração

> Este capítulo é só para quem tem papel de **administrador**. Se o item "Usuários" não
> aparece no seu menu, ele não se aplica a você.

## O que um administrador pode

- Ver os relatórios de **qualquer** usuário, sem precisar de consentimento
- Criar contas
- Promover ou rebaixar o papel de outras contas
- Ativar e desativar contas

Esse acesso existe para operação e suporte, e está declarado nos
[Termos de Uso](../Docs/legal/termos-v1.md) — quem usa o sistema sabe que ele existe.

## A tela de usuários

Em **Mais → Usuários** (ou na barra lateral).

A lista mostra nome, e-mail, papel, situação e data de criação. No celular cada usuário vira
um cartão; no computador, uma tabela.

## Criar um usuário

Toque em **Novo usuário**.

| Campo                | Observação               |
| -------------------- | ------------------------ |
| **Nome**             |                          |
| **E-mail**           | Precisa ser único        |
| **Senha provisória** | Pelo menos 8 caracteres  |
| **Papel**            | Usuário ou Administrador |

A pessoa é **obrigada a trocar a senha no primeiro acesso**. Uma senha que um administrador
escolheu não é uma senha do dono da conta.

Combine a senha provisória por um canal seguro — ela não é enviada por e-mail.

## Trocar o papel

Use o seletor na coluna **Papel**. A mudança vale **imediatamente**, na requisição seguinte
daquela pessoa: ela não precisa sair e entrar de novo, e não há janela em que o papel antigo
continue valendo.

## Ativar e desativar

O botão na coluna **Situação**. Desativar bloqueia o acesso na hora, sem apagar nada.

É o caminho para suspender alguém temporariamente — diferente da exclusão de conta, que
anonimiza os dados e não pode ser desfeita.

## O que você não pode fazer com a própria conta

Rebaixar ou desativar a si mesmo. O seletor e o botão ficam desabilitados na sua linha, que
mostra **"Você"**.

O motivo é prático: um administrador que se rebaixa pode deixar o sistema sem nenhum
administrador ativo, e aí não sobra ninguém com poder de desfazer. Para sair da
administração, promova outra pessoa primeiro e peça que ela rebaixe você.

## O primeiro administrador

É criado pelo comando de seed, quando o sistema é instalado. Se a senha não foi definida na
configuração, ela é gerada e **impressa uma única vez** no console — anote na hora.

Esse administrador entra com a exigência de trocar a senha no primeiro acesso.
