/**
 * Usuário atual + suas permissões (§4). A permissão controla a VISIBILIDADE na
 * UI (o que a pessoa não pode ver nem aparece); o RLS é a barreira final.
 */
import { supabase } from './supabase';

export interface UsuarioAtual {
  id: string;
  nome: string;
  permissoes: Set<string>;
}

export async function carregarUsuarioAtual(): Promise<UsuarioAtual | null> {
  const { data: auth } = await supabase.auth.getUser();
  const authUid = auth.user?.id;
  if (!authUid) return null;

  const { data, error } = await supabase
    .from('usuario')
    .select('id,nome,usuario_permissao(permissao_chave)')
    .eq('auth_uid', authUid)
    .single();
  if (error || !data) return null;

  const linha = data as {
    id: string;
    nome: string;
    usuario_permissao: { permissao_chave: string }[];
  };
  return {
    id: linha.id,
    nome: linha.nome,
    permissoes: new Set(linha.usuario_permissao.map((p) => p.permissao_chave)),
  };
}
