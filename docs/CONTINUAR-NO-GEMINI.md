# Continuar o desenvolvimento (handoff para o Gemini / Antigravity)

Este documento orienta a continuação do projeto por **outro agente de IA**
(Antigravity / Gemini 3.x). Foi escrito porque o desenvolvimento começou no
Claude Code e segue agora em outra ferramenta. **Leia na ordem abaixo antes de
codar.**

---

## 1. Onde estão as instruções (leia nesta ordem)

| Arquivo | Para quê |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | **Fonte única de verdade** (a especificação inteira). Os dois pilares, glossário (§2), regras de negócio com fórmulas (§3), permissões (§4), módulos (§5), modelo de dados (§6), stack (§7), design (§8), roadmap (§9), critérios de aceite (§11). Antigravity carrega este arquivo automaticamente. |
| [`CLAUDE.md`](../CLAUDE.md) | Resumo do Working Agreement + estado atual + onde fica cada coisa. |
| [`docs/working-agreement.md`](./working-agreement.md) | Regras inegociáveis de como trabalhar. |
| [`docs/roadmap.md`](./roadmap.md) | **O que fazer**, fase a fase, com o estado atual (✅/🟢/🟡/⏳). |
| [`docs/criterios-de-aceite.md`](./criterios-de-aceite.md) | Cenários obrigatórios ↔ testes. |
| [`docs/modelo-de-dados.md`](./modelo-de-dados.md) + [`docs/arquitetura.md`](./arquitetura.md) | Mapa do banco e das camadas. |
| [`docs/adr/`](./adr/) | Decisões arquiteturais (por que centavos, UUIDv7, Manaus, etc.). |

Código de referência (reutilize os padrões):
- ⭐ [`apps/web/src/domain/`](../apps/web/src/domain/) — **motor de cálculo puro, testado**. NUNCA duplique essa lógica em SQL ou na UI; importe daqui.
- [`apps/web/src/data/`](../apps/web/src/data/) — camada de dados (cliente Supabase, **conversão na borda**, repositórios, sessão).
- [`apps/web/src/features/`](../apps/web/src/features/) — telas. Exemplos completos: `fechamento/`, `painel/`, `auth/`, `Shell.tsx`.
- [`supabase/migrations/`](../supabase/migrations/) — schema versionado; [`supabase/README.md`](../supabase/README.md) explica como aplicar.

---

## 2. Estado atual (junho/2026)

- ✅ **Fase 0** Fundação · ✅ **Fase 2** Núcleo de domínio (42 testes, inclui a âncora R$0,10).
- 🟡 **Fase 1** Banco na **nuvem Supabase** (projeto `pontao-beira-rio`, ref `jkvyrrzjgphhvejggiuo`, sa-east-1). Migrations 0001–0008 + seed aplicados. Advisors de segurança = 0. App **conectado online** (login + Painel). Falta só **PowerSync** (offline) — adiado.
- 🟢 **Fase 5** **Fechamento de caixa + Relatório** funcionando online.
- ⏳ **Faltam: Fase 4 (catálogo), Fase 6 (livro financeiro), Fase 8 (painel/alertas)** — este handoff. Depois: 3 (auth/permissões completas), 7 (fiado/folha), 9 (offline), 10 (auditoria).

Login de teste: **mngn.eng@gmail.com** / **BeiraRio@2026** (usuário gerente, todas as permissões). O `apps/web/.env` já tem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

---

## 3. Convenções críticas (não viole — quebra o sistema)

1. **Dinheiro só em centavos** (`bigint`, tipo `Centavos` em `lib/money.ts`). **NUNCA float.** Há regra ESLint `no-float-money` em `domain/**` e `lib/money.ts`.
2. **Volume só em mililitros** (`bigint`, `Mililitros` em `domain/tipos.ts`).
3. **Conversão acontece na BORDA**, em [`data/conversao.ts`](../apps/web/src/data/conversao.ts):
   - banco → domínio: `paraCentavos`, `paraQuantidade`, `litrosParaMililitros`.
   - domínio → banco (gravar): `centavosParaNumero`, `quantidadeParaNumero`, `mililitrosParaLitros`. **`bigint` não vai em JSON** — sempre converta para `number` antes de `.insert()`.
4. **Datas só em America/Manaus** (`lib/datas.ts`): `hojeManaus()`, `agoraManausISO()`.
5. **IDs só UUIDv7** gerados no cliente: `uuidv7()` de `lib/uuidv7.ts`.
6. **Saldos/estoques/vendas são DERIVADOS de eventos** (Pilar 1). Proibido criar coluna/variável de saldo mutável. Ver views `vw_saldo_conta`, etc.
7. **Conceitos de domínio em português**; termos técnicos em inglês.
8. **Lógica financeira nova → teste primeiro** (Vitest, em `domain/__tests__/`).

### Gotchas do Supabase (já aprendidos aqui)

- O cliente é **sem tipos** (`createClient(url, key)`); faça `as Array<{...}>` no `data` retornado (veja `data/repositorios.ts`).
- **Toda nova ESCRITA precisa de política RLS.** RLS está ligado em todas as tabelas; sem policy de `insert`/`update`, o banco **nega** (silenciosamente devolve erro). Veja a migration `0008` como modelo e use `private.tem_permissao('<chave>')`.
- **Views novas:** crie com `... with (security_invoker = on)` senão furam o RLS (o advisor acusa como ERROR).
- **Funções helper de permissão** ficam no schema `private` (fora da API), não em `public`.
- Para aplicar migrations: se o Antigravity tiver o **MCP do Supabase**, use `apply_migration`/`execute_sql` no projeto `jkvyrrzjgphhvejggiuo`. Senão, use o SQL Editor do dashboard ou o Supabase CLI (`supabase db push`). Sempre rode `get_advisors` (segurança) depois de mexer no schema.

### Padrão de tela (reutilize)

`features/<modulo>/<Tela>.tsx` chama funções de `data/<modulo>.ts` (repositórios)
→ que falam com o Supabase e **convertem na borda** → a tela formata com
`formatReais`/`formatLitros`. Visibilidade por permissão (veja `Shell.tsx`).
Importe os cálculos de `domain/`.

### Fluxo por fatia
spec/seção → (teste se for lógica) → repositório → tela → `pnpm typecheck && pnpm test && pnpm lint && pnpm build` → commit pequeno.

---

## 4. Fase 4 — Catálogo e configuração (§5.6, §5.4, §5.11)

**Objetivo:** cadastrar/editar pela UI tudo que hoje só existe via seed.

**Telas (criar em `features/`):**
- `produtos/` — lista + form de produto (nome, categoria, **ordem**, **modo_apuracao** contagem/individual, alerta_baixo/muito_baixo, ativo). Preço: **histórico** — alterar preço **insere** novo `preco_produto` com `valido_a_partir_de` (NÃO edita o passado). Custo idem em `custo_produto` (timestamptz). Mostre o preço/custo vigente com `domain/precos.ts` (`precoVigenteEm`/`custoVigenteEm`).
- `contas/` — CRUD de `conta` (dinheiro/banco), marcar **uma** como `eh_destino_padrao_venda`, ativar/desativar.
- `configuracoes/` — editar `config` (troco_fixo_centavos, taxa_cartao_debito/credito {percentual_bp, fixa_centavos}, modo_apuracao_padrao, data_corte_folha_dia, conta_destino_padrao_venda) e alertas por produto/tanque.
- Categorias e categorias de despesa (CRUD simples).

**Banco / RLS:** criar `supabase/migrations/20260623_xxxx_rls_catalogo.sql` com políticas de **insert/update** (e o que precisar) gated por: `cadastrar_produto` (produto, categoria), `definir_preco_custo` (preco_*/custo_*), `gerenciar_contas` (conta), `editar_configuracoes` (config, categoria_despesa, alertas). Modelo: migration 0008.

**Reutilize:** `data/repositorios.ts` (estenda), `data/conversao.ts`, `domain/precos.ts`, `lib/money`, `lib/uuidv7`, `lib/datas`.

**DoD:** dá para cadastrar todo o catálogo real e configurar parâmetros pela tela; alterar preço não muda fechamentos passados.

---

## 5. Fase 6 — Livro financeiro / UI (§5.4, §5.5, §5.10)

**Objetivo:** as telas do dinheiro que o fechamento abre.

- `contas/` (saldos já derivam de `vw_saldo_conta` / `listarSaldos`): adicionar **transferência** e **depósito** = **partida dobrada** → DOIS `movimento` (saída na origem `−valor`, entrada no destino `+valor`) ligados por `contraparte_conta_id`, mesmo `data_hora`. Tipos: `transferencia`/`deposito`. **Conferir invariante:** soma dos saldos constante (cenário §11.7, já testado em `domain`).
- `despesas/` — lançar despesa: valor, **conta de origem**, `categoria_despesa`, forma_pagamento, descrição, tags. `perda` é categoria especial que **NÃO debita conta** (cria evento `perda`, não `movimento`). Taxa de cartão/ diferença são categorias especiais.
- `socios/` — **aporte** (`aporte_emprestimo` ou `aporte_aumento`, com `socio_id` e conta destino) e **devolução** (`devolucao_emprestimo`). Saldo devedor por sócio: `vw_saldo_devedor_socio` + `domain/capital.ts` `saldoDevedorSocio`. Visível só com `ver_retiradas_socios`.
- Taxa de cartão automática: já existe `domain/capital.ts` `liquidoCartao` (a venda registra bruto, a conta recebe líquido, a diferença vira `taxa_cartao`).

**Banco / RLS:** a política `inserir_despesa` (migration 0005) **já permite** insert em `movimento` para quem tem `lancar_despesa`/`transferir_entre_contas`/`fechar_caixa`/`gerenciar_socios`. Para `perda`, há `inserir_perda` (0008). Confira se precisa de policy nova só se criar tabela nova (não deve).

**Reutilize:** `domain/capital.ts` (liquidoCartao, saldoDevedorSocio, capital), `lib/money` (somar/subtrair/negar), o padrão de repositório.

**DoD:** transferência não cria/destrói dinheiro (soma dos saldos constante); despesa em dinheiro reduz o Caixa; saldo devedor de sócio sobe no empréstimo e zera na devolução.

---

## 6. Fase 8 — Painel e alertas (§5.1)

**Objetivo:** visão executiva. Estender o `features/painel/Painel.tsx` atual.

- **KPIs:** venda do **dia** e do **mês**, **litros vendidos no mês** por combustível, **capital** (toggle **operacional**/**total**).
  - Venda do dia/mês: derive dos fechamentos (diferenças de contagem/encerrante entre dias) usando `domain/venda.ts`. Pode materializar por dia, mas **sempre reconstruível** dos eventos.
  - Capital: `domain/capital.ts` `capitalTotal`/`capitalOperacional`. Precisa: Σ saldos (`vw_saldo_conta`), fiado em aberto (`vw_fiado_em_aberto`), valor do **estoque** a custo (`custoMedioPonderado` × estoque_atual) e do **combustível** nos tanques, − empréstimos de sócio em aberto. `estoque_atual` = Σ entradas − Σ vendido − Σ perdas (derive; pode virar uma view `security_invoker` ou cálculo no repo).
- **Medidor de tanque:** já existe `components/MedidorTanque.tsx` (usado no Painel). Mantenha como componente-assinatura (§8.3).
- **Alertas:** estoque **baixo/muito baixo/zerado** (estoque_atual vs `produto.alerta_baixo`/`alerta_muito_baixo`); tanque baixo (nível vs `tanque.nivel_alerta_litros`, visível ao vendedor); fiados vencendo.
- **Gráficos:** evolução do capital no tempo e venda diária do mês. Sugestão: adicionar `recharts` (`pnpm --filter @pontao/web add recharts`). Respeitar `prefers-reduced-motion`.
- **Permissões:** vendedor vê só o painel operacional (sem capital/sócios). Use `usuario.permissoes` (já carregado em `data/usuario.ts` e passado pelo `Shell`).

**DoD:** painel reflete o estado real; alertas disparam nos limites configurados; toggle capital operacional/total funciona.

---

## 7. Comandos

```bash
pnpm install
pnpm dev          # app em desenvolvimento (login acima)
pnpm test         # Vitest (mantenha verde; adicione testes p/ lógica nova)
pnpm typecheck    # TS strict
pnpm lint         # ESLint (inclui no-float-money)
pnpm build        # build de produção (PWA)
pnpm format       # Prettier
```

Antes de cada commit: `pnpm typecheck && pnpm test && pnpm lint && pnpm build` verdes. Um commit por fatia, mensagem em PT, descritiva.

---

## 8. Resumo para colar no Gemini

Há um prompt pronto no fim deste handoff / na conversa de entrega. Em essência:
"Leia `AGENTS.md` e `docs/CONTINUAR-NO-GEMINI.md`. Implemente a **Fase 4** (depois 6, depois 8) seguindo o roadmap e as convenções (centavos bigint, conversão na borda, RLS para toda escrita, reutilizar `domain/` e o padrão de repositório). Rode typecheck/test/lint/build e commite por fatia."
