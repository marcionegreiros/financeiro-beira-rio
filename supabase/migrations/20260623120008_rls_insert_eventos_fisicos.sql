-- Migration 0008 — Políticas de INSERT para os eventos físicos do fechamento.
--
-- O fechamento (quem tem fechar_caixa) grava contagens e leituras; entradas e
-- perdas podem vir do fechamento ou de quem gerencia combustível/despesa.
-- (A matriz completa de INSERT/UPDATE por permissão é finalizada na Fase 3.)

create policy inserir_contagem on public.contagem_produto
  for insert to authenticated with check (private.tem_permissao('fechar_caixa'));

create policy inserir_leitura on public.leitura_bomba
  for insert to authenticated with check (private.tem_permissao('fechar_caixa'));

create policy inserir_entrada_merc on public.entrada_mercadoria
  for insert to authenticated with check (
    private.tem_permissao('fechar_caixa') or private.tem_permissao('gerenciar_combustivel')
  );

create policy inserir_perda on public.perda
  for insert to authenticated with check (
    private.tem_permissao('fechar_caixa') or private.tem_permissao('lancar_despesa')
  );
