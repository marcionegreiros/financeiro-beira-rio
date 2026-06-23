# ADR 0002 — Caixa, capital e dívida são três livros separados (Pilar 2)

- **Status:** aceito
- **Data:** 2026-06
- **Contexto:** um mesmo movimento pode afetar o caixa, o capital, a dívida ao
  sócio, vários deles, ou nenhum. Misturar esses efeitos num só número produz
  contas erradas (ex.: pró-labore reduz caixa e capital, mas **não** amortiza
  empréstimo).

## Decisão

Tratar **caixa**, **capital** e **saldo devedor ao sócio** como três livros
independentes. A **tabela mestra §3.4** define, por tipo de movimento, o efeito
em cada livro. Toda função financeira consulta essa tabela conceitual.

Efeito-caixa e efeito-capital são **contas separadas**: qualquer dinheiro que sai
da gaveta no dia entra como saída no `dinheiro_esperado`, independente de como
afeta o capital (regra geral de caixa, §3.3).

## Consequências

- ✅ Pró-labore, perda, aporte etc. ficam corretos em cada dimensão.
- ✅ Painel pode mostrar capital **operacional** vs **total** com um toggle.
- 📌 Implementado em [`caixa.ts`](../../apps/web/src/domain/caixa.ts) e
  [`capital.ts`](../../apps/web/src/domain/capital.ts); coberto pelos testes §11.7–11.11.
