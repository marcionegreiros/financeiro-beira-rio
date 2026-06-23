-- Migration 0001 — Identidade, permissões e catálogo/configuração (§6.1 e §6.2).
--
-- Convenções (§0 da spec):
--   dinheiro = bigint (centavos) · volume = numeric(14,3) · ids = uuid (UUIDv7
--   gerado no cliente) · timestamps = timestamptz (Manaus −04:00 na borda).
-- Saldos/estoques/vendas NÃO são colunas — são derivados (ver migration 0004).

-- =====================================================================
-- §6.1 Identidade e permissões
-- =====================================================================

create table usuario (
  id          uuid primary key,
  nome        text not null,
  email       text unique not null,
  auth_uid    uuid unique,                 -- vínculo com auth.users do Supabase
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- Catálogo fixo de permissões (chaves do §4).
create table permissao (
  chave       text primary key,
  descricao   text not null
);

create table usuario_permissao (
  usuario_id      uuid not null references usuario (id) on delete cascade,
  permissao_chave text not null references permissao (chave) on delete cascade,
  primary key (usuario_id, permissao_chave)
);

create table modelo_permissao (
  id    uuid primary key,
  nome  text not null
);

create table modelo_permissao_item (
  modelo_id       uuid not null references modelo_permissao (id) on delete cascade,
  permissao_chave text not null references permissao (chave) on delete cascade,
  primary key (modelo_id, permissao_chave)
);

-- =====================================================================
-- §6.2 Catálogo e configuração
-- =====================================================================

create table categoria (
  id     uuid primary key,
  nome   text not null,
  ordem  integer not null default 0
);

create table produto (
  id                  uuid primary key,
  nome                text not null,
  categoria_id        uuid not null references categoria (id),
  unidade             text not null default 'unidade',
  ordem               integer not null default 0,  -- sequência da contagem no fechamento
  modo_apuracao       text not null default 'contagem'
                        check (modo_apuracao in ('contagem', 'individual')),
  alerta_baixo        numeric(14,3),
  alerta_muito_baixo  numeric(14,3),
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now()
);
create index idx_produto_categoria on produto (categoria_id);

-- Histórico de preço por DATA. Alterar preço não muda fechamentos passados.
create table preco_produto (
  id                  uuid primary key,
  produto_id          uuid not null references produto (id) on delete cascade,
  valor_centavos      bigint not null,
  valido_a_partir_de  date not null
);
create index idx_preco_produto on preco_produto (produto_id, valido_a_partir_de);

-- Histórico de custo por DATA/HORA (controle fino do gerente).
create table custo_produto (
  id                  uuid primary key,
  produto_id          uuid not null references produto (id) on delete cascade,
  valor_centavos      bigint not null,
  valido_a_partir_de  timestamptz not null
);
create index idx_custo_produto on custo_produto (produto_id, valido_a_partir_de);

create table combustivel (
  id    uuid primary key,
  nome  text not null
);

create table tanque (
  id                   uuid primary key,
  combustivel_id       uuid not null references combustivel (id),
  nome                 text not null,
  capacidade_litros    numeric(14,3) not null,
  nivel_alerta_litros  numeric(14,3) not null default 0,
  ativo                boolean not null default true
);
create index idx_tanque_combustivel on tanque (combustivel_id);

create table bomba (
  id         uuid primary key,
  tanque_id  uuid not null references tanque (id),
  nome       text not null,
  ativo      boolean not null default true
);
create index idx_bomba_tanque on bomba (tanque_id);

create table preco_combustivel (
  id                  uuid primary key,
  combustivel_id      uuid not null references combustivel (id) on delete cascade,
  valor_centavos      bigint not null,
  valido_a_partir_de  date not null
);
create index idx_preco_combustivel on preco_combustivel (combustivel_id, valido_a_partir_de);

create table custo_combustivel (
  id                  uuid primary key,
  combustivel_id      uuid not null references combustivel (id) on delete cascade,
  valor_centavos      bigint not null,
  valido_a_partir_de  timestamptz not null
);
create index idx_custo_combustivel on custo_combustivel (combustivel_id, valido_a_partir_de);

create table conta (
  id                       uuid primary key,
  nome                     text not null,
  tipo                     text not null check (tipo in ('dinheiro', 'banco')),
  eh_destino_padrao_venda  boolean not null default false,
  ativo                    boolean not null default true,
  criado_em                timestamptz not null default now()
);
-- No máximo uma conta marcada como destino padrão da venda.
create unique index idx_conta_destino_padrao
  on conta (eh_destino_padrao_venda) where eh_destino_padrao_venda;

create table socio (
  id       uuid primary key,
  nome     text not null,
  contato  text
);

create table funcionario (
  id                    uuid primary key,
  nome                  text not null,
  salario_base_centavos bigint not null default 0,
  ativo                 boolean not null default true
);

create table cliente_fiado (
  id       uuid primary key,
  nome     text not null,
  contato  text
);

-- Categorias de despesa; especiais (perda, taxa cartão, diferença) têm regra própria.
create table categoria_despesa (
  id           uuid primary key,
  nome         text not null,
  eh_especial  boolean not null default false
);

-- Parâmetros gerais (troco fixo, taxas de cartão, corte da folha, etc.).
create table config (
  chave       text primary key,
  valor_json  jsonb not null
);
