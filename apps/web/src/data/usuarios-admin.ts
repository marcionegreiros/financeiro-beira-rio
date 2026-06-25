/**
 * Gestão de usuários (§4) — usada pela tela de Usuários e por "Meu perfil".
 *
 * A criação/edição de LOGIN (auth.users) passa pela Edge Function
 * `admin-usuarios` (service_role no servidor; nunca no cliente). Permissões e
 * ACL de conta são gravadas direto aqui, sob o RLS de `gerenciar_permissoes`.
 * Foto vai para o bucket `avatares` (própria pasta, ou qualquer uma se gerente).
 */
import { supabase } from './supabase';

export interface UsuarioAdmin {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  fotoUrl: string | null;
  ativo: boolean;
  temLogin: boolean;
  permissoes: Set<string>;
  /** conta_id → 'ver' | 'movimentar' */
  contas: Map<string, 'ver' | 'movimentar'>;
}

export interface PermissaoCatalogo {
  chave: string;
  descricao: string;
}

export interface ModeloPermissao {
  id: string;
  nome: string;
  permissoes: Set<string>;
}

export async function listarPermissoesCatalogo(): Promise<PermissaoCatalogo[]> {
  const { data, error } = await supabase.from('permissao').select('chave,descricao');
  if (error) throw error;
  return (data ?? []) as PermissaoCatalogo[];
}

export async function listarModelos(): Promise<ModeloPermissao[]> {
  const [{ data: modelos, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
    supabase.from('modelo_permissao').select('id,nome'),
    supabase.from('modelo_permissao_item').select('modelo_id,permissao_chave'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const porModelo = new Map<string, Set<string>>();
  for (const it of (itens ?? []) as { modelo_id: string; permissao_chave: string }[]) {
    const s = porModelo.get(it.modelo_id) ?? new Set<string>();
    s.add(it.permissao_chave);
    porModelo.set(it.modelo_id, s);
  }
  return ((modelos ?? []) as { id: string; nome: string }[]).map((m) => ({
    id: m.id,
    nome: m.nome,
    permissoes: porModelo.get(m.id) ?? new Set<string>(),
  }));
}

export async function listarUsuarios(): Promise<UsuarioAdmin[]> {
  const { data, error } = await supabase
    .from('usuario')
    .select(
      'id,nome,email,cargo,foto_url,ativo,auth_uid,usuario_permissao(permissao_chave),usuario_conta(conta_id,nivel)',
    )
    .order('criado_em', { ascending: true });
  if (error) throw error;

  const linhas = (data ?? []) as Array<{
    id: string;
    nome: string;
    email: string;
    cargo: string | null;
    foto_url: string | null;
    ativo: boolean;
    auth_uid: string | null;
    usuario_permissao: { permissao_chave: string }[];
    usuario_conta: { conta_id: string; nivel: string }[];
  }>;

  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    email: l.email,
    cargo: l.cargo,
    fotoUrl: l.foto_url,
    ativo: l.ativo,
    temLogin: !!l.auth_uid,
    permissoes: new Set(l.usuario_permissao.map((p) => p.permissao_chave)),
    contas: new Map(
      l.usuario_conta.map((c) => [c.conta_id, c.nivel as 'ver' | 'movimentar']),
    ),
  }));
}

export interface NovoUsuario {
  id: string;
  email: string;
  senha: string;
  nome: string;
  cargo: string | null;
  permissoes: string[];
  contas: { conta_id: string; nivel: 'ver' | 'movimentar' }[];
}

async function invocarAdmin(body: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body });
  if (error) {
    // A função devolve { erro } em falhas controladas; tenta extrair a mensagem.
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = await ctx.json();
        if (j?.erro) msg = j.erro;
      }
    } catch {
      /* mantém msg padrão */
    }
    throw new Error(msg);
  }
  if (data && (data as { erro?: string }).erro) throw new Error((data as { erro: string }).erro);
}

export async function criarUsuario(u: NovoUsuario): Promise<void> {
  await invocarAdmin({
    action: 'criar',
    id: u.id,
    email: u.email,
    senha: u.senha,
    nome: u.nome,
    cargo: u.cargo,
    permissoes: u.permissoes,
    contas: u.contas,
  });
}

export async function redefinirSenha(usuarioId: string, senha: string): Promise<void> {
  await invocarAdmin({ action: 'redefinir_senha', usuario_id: usuarioId, senha });
}

export async function setAtivo(usuarioId: string, ativo: boolean): Promise<void> {
  await invocarAdmin({ action: 'set_ativo', usuario_id: usuarioId, ativo });
}

/** Atualiza nome/cargo de um usuário (gerente em qualquer um; pessoa na própria). */
export async function atualizarPerfil(
  usuarioId: string,
  campos: { nome?: string; cargo?: string | null },
): Promise<void> {
  const { error } = await supabase.from('usuario').update(campos).eq('id', usuarioId);
  if (error) throw error;
}

/**
 * Ajusta o conjunto de permissões do usuário ao informado, de forma DIFERENCIAL:
 * insere só o que falta e remove só o que saiu. NUNCA apaga tudo de uma vez —
 * isso evitava o auto-bloqueio: como a RLS de `usuario_permissao` exige
 * `gerenciar_permissoes`, um delete-tudo do próprio gerente removeria essa chave
 * e o insert seguinte seria barrado, deixando-o com 0 permissões e travado.
 */
export async function salvarPermissoes(usuarioId: string, permissoes: string[]): Promise<void> {
  const desejado = new Set(permissoes);
  const { data, error } = await supabase
    .from('usuario_permissao')
    .select('permissao_chave')
    .eq('usuario_id', usuarioId);
  if (error) throw error;
  const atual = new Set((data ?? []).map((r) => (r as { permissao_chave: string }).permissao_chave));

  const aInserir = [...desejado].filter((c) => !atual.has(c));
  const aRemover = [...atual].filter((c) => !desejado.has(c));

  if (aInserir.length > 0) {
    const { error: eIns } = await supabase
      .from('usuario_permissao')
      .insert(aInserir.map((chave) => ({ usuario_id: usuarioId, permissao_chave: chave })));
    if (eIns) throw eIns;
  }
  if (aRemover.length > 0) {
    const { error: eDel } = await supabase
      .from('usuario_permissao')
      .delete()
      .eq('usuario_id', usuarioId)
      .in('permissao_chave', aRemover);
    if (eDel) throw eDel;
  }
}

/** Ajusta a ACL de conta do usuário ao informado, também de forma diferencial. */
export async function salvarContasAcesso(
  usuarioId: string,
  contas: { conta_id: string; nivel: 'ver' | 'movimentar' }[],
): Promise<void> {
  const desejado = new Map(contas.map((c) => [c.conta_id, c.nivel]));
  const { data, error } = await supabase
    .from('usuario_conta')
    .select('conta_id,nivel')
    .eq('usuario_id', usuarioId);
  if (error) throw error;
  const atual = new Map(
    (data ?? []).map((r) => {
      const row = r as { conta_id: string; nivel: 'ver' | 'movimentar' };
      return [row.conta_id, row.nivel];
    }),
  );

  // Remover as que saíram; upsert as novas/alteradas.
  const aRemover = [...atual.keys()].filter((id) => !desejado.has(id));
  const aGravar = [...desejado.entries()]
    .filter(([id, nivel]) => atual.get(id) !== nivel)
    .map(([conta_id, nivel]) => ({ usuario_id: usuarioId, conta_id, nivel }));

  if (aGravar.length > 0) {
    const { error: eUp } = await supabase.from('usuario_conta').upsert(aGravar);
    if (eUp) throw eUp;
  }
  if (aRemover.length > 0) {
    const { error: eDel } = await supabase
      .from('usuario_conta')
      .delete()
      .eq('usuario_id', usuarioId)
      .in('conta_id', aRemover);
    if (eDel) throw eDel;
  }
}

/**
 * Sobe a foto do usuário para `avatares/{usuarioId}/avatar.<ext>` e grava o
 * `foto_url` público na linha. O RLS de storage garante: própria pasta, ou
 * qualquer uma se tiver `gerenciar_permissoes`. Devolve a URL pública (com
 * cache-busting) para a UI atualizar na hora.
 */
export async function uploadFoto(usuarioId: string, arquivo: File): Promise<string> {
  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
  const caminho = `${usuarioId}/avatar.${ext}`;
  const { error: eUp } = await supabase.storage
    .from('avatares')
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
  if (eUp) throw eUp;

  const { data: pub } = supabase.storage.from('avatares').getPublicUrl(caminho);
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: eUsr } = await supabase.from('usuario').update({ foto_url: url }).eq('id', usuarioId);
  if (eUsr) throw eUsr;
  return url;
}
