# LGPD — inventário e decisões

Documento interno. Os textos voltados ao usuário estão em [legal/](legal/).

## Por que este projeto exige mais que um checkbox

Este sistema guarda dados pessoais **de quem não é usuário dele**: o amigo do rolê, o
terceiro a quem um gasto foi repassado. Essas pessoas não aceitaram termo nenhum e podem
nem saber que constam aqui. É o que separa este caso de um app comum, onde todo titular é
também usuário.

`Person.ownerId` registra quem cadastrou cada pessoa — é quem responde por aquele dado.

## Inventário de dados pessoais

| Dado                             | Onde                                         | Finalidade                            | Base legal                      | Retenção                               |
| -------------------------------- | -------------------------------------------- | ------------------------------------- | ------------------------------- | -------------------------------------- |
| Nome, e-mail                     | `User`, `Person`                             | Identificação e autenticação          | Execução de contrato            | Até a exclusão (anonimizado)           |
| Hash da senha                    | `User.passwordHash`                          | Autenticação                          | Execução de contrato            | Até a exclusão                         |
| Telefone                         | `Person.phone`, `ReportInvite.phone`         | Montar o link de convite por WhatsApp | Consentimento de quem cadastrou | Até a exclusão                         |
| IP e user-agent                  | `TermsAcceptance`                            | Provar quando e a que se consentiu    | Obrigação legal                 | Permanente — é a evidência             |
| Quatro últimos dígitos do cartão | `CreditCard.lastFour`                        | Distinguir cartões na interface       | Execução de contrato            | Até a exclusão do cartão               |
| Lançamentos e valores            | `InvoiceEntry`, `Obligation`, `GroupExpense` | Núcleo do serviço                     | Execução de contrato            | Permanente enquanto houver contraparte |
| Hash do token de convite         | `ReportInvite.tokenHash`                     | Validar o convite                     | Execução de contrato            | Até expirar ou ser aceito              |

## O que deliberadamente não existe no modelo

- Número completo de cartão, CVV e validade. Não há campo, e não deve haver: o parser de
  CSV precisa descartá-los se aparecerem no arquivo.
- Credencial bancária, saldo, extrato.
- Qualquer identificador de rastreamento publicitário.

## Decisões que serão questionadas

### Exclusão anonimiza, não apaga

`DELETE /eu` marca `anonymizedAt`, troca nome e e-mail por marcadores, desativa o login e
revoga grants e convites. **Os valores das obrigações ficam.**

Apagar a linha quebraria o saldo de terceiros: as obrigações do grupo referenciam aquela
`Person`, e removê-la faria o credor deixar de ter o valor a receber sem ninguém ter pago.
Isso alteraria o dado de outro titular, que não pediu nada — trocar uma violação por outra.

O e-mail vira `excluido+<uuid>@anonimizado.local` porque a coluna tem unique: sem o sufixo,
a segunda exclusão colidiria com a primeira. A senha vira `CONTA_ANONIMIZADA`, string que
não é um hash bcrypt válido, então nenhuma senha autentica a conta mesmo que alguém
reative o registro por engano.

A eliminação completa continua possível sob demanda, quando as obrigações da pessoa
estiverem liquidadas ou canceladas. Não é autoatendimento porque exige julgar o efeito
sobre terceiros.

### Admin não se exclui por autoatendimento

O admin é o caminho de recuperação de tudo. Permitir a autoexclusão pode deixar a
instância sem administrador e sem forma de voltar atrás.

### Aceite versionado, histórico preservado

Cada aceite é uma linha com versão, data, IP e user-agent, e nunca é sobrescrita. Subir
`VERSAO_TERMOS` ou `VERSAO_PRIVACIDADE` em `apps/api/src/lib/legal.ts` faz o próximo
acesso pedir o aceite novo; o registro antigo continua provando o que foi consentido antes.

O checkbox do cadastro **não** vem pré-marcado. Consentimento pré-marcado não é
consentimento.

## Regras que o código precisa manter

- **Log sem PII.** Nada de e-mail, valor ou descrição de lançamento no log de aplicação —
  só identificadores. O ponto de maior risco é o parser de CSV, onde a tentação de logar a
  linha crua no erro é grande.
- **Mensagem de erro sem PII.** O `error-handler` converte violação de unique do Prisma em
  "Registro já existe" em vez de repassar a mensagem original, que cita coluna e valor e
  permitiria descobrir se um e-mail tem conta só tentando cadastrá-lo.
- **Login com resposta uniforme.** Senha errada, conta inexistente e conta inativa
  devolvem a mesma mensagem e gastam tempo comparável. Diferenciar transformaria o login
  num verificador de cadastro.
- **Token de convite só como hash.** Vazamento do banco não pode virar acesso a dado
  financeiro de ninguém.

## Pendências antes de uso real

- [ ] Revisão dos documentos de `legal/` por advogado.
- [ ] Definir e publicar o contato do encarregado (DPO).
- [ ] Definir política de backup e o prazo de retenção dos backups — hoje não há backup
      definido, e backup é cópia de dado pessoal como qualquer outra.
- [ ] Definir prazo de resposta a solicitação de titular.
