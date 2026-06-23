# ADR 0008 — Monorepo leve com pnpm workspaces

- **Status:** aceito
- **Data:** 2026-06
- **Contexto:** a spec (§7.5) prevê estrutura `apps/web` + `supabase` + `docs`, e
  cita evolução futura (ex.: multi-loja). Precisamos de uma raiz que comporte
  mais de um pacote sem reescrever a estrutura depois.

## Decisão

Usar **pnpm workspaces** (`pnpm-workspace.yaml` com `apps/*`). pnpm já está
instalado (10.26) e é eficiente em disco/velocidade para monorepo. Configs na
raiz (`tsconfig.base.json`, `eslint.config.js`, Prettier) compartilhadas; o app
fica em `apps/web` (`@pontao/web`).

## Consequências

- ✅ Espaço para novos pacotes (ex.: futura `apps/admin`, `packages/domain`
  extraído) sem migração estrutural.
- ✅ Scripts agregados na raiz (`pnpm test`, `pnpm lint`, `pnpm typecheck`).
- 📌 Node ≥ 22 fixado em `.nvmrc` e em `engines`.
- 🤔 Alternativa (npm workspaces) funcionaria, mas pnpm é mais rápido e já era o
  gerenciador disponível.
