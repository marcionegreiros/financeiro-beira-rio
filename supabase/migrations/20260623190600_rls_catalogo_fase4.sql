-- Migration — Políticas de INSERT/UPDATE para o Catálogo e Configuração (Fase 4)
--
-- Aplica Row Level Security (RLS) nas tabelas do catálogo que serão geridas na UI.

-- Categoria
create policy inserir_categoria on public.categoria
  for insert to authenticated with check (private.tem_permissao('cadastrar_produto'));

create policy atualizar_categoria on public.categoria
  for update to authenticated using (private.tem_permissao('cadastrar_produto'));

-- Produto
create policy inserir_produto on public.produto
  for insert to authenticated with check (private.tem_permissao('cadastrar_produto'));

create policy atualizar_produto on public.produto
  for update to authenticated using (private.tem_permissao('cadastrar_produto'));

-- Preço e Custo do Produto
create policy inserir_preco_produto on public.preco_produto
  for insert to authenticated with check (private.tem_permissao('definir_preco_custo'));

create policy atualizar_preco_produto on public.preco_produto
  for update to authenticated using (private.tem_permissao('definir_preco_custo'));

create policy inserir_custo_produto on public.custo_produto
  for insert to authenticated with check (private.tem_permissao('definir_preco_custo'));

create policy atualizar_custo_produto on public.custo_produto
  for update to authenticated using (private.tem_permissao('definir_preco_custo'));

-- Conta
create policy inserir_conta on public.conta
  for insert to authenticated with check (private.tem_permissao('gerenciar_contas'));

create policy atualizar_conta on public.conta
  for update to authenticated using (private.tem_permissao('gerenciar_contas'));

-- Config
create policy inserir_config on public.config
  for insert to authenticated with check (private.tem_permissao('editar_configuracoes'));

create policy atualizar_config on public.config
  for update to authenticated using (private.tem_permissao('editar_configuracoes'));

-- Categoria de Despesa
create policy inserir_categoria_despesa on public.categoria_despesa
  for insert to authenticated with check (private.tem_permissao('editar_configuracoes'));

create policy atualizar_categoria_despesa on public.categoria_despesa
  for update to authenticated using (private.tem_permissao('editar_configuracoes'));
