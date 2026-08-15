# Política de Privacidade

**Versão 1.0.0**

> **Este é um texto-base, não um documento revisado juridicamente.** Ele descreve com
> precisão o que o sistema faz com os dados, para que o aceite tenha conteúdo real desde o
> primeiro dia. Antes de uso com usuários reais, submeta a revisão de um advogado.

## O que coletamos

**De você:** nome, e-mail, senha (guardada apenas como hash bcrypt, nunca em texto), e o
registro do seu aceite destes documentos — com data, versão, endereço IP e navegador.

**Do que você registra:** cartões (apenas apelido, bandeira e **os quatro últimos
dígitos**), lançamentos de fatura, despesas de grupo, e as obrigações de pagar e receber
com valores e vencimentos.

**De terceiros que você cadastra:** nome e, se você informar, e-mail e telefone.

## O que nunca coletamos

Número completo de cartão, CVV e validade **não entram no sistema**, em nenhum campo, log
ou arquivo. Não temos conexão com bancos e não acessamos extrato ou saldo de conta.

## Para que usamos

Exclusivamente para operar o serviço: autenticar você, calcular os saldos, gerar os
relatórios e mostrar a quem você autorizou. **Não vendemos dados, não fazemos publicidade
com eles e não os compartilhamos com terceiros** além do que você autorizar explicitamente.

## Base legal

| Dado                                 | Base legal (LGPD, art. 7º)                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Cadastro e autenticação              | Execução de contrato (inciso V)                                                                     |
| Registros financeiros que você cria  | Execução de contrato (inciso V)                                                                     |
| Registro do aceite dos termos        | Cumprimento de obrigação legal (inciso II)                                                          |
| Dados de terceiros que você cadastra | Legítimo interesse do titular do registro (inciso IX), sob sua responsabilidade como quem cadastrou |

## Quem vê seus dados

- **Você**, sempre.
- **Quem você autorizar**, no escopo que você escolher, até você revogar.
- **Administradores do sistema**, para operação e suporte.
- Ninguém mais.

## Cookies

Usamos **um** cookie, `controle_sessao`, que mantém você autenticado. Ele é `httpOnly` (não
pode ser lido por script na página) e `sameSite=lax`. Não usamos cookie de publicidade nem
de rastreamento, e não há analytics de terceiros.

## Seus direitos

| Direito                           | Como exercer                                                        |
| --------------------------------- | ------------------------------------------------------------------- |
| Acesso e portabilidade            | Baixe o arquivo completo em "Meus dados"                            |
| Correção                          | Edite seu perfil                                                    |
| Revogação de consentimento        | Revogue o compartilhamento na tela de compartilhamento              |
| Exclusão                          | "Excluir conta" — leia a seção abaixo                               |
| Informação sobre compartilhamento | A tela de compartilhamento lista tudo, inclusive convites pendentes |

## Exclusão: por que anonimizamos em vez de apagar

Quando você exclui sua conta, removemos o que identifica você — nome, e-mail, telefone —,
desativamos o login e revogamos todos os compartilhamentos. **Os valores das obrigações
permanecem.**

O motivo: as suas obrigações são também obrigações de outras pessoas. Se você deve R$ 200 a
alguém do grupo e apagássemos o registro, essa pessoa simplesmente deixaria de ter R$ 200 a
receber, sem ninguém ter pago — nós estaríamos alterando o saldo de um terceiro que não
pediu nada. O registro passa a constar como "Usuário excluído", sem qualquer dado que
identifique você.

Se quiser a eliminação completa, ela depende de as obrigações em que você é parte estarem
liquidadas ou canceladas. Entre em contato.

## Retenção

Enquanto sua conta existir. Após a exclusão, permanecem apenas os registros anonimizados
descritos acima e o histórico de aceite dos termos, que é a evidência exigida por lei.

## Segurança

Senhas com bcrypt. Sessão em cookie httpOnly. Tokens de convite guardados apenas como
hash — nem quem tem acesso ao banco consegue reconstruir um link de convite. Logs sem dado
pessoal: registramos identificadores, não e-mails, valores ou descrições de lançamento.

## Encarregado (DPO)

Defina aqui o contato do encarregado de dados antes de colocar o sistema em uso real.

## Mudanças

Ao publicarmos uma versão nova, pediremos seu aceite no acesso seguinte.
