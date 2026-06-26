-- Migration — Escrita de sócios (cadastro) sob RLS.
--
-- A tabela `socio` só tinha política de SELECT (`ler_socios`, gated por
-- `ver_retiradas_socios`) e a de DELETE adicionada em 20260625140000. Faltavam
-- INSERT e UPDATE, então a nova TELA DE GESTÃO de sócios não conseguiria
-- cadastrar/editar. Aqui fechamos a matriz de escrita, gated por `gerenciar_socios`,
-- e damos SELECT também a quem gerencia (além de quem vê retiradas), para a tela
-- listar os sócios mesmo sem `ver_retiradas_socios`.

create policy inserir_socio on public.socio
  for insert to authenticated
  with check (private.tem_permissao('gerenciar_socios'));

create policy atualizar_socio on public.socio
  for update to authenticated
  using (private.tem_permissao('gerenciar_socios'));

create policy ler_socios_gestao on public.socio
  for select to authenticated
  using (private.tem_permissao('gerenciar_socios'));
