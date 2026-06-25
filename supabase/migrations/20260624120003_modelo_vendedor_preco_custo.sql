-- Migration — onboarding: o modelo "Vendedor" passa a poder alterar preço de
-- venda e custo (§5.6). Continua SEM ver capital/sócios/permissões.
insert into modelo_permissao_item (modelo_id, permissao_chave)
select id, 'definir_preco_custo'
from modelo_permissao where nome = 'Vendedor'
on conflict do nothing;
