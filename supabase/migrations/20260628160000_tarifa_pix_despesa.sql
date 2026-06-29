-- Migration — tarifa de PIX automática em despesas pagas via PIX.
--
-- Quando uma despesa é paga por PIX saindo de uma conta de BANCO que tem regra de
-- tarifa vigente (taxa_pix_conta), o sistema gera uma segunda despesa AUTOMÁTICA
-- com a tarifa (percentual sobre o valor enviado, grampeado entre mín e máx). Ela
-- é DERIVADA do pagamento (Pilar 1): vive presa a ele por `origem_movimento_id` e
-- some junto quando o pagamento é excluído (on delete cascade).

-- 1. Liga a despesa-tarifa ao movimento que a originou. Cascade = a tarifa é
--    apagada automaticamente quando o pagamento de origem é removido.
alter table public.movimento
  add column origem_movimento_id uuid references public.movimento (id) on delete cascade;
create index idx_movimento_origem on public.movimento (origem_movimento_id);

-- 2. Categoria especial fixa "Tarifa de PIX" (id estável, idempotente).
insert into public.categoria_despesa (id, nome, eh_especial)
values ('f1a2b3c4-d5e6-4f00-8a00-000000000001', 'Tarifa de PIX', true)
on conflict (id) do nothing;
