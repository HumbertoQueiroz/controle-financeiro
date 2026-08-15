# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado atual

Fase 1 (fundação do monorepo) concluída. O plano de desenvolvimento completo, em 9 fases, está em `C:\Users\humbe\.claude\plans\crie-um-plano-de-reflective-newt.md`.

Documentação em `Docs/`. Toda documentação e mensagem de commit em português.

## Comandos

Da raiz do monorepo. Requer **pnpm 11+**, **Node 22+** e Docker.

```bash
pnpm install            # instala tudo (pnpm workspaces)
docker compose up -d    # sobe postgres (5432) e postgres-test (5433)
pnpm dev                # api + web em paralelo (turbo)
pnpm build              # build de todos os pacotes
pnpm lint               # eslint
pnpm typecheck          # tsc --noEmit
pnpm test               # vitest em todos os pacotes
pnpm test:e2e           # playwright
pnpm format             # prettier --write
```

Banco (delegam para `@controle/api`):

```bash
pnpm db:migrate   # prisma migrate dev
pnpm db:deploy    # prisma migrate deploy (usado antes da suíte de testes)
pnpm db:seed      # cria o admin, idempotente
pnpm db:studio    # prisma studio
pnpm db:reset     # apaga e recria o banco
```

Teste isolado: `pnpm --filter @controle/api test -- <padrão>`.

Antes de tudo: copie `.env.example` para `.env`. A API valida o `.env` na subida (`apps/api/src/env.ts`) e se recusa a iniciar com configuração inválida.

## Armadilhas do ambiente (Windows)

- **Nunca use `Set-Content -Encoding utf8`** para gravar `.json`, `.env` ou `.ts`. No PowerShell 5.1 isso grava **BOM**, e o BOM quebra `JSON.parse` — o sintoma é o Vite falhando ao carregar config PostCSS com `Unexpected token '﻿'`. Use as ferramentas de edição de arquivo, ou `[System.IO.File]::WriteAllText` com `UTF8Encoding($false)`.
- O `PGDATA` no `docker-compose.yml` aponta para a **subpasta** `pgdata` dentro do bind mount. O Postgres recusa iniciar quando o diretório de dados é a raiz de um bind mount no Windows. Não "simplifique" isso.
- `pnpm` 11 usa `allowBuilds` no `pnpm-workspace.yaml` (não `onlyBuiltDependencies`) para liberar scripts de pós-instalação.

## Stack

Monorepo pnpm workspaces + Turborepo:

- `apps/api` — Node.js + Fastify + Prisma + PostgreSQL.
- `apps/web` — React + TypeScript + Vite + Tailwind v4 + shadcn/ui + Radix + ícones Phosphor.
- `packages/shared` — schemas Zod compartilhados entre api e web, para que a regra de validação exista uma vez só.
- **Infra**: Docker. O volume do Postgres fica em `docker-container/` na raiz e **é commitado junto com o projeto** — não adicione essa pasta ao `.gitignore`.
- **Docs**: pasta `Docs/` na raiz para toda documentação relevante.

## Camadas da API

`routes` (declara e valida com Zod) → `controller` (traduz HTTP) → `service` (regra de negócio) → `repository` (Prisma). O `service` não conhece HTTP; o `repository` é o único que conhece o Prisma. Testes de integração usam `app.inject()`, sem abrir socket.

## Domínio — o que o modelo de dados precisa suportar

Duas funcionalidades centrais, ambas apoiadas no mesmo par contas a pagar / contas a receber:

**1. Controle de cartão de crédito com importação de CSV de fatura**

- A mesma fatura pode ser importada **várias vezes no mesmo mês** para atualização incremental. A importação precisa ser idempotente: lançamentos exatamente iguais aos já existentes não podem ser duplicados. Isso exige uma chave de deduplicação estável derivada da linha do CSV.
- Se o CSV contiver registro de pagamento da fatura: registrar o pagamento apenas se a fatura estiver **em aberto** no sistema; caso contrário, ignorar silenciosamente.
- Todo lançamento de cartão gera uma **dívida do usuário dono do cartão**. Se o gasto foi repassado a um terceiro, gera também um **a receber** contra esse terceiro. O terceiro pode ou não ser um usuário do sistema — quando for, precisa haver vínculo para que ele enxergue o que deve.

**2. Rateio de gastos entre grupo de amigos**

- Em cada evento/rolê um participante paga pelos demais (ou há compra coletiva). Cada gasto vira a pagar / a receber entre participantes.
- No fechamento do mês o sistema resolve quem paga quem, o que é abatido e o **saldo final** por participante.

**Formas de pagamento são relevantes** e fazem parte do modelo: dinheiro, permuta, vale alimentação e cartão de crédito.

**Relatórios** por participante, em três modos: só a pagar, só a receber, e ambos com saldo final.

## Design de telas

Minimalista, moderno, voltado para usabilidade e **mobile first**: o CSS parte da largura de celular e os breakpoints do Tailwind (`sm:`/`md:`/`lg:`) só **acrescentam**, nunca desfazem um layout de desktop escrito antes.

**Use flexbox por padrão.** `flex` resolve a maioria dos layouts deste app — barra de navegação, linha de valor com rótulo à esquerda e número à direita, pilha de cartões, campo com botão ao lado — e degrada bem quando o conteúdo cresce ou o texto quebra em telas estreitas. Prefira `flex` + `gap` a margens soltas.

Recorra ao `grid` só quando o layout for de fato bidimensional, isto é, quando linhas **e** colunas precisam se alinhar entre si: tabela de fatura no desktop, galeria de cartões com colunas de mesma largura, formulário de duas colunas. Escolher `grid` para empilhar coisas numa direção só é complicar sem ganho.

Nada de layout por `float`, `position: absolute` para posicionar conteúdo de fluxo, ou largura fixa em pixel — os três quebram no primeiro celular estreito.

Demais diretrizes (bottom tab bar no celular, listas que viram cartões abaixo de `md:`, `tabular-nums` em valor monetário, cor semântica sempre acompanhada de sinal ou rótulo) estão na seção de design do plano em `C:\Users\humbe\.claude\plans\crie-um-plano-de-reflective-newt.md`.

## Commits

Conventional Commits em português, com **número da issue e emoji**:

```
✨ feat(#12): importa fatura csv do cartão
```

Base de emojis: gitmoji, com estes fixados pelo README — ✅ tests, ✨ features, 💄 alteração visual.

Para gerar o texto do commit, use a skill `commit-titulo-descricao` (em `.claude/skills/`), que entrega título e descrição em blocos separados. Ela **não commita** — quem decide o que entra no commit é o usuário.

Escopos em uso: `infra`, `db`, `auth`, `lgpd`, `pessoas`, `convites`, `cartao`, `importacao`, `grupos`, `relatorios`, `front`, `seo`, `docs`.
