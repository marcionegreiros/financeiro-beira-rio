-- Migration — Políticas de INSERT/UPDATE/DELETE para Combustível e Tanques.
--
-- O RLS já estava habilitado (migration 0005) e a leitura-base liberada, mas
-- NENHUMA política de escrita existia para combustível/tanque/bomba, entradas,
-- medições, preço e custo — logo o Postgres negava toda gravação. Esta migration
-- fecha a matriz de escrita do §5.6/§3.2:
--
--   • cadastro/config (combustivel, tanque, bomba) ......... gerenciar_combustivel
--   • entradas de carga e medições de régua ................ gerenciar_combustivel
--   • preço de venda e custo do combustível ................ definir_preco_custo
--
-- Edição/exclusão de eventos com data (entradas, medições) seguem a trava
-- retroativa do §3.7: livre no dia corrente, senão exige editar_lancamentos_retroativos.

-- =====================================================================
-- Cadastro e configuração (sem data → sem trava retroativa)
-- =====================================================================
create policy inserir_combustivel on public.combustivel
  for insert to authenticated with check (private.tem_permissao('gerenciar_combustivel'));
create policy atualizar_combustivel on public.combustivel
  for update to authenticated using (private.tem_permissao('gerenciar_combustivel'));

create policy inserir_tanque on public.tanque
  for insert to authenticated with check (private.tem_permissao('gerenciar_combustivel'));
create policy atualizar_tanque on public.tanque
  for update to authenticated using (private.tem_permissao('gerenciar_combustivel'));

create policy inserir_bomba on public.bomba
  for insert to authenticated with check (private.tem_permissao('gerenciar_combustivel'));
create policy atualizar_bomba on public.bomba
  for update to authenticated using (private.tem_permissao('gerenciar_combustivel'));

-- =====================================================================
-- Entrada de combustível (carga): afeta só o nível do tanque (§3.2)
-- =====================================================================
create policy inserir_entrada_comb on public.entrada_combustivel
  for insert to authenticated
  with check (private.tem_permissao('gerenciar_combustivel'));
create policy editar_entrada_comb on public.entrada_combustivel
  for update to authenticated
  using (
    private.tem_permissao('gerenciar_combustivel')
    and (data >= private.hoje_manaus() or private.tem_permissao('editar_lancamentos_retroativos'))
  );
create policy apagar_entrada_comb on public.entrada_combustivel
  for delete to authenticated
  using (
    private.tem_permissao('gerenciar_combustivel')
    and (data >= private.hoje_manaus() or private.tem_permissao('editar_lancamentos_retroativos'))
  );

-- =====================================================================
-- Medição de régua: reconciliação contra o nível calculado (§3.2)
-- =====================================================================
create policy inserir_medicao on public.medicao_tanque
  for insert to authenticated
  with check (private.tem_permissao('gerenciar_combustivel'));
create policy editar_medicao on public.medicao_tanque
  for update to authenticated
  using (
    private.tem_permissao('gerenciar_combustivel')
    and ((data_hora at time zone 'America/Manaus')::date >= private.hoje_manaus()
         or private.tem_permissao('editar_lancamentos_retroativos'))
  );
create policy apagar_medicao on public.medicao_tanque
  for delete to authenticated
  using (
    private.tem_permissao('gerenciar_combustivel')
    and ((data_hora at time zone 'America/Manaus')::date >= private.hoje_manaus()
         or private.tem_permissao('editar_lancamentos_retroativos'))
  );

-- =====================================================================
-- Preço de venda e custo do combustível (histórico por vigência — §5.6)
-- =====================================================================
create policy inserir_preco_comb on public.preco_combustivel
  for insert to authenticated with check (private.tem_permissao('definir_preco_custo'));
create policy atualizar_preco_comb on public.preco_combustivel
  for update to authenticated using (private.tem_permissao('definir_preco_custo'));

create policy inserir_custo_comb on public.custo_combustivel
  for insert to authenticated with check (private.tem_permissao('definir_preco_custo'));
create policy atualizar_custo_comb on public.custo_combustivel
  for update to authenticated using (private.tem_permissao('definir_preco_custo'));
