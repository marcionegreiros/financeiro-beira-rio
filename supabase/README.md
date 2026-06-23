# `supabase/` — banco central (placeholder)

Entra na **Fase 1** (ver [docs/roadmap.md](../docs/roadmap.md)). Nada aqui é
provisionado ainda — esta entrega é 100% offline, sem credenciais de nuvem.

Estrutura prevista (§7.5):

```
supabase/
├── migrations/   # schema Postgres versionado (todas as tabelas do §6) + RLS
└── seed/         # dia zero (§3.8) + caso de validação R$0,10 (§11.1)
```

## O que entra na Fase 1

- **Migrations** com todas as entidades do [modelo de dados](../docs/modelo-de-dados.md)
  (§6): identidade/permissões, catálogo, eventos do livro físico, livro
  financeiro (razão), fiado, folha, auditoria.
- **RLS** (Row Level Security) por permissão — a última linha de defesa: a UI
  esconde, o banco proíbe (§4, §7.3).
- **PowerSync**: sync rules iniciais + SQLite local espelhando o Postgres.
- **Seed do dia zero** e o **caso de validação R$0,10**.

## Princípios que o schema respeita (Pilar 1)

Saldos, estoques e vendas são **views/queries** (§6.8), nunca colunas mutáveis.
Eventos são **insert-only** (append-only); correção é novo evento ou reabertura
logada. Dinheiro em `bigint` (centavos); volume em `numeric(14,3)`/mL; IDs UUIDv7.
