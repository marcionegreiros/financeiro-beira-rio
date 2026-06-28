-- Corrige o índice único para permitir uma conta padrão por tipo (um banco e um dinheiro físico)
drop index if exists public.idx_conta_destino_padrao;
create unique index idx_conta_destino_padrao
  on public.conta (tipo) where eh_destino_padrao_venda;

-- Trigger para desmarcar a conta padrão anterior do mesmo tipo ao marcar uma nova
create or replace function public.trg_conta_destino_padrao()
returns trigger as $$
begin
  if new.eh_destino_padrao_venda then
    update public.conta
    set eh_destino_padrao_venda = false
    where tipo = new.tipo
      and id <> new.id
      and eh_destino_padrao_venda;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Remove trigger antigo se existir
drop trigger if exists trg_conta_destino_padrao_after on public.conta;

create trigger trg_conta_destino_padrao_after
  after insert or update of eh_destino_padrao_venda, tipo on public.conta
  for each row
  execute function public.trg_conta_destino_padrao();

-- Se nenhuma conta de dinheiro estiver marcada como padrão, marca a primeira criada
update public.conta
set eh_destino_padrao_venda = true
where id = (
  select id from public.conta
  where tipo = 'dinheiro'
  order by criado_em asc
  limit 1
)
and not exists (
  select 1 from public.conta
  where tipo = 'dinheiro' and eh_destino_padrao_venda
);
