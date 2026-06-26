-- Migration — Adiciona foto_url na tabela conta e cria políticas de RLS para fotos de contas no bucket avatares.
--

-- 1. Adicionar coluna foto_url na tabela conta
alter table public.conta add column if not exists foto_url text;

-- 2. Políticas de escrita no bucket avatares para a pasta 'contas/'
create policy "contas escrever se gerenciar_contas"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = 'contas'
    and private.tem_permissao('gerenciar_contas')
  );

create policy "contas atualizar se gerenciar_contas"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = 'contas'
    and private.tem_permissao('gerenciar_contas')
  );

create policy "contas remover se gerenciar_contas"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = 'contas'
    and private.tem_permissao('gerenciar_contas')
  );
