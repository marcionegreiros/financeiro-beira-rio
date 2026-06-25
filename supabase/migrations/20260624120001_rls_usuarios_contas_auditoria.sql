-- Migration — Fase 3: helpers e políticas RLS para usuários, ACL de conta,
-- auditoria e edição retroativa (§4, §7.3). "A UI esconde, o RLS proíbe".
--
-- Helpers ficam em `private` (fora da API PostgREST), como `private.tem_permissao`
-- (migration 0007).

-- =====================================================================
-- Helpers
-- =====================================================================

-- Id da linha `usuario` do autenticado (ou null).
create or replace function private.usuario_atual_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id from usuario u where u.auth_uid = auth.uid() and u.ativo limit 1;
$$;
revoke all on function private.usuario_atual_id() from public;
grant execute on function private.usuario_atual_id() to authenticated;

-- "Hoje" em America/Manaus (UTC−4, sem horário de verão) como date.
create or replace function private.hoje_manaus()
returns date
language sql
stable
set search_path = pg_catalog
as $$
  select (now() at time zone 'America/Manaus')::date;
$$;
revoke all on function private.hoje_manaus() from public;
grant execute on function private.hoje_manaus() to authenticated;

-- Pode VER a conta? Permissão global (atalho do gerente) OU linha na ACL.
create or replace function private.pode_ver_conta(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.tem_permissao('gerenciar_contas')
    or private.tem_permissao('ver_capital')
    or exists (
      select 1 from usuario_conta uc
      where uc.conta_id = p_conta
        and uc.usuario_id = private.usuario_atual_id()
    );
$$;
revoke all on function private.pode_ver_conta(uuid) from public;
grant execute on function private.pode_ver_conta(uuid) to authenticated;

-- Pode MOVIMENTAR a conta? Permissões operacionais globais OU ACL movimentar.
create or replace function private.pode_movimentar_conta(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.tem_permissao('transferir_entre_contas')
    or private.tem_permissao('gerenciar_contas')
    or private.tem_permissao('fechar_caixa')
    or exists (
      select 1 from usuario_conta uc
      where uc.conta_id = p_conta
        and uc.usuario_id = private.usuario_atual_id()
        and uc.nivel = 'movimentar'
    );
$$;
revoke all on function private.pode_movimentar_conta(uuid) from public;
grant execute on function private.pode_movimentar_conta(uuid) to authenticated;

-- =====================================================================
-- Identidade: usuário edita a PRÓPRIA linha; gerente edita todos (§4).
-- A criação de auth.users + usuario é feita pela Edge Function (service_role),
-- que ignora RLS — aqui ficam só as escritas vindas do app autenticado.
-- =====================================================================
create policy usuario_self_update on public.usuario
  for update to authenticated
  using (auth_uid = auth.uid())
  with check (auth_uid = auth.uid());

create policy usuario_admin_update on public.usuario
  for update to authenticated
  using (private.tem_permissao('gerenciar_permissoes'))
  with check (private.tem_permissao('gerenciar_permissoes'));

create policy usuario_admin_insert on public.usuario
  for insert to authenticated
  with check (private.tem_permissao('gerenciar_permissoes'));

-- =====================================================================
-- Permissões e ACL: só quem tem `gerenciar_permissoes` escreve.
-- (Leitura já é coberta por `ler_base`; usuario_conta ganha leitura aqui.)
-- =====================================================================
create policy usuario_conta_ler on public.usuario_conta
  for select to authenticated using (true);

create policy usuario_conta_gerenciar on public.usuario_conta
  for all to authenticated
  using (private.tem_permissao('gerenciar_permissoes'))
  with check (private.tem_permissao('gerenciar_permissoes'));

create policy usuario_permissao_gerenciar on public.usuario_permissao
  for all to authenticated
  using (private.tem_permissao('gerenciar_permissoes'))
  with check (private.tem_permissao('gerenciar_permissoes'));

create policy modelo_permissao_gerenciar on public.modelo_permissao
  for all to authenticated
  using (private.tem_permissao('gerenciar_permissoes'))
  with check (private.tem_permissao('gerenciar_permissoes'));

create policy modelo_permissao_item_gerenciar on public.modelo_permissao_item
  for all to authenticated
  using (private.tem_permissao('gerenciar_permissoes'))
  with check (private.tem_permissao('gerenciar_permissoes'));

-- =====================================================================
-- Auditoria: o app autenticado pode INSERIR log, mas só em seu próprio nome
-- (integridade: ninguém loga como outro). Leitura já é gated por `ver_auditoria`.
-- =====================================================================
create policy inserir_auditoria on public.auditoria
  for insert to authenticated
  with check (usuario_id = private.usuario_atual_id());

-- =====================================================================
-- Edição retroativa (§3.7): editar/excluir lançamentos de dias ANTERIORES
-- exige `editar_lancamentos_retroativos`. No dia corrente, basta a permissão
-- operacional de sempre. Antes não havia política de UPDATE/DELETE nessas
-- tabelas (tudo bloqueado pelo RLS); estas habilitam de forma controlada.
-- =====================================================================

-- entrada_mercadoria
create policy editar_entrada_merc on public.entrada_mercadoria
  for update to authenticated
  using (
    (private.tem_permissao('fechar_caixa') or private.tem_permissao('gerenciar_combustivel'))
    and (data >= private.hoje_manaus() or private.tem_permissao('editar_lancamentos_retroativos'))
  );
create policy apagar_entrada_merc on public.entrada_mercadoria
  for delete to authenticated
  using (
    (private.tem_permissao('fechar_caixa') or private.tem_permissao('gerenciar_combustivel'))
    and (data >= private.hoje_manaus() or private.tem_permissao('editar_lancamentos_retroativos'))
  );

-- perda
create policy editar_perda on public.perda
  for update to authenticated
  using (
    (private.tem_permissao('fechar_caixa') or private.tem_permissao('lancar_despesa'))
    and (data >= private.hoje_manaus() or private.tem_permissao('editar_lancamentos_retroativos'))
  );
create policy apagar_perda on public.perda
  for delete to authenticated
  using (
    (private.tem_permissao('fechar_caixa') or private.tem_permissao('lancar_despesa'))
    and (data >= private.hoje_manaus() or private.tem_permissao('editar_lancamentos_retroativos'))
  );

-- movimento (despesas/transferências avulsas). O DELETE de movimento ligado a
-- funcionário continua coberto por `apagar_mov_funcionario`; este cobre o resto
-- e aplica o gate retroativo pela data do lançamento.
create policy apagar_movimento on public.movimento
  for delete to authenticated
  using (
    (
      private.tem_permissao('lancar_despesa')
      or private.tem_permissao('transferir_entre_contas')
      or private.tem_permissao('gerenciar_socios')
      or private.tem_permissao('fechar_caixa')
    )
    and (
      (data_hora at time zone 'America/Manaus')::date >= private.hoje_manaus()
      or private.tem_permissao('editar_lancamentos_retroativos')
    )
  );
