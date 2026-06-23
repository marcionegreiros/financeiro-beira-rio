import { useEffect, useState, type ReactNode } from 'react';
import { supabaseConfigurado } from './data/supabase';
import { useSessao, sair } from './data/sessao';
import { carregarUsuarioAtual, type UsuarioAtual } from './data/usuario';
import { Login } from './features/auth/Login';
import { Shell } from './features/Shell';

function Aviso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-2xl font-bold text-claro">{titulo}</h1>
      <div className="text-claro/70">{children}</div>
    </main>
  );
}

export function App() {
  const { sessao, carregando } = useSessao();
  // undefined = ainda carregando o usuário; null = sem vínculo
  const [usuario, setUsuario] = useState<UsuarioAtual | null | undefined>(undefined);

  useEffect(() => {
    if (!sessao) {
      setUsuario(undefined);
      return;
    }
    let ativo = true;
    carregarUsuarioAtual().then((u) => {
      if (ativo) setUsuario(u);
    });
    return () => {
      ativo = false;
    };
  }, [sessao]);

  if (!supabaseConfigurado) {
    return (
      <Aviso titulo="Configuração necessária">
        Defina <code className="text-ambar">VITE_SUPABASE_URL</code> e{' '}
        <code className="text-ambar">VITE_SUPABASE_ANON_KEY</code> em{' '}
        <code className="text-ambar">apps/web/.env</code> e recarregue.
      </Aviso>
    );
  }

  if (carregando) {
    return (
      <main className="flex min-h-full items-center justify-center">
        <p className="text-claro/60">Carregando…</p>
      </main>
    );
  }

  if (!sessao) return <Login />;

  if (usuario === undefined) {
    return (
      <main className="flex min-h-full items-center justify-center">
        <p className="text-claro/60">Carregando usuário…</p>
      </main>
    );
  }

  if (usuario === null) {
    return (
      <Aviso titulo="Usuário sem vínculo">
        <p>Seu login não está vinculado a um usuário do Pontão. Fale com o gerente.</p>
        <button onClick={() => void sair()} className="mt-3 text-ambar hover:underline">
          Sair
        </button>
      </Aviso>
    );
  }

  return <Shell usuario={usuario} />;
}
