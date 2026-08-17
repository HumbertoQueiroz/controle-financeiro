# Autenticação e permissões

## Sessão

JWT assinado, entregue em cookie **`controle_sessao`**: `httpOnly`, `sameSite=lax`,
`secure` em produção, validade de 7 dias (`JWT_EXPIRACAO_SEGUNDOS`).

O token vai em cookie e não em `localStorage` porque script injetado na página não lê
cookie `httpOnly` — é o que faz um XSS deixar de virar roubo de sessão. `sameSite=lax`
cobre o CSRF nas requisições que mudam estado.

O payload carrega só `sub` e `papel`. **O papel é relido do banco a cada requisição**, e o
do token serve apenas como pista. Confiar no token faria rebaixar ou desativar alguém só
ter efeito quando o token expirasse — até lá, a pessoa continuaria entrando como admin.

## Senhas

`bcrypt` com custo 12, atrás de `src/lib/hash.ts`.

Duas armadilhas tratadas ali:

- **Truncamento em 72 bytes.** O bcrypt ignora o que passa disso, em silêncio. O wrapper
  rejeita em vez de truncar, e conta **bytes**, não caracteres — acentuada ocupa 2 em UTF-8.
  O limite e a contagem vêm de `@controle/shared`, os mesmos do formulário.
- **Tempo de resposta.** `verifyPassword` compara contra um hash descartável quando não há
  usuário. Responder em 1ms para conta inexistente e 250ms para senha errada entregaria a
  lista de quem tem conta sem o atacante precisar acertar senha nenhuma.

Login devolve a mesma mensagem para senha errada, conta inexistente e conta inativa.

### Exigência de senha forte

`senhaSchema`, em `packages/shared/src/schemas/senha.ts`, cobra seis coisas: dez caracteres,
minúscula, maiúscula, número, símbolo e não estar na lista de senhas óbvias.

Três decisões que valem o registro:

- **`superRefine`, e não uma cadeia de `refine`.** A validação devolve **todas** as
  pendências de uma vez. Uma por vez transformaria a criação de senha em tentativa e erro,
  e o resultado prático seria a pessoa parando no mínimo que passa.
- **A lista de óbvias compara por igualdade, não por `includes`.** `RelatorioDeSenhas!7` é
  uma boa senha e seria reprovada por um `includes`. O que a lista precisa pegar é a senha
  que **é** a palavra, com ou sem os dígitos de sempre no fim — `Senha@123` cumpre as quatro
  classes e ainda assim é a primeira tentativa de qualquer dicionário. Por isso a comparação
  também considera a raiz, sem os dígitos finais, e reprova o caractere único repetido.
- **O login não valida força**, só `min(1)`. Aplicar a régua ali impediria de entrar quem
  cadastrou antes de a regra existir, e ainda revelaria a política para quem só está
  tentando adivinhar. Senha antiga continua entrando; a exigência vale para senha nova.

A régua é a mesma no formulário (`CampoDeSenha` mostra a lista enquanto a pessoa digita), na
API e no seed — inclusive na senha que o seed gera sozinho, que sem cuidado sairia às vezes
sem maiúscula e criaria um admin com uma senha que o próprio sistema recusaria.

## Os três guards

Em `src/plugins/auth.ts`, compostos por rota.

### `requireAuth`

Valida o cookie, relê o usuário e recusa conta inativa ou anonimizada. Preenche
`request.usuario`.

### `requireAdmin`

`requireAuth` + papel `ADMIN`. Aplicado como hook de escopo em `/usuarios`, para que rota
nova nasça protegida em vez de depender de alguém repetir o `preHandler`.

### `requireReportAccess`

Libera o relatório de outra pessoa quando:

1. o solicitante é o próprio dono, **ou**
2. o solicitante é `ADMIN`, **ou**
3. existe `ReportGrant` ativo — não revogado, não expirado — cujo escopo cobre o pedido.

Resolve o **escopo efetivo** e o grava em `request.escopoDeRelatorio`. A consulta do
relatório tem de usar esse valor, e não o que veio na query: filtrar depois de buscar
significaria trazer do banco linhas que a pessoa não pode ver, e basta um `select`
esquecido para elas vazarem na resposta.

Um grant `PAYABLE` recusa pedido `RECEIVABLE` e recusa também o pedido sem parâmetro, que
por padrão vale `BOTH` — omitir o escopo não pode ser um caminho para ver mais.

## Erros

`src/lib/erros.ts` define os erros de domínio com status embutido; `plugins/error-handler.ts`
é o único ponto que traduz erro em resposta. Isso sustenta uma garantia de privacidade:
nenhuma mensagem carrega dado pessoal para fora. Violação de unique do Prisma vira
"Registro já existe" em vez da mensagem original, que cita coluna e valor e permitiria
descobrir se um e-mail tem conta só tentando cadastrá-lo.

## Rotas

| Rota                                                       | Guard          | O que faz                                                             |
| ---------------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| `POST /auth/login`                                         | —              | Autentica e emite o cookie                                            |
| `POST /auth/cadastro`                                      | —              | Cria conta, `Person` espelho e o aceite dos termos, em transação      |
| `POST /auth/logout`                                        | —              | Limpa o cookie com as mesmas opções com que foi criado                |
| `GET /auth/eu`                                             | `requireAuth`  | Sessão atual, incluindo `precisaTrocarSenha` e `precisaAceitarTermos` |
| `POST /auth/aceitar-termos`                                | `requireAuth`  | Registra o aceite da versão vigente                                   |
| `POST /auth/trocar-senha`                                  | `requireAuth`  | Exige a senha atual e recusa nova igual à anterior                    |
| `GET /usuarios` · `POST /usuarios` · `PATCH /usuarios/:id` | `requireAdmin` | Administração de contas                                               |
| `GET /eu/dados`                                            | `requireAuth`  | Exportação LGPD, como arquivo                                         |
| `DELETE /eu`                                               | `requireAuth`  | Anonimização da conta — ver [lgpd.md](lgpd.md)                        |
