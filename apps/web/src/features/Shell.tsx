import { useState, type ReactNode } from 'react';
import { Painel } from './painel/Painel';
import { Fechamento } from './fechamento/Fechamento';
import { sair } from '../data/sessao';
import type { UsuarioAtual } from '../data/usuario';

type Tela = 'painel' | 'fechamento';

export function Shell({ usuario }: { usuario: UsuarioAtual }) {
  const [tela, setTela] = useState<Tela>('painel');
  const podeFechar = usuario.permissoes.has('fechar_caixa');
  const podeVerPainel =
    usuario.permissoes.has('ver_painel_operacional') || usuario.permissoes.has('ver_capital');

  return (
    <div className="min-h-full">
      <nav className="sticky top-0 z-10 flex items-center gap-2 border-b border-claro/10 bg-petroleo/95 px-4 py-3 backdrop-blur">
        <span className="mr-2 font-display font-bold text-ambar">Pontão</span>
        {podeVerPainel && (
          <ItemNav ativo={tela === 'painel'} aoClicar={() => setTela('painel')}>
            Painel
          </ItemNav>
        )}
        {podeFechar && (
          <ItemNav ativo={tela === 'fechamento'} aoClicar={() => setTela('fechamento')}>
            Fechar caixa
          </ItemNav>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm text-claro/60">
          <span className="hidden sm:inline">{usuario.nome}</span>
          <button onClick={() => void sair()} className="hover:text-claro">
            Sair
          </button>
        </div>
      </nav>

      {tela === 'painel' && podeVerPainel && <Painel />}
      {tela === 'fechamento' && podeFechar && <Fechamento usuarioId={usuario.id} />}
    </div>
  );
}

function ItemNav({
  ativo,
  aoClicar,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={aoClicar}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        ativo ? 'bg-ardosia text-claro' : 'text-claro/70 hover:text-claro'
      }`}
    >
      {children}
    </button>
  );
}
