# Arquitetura

## Monorepo

```
apps/
  api/              Fastify + Prisma + PostgreSQL
  web/              React + Vite + Tailwind + shadcn/ui
packages/
  shared/           schemas Zod e tipos compartilhados
docker-container/   volume do Postgres (versionado com o projeto)
Docs/               esta documentação
```

Orquestração com **pnpm workspaces** + **Turborepo**. O Turborepo dá cache de build e roda
as tarefas (`build`, `lint`, `test`, `typecheck`) na ordem correta entre os pacotes —
`@controle/shared` compila antes de quem depende dele.

### Por que `packages/shared`

As regras de validação valem para os dois lados: a API valida a requisição e o formulário
valida antes de enviar. Com o schema Zod em um pacote comum, a regra existe uma vez. Duas
cópias divergem na primeira alteração, e a divergência aparece como um erro 400 que o
frontend jurava ser impossível.

## Camadas da API

```
src/
  plugins/          prisma, jwt, cookie, auth, errorHandler
  modules/<domínio>/
    routes.ts       declara a rota e o schema de entrada/saída
    controller.ts   traduz HTTP <-> domínio
    service.ts      a regra de negócio
    repository.ts   acesso ao Prisma
  lib/              hash, dedupe, netting, csv
```

A regra que sustenta a divisão: **o `service` não conhece HTTP e o `repository` é o único
que conhece o Prisma**. É o que permite testar a regra de negócio sem subir servidor e
trocar detalhe de persistência sem reescrever a regra.

## Banco de dados

Dois serviços no `docker-compose.yml`:

- **`postgres`** — desenvolvimento, com o volume em `docker-container/postgres`. O
  `PGDATA` aponta para a subpasta `pgdata` dentro do mount porque o Postgres recusa
  iniciar quando o diretório de dados é a raiz de um bind mount.
- **`postgres-test`** — exclusivo da suíte de testes, em `tmpfs`. Os dados são
  descartáveis; versioná-los não faria sentido e apontar os testes para o banco de
  desenvolvimento faria a suíte apagar dados reais.
