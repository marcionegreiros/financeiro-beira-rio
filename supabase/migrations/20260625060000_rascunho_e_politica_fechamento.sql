-- Migration 0018 - Rascunho e política de atualização para Fechamento de Caixa
--

-- Adiciona a coluna rascunho (JSONB) na tabela fechamento para salvar rascunhos sem afetar o livro financeiro
alter table public.fechamento add column if not exists rascunho jsonb;

-- Cria a política de UPDATE para a tabela fechamento
drop policy if exists atualizar_fechamento on public.fechamento;
create policy atualizar_fechamento on public.fechamento
  for update to authenticated
  using (
    private.tem_permissao('fechar_caixa')
    or private.tem_permissao('reabrir_fechamento')
  )
  with check (
    private.tem_permissao('fechar_caixa')
    or private.tem_permissao('reabrir_fechamento')
  );
