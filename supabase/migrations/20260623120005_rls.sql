-- Migration 0005 — Row Level Security (esqueleto) (§4 e §7.3).
--
-- "A UI esconde, o RLS proíbe": esta é a última linha de defesa no que SOBE ao
-- banco. Aqui fica o ESQUELETO — habilita RLS em tudo, cria o helper de
-- permissão, dá leitura-base ao operacional e tranca o sensível (sócios, folha,
-- auditoria). A matriz completa por permissão (e o alinhamento com as sync rules
-- do PowerSync) é finalizada na Fase 3.

-- Helper: o usuário autenticado tem a permissão de chave informada?
create or replace function public.tem_permissao(p_chave text)
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

-- Habilita RLS em todas as tabelas base do schema public.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Leitura-base: o operacional/catálogo é legível por qualquer autenticado
-- (o vendedor precisa do catálogo, do painel operacional e dos eventos do dia).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'categoria','produto','preco_produto','custo_produto',
    'combustivel','tanque','bomba','preco_combustivel','custo_combustivel',
    'conta','categoria_despesa','config',
    'fechamento','contagem_produto','leitura_bomba','entrada_mercadoria',
    'entrada_combustivel','medicao_tanque','perda','venda_avulsa',
    'cliente_fiado','fiado','movimento',
    'usuario','permissao','usuario_permissao','modelo_permissao','modelo_permissao_item'
  ]
  loop
    execute format(
      'create policy ler_base on public.%I for select to authenticated using (true);', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Sensível: só quem tem a permissão correspondente lê (§4).
-- ---------------------------------------------------------------------
create policy ler_socios on public.socio
  for select to authenticated using (tem_permissao('ver_retiradas_socios'));

create policy ler_funcionarios on public.funcionario
  for select to authenticated using (tem_permissao('gerenciar_funcionarios'));

create policy ler_folha on public.fechamento_folha
  for select to authenticated using (tem_permissao('gerenciar_funcionarios'));

create policy ler_auditoria on public.auditoria
  for select to authenticated using (tem_permissao('ver_auditoria'));

-- ---------------------------------------------------------------------
-- Exemplos de escrita gated por permissão (a matriz completa vem na Fase 3).
-- ---------------------------------------------------------------------
create policy inserir_fechamento on public.fechamento
  for insert to authenticated with check (tem_permissao('fechar_caixa'));

create policy inserir_despesa on public.movimento
  for insert to authenticated with check (
    tem_permissao('lancar_despesa')
    or tem_permissao('transferir_entre_contas')
    or tem_permissao('fechar_caixa')
    or tem_permissao('gerenciar_socios')
  );

-- NOTA Fase 3: completar políticas de INSERT/UPDATE por permissão em todas as
-- tabelas; refinar a leitura de `movimento`/`fechamento_folha` para linhas
-- ligadas a sócio (capital) só com `ver_capital`/`ver_retiradas_socios`; e
-- garantir que as sync rules do PowerSync desçam exatamente o subconjunto
-- permitido (defesa em profundidade).
