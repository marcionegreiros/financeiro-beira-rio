# ADR 0006 — Offline-first com Supabase + PowerSync

- **Status:** aceito (implementação na Fase 1)
- **Data:** 2026-06
- **Contexto:** o requisito de negócio que define a arquitetura é **fechar o
  caixa sem internet** (estação à beira-rio) e sincronizar ao recuperar sinal.
  Isso exige um banco **local** no dispositivo, espelhado num banco central.

## Decisão

- **Banco central:** Supabase (PostgreSQL + Auth + RLS + Realtime).
- **Sync offline:** PowerSync — mantém um **SQLite local** no app, fila de
  upload, e sincroniza ao reconectar. Suporte offline de primeira classe; plano
  gratuito; não exige mudança de schema no Supabase.

## Alternativas consideradas

- **ElectricSQL** — ótimo, mas offline/conflito menos maduros para um requisito
  de negócio.
- **Zero** — DX web excelente, offline mais limitado.
- **RxDB/Dexie** — leve, porém sync artesanal.

Para um app **financeiro** onde offline é requisito, **PowerSync vence**.

## Consequências

- ✅ Combina com o Pilar 1: eventos append-only → sync ≈ unir conjuntos e
  re-derivar; conflito raro resolvido por last-write-wins.
- 🔒 Permissões em duas camadas: _sync rules_ (o que desce) + **RLS** (o que sobe).
- 📌 `fechamento.data UNIQUE` previne dois fechamentos do mesmo dia.
- ⏳ Provisionamento (contas, instância, sync rules) fica para a **Fase 1**;
  esta entrega é 100% offline/local, sem credenciais.
