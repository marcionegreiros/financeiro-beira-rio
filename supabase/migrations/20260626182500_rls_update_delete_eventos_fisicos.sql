-- Migration — Adicionar políticas de UPDATE e DELETE para contagem_produto e leitura_bomba.
-- Necessário para permitir a atualização de estoque inicial no Dia Zero e a gravação/exclusão em fechamentos.

drop policy if exists atualizar_contagem on public.contagem_produto;
create policy atualizar_contagem on public.contagem_produto
  for update to authenticated
  using (private.tem_permissao('fechar_caixa'))
  with check (private.tem_permissao('fechar_caixa'));

drop policy if exists apagar_contagem on public.contagem_produto;
create policy apagar_contagem on public.contagem_produto
  for delete to authenticated
  using (private.tem_permissao('fechar_caixa'));

drop policy if exists atualizar_leitura on public.leitura_bomba;
create policy atualizar_leitura on public.leitura_bomba
  for update to authenticated
  using (private.tem_permissao('fechar_caixa'))
  with check (private.tem_permissao('fechar_caixa'));

drop policy if exists apagar_leitura on public.leitura_bomba;
create policy apagar_leitura on public.leitura_bomba
  for delete to authenticated
  using (private.tem_permissao('fechar_caixa'));
