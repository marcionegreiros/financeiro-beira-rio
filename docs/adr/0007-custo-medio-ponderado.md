# ADR 0007 — Custo médio ponderado para valorizar estoque

- **Status:** aceito
- **Data:** 2026-06
- **Contexto:** o capital inclui o valor do estoque e do combustível parados
  (§3.5). É preciso decidir como valorizá-los, e como separar isso do custo usado
  para medir o **lucro** da venda.

## Decisão

- **Valorização do estoque:** **custo médio ponderado**, recalculado a cada
  entrada de mercadoria/combustível. Cada entrada carrega o custo daquela compra
  (editável no recebimento; default = último custo). Implementado em
  [`capital.ts`](../../apps/web/src/domain/capital.ts) (`custoMedioPonderado`).
- **Custo para lucro (separado):** o lucro do dia usa o **custo vigente** que o
  gerente fixou (histórico por data/hora — ver
  [`precos.ts`](../../apps/web/src/domain/precos.ts)). São dois usos do custo, e
  tudo bem divergirem.

## Consequências

- ✅ Capital move de forma suave e reflete o que foi pago pelo que está parado.
- ✅ Margem da venda usa o custo vigente no fechamento (não reescreve passado).
- ⚠️ **Limite honesto:** a venda do dia é a diferença entre duas contagens e não
  tem hora. Se o custo mudar no meio do dia, o custo dos vendidos fica aproximado
  (salvo divisão manual da contagem). A valorização do estoque parado permanece
  exata (usa o custo atual).
