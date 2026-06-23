# ADR 0003 — Dinheiro em centavos (bigint), volume em mililitros (bigint)

- **Status:** aceito
- **Data:** 2026-06
- **Contexto:** float (`number`) acumula erro de arredondamento — inaceitável em
  dinheiro. Volume também precisa de precisão fixa (3 casas / mL).

## Decisão

- **Dinheiro:** sempre **centavos** como `bigint` (tipo branded `Centavos`).
- **Volume/encerrante:** sempre **mililitros inteiros** como `bigint` (tipo
  branded `Mililitros`).
- Formatação para R$ e litros só na **borda de exibição** (`formatReais`,
  `formatLitros`). Entrada de texto via `parseReais` (aritmética inteira, sem
  `parseFloat`).
- Percentuais em **basis points** inteiros (3% = 300); arredondamento **half-up**
  explícito (`aplicarPercentual`, `arredondarDivisao`).

## Enforcement (duas camadas)

1. **Tipos branded** — atribuir `number` a `Centavos`/`Mililitros` é erro de tipo.
2. **ESLint `no-float-money`** — barra `parseFloat` e literais decimais em
   `domain/**` e `lib/money.ts`.

## Consequências

- ✅ Zero erro de ponto flutuante; comparações exatas (`toBe` com bigint).
- ✅ A âncora R$0,10 (§11.1) bate exatamente.
- ⚠️ `bigint` não serializa direto em JSON — converter na borda de
  persistência/transporte (tratado na Fase 1).
