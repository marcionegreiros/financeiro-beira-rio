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
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <header>
        <p className="text-sm uppercase tracking-widest text-ambar">Pontão Beira Rio</p>
        <h1 className="font-display text-2xl font-bold text-claro">Entrar</h1>
      </header>
      <form onSubmit={aoEnviar} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-claro/80">
          E-mail
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-lg border border-claro/20 bg-ardosia px-3 py-2 text-claro outline-none focus:border-ambar"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-claro/80">
          Senha
          <input
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            className="rounded-lg border border-claro/20 bg-ardosia px-3 py-2 text-claro outline-none focus:border-ambar"
          />
        </label>
        {erro && <p className="text-sm text-negativo">{erro}</p>}
        <button
          type="submit"
          disabled={enviando}
          className="mt-2 rounded-lg bg-ambar px-4 py-2 font-medium text-petroleo disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
