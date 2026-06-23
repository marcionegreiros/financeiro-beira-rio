# ADR 0001 — Eventos imutáveis, saldos derivados (Pilar 1)

- **Status:** aceito
- **Data:** 2026-06
- **Contexto:** controle financeiro de dinheiro real. Um saldo armazenado e
  editável mente sobre dinheiro — o pior defeito possível aqui — e gera conflitos
  na sincronização offline.

## Decisão

O sistema **não guarda** "saldo da conta", "estoque atual" nem "venda do dia"
como campos mutáveis. Guarda **eventos imutáveis** (contagens, leituras de bomba,
movimentos) e **calcula** todos os números a partir deles. Saldos/estoques/vendas
são **views/queries** (§6.8).

## Consequências

- ✅ Auditoria total e correção retroativa (recalcula a cascata).
- ✅ Sincronização offline quase livre de conflito: eventos são append-only;
  unir conjuntos e re-derivar (ver [ADR 0006](./0006-offline-first-supabase-powersync.md)).
- ⚠️ Performance de views pesadas: permitido **cache por dia**, desde que sempre
  reconstrutível a partir dos eventos. **Cache nunca é fonte de verdade.**
- 🔒 Regra de código: **proibido criar coluna/variável de saldo mutável.**
