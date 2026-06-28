/**
 * Usuário atual + suas permissões (§4). A permissão controla a VISIBILIDADE na
 * UI (o que a pessoa não pode ver nem aparece); o RLS é a barreira final.
 *
 * Além das permissões globais, o usuário carrega a ACL fina de conta
 * (`usuario_conta`): quais contas pode VER e quais pode MOVIMENTAR (§5.4).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface UsuarioAtual {
  id: string;
  nome: string;
  email: string;
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
      'id,nome,email,cargo,foto_url,usuario_permissao(permissao_chave),usuario_conta(conta_id,nivel)',
    )
    .eq('auth_uid', authUid)
    .single();
  if (error || !data) return null;

  const linha = data as {
    id: string;
    nome: string;
    email: string;
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
    email: linha.email,
    cargo: linha.cargo,
    fotoUrl: linha.foto_url,
    permissoes: new Set(linha.usuario_permissao.map((p) => p.permissao_chave)),
    contasVer,
    contasMovimentar,
  };
}

export interface AutorizacaoResultado {
  sucesso: boolean;
  erro?: string;
  client?: SupabaseClient;
  usuarioId?: string;
}

export async function autorizarAcaoGerente(
  email: string,
  pass: string,
  permissaoRequerida: string
): Promise<AutorizacaoResultado> {
  const url = import.meta.env.VITE_SUPABASE_URL ?? '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  
  const clientTmp = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authErr } = await clientTmp.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (authErr || !authData.user) {
    return { sucesso: false, erro: 'E-mail ou senha incorretos.' };
  }

  // Verificar se o usuário possui a permissão necessária
  const { data: usr, error: usrErr } = await clientTmp
    .from('usuario')
    .select('id, ativo, usuario_permissao(permissao_chave)')
    .eq('auth_uid', authData.user.id)
    .single();

  if (usrErr || !usr) {
    return { sucesso: false, erro: 'Usuário correspondente não encontrado no sistema.' };
  }

  if (!usr.ativo) {
    return { sucesso: false, erro: 'Este usuário gerente está inativo.' };
  }

  const permissoes = new Set(
    ((usr.usuario_permissao as { permissao_chave: string }[]) ?? []).map((p) => p.permissao_chave)
  );

  if (!permissoes.has(permissaoRequerida)) {
    return { sucesso: false, erro: 'Este usuário não possui a permissão necessária para autorizar.' };
  }

  return { sucesso: true, client: clientTmp, usuarioId: usr.id };
}

