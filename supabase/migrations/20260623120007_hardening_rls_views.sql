-- Migration 0007 — Hardening de segurança (achados do advisor do Supabase).
--
-- 1) As views derivadas passam a respeitar o RLS do CHAMADOR (security_invoker),
--    senão rodariam como o dono (postgres) e furariam o RLS (ex.: expor sócio).
-- 2) `tem_permissao` vai para um schema `private` (fora da API PostgREST), para
--    não ser chamável como RPC por anon/authenticated; continua usável pelas
--    políticas (que passam a referenciá-la em `private`).

alter view public.vw_saldo_conta set (security_invoker = on);
alter view public.vw_fiado_em_aberto set (security_invoker = on);
alter view public.vw_saldo_devedor_socio set (security_invoker = on);

create schema if not exists private;

create or replace function private.tem_permissao(p_chave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from usuario u
    join usuario_permissao up on up.usuario_id = u.id
    where u.auth_uid = auth.uid()
      and up.permissao_chave = p_chave
      and u.ativo
  );
$$;
revoke all on function private.tem_permissao(text) from public;
grant execute on function private.tem_permissao(text) to authenticated;

-- Recria as políticas para usar private.tem_permissao.
drop policy ler_socios on public.socio;
create policy ler_socios on public.socio
  for select to authenticated using (private.tem_permissao('ver_retiradas_socios'));

drop policy ler_funcionarios on public.funcionario;
create policy ler_funcionarios on public.funcionario
  for select to authenticated using (private.tem_permissao('gerenciar_funcionarios'));

drop policy ler_folha on public.fechamento_folha;
create policy ler_folha on public.fechamento_folha
  for select to authenticated using (private.tem_permissao('gerenciar_funcionarios'));

drop policy ler_auditoria on public.auditoria;
create policy ler_auditoria on public.auditoria
  for select to authenticated using (private.tem_permissao('ver_auditoria'));

drop policy inserir_fechamento on public.fechamento;
create policy inserir_fechamento on public.fechamento
  for insert to authenticated with check (private.tem_permissao('fechar_caixa'));

drop policy inserir_despesa on public.movimento;
create policy inserir_despesa on public.movimento
  for insert to authenticated with check (
    private.tem_permissao('lancar_despesa')
    or private.tem_permissao('transferir_entre_contas')
    or private.tem_permissao('fechar_caixa')
    or private.tem_permissao('gerenciar_socios')
  );

drop function public.tem_permissao(text);
