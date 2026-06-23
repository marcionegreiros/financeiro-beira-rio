# Critérios de aceite ↔ testes

Os cenários obrigatórios (§11 da spec) mapeados para os arquivos de teste. Rode
`pnpm test`.

## Lógica financeira (Fase 2) — ✅ implementados

| #     | Cenário                                                                        | Arquivo                                                                               |
| ----- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 11.1  | **Âncora da planilha real** → esperado 1.771,90 (gaveta) / diferença **+0,10** | [`planilha-ancora.test.ts`](../apps/web/src/domain/__tests__/planilha-ancora.test.ts) |
| 11.2  | Combustível por encerrante: 277 L × 7,70 = 2.132,90; entrada não altera venda  | [`venda.test.ts`](../apps/web/src/domain/__tests__/venda.test.ts)                     |
| 11.3  | Produto por contagem com/sem perda (30 / 25)                                   | [`venda.test.ts`](../apps/web/src/domain/__tests__/venda.test.ts)                     |
| 11.4  | Fiado concedido reduz o dinheiro_esperado                                      | [`caixa.test.ts`](../apps/web/src/domain/__tests__/caixa.test.ts)                     |
| 11.5  | Recebimento de fiado entra como dinheiro, não é venda                          | [`caixa.test.ts`](../apps/web/src/domain/__tests__/caixa.test.ts)                     |
| 11.6  | Taxa de cartão: R$100 → líquido 96,90 / taxa 3,10                              | [`capital.test.ts`](../apps/web/src/domain/__tests__/capital.test.ts)                 |
| 11.7  | Transferência (partida dobrada) não altera o capital                           | [`capital.test.ts`](../apps/web/src/domain/__tests__/capital.test.ts)                 |
| 11.8  | Aporte empréstimo + devolução (saldo devedor sobe/zera; capital igual)         | [`capital.test.ts`](../apps/web/src/domain/__tests__/capital.test.ts)                 |
| 11.9  | Aporte aumento de capital (total sobe, operacional igual)                      | [`capital.test.ts`](../apps/web/src/domain/__tests__/capital.test.ts)                 |
| 11.10 | Pró-labore em dinheiro entra como saída no esperado                            | [`caixa.test.ts`](../apps/web/src/domain/__tests__/caixa.test.ts)                     |
| 11.11 | Perda reduz estoque/capital, não debita conta                                  | [`capital.test.ts`](../apps/web/src/domain/__tests__/capital.test.ts)                 |
| 11.12 | Diferença de caixa: sobra (+) / falta (−)                                      | [`caixa.test.ts`](../apps/web/src/domain/__tests__/caixa.test.ts)                     |
| 11.13 | Custo histórico não muda lucro de fechamentos anteriores                       | [`precos.test.ts`](../apps/web/src/domain/__tests__/precos.test.ts)                   |
| 11.14 | Preço histórico não reescreve valores passados                                 | [`precos.test.ts`](../apps/web/src/domain/__tests__/precos.test.ts)                   |

Extra: [`money.test.ts`](../apps/web/src/lib/__tests__/money.test.ts) cobre
parse/format de R$ e arredondamento half-up.

## Nota sobre a âncora §11.1 (reconciliação)

A implementação oficial segue a **equação canônica §3.3** — reconciliação da
**gaveta** (só dinheiro em espécie):

```
esperado_gaveta = venda − PIX − despesa = 2.204,90 − 383,00 − 50,00 = 1.771,90
diferença       = contado_espécie(1.772,00) − 1.771,90 = +0,10
```

O texto da §11.1 cita "esperado 2.154,90 / contado 2.155,00", que é a leitura
equivalente de **total recebido** (não subtrai PIX dos dois lados):

```
esperado_total = venda − despesa = 2.154,90
contado_total  = espécie + PIX = 2.155,00
diferença      = +0,10
```

As duas leituras dão a **mesma diferença (+0,10)** — a asserção obrigatória. O
teste verifica ambas.

## Fluxo / E2E (Fases 5–10) — ⏳ pendentes

15–19: fechar em ≤ 3 min; vendedor sem acesso a capital/sócios; fechar offline e
sincronizar; reabrir recalcula em cascata; alertas de estoque/tanque. Viram
testes E2E nas respectivas fases.
