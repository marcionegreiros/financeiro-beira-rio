import { useState, useEffect, useMemo } from 'react';
import {
  listarCategoriasDespesa,
  listarMovimentos,
  type CategoriaDespesa,
  type MovimentoLista,
  removerDespesa,
  verificarFechamentoStatus,
} from '../../data/repositorios';
import { formatReais, negar, somar, ZERO } from '../../lib/money';
import { hojeManaus, formatarDataBR } from '../../lib/datas';
import { formatarDataHora, diaIso } from '../../lib/formato';
import { useToast } from '../../components/ui/Toast';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { CLASSE_CAMPO } from '../../components/ui/Campo';
import { NovaDespesaModal, FORMAS_PAGAMENTO as FORMAS } from './NovaDespesaModal';
import { AutorizacaoGerenteModal } from './AutorizacaoGerenteModal';
import type { UsuarioAtual } from '../../data/usuario';
import type { SupabaseClient } from '@supabase/supabase-js';

export function Despesas({ usuario }: { usuario: UsuarioAtual }) {
  const usuarioId = usuario.id;
  const toast = useToast();
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentoLista[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  // Modal Lançar/Editar
  const [aberto, setAberto] = useState(false);
  const [despesaEdicao, setDespesaEdicao] = useState<MovimentoLista | null>(null);

  // Modal Autorização de Gerente para exclusão
  const [modalAutorizarAberto, setModalAutorizarAberto] = useState(false);
  const [idExcluirConfirmado, setIdExcluirConfirmado] = useState<string | null>(null);

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

  function aoEditarClick(m: MovimentoLista) {
    setDespesaEdicao(m);
    setAberto(true);
  }

  async function aoExcluirClick(m: MovimentoLista) {
    const dia = diaIso(m.dataHora);
    try {
      const statusFechamento = await verificarFechamentoStatus(dia);
      const isFechado = statusFechamento === 'travado';

      if (isFechado) {
        const temPermissaoRetroativa =
          usuario.permissoes.has('editar_lancamentos_retroativos') ||
          usuario.permissoes.has('reabrir_fechamento');

        if (temPermissaoRetroativa) {
          const confirmar = window.confirm(
            `Atenção: o caixa de ${formatarDataBR(dia)} já está fechado. Como você possui permissão de gerente, você pode prosseguir. Deseja realmente excluir esta despesa?`
          );
          if (confirmar) {
            await executarExclusao(m.id);
          }
        } else {
          setIdExcluirConfirmado(m.id);
          setModalAutorizarAberto(true);
        }
      } else {
        const confirmar = window.confirm('Deseja realmente excluir esta despesa?');
        if (confirmar) {
          await executarExclusao(m.id);
        }
      }
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao verificar status do caixa.');
    }
  }

  async function executarExclusao(id: string, clientOverride?: SupabaseClient) {
    try {
      await removerDespesa(id, usuarioId, clientOverride);
      toast.sucesso('Despesa removida com sucesso.');
      await recarregar();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao excluir a despesa.');
    }
  }

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
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'right',
      render: (m) => {
        const isFechado = m.fechamentoStatus === 'travado';
        return (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="text-suave hover:text-claro p-1 rounded hover:bg-claro/5 transition-colors"
              title={isFechado ? 'Editar despesa (caixa fechado)' : 'Editar despesa'}
              onClick={() => aoEditarClick(m)}
            >
              {isFechado ? (
                <IconeLock className="h-4 w-4 text-ambar" />
              ) : (
                <IconePencil className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              className="text-suave hover:text-negativo p-1 rounded hover:bg-claro/5 transition-colors"
              title="Excluir despesa"
              onClick={() => aoExcluirClick(m)}
            >
              <IconeTrash className="h-4 w-4" />
            </button>
          </div>
        );
      },
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
        aoFechar={() => {
          setAberto(false);
          setDespesaEdicao(null);
        }}
        usuarioId={usuarioId}
        usuario={usuario}
        despesaEdicao={despesaEdicao}
        data={hojeManaus()}
        aoSalvo={() => void recarregar()}
      />

      <AutorizacaoGerenteModal
        aberto={modalAutorizarAberto}
        aoFechar={() => {
          setModalAutorizarAberto(false);
          setIdExcluirConfirmado(null);
        }}
        permissaoRequerida="editar_lancamentos_retroativos"
        aoAutorizado={(managerClient) => {
          if (idExcluirConfirmado) {
            void executarExclusao(idExcluirConfirmado, managerClient);
          }
        }}
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

function IconeLock({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function IconePencil({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function IconeTrash({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
