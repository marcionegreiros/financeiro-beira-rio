# ADR 0004 — IDs UUIDv7 gerados no cliente

- **Status:** aceito
- **Data:** 2026-06
- **Contexto:** o app é offline-first; o cliente precisa gerar IDs antes de
  qualquer ida ao servidor. IDs auto-incrementais do banco não servem (offline) e
  UUIDv4 puro não é ordenável por tempo.

## Decisão

Usar **UUIDv7** (RFC 9562) gerado **no cliente** ([`lib/uuidv7.ts`](../../apps/web/src/lib/uuidv7.ts)),
sem dependência externa, via `crypto.getRandomValues`. Layout: 48 bits de
timestamp Unix (ms) + versão + aleatórios.

## Consequências

- ✅ Ordenável por tempo (os primeiros bits são o timestamp) → bom para índices e
  para a ordem natural dos eventos append-only.
- ✅ Sincronização determinística: o mesmo evento tem o mesmo id em qualquer
  dispositivo.
- ✅ Sem round-trip ao servidor para obter id (essencial offline).
