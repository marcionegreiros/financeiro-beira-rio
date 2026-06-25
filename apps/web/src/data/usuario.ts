/**
 * Usuário atual + suas permissões (§4). A permissão controla a VISIBILIDADE na
 * UI (o que a pessoa não pode ver nem aparece); o RLS é a barreira final.
 *
 * Além das permissões globais, o usuário carrega a ACL fina de conta
 * (`usuario_conta`): quais contas pode VER e quais pode MOVIMENTAR (§5.4).
 */
import { supabase } from './supabase';

export interface UsuarioAtual {
  id: string;
  nome: string;
  cargo: string | null;
  fotoUrl: string | null;
  permissoes: Set<string>;
  /** Contas que pode ver (inclui as que pode movimentar). Vazio = sem ACL fina. */
  contasVer: Set<string>;
  /** Contas que pode movimentar (transferir/lançar). */
  contasMovimentar: Set<string>;
}

export async function carregarUsuarioAtual(): Promise<UsuarioAtual | null> {
  const { data: auth } = await supabase.auth.getUser();
  const authUid = auth.user?.id;
  if (!authUid) return null;

  const { data, error } = await supabase
    .from('usuario')
    .select(
      'id,nome,cargo,foto_url,usuario_permissao(permissao_chave),usuario_conta(conta_id,nivel)',
    )
    .eq('auth_uid', authUid)
    .single();
  if (error || !data) return null;

  const linha = data as {
    id: string;
    nome: string;
    cargo: string | null;
    foto_url: string | null;
    usuario_permissao: { permissao_chave: string }[];
    usuario_conta: { conta_id: string; nivel: string }[];
  };

  const contasVer = new Set<string>();
  const contasMovimentar = new Set<string>();
  for (const c of linha.usuario_conta ?? []) {
    contasVer.add(c.conta_id);
    if (c.nivel === 'movimentar') contasMovimentar.add(c.conta_id);
  }

  return {
    id: linha.id,
    nome: linha.nome,
    cargo: linha.cargo,
    fotoUrl: linha.foto_url,
    permissoes: new Set(linha.usuario_permissao.map((p) => p.permissao_chave)),
    contasVer,
    contasMovimentar,
  };
}
