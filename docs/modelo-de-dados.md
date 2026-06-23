# Modelo de dados

Modelagem **orientada a eventos** (Pilar 1). Saldos, estoques e vendas são
**views/consultas**, nunca colunas mutáveis. Detalhe completo das colunas em
[`../AGENTS.md`](../AGENTS.md) §6 — este documento é o mapa de leitura.

## Convenções de tipo

- **Dinheiro:** centavos como `bigint`.
- **Volume/encerrante:** `numeric(14,3)` (ou inteiro em mL). No domínio (TS),
  representado como `Mililitros` (`bigint`).
- **IDs:** UUIDv7 (gerados no cliente).
- **Datas:** `date` para data do fechamento; `timestamptz` (Manaus −04:00) para
  movimentos.

## Grupos de tabelas (§6)

1. **Identidade e permissões** — `usuario`, `permissao`, `usuario_permissao`,
   `modelo_permissao`, `modelo_permissao_item`. Permissão **por item** (§4).
2. **Catálogo e configuração** — `categoria`, `produto`, `preco_produto`,
   `custo_produto`, `combustivel`, `tanque`, `bomba`, `preco_combustivel`,
   `custo_combustivel`, `conta`, `socio`, `funcionario`, `cliente_fiado`,
   `categoria_despesa`, `config`.
3. **Eventos do livro físico** — `fechamento`, `contagem_produto`,
   `leitura_bomba`, `entrada_mercadoria`, `entrada_combustivel`,
   `medicao_tanque`, `perda`, `venda_avulsa`.
4. **Livro financeiro (razão)** — `movimento` (uma tabela com `tipo`,
   `valor_centavos` com sinal, conta afetada, contraparte, etc.).
5. **Fiado e sócios** — `fiado`; aportes/devoluções são `movimento`.
6. **Folha** — vales são `movimento`; `fechamento_folha`.
7. **Auditoria** — `auditoria` (quem, quando, antes/depois).

## Invariantes importantes

- **Transferência/depósito = partida dobrada:** dois `movimento` (saída na
  origem, entrada no destino), ligados por `contraparte_conta_id`. Não cria nem
  destrói dinheiro. → implementado e testado em
  [`capital.test.ts`](../apps/web/src/domain/__tests__/capital.test.ts) (§11.7).
- **Recebimento de fiado ≠ venda:** é `movimento.tipo = recebimento_fiado`, não
  infla a venda do dia (§11.5).
- **Perda não debita conta:** baixa estoque (e capital via estoque) só (§11.11).

## Views derivadas (§6.8) — implementadas como queries na Fase 1

`saldo_conta`, `estoque_atual`, `nivel_tanque`, `fiado_em_aberto`,
`saldo_devedor_socio`, `custo_medio_produto`, `capital_total`. As fórmulas já
existem, testadas, no núcleo de [`domain/`](../apps/web/src/domain/). Cache por
dia é permitido **desde que sempre reconstrutível** a partir dos eventos — cache
nunca é fonte de verdade.
