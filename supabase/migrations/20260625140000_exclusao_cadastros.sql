-- Migration — Exclusão de cadastros que NUNCA foram usados.
--
-- Até aqui o sistema só sabia "inativar" (flag `ativo`): não havia NENHUMA
-- política de DELETE, então o Postgres negava qualquer exclusão. Esta migration
-- habilita apagar de verdade um cadastro **desde que ele nunca tenha sido usado**
-- em nenhum evento — o que mantém o histórico financeiro íntegro (Pilar 1). A
-- regra "nunca usado" é embutida na própria policy (NOT EXISTS sobre as tabelas
-- de evento), de modo que o banco é a última linha de defesa, não a UI.
--
-- Duas partes:
--   2a) FKs de CONFIGURAÇÃO viram ON DELETE CASCADE — apagar o pai leva junto os
--       filhos de config (preço/custo/bico/permissão/ACL). O cascade do Postgres
--       ignora o RLS do filho, então não precisa de policy de DELETE neles.
--   2b) Policies de DELETE nos cadastros-pai = permissão do cadastro + guarda
--       "sem nenhum evento que o referencie".
--
-- FKs de EVENTO continuam RESTRICT (default): são exatamente o sinal de "usado".
-- `usuario` não entra aqui — é apagado pela Edge Function admin-usuarios
-- (service_role), que também remove o login no Auth.

-- =====================================================================
-- 2a) FKs de configuração → ON DELETE CASCADE
-- =====================================================================
alter table public.preco_produto
  drop constraint preco_produto_produto_id_fkey,
  add constraint preco_produto_produto_id_fkey
    foreign key (produto_id) references public.produto(id) on delete cascade;

alter table public.custo_produto
  drop constraint custo_produto_produto_id_fkey,
  add constraint custo_produto_produto_id_fkey
    foreign key (produto_id) references public.produto(id) on delete cascade;

alter table public.preco_combustivel
  drop constraint preco_combustivel_combustivel_id_fkey,
  add constraint preco_combustivel_combustivel_id_fkey
    foreign key (combustivel_id) references public.combustivel(id) on delete cascade;

alter table public.custo_combustivel
  drop constraint custo_combustivel_combustivel_id_fkey,
  add constraint custo_combustivel_combustivel_id_fkey
    foreign key (combustivel_id) references public.combustivel(id) on delete cascade;

alter table public.bomba
  drop constraint bomba_tanque_id_fkey,
  add constraint bomba_tanque_id_fkey
    foreign key (tanque_id) references public.tanque(id) on delete cascade;

alter table public.usuario_permissao
  drop constraint usuario_permissao_usuario_id_fkey,
  add constraint usuario_permissao_usuario_id_fkey
    foreign key (usuario_id) references public.usuario(id) on delete cascade;

alter table public.usuario_conta
  drop constraint usuario_conta_usuario_id_fkey,
  add constraint usuario_conta_usuario_id_fkey
    foreign key (usuario_id) references public.usuario(id) on delete cascade;

alter table public.usuario_conta
  drop constraint usuario_conta_conta_id_fkey,
  add constraint usuario_conta_conta_id_fkey
    foreign key (conta_id) references public.conta(id) on delete cascade;

-- =====================================================================
-- 2b) Policies de DELETE — permissão do cadastro + "nunca usado"
-- =====================================================================

-- Produto: sem contagem, entrada de mercadoria, perda ou venda avulsa.
drop policy if exists excluir_produto on public.produto;
create policy excluir_produto on public.produto
  for delete to authenticated
  using (
    private.tem_permissao('cadastrar_produto')
    and not exists (select 1 from public.contagem_produto x where x.produto_id = produto.id)
    and not exists (select 1 from public.entrada_mercadoria x where x.produto_id = produto.id)
    and not exists (select 1 from public.perda x where x.produto_id = produto.id)
    and not exists (select 1 from public.venda_avulsa x where x.produto_id = produto.id)
  );

-- Combustível: sem nenhum tanque usando-o.
drop policy if exists excluir_combustivel on public.combustivel;
create policy excluir_combustivel on public.combustivel
  for delete to authenticated
  using (
    private.tem_permissao('gerenciar_combustivel')
    and not exists (select 1 from public.tanque x where x.combustivel_id = combustivel.id)
  );

-- Tanque: sem entrada de carga, sem medição e sem leitura em qualquer bico seu.
drop policy if exists excluir_tanque on public.tanque;
create policy excluir_tanque on public.tanque
  for delete to authenticated
  using (
    private.tem_permissao('gerenciar_combustivel')
    and not exists (select 1 from public.entrada_combustivel x where x.tanque_id = tanque.id)
    and not exists (select 1 from public.medicao_tanque x where x.tanque_id = tanque.id)
    and not exists (
      select 1 from public.leitura_bomba lb
      join public.bomba b on b.id = lb.bomba_id
      where b.tanque_id = tanque.id
    )
  );

-- Bico/bomba: sem leitura de encerrante.
drop policy if exists excluir_bomba on public.bomba;
create policy excluir_bomba on public.bomba
  for delete to authenticated
  using (
    private.tem_permissao('gerenciar_combustivel')
    and not exists (select 1 from public.leitura_bomba x where x.bomba_id = bomba.id)
  );

-- Funcionário: sem vale/movimento e sem folha.
drop policy if exists excluir_funcionario on public.funcionario;
create policy excluir_funcionario on public.funcionario
  for delete to authenticated
  using (
    private.tem_permissao('gerenciar_funcionarios')
    and not exists (select 1 from public.movimento x where x.funcionario_id = funcionario.id)
    and not exists (select 1 from public.fechamento_folha x where x.funcionario_id = funcionario.id)
  );

-- Sócio: sem nenhum movimento (aporte/pró-labore/devolução).
drop policy if exists excluir_socio on public.socio;
create policy excluir_socio on public.socio
  for delete to authenticated
  using (
    private.tem_permissao('gerenciar_socios')
    and not exists (select 1 from public.movimento x where x.socio_id = socio.id)
  );

-- Categoria de produto: sem nenhum produto nela.
drop policy if exists excluir_categoria on public.categoria;
create policy excluir_categoria on public.categoria
  for delete to authenticated
  using (
    private.tem_permissao('cadastrar_produto')
    and not exists (select 1 from public.produto x where x.categoria_id = categoria.id)
  );

-- Categoria de despesa: sem nenhum movimento que a use.
drop policy if exists excluir_categoria_despesa on public.categoria_despesa;
create policy excluir_categoria_despesa on public.categoria_despesa
  for delete to authenticated
  using (
    private.tem_permissao('editar_configuracoes')
    and not exists (select 1 from public.movimento x where x.categoria_despesa_id = categoria_despesa.id)
  );

-- Conta: sem nenhum movimento (origem ou contraparte).
drop policy if exists excluir_conta on public.conta;
create policy excluir_conta on public.conta
  for delete to authenticated
  using (
    private.tem_permissao('gerenciar_contas')
    and not exists (
      select 1 from public.movimento x
      where x.conta_id = conta.id or x.contraparte_conta_id = conta.id
    )
  );

-- Cliente de fiado: sem nenhum fiado lançado.
drop policy if exists excluir_cliente_fiado on public.cliente_fiado;
create policy excluir_cliente_fiado on public.cliente_fiado
  for delete to authenticated
  using (
    (private.tem_permissao('gerenciar_fiado') or private.tem_permissao('fechar_caixa'))
    and not exists (select 1 from public.fiado x where x.cliente_id = cliente_fiado.id)
  );
