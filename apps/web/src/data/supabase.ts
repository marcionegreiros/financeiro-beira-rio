/**
 * Cliente Supabase (camada online da Fase 1).
 *
 * Por ora o app lê/escreve direto no Supabase (online). Quando a instância
 * PowerSync existir, a leitura passa a vir do SQLite local (offline-first) SEM
 * mudar os repositórios em `repositorios.ts` — essa é a fronteira que isola o
 * mecanismo de sync do resto do app.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** Verdadeiro quando as variáveis de ambiente do Supabase estão preenchidas. */
export const supabaseConfigurado = Boolean(url && anonKey);

if (!supabaseConfigurado) {
  // Não derruba o app: a tela mostra um aviso de configuração.
  console.warn(
    'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em apps/web/.env',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
