-- Migration 0004 — Auditoria (§6.7) e views derivadas (§6.8).
--
-- As views materializam o Pilar 1: saldos/estoques são CALCULADOS a partir dos
-- eventos, nunca armazenados. As fórmulas espelham o núcleo de domínio testado
-- em apps/web/src/domain/. Views pesadas podem ser materializadas por dia DESDE
-- QUE sempre reconstrutíveis — cache nunca é fonte de verdade.

-- =====================================================================
-- §6.7 Auditoria — log imutável de tudo que mexe em dinheiro/estoque
-- =====================================================================
create table auditoria (
  id           uuid primary key,
  entidade     text not null,
  entidade_id  uuid not null,
  acao         text not null check (acao in ('criar', 'editar', 'remover', 'reabrir', 'ajustar')),
  usuario_id   uuid references usuario (id),
  dados_antes  jsonb,
  dados_depois jsonb,
  criado_em    timestamptz not null default now()
);
create index idx_auditoria_entidade on auditoria (entidade, entidade_id);
create index idx_auditoria_criado on auditoria (criado_em);

-- =====================================================================
-- §6.8 Views derivadas (as triviais; as compostas ficam para a camada de
-- consulta/domínio, que já está testada)
-- =====================================================================

-- saldo_conta = Σ movimento.valor_centavos por conta.
create view vw_saldo_conta as
select c.id as conta_id,
       c.nome,
       c.tipo,
       coalesce(sum(m.valor_centavos), 0)::bigint as saldo_centavos
from conta c
left join movimento m on m.conta_id = c.id
group by c.id, c.nome, c.tipo;

-- fiado em aberto (a receber) = Σ fiado.valor onde status = aberto.
create view vw_fiado_em_aberto as
select cf.id as cliente_id,
       cf.nome,
       coalesce(sum(f.valor_centavos) filter (where f.status = 'aberto'), 0)::bigint
         as a_receber_centavos
from cliente_fiado cf
left join fiado f on f.cliente_id = cf.id
group by cf.id, cf.nome;

-- saldo devedor do sócio = Σ aporte_emprestimo − Σ devolucao_emprestimo.
create view vw_saldo_devedor_socio as
select s.id as socio_id,
       s.nome,
       coalesce(sum(case
         when m.tipo = 'aporte_emprestimo'    then m.valor_centavos
         when m.tipo = 'devolucao_emprestimo' then -m.valor_centavos
         else 0 end), 0)::bigint as saldo_devedor_centavos
from socio s
left join movimento m on m.socio_id = s.id
group by s.id, s.nome;

-- Nota: estoque_atual, nivel_tanque, custo_medio e capital_total envolvem deltas
-- entre contagens/leituras e a tabela mestra §3.4. Ficam na camada de consulta
-- (apps/web/src/data, Fase 1+) reusando as fórmulas já testadas do domínio,
-- para não duplicar lógica financeira em SQL não testado.
