-- Migration 0013 — Fase 7 (Folha de Pagamento) — RLS para registrar pagamentos de salários e gerenciar vales.
--
-- Objetivo: permitir que usuários com permissão 'gerenciar_funcionarios':
--   1. Insiram movimentos de despesa associados a um funcionário (pagamento de folha/salário).
--   2. Excluam movimentos associados a um funcionário (ex.: excluir um vale ou pagamento incorreto).

-- ── movimento: inserção de pagamento de salário (tipo = 'despesa' e funcionario_id IS NOT NULL)
create policy inserir_mov_pagamento_salario on public.movimento
  for insert to authenticated
  with check (
    private.tem_permissao('gerenciar_funcionarios')
    and tipo = 'despesa'
    and funcionario_id is not null
  );

-- ── movimento: exclusão de vale ou pagamento de salário (funcionario_id IS NOT NULL)
create policy apagar_mov_funcionario on public.movimento
  for delete to authenticated
  using (
    private.tem_permissao('gerenciar_funcionarios')
    and funcionario_id is not null
  );
