-- Migration — tarifa de PIX por CONTA de banco, com HISTÓRICO por DATA.
--
-- Cada conta de banco tem a sua própria regra de tarifa cobrada quando há uma
-- transação PIX (sobre o valor enviado): percentual em basis points limitado por
-- uma tarifa MÍNIMA e uma MÁXIMA (centavos). Versionada por `valido_a_partir_de`,
-- igual a preco_combustivel / taxa_cartao: renegociar a tarifa NÃO reescreve
-- transações passadas — cada uma usa a regra vigente na sua data.
--
-- Limites zerados (minimo/maximo = 0) significam "sem aquele limite". A base é
-- criada vazia: o gerente preenche cada valor no seu campo (1,45% / R$1,75 / R$9,80).

create table public.taxa_pix_conta (
  id                  uuid primary key,
  conta_id            uuid not null references public.conta (id) on delete cascade,
  percentual_bp       bigint not null default 0,   -- 1,45% = 145
  minimo_centavos     bigint not null default 0,
  maximo_centavos     bigint not null default 0,
  valido_a_partir_de  date not null
);
create index idx_taxa_pix_conta on public.taxa_pix_conta (conta_id, valido_a_partir_de);

alter table public.taxa_pix_conta enable row level security;

-- Leitura: qualquer autenticado (mesma base do catálogo/config).
create policy ler_taxa_pix_conta on public.taxa_pix_conta
  for select to authenticated using (true);

-- Escrita: quem gerencia contas (mesma permissão da tela de Contas).
create policy inserir_taxa_pix_conta on public.taxa_pix_conta
  for insert to authenticated with check (private.tem_permissao('gerenciar_contas'));
create policy atualizar_taxa_pix_conta on public.taxa_pix_conta
  for update to authenticated using (private.tem_permissao('gerenciar_contas'));
create policy excluir_taxa_pix_conta on public.taxa_pix_conta
  for delete to authenticated using (private.tem_permissao('gerenciar_contas'));
