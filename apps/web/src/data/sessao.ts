/**
 * Sessão de autenticação (Supabase Auth). A permissão por item (§4) e o RLS
 * dependem de um usuário logado; sem sessão, o banco não devolve dados.
 */
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export function useSessao(): { sessao: Session | null; carregando: boolean } {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
    });
    return () => assinatura.subscription.unsubscribe();
  }, []);

  return { sessao, carregando };
}

export async function entrar(email: string, senha: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
}

export async function sair(): Promise<void> {
  await supabase.auth.signOut();
}
