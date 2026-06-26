// Edge Function — gestão administrativa de usuários (§4).
//
// O cliente (anon key) NÃO pode criar contas em auth.users. Esta função roda com
// SERVICE_ROLE (ignora RLS) mas só age depois de confirmar que QUEM CHAMA tem a
// permissão `gerenciar_permissoes`. Faz: criar usuário com login, redefinir
// senha e ativar/desativar. As permissões e a ACL de conta são gravadas direto
// pelo app (sob RLS) — aqui só o que exige service_role.
//
// Ações (POST JSON { action, ... }):
//   criar          { id, email, senha, nome, cargo?, permissoes[], contas[] }
//   redefinir_senha{ usuario_id, senha }
//   set_ativo      { usuario_id, ativo }
//   excluir        { usuario_id }  — só se nunca usado; apaga linha + login (Auth)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não suportado' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ erro: 'Sem autenticação' }, 401);

  // Cliente "como o chamador": identifica quem está pedindo.
  const comoChamador = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await comoChamador.auth.getUser();
  const authUid = auth.user?.id;
  if (!authUid) return json({ erro: 'Sessão inválida' }, 401);

  // Cliente admin (service_role) — ignora RLS.
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  // Confirma que o chamador tem `gerenciar_permissoes` e está ativo.
  const { data: chamador } = await admin
    .from('usuario')
    .select('id, ativo, usuario_permissao(permissao_chave)')
    .eq('auth_uid', authUid)
    .single();

  const perms = new Set(
    ((chamador?.usuario_permissao ?? []) as { permissao_chave: string }[]).map(
      (p) => p.permissao_chave,
    ),
  );
  if (!chamador?.ativo || !perms.has('gerenciar_permissoes')) {
    return json({ erro: 'Sem permissão para gerenciar usuários' }, 403);
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'JSON inválido' }, 400);
  }
  const action = corpo.action as string;

  try {
    if (action === 'criar') {
      const { id, email, senha, nome, cargo, permissoes, contas } = corpo as {
        id: string;
        email: string;
        senha: string;
        nome: string;
        cargo?: string;
        permissoes?: string[];
        contas?: { conta_id: string; nivel: string }[];
      };
      if (!id || !email || !senha || !nome) {
        return json({ erro: 'Campos obrigatórios: id, email, senha, nome' }, 400);
      }

      // 1) Cria o login (email já confirmado — uso interno do posto).
      const { data: novo, error: eAuth } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });
      if (eAuth || !novo.user) {
        return json({ erro: eAuth?.message ?? 'Falha ao criar login' }, 400);
      }
      const authNovo = novo.user.id;

      // 2) Linha usuario. Em erro, desfaz o login criado (rollback manual).
      const { error: eUsr } = await admin.from('usuario').insert({
        id,
        nome,
        email,
        cargo: cargo ?? null,
        auth_uid: authNovo,
        ativo: true,
      });
      if (eUsr) {
        await admin.auth.admin.deleteUser(authNovo);
        return json({ erro: eUsr.message }, 400);
      }

      // 3) Permissões e ACL de conta.
      if (permissoes && permissoes.length > 0) {
        await admin
          .from('usuario_permissao')
          .insert(permissoes.map((chave) => ({ usuario_id: id, permissao_chave: chave })));
      }
      if (contas && contas.length > 0) {
        await admin
          .from('usuario_conta')
          .insert(contas.map((c) => ({ usuario_id: id, conta_id: c.conta_id, nivel: c.nivel })));
      }

      // 4) Auditoria.
      await admin.from('auditoria').insert({
        id: crypto.randomUUID(),
        entidade: 'usuario',
        entidade_id: id,
        acao: 'criar',
        usuario_id: chamador.id,
        dados_depois: { nome, email, cargo, permissoes },
      });

      return json({ ok: true, usuario_id: id, auth_uid: authNovo });
    }

    if (action === 'redefinir_senha') {
      const { usuario_id, senha } = corpo as { usuario_id: string; senha: string };
      const { data: alvo } = await admin
        .from('usuario')
        .select('auth_uid')
        .eq('id', usuario_id)
        .single();
      if (!alvo?.auth_uid) return json({ erro: 'Usuário sem login' }, 404);
      const { error } = await admin.auth.admin.updateUserById(alvo.auth_uid, { password: senha });
      if (error) return json({ erro: error.message }, 400);
      await admin.from('auditoria').insert({
        id: crypto.randomUUID(),
        entidade: 'usuario',
        entidade_id: usuario_id,
        acao: 'editar',
        usuario_id: chamador.id,
        dados_depois: { senha_redefinida: true },
      });
      return json({ ok: true });
    }

    if (action === 'set_ativo') {
      const { usuario_id, ativo } = corpo as { usuario_id: string; ativo: boolean };
      const { error } = await admin.from('usuario').update({ ativo }).eq('id', usuario_id);
      if (error) return json({ erro: error.message }, 400);
      await admin.from('auditoria').insert({
        id: crypto.randomUUID(),
        entidade: 'usuario',
        entidade_id: usuario_id,
        acao: 'editar',
        usuario_id: chamador.id,
        dados_depois: { ativo },
      });
      return json({ ok: true });
    }

    // Excluir DE VERDADE — só se o usuário nunca foi usado em nenhum evento.
    // Se já tem histórico (responsável por fechamento, autor de movimento, vendedor
    // de venda avulsa, ou aparece na auditoria), recusa e orienta a inativar.
    if (action === 'excluir') {
      const { usuario_id } = corpo as { usuario_id: string };
      if (!usuario_id) return json({ erro: 'Informe usuario_id' }, 400);
      if (usuario_id === chamador.id) {
        return json({ erro: 'Você não pode excluir o seu próprio usuário.' }, 400);
      }

      const { data: alvo } = await admin
        .from('usuario')
        .select('auth_uid, nome')
        .eq('id', usuario_id)
        .single();
      if (!alvo) return json({ erro: 'Usuário não encontrado' }, 404);

      // Checagem de uso (NOT EXISTS via count head).
      const usos = await Promise.all([
        admin.from('fechamento').select('id', { count: 'exact', head: true }).eq('responsavel_id', usuario_id),
        admin.from('movimento').select('id', { count: 'exact', head: true }).eq('criado_por', usuario_id),
        admin.from('venda_avulsa').select('id', { count: 'exact', head: true }).eq('vendedor_id', usuario_id),
        admin.from('auditoria').select('id', { count: 'exact', head: true }).eq('usuario_id', usuario_id),
      ]);
      const totalUsos = usos.reduce((s, r) => s + (r.count ?? 0), 0);
      if (totalUsos > 0) {
        return json(
          { erro: 'Este usuário já tem histórico no sistema e não pode ser excluído. Inative-o.' },
          409,
        );
      }

      // Apaga a linha (cascade leva usuario_permissao e usuario_conta) e o login.
      const { error: eUsr } = await admin.from('usuario').delete().eq('id', usuario_id);
      if (eUsr) return json({ erro: eUsr.message }, 400);
      if (alvo.auth_uid) {
        await admin.auth.admin.deleteUser(alvo.auth_uid);
      }

      await admin.from('auditoria').insert({
        id: crypto.randomUUID(),
        entidade: 'usuario',
        entidade_id: usuario_id,
        acao: 'remover',
        usuario_id: chamador.id,
        dados_antes: { nome: alvo.nome },
      });
      return json({ ok: true });
    }

    return json({ erro: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : 'Erro interno' }, 500);
  }
});
