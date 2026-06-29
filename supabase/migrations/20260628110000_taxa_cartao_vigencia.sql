-- Migration — Taxa de cartão com HISTÓRICO por DATA (§3.6 + §5.6).
--
-- A taxa de cartão (débito/crédito: percentual em basis points + parte fixa em
-- centavos) passa a ser versionada por `valido_a_partir_de`, igual a
-- preco_combustivel/custo_produto. Renegociar a taxa NÃO reescreve fechamentos
-- passados — cada fechamento usa a taxa vigente na sua data. (No fechamento a taxa
-- já é congelada no movimento `taxa_cartao`; esta tabela decide a taxa de novos
-- fechamentos.)

create table public.taxa_cartao (
  id                  uuid primary key,
  forma               text not null check (forma in ('debito', 'credito')),
  percentual_bp       bigint not null default 0,   -- 3% = 300
  fixa_centavos       bigint not null default 0,
  valido_a_partir_de  date not null
);
create index idx_taxa_cartao on public.taxa_cartao (forma, valido_a_partir_de);

alter table public.taxa_cartao enable row level security;

-- Leitura: qualquer autenticado (mesma base do catálogo/config).
create policy ler_base on public.taxa_cartao
  for select to authenticated using (true);

-- Escrita: gerente com permissão de configuração (§4 — "Troco, taxas de cartão…").
create policy inserir_taxa_cartao on public.taxa_cartao
  for insert to authenticated with check (private.tem_permissao('editar_configuracoes'));
create policy atualizar_taxa_cartao on public.taxa_cartao
  for update to authenticated using (private.tem_permissao('editar_configuracoes'));
create policy excluir_taxa_cartao on public.taxa_cartao
  for delete to authenticated using (private.tem_permissao('editar_configuracoes'));

-- =====================================================================
-- Backfill: traz a taxa atual do `config` como vigência antiga ('2000-01-01'),
-- para já valer em qualquer fechamento novo enquanto não houver registro mais
-- recente. Idempotente: só insere se a tabela estiver vazia para a forma.
-- =====================================================================
insert into public.taxa_cartao (id, forma, percentual_bp, fixa_centavos, valido_a_partir_de)
select
  gen_random_uuid(),
  m.forma,
  coalesce((c.valor_json ->> 'percentual_bp')::bigint, 0),
  coalesce((c.valor_json ->> 'fixa_centavos')::bigint, 0),
  date '2000-01-01'
from (values ('debito', 'taxa_cartao_debito'), ('credito', 'taxa_cartao_credito')) as m(forma, chave)
left join public.config c on c.chave = m.chave
where not exists (
  select 1 from public.taxa_cartao t where t.forma = m.forma
);
