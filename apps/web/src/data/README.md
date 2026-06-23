# `data/` — camada de dados

Fronteira entre o app e a fonte de dados. As telas chamam os **repositórios**
daqui e nunca falam com o Supabase direto — assim, quando o **PowerSync** entrar,
só a implementação muda (a fonte vira o SQLite local), sem tocar nas telas.

## Implementado (Fase 1 — online)

- [`supabase.ts`](./supabase.ts) — cliente `@supabase/supabase-js` (lê o `.env`).
- [`sessao.ts`](./sessao.ts) — sessão/login (Supabase Auth): `useSessao`, `entrar`, `sair`.
- [`conversao.ts`](./conversao.ts) — **borda**: converte number/string do banco em
  `bigint` do domínio (`Centavos`, `Mililitros`). É o único lugar que toca float.
- [`repositorios.ts`](./repositorios.ts) — leituras já em tipos de domínio:
  `listarSaldos` (view derivada), `listarTanques` (nível pela última medição),
  `listarProdutos` (preço vigente resolvido em `domain/precos`).

## Pendente

- **PowerSync**: schema do SQLite local + connector de upload (offline-first).
  Substitui a fonte dos repositórios sem mudar a assinatura deles. Requer a
  instância externa (ver [supabase/powersync/sync-rules.yaml](../../../../supabase/powersync/sync-rules.yaml)).
- Tipos TS completos do schema (geráveis via MCP `generate_typescript_types`).

> Regra: nada aqui pode contradizer o núcleo de [`../domain`](../domain). O
> domínio calcula; a camada de dados só persiste e busca eventos.
