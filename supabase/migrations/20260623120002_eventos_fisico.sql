-- Migration 0002 — Eventos do livro físico (§6.3).
--
-- O fechamento é o cruzamento dos dois livros: lê o físico (contagens +
-- encerrantes) e alimenta o financeiro. Tudo aqui é INSERT-only (append-only):
-- correção é novo evento ou reabertura logada (§3.7). A venda NÃO é armazenada —
-- deriva das contagens/leituras (Pilar 1).

create table fechamento (
  id                  uuid primary key,
  data                date not null unique,   -- UNIQUE defende contra 2 fechamentos/dia
  status              text not null default 'aberto'
                        check (status in ('aberto', 'confirmado', 'travado')),
  troco_fixo_centavos bigint not null default 0,
  responsavel_id      uuid references usuario (id),
  observacao          text,
  confirmado_em       timestamptz,
  travado_em          timestamptz,
  criado_em           timestamptz not null default now()
);

-- Estado contado de um produto no dia (a venda deriva da diferença entre dias).
create table contagem_produto (
  id            uuid primary key,
  fechamento_id uuid not null references fechamento (id) on delete cascade,
  produto_id    uuid not null references produto (id),
  quantidade    numeric(14,3) not null,
  unique (fechamento_id, produto_id)
);
create index idx_contagem_fechamento on contagem_produto (fechamento_id);
create index idx_contagem_produto on contagem_produto (produto_id);

-- Encerrante do dia (leitura cumulativa e crescente por bico).
create table leitura_bomba (
  id            uuid primary key,
  fechamento_id uuid not null references fechamento (id) on delete cascade,
  bomba_id      uuid not null references bomba (id),
  leitura       numeric(14,3) not null,
  unique (fechamento_id, bomba_id)
);
create index idx_leitura_fechamento on leitura_bomba (fechamento_id);
create index idx_leitura_bomba on leitura_bomba (bomba_id);

-- Entrada de mercadoria: ENTRA no cálculo da venda do produto (modo contagem).
create table entrada_mercadoria (
  id                      uuid primary key,
  produto_id              uuid not null references produto (id),
  quantidade              numeric(14,3) not null,
  custo_unitario_centavos bigint not null,
  data                    date not null,
  fechamento_id           uuid references fechamento (id),
  criado_em               timestamptz not null default now()
);
create index idx_entrada_merc_produto on entrada_mercadoria (produto_id);
create index idx_entrada_merc_data on entrada_mercadoria (data);

-- Entrada de combustível: afeta só o NÍVEL do tanque, não a venda (§3.2).
create table entrada_combustivel (
  id                  uuid primary key,
  tanque_id           uuid not null references tanque (id),
  litros              numeric(14,3) not null,
  custo_litro_centavos bigint not null,
  data                date not null,
  criado_em           timestamptz not null default now()
);
create index idx_entrada_comb_tanque on entrada_combustivel (tanque_id);

-- Medição física (régua): reconcilia contra o nível calculado. Várias por dia.
create table medicao_tanque (
  id              uuid primary key,
  tanque_id       uuid not null references tanque (id),
  litros_medidos  numeric(14,3) not null,
  data_hora       timestamptz not null,
  observacao      text,
  criado_em       timestamptz not null default now()
);
create index idx_medicao_tanque on medicao_tanque (tanque_id);

-- Baixa de estoque sem venda. Reduz estoque/capital; NÃO debita conta (§3.6).
create table perda (
  id            uuid primary key,
  produto_id    uuid not null references produto (id),
  quantidade    numeric(14,3) not null,
  motivo        text,
  data          date not null,
  fechamento_id uuid references fechamento (id),
  criado_em     timestamptz not null default now()
);
create index idx_perda_produto on perda (produto_id);

-- Venda registrada manualmente no dia. Autoritativa só se modo_apuracao=individual.
create table venda_avulsa (
  id          uuid primary key,
  produto_id  uuid not null references produto (id),
  quantidade  numeric(14,3) not null,
  valor_centavos bigint not null,
  data_hora   timestamptz not null,
  vendedor_id uuid references usuario (id)
);
create index idx_venda_avulsa_produto on venda_avulsa (produto_id);
create index idx_venda_avulsa_data on venda_avulsa (data_hora);
