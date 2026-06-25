-- Migration — Fase 3: bucket de fotos de usuário (`avatares`).
--
-- Convenção de caminho: `{usuario_id}/avatar.<ext>` (a 1ª pasta é o id do
-- usuário). Leitura pública (a foto aparece no Shell/Auditoria); escrita só na
-- própria pasta, OU em qualquer uma se tiver `gerenciar_permissoes` (o gerente
-- troca a foto de todos — §4).

insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

-- Leitura: o bucket é público; a foto é servida por URL direta (getPublicUrl),
-- sem necessidade de policy de SELECT em storage.objects (e sem permitir listar
-- o bucket inteiro).

-- Inserir/atualizar/remover: dono da pasta OU gerente de permissões.
create policy "avatares escrever proprio ou gerente"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (
      (storage.foldername(name))[1] = private.usuario_atual_id()::text
      or private.tem_permissao('gerenciar_permissoes')
    )
  );

create policy "avatares atualizar proprio ou gerente"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatares'
    and (
      (storage.foldername(name))[1] = private.usuario_atual_id()::text
      or private.tem_permissao('gerenciar_permissoes')
    )
  );

create policy "avatares remover proprio ou gerente"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (
      (storage.foldername(name))[1] = private.usuario_atual_id()::text
      or private.tem_permissao('gerenciar_permissoes')
    )
  );
