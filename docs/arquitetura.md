# Arquitetura

Resumo operacional do §7 da spec. Detalhes e justificativas nos
[ADRs](./adr/).

## Decisão central: offline-first

O vendedor precisa **fechar o caixa sem internet** (estação à beira-rio) e
sincronizar quando o sinal voltar. Isso exige um **banco local** no dispositivo,
espelhado num banco central.

## Stack

| Camada        | Escolha                                                  |
| ------------- | -------------------------------------------------------- |
| Frontend      | React + TypeScript + Vite, como **PWA instalável**       |
| Estilo        | Tailwind CSS v4 (tokens §8.2)                            |
| Banco central | Supabase (PostgreSQL + Auth + RLS + Realtime) — _Fase 1_ |
| Sync offline  | PowerSync (SQLite local + fila de upload) — _Fase 1_     |
| Migrations    | Supabase CLI — _Fase 1_                                  |
| Testes        | Vitest                                                   |

## Camadas do app (`apps/web/src/`)

```
domain/   ⭐ núcleo de cálculo puro — sem UI, sem banco, 100% testável
lib/      money (centavos), datas (Manaus), uuidv7 — utilitários de borda
data/     PowerSync schema, queries, repositórios, views derivadas  (Fase 1)
features/ módulos/telas (§5)                                          (Fases 4+)
components/ UI compartilhada (medidor de tanque, etc.)               (Fases 5+)
```

Regra de dependência: `features` → `domain` + `data`; `data` → `domain`;
`domain` não depende de ninguém (nem de `lib`, exceto tipos/aritmética de
`money`). O domínio **calcula**; a camada de dados só **persiste e busca**
eventos.

## Por que o sync é quase livre de conflito (§7.2)

- Eventos **imutáveis**, só **inseridos** (append-only). Não há "editar saldo".
- Saldos/estoques **derivados** — recalculados, não sobrescritos.
- Fechamento **diário e único** (`data UNIQUE`); um dispositivo fecha por vez.

Sincronizar = unir dois conjuntos de eventos e re-derivar. Conflito raro →
last-write-wins do PowerSync basta; `fechamento.data UNIQUE` previne dois
fechamentos do mesmo dia.

## Fluxo de dados

- **Leitura:** app lê do **SQLite local** (instantâneo, offline). PowerSync
  mantém esse SQLite sincronizado via _sync rules_.
- **Escrita:** app escreve no SQLite local → fila de upload → Supabase ao
  reconectar.
- **Permissões:** _sync rules_ controlam o que **desce**; **RLS** é a última
  defesa no que **sobe**. A UI esconde, o RLS proíbe.

## Segurança e integridade

Auth Supabase + RLS por permissão; dinheiro em centavos (lint barra float);
eventos insert-only; backups automáticos + export periódico.
