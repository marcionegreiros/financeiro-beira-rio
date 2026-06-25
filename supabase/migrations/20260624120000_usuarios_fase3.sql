-- Migration — Fase 3: gestão de usuários (foto, cargo), ACL por conta e nova
-- permissão de edição retroativa (§4, §6.1).
--
-- Convenções (§0): ids = uuid (UUIDv7 no cliente) · timestamps = timestamptz.
-- Saldos/estoques continuam derivados — aqui só identidade e autorização.

-- ---------------------------------------------------------------------
-- 1) Usuário ganha FOTO e CARGO.
--    foto_url: caminho/URL pública no bucket `avatares`.
--    cargo: rótulo de hierarquia ('Dono', 'Gerente', 'Vendedor'…). É só
--    apresentação/atalho; o que vale é o conjunto de permissões por pessoa (§4).
-- ---------------------------------------------------------------------
alter table usuario add column if not exists foto_url text;
alter table usuario add column if not exists cargo    text;

-- ---------------------------------------------------------------------
-- 2) Nova permissão: editar lançamentos de dias anteriores (caixas passados).
--    Separa "mexer no passado" de "reabrir fechamento travado".
-- ---------------------------------------------------------------------
insert into permissao (chave, descricao) values
  ('editar_lancamentos_retroativos',
   'Editar/excluir despesas, entradas e lançamentos de dias anteriores.')
on conflict (chave) do nothing;

-- O modelo "Gerente (completo)" passa a incluir a nova permissão.
insert into modelo_permissao_item (modelo_id, permissao_chave)
select id, 'editar_lancamentos_retroativos'
from modelo_permissao
where nome = 'Gerente (completo)'
on conflict do nothing;

-- Quem já administra permissões (o dono) também recebe a nova chave, para não
-- perder capacidade ao migrar.
insert into usuario_permissao (usuario_id, permissao_chave)
select up.usuario_id, 'editar_lancamentos_retroativos'
from usuario_permissao up
where up.permissao_chave = 'gerenciar_permissoes'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3) ACL fina por conta: quais contas cada usuário VÊ e/ou MOVIMENTA (§5.4).
--    Sem linha aqui, o acesso à conta cai nas permissões globais (atalho do
--    gerente). `movimentar` implica `ver`.
-- ---------------------------------------------------------------------
create table if not exists usuario_conta (
  usuario_id uuid not null references usuario (id) on delete cascade,
  conta_id   uuid not null references conta (id)  on delete cascade,
  nivel      text not null check (nivel in ('ver', 'movimentar')),
  primary key (usuario_id, conta_id)
);
create index if not exists idx_usuario_conta_usuario on usuario_conta (usuario_id);

alter table usuario_conta enable row level security;
