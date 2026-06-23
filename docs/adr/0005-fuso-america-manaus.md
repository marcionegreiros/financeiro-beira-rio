# ADR 0005 — Fuso fixo America/Manaus (UTC−4)

- **Status:** aceito
- **Data:** 2026-06
- **Contexto:** o posto opera no Amazonas. A "data do fechamento" precisa ser
  estável e inequívoca; usar o fuso do dispositivo causaria fechamentos no dia
  errado.

## Decisão

Todo cálculo de data/hora de negócio usa **America/Manaus**, que é **UTC−4 e não
tem horário de verão** — portanto offset **constante**. Implementado em
[`lib/datas.ts`](../../apps/web/src/lib/datas.ts) sem depender do fuso local.

- "Data do fechamento" é uma `date` (`YYYY-MM-DD`), não timestamp.
- Movimentos usam timestamp com offset explícito `−04:00`.

## Consequências

- ✅ Fechamento sempre cai no dia certo, em qualquer dispositivo.
- ✅ Determinismo offline (sem ambiguidade de DST).
- 📌 `fechamento.data` é `UNIQUE` — defende contra dois fechamentos do mesmo dia
  (concorrência), ver [ADR 0006](./0006-offline-first-supabase-powersync.md).
