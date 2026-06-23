# Pontão Beira Rio

Sistema web **offline-first** de controle financeiro de um posto/porto fluvial de
combustível. Substitui a planilha Excel manual por um app instalável (notebook e
celular) que fecha o caixa rápido, controla combustível/dinheiro/capital e oferece
auditoria completa — funcionando mesmo sem internet.

> **Fonte única de verdade:** [`AGENTS.md`](./AGENTS.md). Para o contexto dos
> agentes de IA, veja [`CLAUDE.md`](./CLAUDE.md). Documentação viva em
> [`docs/`](./docs/).

## Estado atual

- ✅ **Fase 0** — Fundação (monorepo, PWA, tokens visuais, libs, lint anti-float).
- ✅ **Fase 2** — Núcleo de domínio (cálculo financeiro) com a suíte de testes §11,
  incluindo a **âncora da planilha real** (diferença **+0,10**).
- 🔜 **Fase 1** — Modelo de dados, migrations, RLS, PowerSync, seed do dia zero.

Ver o [roadmap completo](./docs/roadmap.md).

## Os dois pilares (não-negociáveis)

1. **Nada de saldo editável — tudo é derivado de eventos imutáveis.**
2. **Caixa, capital e dívida são três livros separados.**

## Stack

React + TypeScript + Vite (PWA) · Tailwind CSS v4 · Vitest · pnpm workspaces.
Banco central Supabase + sync offline PowerSync entram na Fase 1.

## Como rodar

Requer **Node ≥ 22** e **pnpm**.

```bash
pnpm install        # instala o workspace

pnpm test           # roda a suíte de domínio (inclui a âncora R$0,10)
pnpm typecheck      # TypeScript strict
pnpm lint           # ESLint (inclui no-float-money)
pnpm format         # Prettier

pnpm dev            # app em desenvolvimento
pnpm build          # build de produção (gera service worker + manifest PWA)
pnpm preview        # serve o build (testar instalação/offline)
```

## Estrutura

```
.
├── AGENTS.md / CLAUDE.md        # contexto canônico
├── apps/web/                    # PWA React + TS + Vite
│   └── src/
│       ├── domain/   ⭐ núcleo de cálculo puro (testado)
│       ├── lib/      money / datas (Manaus) / uuidv7
│       └── data, features, components/  (próximas fases)
├── supabase/                    # banco central (Fase 1)
├── docs/                        # working agreement, glossário, roadmap, ADRs
└── eslint-rules/                # regra local no-float-money
```

## Convenções

Dinheiro só em centavos (`bigint`); volume só em mililitros (`bigint`); datas só
em America/Manaus; IDs só UUIDv7; conceitos de domínio em português.
Detalhes no [Working Agreement](./docs/working-agreement.md).
