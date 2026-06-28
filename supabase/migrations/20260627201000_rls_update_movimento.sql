-- Migration: RLS Update policy on movimento.
-- Permite que usuários com permissão de lançar despesa, transferir ou fechar caixa possam editar
-- movimentos do dia corrente, ou de dias anteriores caso possuam a permissão editar_lancamentos_retroativos.

create policy editar_movimento on public.movimento
  for update to authenticated
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
  )
  with check (
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
