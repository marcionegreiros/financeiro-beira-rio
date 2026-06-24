-- Migration 0011 — Fase 7 (Fiado e Folha) + correção de buraco de RLS.
--
-- Diagnóstico: venda_avulsa e fiado tinham RLS LIGADO porém SEM política de
-- INSERT (a 0008 cobriu contagem/leitura/entrada, mas pulou essas duas). Como
-- RLS sem policy nega para todos, fechar um caixa com VENDA INDIVIDUAL ou com
-- FIADO CONCEDIDO falhava silenciosamente. Aqui corrigimos isso e abrimos as
-- escritas das telas de Fiado (§5.8) e Folha (§5.9).
--
-- Padrão: gating por private.tem_permissao('<chave>') (igual à 0008).

-- ── venda_avulsa: lançada no fechamento (fechar_caixa) ou avulsa ───────────────
create policy inserir_venda_avulsa on public.venda_avulsa
  for insert to authenticated
  with check (
    private.tem_permissao('fechar_caixa')
    or private.tem_permissao('registrar_venda_avulsa')
  );
create policy apagar_venda_avulsa on public.venda_avulsa
  for delete to authenticated
  using (
    private.tem_permissao('fechar_caixa')
    or private.tem_permissao('registrar_venda_avulsa')
  );

-- ── fiado: concedido no fechamento ou na tela; baixa = UPDATE; reabertura apaga ─
create policy inserir_fiado on public.fiado
  for insert to authenticated
  with check (
    private.tem_permissao('fechar_caixa')
    or private.tem_permissao('gerenciar_fiado')
  );
create policy atualizar_fiado on public.fiado
  for update to authenticated
  using (
    private.tem_permissao('fechar_caixa')
    or private.tem_permissao('gerenciar_fiado')
  )
  with check (
    private.tem_permissao('fechar_caixa')
    or private.tem_permissao('gerenciar_fiado')
  );
create policy apagar_fiado on public.fiado
  for delete to authenticated
  using (
    private.tem_permissao('fechar_caixa')
    or private.tem_permissao('gerenciar_fiado')
  );

-- ── cliente_fiado: cadastro pela tela de Fiado ─────────────────────────────────
create policy inserir_cliente_fiado on public.cliente_fiado
  for insert to authenticated
  with check (private.tem_permissao('gerenciar_fiado'));
create policy atualizar_cliente_fiado on public.cliente_fiado
  for update to authenticated
  using (private.tem_permissao('gerenciar_fiado'))
  with check (private.tem_permissao('gerenciar_fiado'));

-- ── funcionario: cadastro pela tela de Folha ───────────────────────────────────
create policy inserir_funcionario on public.funcionario
  for insert to authenticated
  with check (private.tem_permissao('gerenciar_funcionarios'));
create policy atualizar_funcionario on public.funcionario
  for update to authenticated
  using (private.tem_permissao('gerenciar_funcionarios'))
  with check (private.tem_permissao('gerenciar_funcionarios'));

-- ── fechamento_folha: fechamento mensal (salário − vales) ──────────────────────
create policy inserir_fechamento_folha on public.fechamento_folha
  for insert to authenticated
  with check (private.tem_permissao('gerenciar_funcionarios'));
create policy atualizar_fechamento_folha on public.fechamento_folha
  for update to authenticated
  using (private.tem_permissao('gerenciar_funcionarios'))
  with check (private.tem_permissao('gerenciar_funcionarios'));

-- ── movimento: recebimento de fiado e vale FORA do fechamento ──────────────────
-- (a política existente "inserir_despesa" já cobre fechar_caixa; estas somam,
-- pois políticas permissivas de INSERT são combinadas por OR.)
create policy inserir_mov_recebimento_fiado on public.movimento
  for insert to authenticated
  with check (private.tem_permissao('gerenciar_fiado') and tipo = 'recebimento_fiado');
create policy inserir_mov_vale on public.movimento
  for insert to authenticated
  with check (private.tem_permissao('gerenciar_funcionarios') and tipo = 'vale');
