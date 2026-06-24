import { useState, useEffect, useMemo } from 'react';
import {
  listarCategoriasDespesa,
  listarMovimentos,
  type CategoriaDespesa,
  type MovimentoLista,
} from '../../data/repositorios';
import { formatReais, negar, somar, ZERO } from '../../lib/money';
import { hojeManaus } from '../../lib/datas';
import { formatarDataHora, diaIso } from '../../lib/formato';
import { useToast } from '../../components/ui/Toast';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { CLASSE_CAMPO } from '../../components/ui/Campo';
import { NovaDespesaModal, FORMAS_PAGAMENTO as FORMAS } from './NovaDespesaModal';

export function Despesas({ usuarioId }: { usuarioId: string }) {
  const toast = useToast();
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentoLista[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  // Modal
  const [aberto, setAberto] = useState(false);

  async function recarregar() {
    setMovimentos(await listarMovimentos(['despesa']));
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [cat, movs] = await Promise.all([
          listarCategoriasDespesa(),
          listarMovimentos(['despesa']),
        ]);
        if (!ativo) return;
        setCategorias(cat.filter((x) => x.nome.toLowerCase() !== 'perda'));
        setMovimentos(movs);
      } catch (e) {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar as despesas.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [toast]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return movimentos.filter((m) => {
      if (filtroCategoria && m.categoriaNome !== filtroCategoria) return false;
      const dia = diaIso(m.dataHora);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      if (termo) {
        const alvo = `${m.descricao ?? ''} ${m.categoriaNome ?? ''} ${m.contaNome ?? ''}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [movimentos, filtroCategoria, de, ate, busca]);

  const total = useMemo(
    () => somar(...filtrados.map((m) => (m.valorCentavos < 0n ? negar(m.valorCentavos) : m.valorCentavos))),
    [filtrados],
  );

  const temFiltro = busca || filtroCategoria || de || ate;

  const colunas: Coluna<MovimentoLista>[] = [
    {
      chave: 'data',
      titulo: 'Data',
      render: (m) => <span className="whitespace-nowrap text-suave">{formatarDataHora(m.dataHora)}</span>,
    },
    {
      chave: 'categoria',
      titulo: 'Categoria',
      render: (m) => (
        <span className="inline-flex rounded-full bg-claro/[0.06] px-2 py-0.5 text-xs font-medium text-claro">
          {m.categoriaNome ?? '—'}
        </span>
      ),
    },
    {
      chave: 'descricao',
      titulo: 'Descrição',
      render: (m) => m.descricao || <span className="text-suave">—</span>,
    },
    { chave: 'conta', titulo: 'Conta', render: (m) => <span className="text-suave">{m.contaNome ?? '—'}</span> },
    {
      chave: 'forma',
      titulo: 'Forma',
      render: (m) => <span className="text-suave">{FORMAS[m.formaPagamento ?? ''] ?? m.formaPagamento ?? '—'}</span>,
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      alinhar: 'right',
      render: (m) => (
        <span className="numeros font-semibold text-negativo">
          {formatReais(m.valorCentavos < 0n ? negar(m.valorCentavos) : m.valorCentavos)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Despesas"
        subtitulo="Pagamentos de contas, fornecedores e avulsos"
        acao={
          <button type="button" onClick={() => setAberto(true)} className="btn btn-primario px-4 py-2 text-sm">
            <IconePlus /> Nova despesa
          </button>
        }
      />

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-medium text-suave">Buscar</label>
          <input
            className={CLASSE_CAMPO}
            placeholder="Descrição, categoria ou conta…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-suave">Categoria</label>
          <select
            aria-label="Filtrar por categoria"
            className={CLASSE_CAMPO}
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
          >
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.nome}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-suave">De</label>
          <input aria-label="Data inicial" type="date" className={CLASSE_CAMPO} value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-suave">Até</label>
          <input aria-label="Data final" type="date" className={CLASSE_CAMPO} value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        {temFiltro && (
          <button
            type="button"
            className="btn btn-suave px-3 py-2 text-sm"
            onClick={() => {
              setBusca('');
              setFiltroCategoria('');
              setDe('');
              setAte('');
            }}
          >
            Limpar
          </button>
        )}
      </div>

      <div className="flex items-center justify-between px-1 text-sm text-suave">
        <span>
          {filtrados.length} {filtrados.length === 1 ? 'lançamento' : 'lançamentos'}
        </span>
        <span>
          Total: <strong className="numeros text-claro">{formatReais(total ?? ZERO)}</strong>
        </span>
      </div>

      <DataTable
        colunas={colunas}
        dados={filtrados}
        chaveLinha={(m) => m.id}
        carregando={carregando}
        vazio={temFiltro ? 'Nenhuma despesa nesse filtro.' : 'Nenhuma despesa lançada ainda.'}
      />

      <NovaDespesaModal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        usuarioId={usuarioId}
        data={hojeManaus()}
        aoSalvo={() => void recarregar()}
      />
    </div>
  );
}

function IconePlus() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
