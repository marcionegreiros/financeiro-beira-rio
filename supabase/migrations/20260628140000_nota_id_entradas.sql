-- Migration — agrupamento de entradas por NOTA (nota_id).
--
-- Itens lançados juntos numa "notinha" de entrada compartilham um nota_id, o que
-- permite reabrir/editar exatamente aquele grupo e ter várias notas no mesmo dia.
-- Entradas avulsas (modal por produto/tanque) ficam com nota_id NULL. Não há
-- entidade de nota: o nota_id é só a chave de agrupamento (Pilar 1 — derivado).

alter table public.entrada_mercadoria  add column nota_id uuid;
alter table public.entrada_combustivel add column nota_id uuid;
create index idx_entrada_merc_nota on public.entrada_mercadoria (nota_id);
create index idx_entrada_comb_nota on public.entrada_combustivel (nota_id);
