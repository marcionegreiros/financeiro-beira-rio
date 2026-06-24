-- Migration 0012 — Fase 7 (Fiado e Folha) — RLS da tabela cliente_fiado para fechar_caixa.
--
-- Modificamos as políticas de inserção e atualização da tabela cliente_fiado para que
-- usuários autenticados com a permissão 'fechar_caixa' também possam cadastrar/atualizar clientes.
-- Isso é necessário para permitir cadastrar novos clientes diretamente na tela de Fechamento de Caixa.

drop policy if exists inserir_cliente_fiado on public.cliente_fiado;
drop policy if exists atualizar_cliente_fiado on public.cliente_fiado;

create policy inserir_cliente_fiado on public.cliente_fiado
  for insert to authenticated
  with check (
    private.tem_permissao('gerenciar_fiado')
    or private.tem_permissao('fechar_caixa')
  );

create policy atualizar_cliente_fiado on public.cliente_fiado
  for update to authenticated
  using (
    private.tem_permissao('gerenciar_fiado')
    or private.tem_permissao('fechar_caixa')
  )
  with check (
    private.tem_permissao('gerenciar_fiado')
    or private.tem_permissao('fechar_caixa')
  );
