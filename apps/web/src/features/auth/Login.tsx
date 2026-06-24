import { useState, type FormEvent } from 'react';
import { entrar } from '../../data/sessao';

export function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
    } catch {
      setErro('E-mail ou senha inválidos.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden px-6 py-12">
      {/* Brilho decorativo sutil — dá profundidade sem poluir */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-ambar/20 blur-[120px]"
      />

      <div className="animar-surgir relative w-full max-w-sm">
        <div className="cartao-realce p-8 sm:p-9">
          <header className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-ambar to-[color-mix(in_srgb,var(--color-ambar)_55%,#000)] font-display text-xl font-extrabold text-sobreacento shadow-lg ring-1 ring-white/10">
              P
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-claro">Pontão Beira Rio</h1>
            <p className="mt-1 text-sm text-suave">Acesse o controle financeiro</p>
          </header>

          <form onSubmit={aoEnviar} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-claro">
              E-mail
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="voce@pontao.com.br"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-claro">
              Senha
              <input
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm"
              />
            </label>

            {erro && (
              <p className="rounded-lg border border-negativo/30 bg-negativo/10 px-3.5 py-2.5 text-sm font-medium text-negativo">
                {erro}
              </p>
            )}

            <button type="submit" disabled={enviando} className="btn btn-primario mt-2 w-full px-4 py-2.5 text-sm">
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-suave">
          Controle financeiro offline-first · Pontão Beira Rio
        </p>
      </div>
    </main>
  );
}
