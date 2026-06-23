# Roadmap

Fatias verticais pequenas, cada uma testável e entregável. **Schema e lógica
antes de UI**; lógica financeira coberta por testes antes de qualquer tela
(§9 da spec). Cada fase termina numa **Definition of Done (DoD)**.

Legenda: ✅ concluída · 🔜 próxima · ⏳ pendente

---

## ✅ Fase 0 — Fundação e contexto canônico

Repositório, contexto dos agentes e esqueleto rodando.

- [x] Estrutura de pastas (§7.5) + monorepo pnpm.
- [x] `AGENTS.md` (spec canônica) + `CLAUDE.md`.
- [x] PWA React+TS+Vite instalável; Tailwind v4 + tokens (§8.2).
- [x] Libs `money` (centavos), `datas` (Manaus), `uuidv7`.
- [x] Lint que barra float em dinheiro (`no-float-money` + tipos branded).
- [ ] Projeto Supabase / MCPs configurados (adiado — sem nuvem nesta entrega).
      **DoD:** app abre offline; agentes leem o AGENTS.md; lint barra float. ✅

## ✅ Fase 2 — Núcleo de domínio (motor de cálculo) ⭐

A parte de maior risco, construída test-first.

- [x] `domain/` puro: `venda`, `caixa`, `capital`, `tanque`, `precos`.
- [x] Suíte de testes cobrindo §3.4 e os casos especiais §3.6.
      **DoD:** o teste da planilha real passa (`+0,10`); cenários §11.1–14 verdes. ✅

> Fases 0 e 2 foram entregues primeiro (lógica antes de telas). A Fase 1 está
> quase completa: schema aplicado na nuvem; falta só o sync offline (PowerSync).

## 🟡 Fase 1 — Modelo de dados e migrations (nuvem provisionada; falta PowerSync)

- [x] Migrations Postgres com todas as entidades (§6) — `supabase/migrations/` (7 arquivos).
- [x] Políticas RLS por permissão (esqueleto) + helper `tem_permissao` (schema `private`).
- [x] Catálogo fixo de permissões (§4).
- [x] Seed do **dia zero** (§3.8) — saldos derivados conferem (Caixa R$500 / Bradesco R$15.000).
- [x] PowerSync **sync rules** (esqueleto) — `supabase/powersync/sync-rules.yaml`.
- [x] **Projeto Supabase provisionado** via MCP: `pontao-beira-rio`
      (ref `jkvyrrzjgphhvejggiuo`, sa-east-1). Migrations + seed aplicados;
      `apps/web/.env` configurado (URL + publishable key).
- [x] **Advisors de segurança: 0 achados** (views `security_invoker`; `tem_permissao`
      em schema `private`). Performance: só INFO (índices novos sem tráfego).
- [x] **Wiring do cliente (online)**: `@supabase/supabase-js`, camada `data/`
      (cliente, conversão borda→bigint, repositórios), **login** (Supabase Auth)
      e **Painel** lendo dados reais (saldos derivados, tanques, produtos).
      Verificado de ponta a ponta (login → RLS → dados, incl. tabela sensível).
- [ ] **Instância PowerSync** (serviço separado, não coberto pelo MCP do Supabase):
      criar em powersync.com apontando para este Postgres + subir as sync rules.
      Só então a leitura passa a vir do SQLite local (offline-first).

**DoD:** ⚠️ parcial — app lê/escreve **online** contra o banco real ✓; o
**offline** (PowerSync/SQLite) depende da instância externa.

## ⏳ Fase 3 — Autenticação e permissões

Supabase Auth; permissões por item + modelos prontos; RLS aplicado; UI esconde o
que a permissão não permite. **DoD:** vendedor não vê capital/sócios (UI e sync).

## ⏳ Fase 4 — Catálogo e configuração

Produtos, preços, custos, contas, categorias, configurações (§5.6, §5.4, §5.11);
histórico de preço/custo por data. **DoD:** cadastrar todo o catálogo real.

## ⏳ Fase 5 — Fechamento de caixa + relatório ⭐

Fluxo central (§5.2, §8.4) e o relatório espelho (§5.3). **DoD:** fechar um dia
real em ≤ 3 min; relatório bate com o motor da Fase 2; trava ao confirmar.

## ⏳ Fase 6 — Livro financeiro (UI)

Contas, transferências, depósitos, despesas, aportes (§5.4, §5.5, §5.10); taxa de
cartão automática. **DoD:** transferência não cria/destrói dinheiro.

## ⏳ Fase 7 — Fiado e folha

Contas a receber e salários/vales (§5.8, §5.9). **DoD:** pagar fiado não infla a
venda do dia; `a_receber = salário − vales`.

## ⏳ Fase 8 — Painel e alertas

KPIs, medidor de tanque (componente-assinatura), gráficos, alertas (§5.1).
**DoD:** painel reflete o estado real; alertas disparam nos limites.

## ⏳ Fase 9 — Endurecimento offline (PWA + sync)

Instalação polida; fila de upload robusta; indicadores de sync; `fechamento.data
UNIQUE`. **DoD:** fechar offline e sincronizar sem perda/duplicidade.

## ⏳ Fase 10 — Auditoria, correção e polimento

Log de auditoria (§5.12); reabertura/ajuste com recálculo em cascata; E2E.
**DoD:** toda alteração financeira é rastreável; correção retroativa recalcula.
