-- Migration 0003 — Livro financeiro (razão), fiado e folha (§6.4–6.6).
--
-- O saldo de cada conta é SEMPRE derivado: Σ movimento.valor_centavos (com sinal).
-- Transferência/depósito = partida dobrada: dois movimentos (saída na origem,
-- entrada no destino) ligados por contraparte_conta_id — não cria nem destrói
-- dinheiro (§6.4).

-- Fiado precede movimento (movimento.fiado_id o referencia).
create table fiado (
  id            uuid primary key,
  cliente_id    uuid not null references cliente_fiado (id),
  fechamento_id uuid references fechamento (id),
  valor_centavos bigint not null,
  data          date not null,
  status        text not null default 'aberto' check (status in ('aberto', 'pago')),
  vencimento    date
);
create index idx_fiado_cliente on fiado (cliente_id);
create index idx_fiado_status on fiado (status);

create table movimento (
  id                   uuid primary key,
  tipo                 text not null check (tipo in (
                         'recebimento_venda', 'despesa', 'transferencia', 'deposito',
                         'prolabore', 'aporte_emprestimo', 'aporte_aumento',
                         'devolucao_emprestimo', 'recebimento_fiado',
                         'taxa_cartao', 'diferenca_caixa', 'vale', 'ajuste')),
  conta_id             uuid not null references conta (id),
  valor_centavos       bigint not null,           -- com sinal: + entra, − sai
  data_hora            timestamptz not null,
  fechamento_id        uuid references fechamento (id),
  categoria_despesa_id uuid references categoria_despesa (id),
  contraparte_conta_id uuid references conta (id), -- perna oposta da transferência
  socio_id             uuid references socio (id),
  funcionario_id       uuid references funcionario (id),
  fiado_id             uuid references fiado (id),
  forma_pagamento      text check (forma_pagamento in ('dinheiro', 'pix', 'debito', 'credito')),
  descricao            text,
  tags                 text[] not null default '{}',
  criado_por           uuid references usuario (id),
  criado_em            timestamptz not null default now()
);
create index idx_movimento_conta on movimento (conta_id);
create index idx_movimento_data on movimento (data_hora);
create index idx_movimento_tipo on movimento (tipo);
create index idx_movimento_fechamento on movimento (fechamento_id);
create index idx_movimento_socio on movimento (socio_id) where socio_id is not null;
create index idx_movimento_fiado on movimento (fiado_id) where fiado_id is not null;

-- §6.6 Folha — vales são movimentos (tipo=vale); aqui fica o fechamento mensal.
create table fechamento_folha (
  id                    uuid primary key,
  funcionario_id        uuid not null references funcionario (id),
  competencia           date not null,            -- mês de referência
  salario_base_centavos bigint not null,
  total_vales_centavos  bigint not null default 0,
  a_receber_centavos    bigint not null,          -- salario_base − vales do período
  status                text not null default 'aberto' check (status in ('aberto', 'pago')),
  pago_em               timestamptz,
  unique (funcionario_id, competencia)
);
