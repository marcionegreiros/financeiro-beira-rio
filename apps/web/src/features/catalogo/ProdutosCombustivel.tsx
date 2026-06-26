import { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Combustivel } from './Combustivel';
import { Produtos } from './Produtos';
import type { UsuarioAtual } from '../../data/usuario';
import { hojeManaus } from '../../lib/datas';

interface ProdutosCombustivelProps {
  usuario?: UsuarioAtual;
}

export function ProdutosCombustivel({ usuario }: ProdutosCombustivelProps) {
  const [dataSelecionada, setDataSelecionada] = useState(hojeManaus());

  const podeVerCombustivel =
    (usuario?.permissoes.has('gerenciar_combustivel') ?? true) ||
    (usuario?.permissoes.has('definir_preco_custo') ?? true);
  const podeVerProdutos =
    (usuario?.permissoes.has('cadastrar_produto') ?? true) ||
    (usuario?.permissoes.has('definir_preco_custo') ?? true);

  function diaAnterior() {
    const d = new Date(dataSelecionada + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setDataSelecionada(d.toISOString().split('T')[0]!);
  }

  function diaSeguinte() {
    const d = new Date(dataSelecionada + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setDataSelecionada(d.toISOString().split('T')[0]!);
  }

  const seletorData = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-sm font-semibold text-suave mr-1">Estoque/Preços em:</span>
      <button
        type="button"
        onClick={diaAnterior}
        className="rounded-lg p-1.5 text-claro border border-borda hover:bg-claro/5 transition-all active:scale-95"
        title="Dia anterior"
      >
        <IconeAnterior />
      </button>
      <input
        type="date"
        aria-label="Data selecionada"
        className="rounded-lg border border-borda bg-transparent px-2.5 py-1 text-sm font-bold text-claro text-center focus:ring-ambar focus:border-ambar outline-none transition-all w-36"
        value={dataSelecionada}
        onChange={(e) => e.target.value && setDataSelecionada(e.target.value)}
      />
      <button
        type="button"
        onClick={diaSeguinte}
        className="rounded-lg p-1.5 text-claro border border-borda hover:bg-claro/5 transition-all active:scale-95"
        title="Próximo dia"
      >
        <IconeProximo />
      </button>
      <button
        type="button"
        onClick={() => setDataSelecionada(hojeManaus())}
        className="rounded-lg border border-borda bg-claro/5 px-2.5 py-1.5 text-xs font-semibold text-claro hover:bg-claro/10 transition-colors"
      >
        Hoje
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        titulo="Produtos & Combustíveis"
        subtitulo="Gerenciamento de combustível, tanques e catálogo de produtos"
        acao={seletorData}
      />

      <div className="flex flex-col gap-8">
        {podeVerCombustivel && (
          <section className="flex flex-col gap-4 p-5 rounded-2xl border border-borda bg-ardosia shadow-sm animate-fadeIn">
            <Combustivel dataSelecionada={dataSelecionada} {...(usuario ? { usuario } : {})} />
          </section>
        )}

        {podeVerProdutos && (
          <section className="flex flex-col gap-4 p-5 rounded-2xl border border-borda bg-ardosia shadow-sm animate-fadeIn">
            <Produtos dataSelecionada={dataSelecionada} {...(usuario ? { usuario } : {})} />
          </section>
        )}
      </div>
    </div>
  );
}

function IconeAnterior() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconeProximo() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
