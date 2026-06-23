# CLAUDE.md

> **A fonte única de verdade deste projeto é [`AGENTS.md`](./AGENTS.md).**
> Este arquivo existe para que o Claude Code carregue o mesmo contexto que o Antigravity.
> Leia `AGENTS.md` por inteiro antes de qualquer tarefa. Nenhuma decisão de
> implementação pode contradizê-lo; se algo nele estiver errado, **corrija o
> documento primeiro, depois o código** (§0 da spec).

---

## Working Agreement (resumo — detalhe em [docs/working-agreement.md](./docs/working-agreement.md))

Os **dois pilares** (§0 de `AGENTS.md`):

1. **Nada de saldo editável. Tudo é derivado de eventos.** O sistema guarda
   eventos imutáveis (contagens, leituras de bomba, movimentos) e **calcula**
   saldos/estoques/vendas. **Proibido criar coluna ou variável de saldo mutável.**
2. **Caixa, capital e dívida são três livros separados.** A tabela mestra §3.4
   diz o que cada movimento afeta. Toda função financeira a consulta.

Regras de trabalho:

- **Toda mudança em lógica financeira exige teste correspondente.** O núcleo de
  domínio (`apps/web/src/domain/`) é construído **test-first** (§9 Fase 2).
- **Dinheiro só em centavos** (`bigint`, tipo `Centavos`). **NUNCA float.**
  Formatação para R$ só na borda de exibição.
- **Volume só em mililitros inteiros** (`bigint`, tipo `Mililitros`). Sem float.
- **Datas só em America/Manaus** (UTC−4, sem horário de verão).
- **IDs só UUIDv7** gerados no cliente.
- Conceitos de **domínio em português** (`fechamento`, `venda`, `caixa`, `socio`);
  termos técnicos em **inglês** (`useState`, `repository`, `service`).
- Commits pequenos e descritivos; **um PR por fatia vertical**.
- A **Definition of Done** da fase tem que estar verde antes de avançar.

## Onde está cada coisa

| Caminho                                    | Conteúdo                                                             |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `AGENTS.md`                                | Especificação mestre (canônica).                                     |
| `docs/`                                    | Documentação viva: working agreement, glossário, roadmap, ADRs, etc. |
| `apps/web/src/domain/`                     | ⭐ Núcleo de cálculo puro (sem UI, sem banco).                       |
| `apps/web/src/lib/`                        | `money`, `datas` (Manaus), `uuidv7`.                                 |
| `apps/web/src/{data,features,components}/` | Placeholders das fases futuras.                                      |
| `supabase/`                                | Placeholder (migrations/seed entram na Fase 1).                      |

## Comandos

```bash
pnpm install        # instala o workspace
pnpm test           # roda a suíte de domínio (Vitest) — inclui a âncora R$0,10
pnpm test:watch     # testes em watch
pnpm typecheck      # TypeScript strict, sem emitir
pnpm lint           # ESLint (inclui a regra no-float-money)
pnpm format         # Prettier
pnpm dev            # sobe o PWA em desenvolvimento
pnpm build          # build de produção (gera service worker + manifest)
pnpm preview        # serve o build (para testar instalação/offline)
```

## Estado atual (ver [docs/roadmap.md](./docs/roadmap.md))

- ✅ **Fase 0** — Fundação (monorepo, PWA, tokens, libs, lint anti-float).
- ✅ **Fase 2** — Núcleo de domínio com a suíte de testes §11.
- ⏳ Próximo: **Fase 1** (modelo de dados, migrations, RLS, PowerSync, seed dia-zero).
