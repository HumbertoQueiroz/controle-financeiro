# Compartilhamento e convites

Quem decide quem vê o relatório de alguém é o dono dos dados. Este documento descreve o
caminho completo, do botão até o acesso.

## Uma chamada resolve os dois casos

`POST /compartilhamentos { email, escopo, telefone?, pessoaId? }`

| Situação do e-mail | O que acontece                          | Resposta                                            |
| ------------------ | --------------------------------------- | --------------------------------------------------- |
| Já tem conta ativa | Consentimento criado na hora            | `GRANT_CREATED`                                     |
| Não tem conta      | Convite criado com o escopo dentro dele | `INVITE_CREATED` + `urlDoConvite` + `urlDoWhatsApp` |

`POST /convites` faz o mesmo pulando a busca, para quando o dono já sabe que a pessoa não
tem conta.

## A entrega é por WhatsApp, e o sistema não envia nada

Não há SMTP, provedor de e-mail nem fila de envio. A API devolve o link; a interface copia
para a área de transferência e abre o diálogo com **Enviar por WhatsApp** e **Sair**.

O link do WhatsApp já vem montado com a mensagem. Sem telefone, `wa.me` abre o app para a
pessoa escolher o contato — que é o caso comum, porque o dono costuma saber quem é sem ter
o número digitado no sistema.

Quem entrega o link é o dono, pelo canal que ele já usa. Disparar mensagem para terceiros
como efeito colateral de uma busca seria ruim justamente quando alguém digitasse o endereço
errado.

## O token

32 bytes aleatórios em `base64url` — os caracteres `+`, `/` e `=` do base64 comum
quebrariam ao ser colados numa URL ou mensagem.

O banco guarda **apenas o SHA-256** do token. Vazamento do banco não pode virar acesso a
dado financeiro de ninguém, e sem o token original nem quem administra o banco reconstrói
um link. Não se usa KDF lento aqui: com 256 bits de entropia não há dicionário a proteger,
e bcrypt só deixaria a validação lenta sem ganho.

O token em claro existe uma única vez, na resposta que o cria.

## Reemissão, não acúmulo

Convidar de novo o mesmo e-mail **reemite** o convite pendente: token novo, validade
renovada, o anterior deixa de valer.

Acumular convites faria dois cliques no botão criarem dois links válidos, e revogar um
deixaria o outro de pé — o dono acharia que tirou o acesso. Um índice único **parcial** no
banco (`status = 'PENDING'`) garante isso mesmo sob concorrência, sem impedir reconvidar
quem teve o convite revogado ou expirado.

## Aceite

`GET /convite/:token` mostra quem convidou, o que será compartilhado e para qual e-mail,
antes de qualquer cadastro. Responde com `Referrer-Policy: no-referrer` e `X-Robots-Tag:
noindex` — o token está no caminho da URL, e sem isso ele iria no header `Referer` de
qualquer recurso externo que a página carregasse.

`POST /convite/:token/aceitar` cria, **na mesma transação**: a conta (se ainda não existir),
a `Person` espelho, o aceite dos termos, o vínculo da ficha indicada e o consentimento. O
convidado sai dali já logado.

É isso que entrega "a permissão embutida no convite": ele nunca vive um instante
cadastrado-mas-sem-acesso, e o dono não volta para conceder de novo.

### Uso único, à prova de corrida

O consumo é um `updateMany` condicionado a `status: 'PENDING'` **dentro da transação**,
abortando se o count vier zero. Verificar antes e gravar depois tem corrida: dois aceites
simultâneos do mesmo link passariam pelos dois `if` e o convite serviria duas vezes.

O e-mail vem **do convite**, nunca do formulário. Aceitar outro transformaria um link
encaminhado no WhatsApp em acesso transferível a dado financeiro.

Convite inexistente, já aceito, revogado e expirado devolvem a **mesma** resposta —
distinguir permitiria sondar tokens e descobrir quais já foram usados.

## O vínculo com a ficha existente

`pessoaId` no convite aponta para a pessoa da agenda do dono que corresponde ao convidado.
No aceite, essa ficha passa a apontar para a conta criada, e o convidado enxerga as dívidas
que já estavam lançadas em nome dele antes de ele ter conta.

Fora do convite, o vínculo é feito por `POST /pessoas/:id/vinculo`, **sempre por iniciativa
do dono**. Nunca automático por coincidência de e-mail: não há verificação de e-mail no
cadastro, e o vínculo automático deixaria alguém herdar as dívidas de outra pessoa apenas
por adivinhar o endereço dela.

## Revogação

`DELETE /compartilhamentos/:id` e `DELETE /convites/:id`. Ambos falham com 404 quando o
registro é de outro dono — responder 403 confirmaria que aquele id existe.

Existe no máximo **uma linha** de `ReportGrant` por par (dono, convidado): revogar preenche
`revokedAt`, conceder de novo limpa o campo. Empilhar histórico faria a consulta de
permissão escolher entre várias linhas, e ambiguidade ali vira vazamento.

A lista de compartilhamentos mostra concedidos e convites pendentes **juntos**: convite
pendente é acesso futuro, e escondê-lo faria o dono acreditar que compartilhou com menos
gente do que compartilhou.
