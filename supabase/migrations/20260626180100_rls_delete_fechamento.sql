-- Migration: Adicionar política de exclusão para a tabela fechamento (necessária para rollback em caso de falha na inicialização)
create policy apagar_fechamento on public.fechamento
  for delete to authenticated using (private.tem_permissao('fechar_caixa') or private.tem_permissao('reabrir_fechamento'));
