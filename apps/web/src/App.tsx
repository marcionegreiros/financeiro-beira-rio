import { supabaseConfigurado } from './data/supabase';
import { useSessao } from './data/sessao';
import { Login } from './features/auth/Login';
import { Painel } from './features/painel/Painel';

export function App() {
  const { sessao, carregando } = useSessao();

  if (!supabaseConfigurado) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-2xl font-bold text-claro">Configuração necessária</h1>
        <p className="text-claro/70">
          Defina <code className="text-ambar">VITE_SUPABASE_URL</code> e{' '}
          <code className="text-ambar">VITE_SUPABASE_ANON_KEY</code> em{' '}
          <code className="text-ambar">apps/web/.env</code> e recarregue.
        </p>
      </main>
    );
  }

  if (carregando) {
    return (
      <main className="flex min-h-full items-center justify-center">
        <p className="text-claro/60">Carregando…</p>
      </main>
    );
  }

  return sessao ? <Painel /> : <Login />;
}
