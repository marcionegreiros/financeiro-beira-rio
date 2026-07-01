import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  listarCategoriasDespesa,
  listarContasCompletas,
  listarMovimentos,
  type CategoriaDespesa,
  type MovimentoLista,
  removerDespesa,
  verificarFechamentoStatus,
} from '../../data/repositorios';
import { idContaGaveta } from '../../lib/formasPagamento';
import { formatReais, negar, somar, ZERO } from '../../lib/money';
import { hojeManaus, formatarDataBR } from '../../lib/datas';
import { formatarDataHora, diaIso } from '../../lib/formato';
import { useToast } from '../../components/ui/Toast';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { CLASSE_CAMPO } from '../../components/ui/Campo';
import { NovaDespesaModal, FORMAS_PAGAMENTO as FORMAS } from './NovaDespesaModal';
import { ValeModal } from './ValeModal';
import { OperacaoSocioModal } from './OperacaoSocioModal';
import { AutorizacaoGerenteModal } from './AutorizacaoGerenteModal';
import type { UsuarioAtual } from '../../data/usuario';
import type { SupabaseClient } from '@supabase/supabase-js';

// Tudo que é SAÍDA já vive na tabela `movimento` como valor negativo. A janela
// só lê mais tipos (aportes de sócio são ENTRADA, ficam de fora).
const TIPOS_SAIDA = ['despesa', 'taxa_cartao', 'vale', 'prolabore', 'devolucao_emprestimo'];

/** Rótulo da linha conforme o tipo (vale/sócio/salário não têm categoria própria). */
function rotuloLinha(m: MovimentoLista): string {
  switch (m.tipo) {
    case 'vale':
      return 'Vale';
    case 'prolabore':
      return 'Pró-labore';
    case 'devolucao_emprestimo':
      return 'Devolução de sócio';
    case 'taxa_cartao':
      return 'Taxa de cartão';
    case 'despesa':
      return m.categoriaNome ?? (m.funcionarioId ? 'Salário' : 'Despesa');
    default:
      return m.categoriaNome ?? m.tipo;
  }
}

/** Funcionário ou sócio beneficiário da saída, se houver. */
function beneficiarioLinha(m: MovimentoLista): string | null {
  return m.funcionarioNome ?? m.socioNome ?? null;
}

/** Linha derivada/automática (taxa de cartão, tarifa de PIX): não se edita à mão. */
function ehAutomatica(m: MovimentoLista): boolean {
  return m.tipo === 'taxa_cartao' || !!m.origemMovimentoId;
}

/** Saída gerenciada em outra tela (salário → Folha). */
function telaDeGestao(m: MovimentoLista): 'folha' | 'socios' | null {
  if (m.tipo === 'vale') return 'folha';
  if (m.tipo === 'despesa' && m.funcionarioId) return 'folha'; // salário
  if (m.tipo === 'prolabore' || m.tipo === 'devolucao_emprestimo') return 'socios';
  return null;
}

/** Grupo para o filtro de tipo da janela Saídas. */
function grupoTipo(m: MovimentoLista): string {
  if (m.tipo === 'taxa_cartao' || m.origemMovimentoId) return 'taxa';
  if (m.tipo === 'vale') return 'vale';
  if (m.tipo === 'prolabore' || m.tipo === 'devolucao_emprestimo') return 'socio';
  if (m.tipo === 'despesa' && m.funcionarioId) return 'salario';
  return 'despesa';
}

const GRUPOS_TIPO: Record<string, string> = {
  despesa: 'Despesas',
  salario: 'Salários',
  vale: 'Vales',
  socio: 'Sócios (retiradas)',
  taxa: 'Taxas e tarifas',
};

export function Despesas({ usuario }: { usuario: UsuarioAtual }) {
  const usuarioId = usuario.id;
  const toast = useToast();
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentoLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  // Só as saídas da conta gaveta entram no fechamento; a trava de caixa fechado
  // se aplica apenas a elas (banco/outras contas dinheiro passam direto).
  const [idGaveta, setIdGaveta] = useState<string | null>(null);

  // Filtros
  const [busca, setBusca] = useState(() => localStorage.getItem('pontao_filtro_despesas_busca') ?? '');
  const [filtroTipo, setFiltroTipo] = useState(() => localStorage.getItem('pontao_filtro_saidas_tipo') ?? '');
  const [filtroCategoria, setFiltroCategoria] = useState(() => localStorage.getItem('pontao_filtro_despesas_categoria') ?? '');
  const [de, setDe] = useState(() => localStorage.getItem('pontao_filtro_despesas_de') ?? '');
  const [ate, setAte] = useState(() => localStorage.getItem('pontao_filtro_despesas_ate') ?? '');

  useEffect(() => {
    localStorage.setItem('pontao_filtro_despesas_busca', busca);
  }, [busca]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_saidas_tipo', filtroTipo);
  }, [filtroTipo]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_despesas_categoria', filtroCategoria);
  }, [filtroCategoria]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_despesas_de', de);
  }, [de]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_despesas_ate', ate);
  }, [ate]);

  // Modal Lançar/Editar despesa
  const [aberto, setAberto] = useState(false);
  const [despesaEdicao, setDespesaEdicao] = useState<MovimentoLista | null>(null);

  // Modais especializados (Fase 2): vale e retirada de sócio abrem o fluxo certo.
  const podeFolha = usuario.permissoes.has('gerenciar_funcionarios');
  const podeSocios = usuario.permissoes.has('gerenciar_socios');
  const [valeAberto, setValeAberto] = useState(false);
  const [valeEdicao, setValeEdicao] = useState<MovimentoLista | null>(null);
  const [socioAberto, setSocioAberto] = useState(false);
  const [socioEdicao, setSocioEdicao] = useState<MovimentoLista | null>(null);

  // Modal Autorização de Gerente para exclusão
  const [modalAutorizarAberto, setModalAutorizarAberto] = useState(false);
  const [idExcluirConfirmado, setIdExcluirConfirmado] = useState<string | null>(null);

  async function recarregar() {
    setMovimentos(await listarMovimentos(TIPOS_SAIDA));
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [cat, movs, contas] = await Promise.all([
          listarCategoriasDespesa(),
          listarMovimentos(TIPOS_SAIDA),
          listarContasCompletas(),
        ]);
        if (!ativo) return;
        setCategorias(cat.filter((x) => x.nome.toLowerCase() !== 'perda'));
        setMovimentos(movs);
        setIdGaveta(idContaGaveta(contas));
      } catch (e) {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar as saídas.');
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
      if (filtroTipo && grupoTipo(m) !== filtroTipo) return false;
      if (filtroCategoria && m.categoriaNome !== filtroCategoria) return false;
      const dia = diaIso(m.dataHora);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      if (termo) {
        const alvo = `${m.descricao ?? ''} ${rotuloLinha(m)} ${beneficiarioLinha(m) ?? ''} ${m.contaNome ?? ''}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [movimentos, filtroTipo, filtroCategoria, de, ate, busca]);

  const total = useMemo(
    () => somar(...filtrados.map((m) => (m.valorCentavos < 0n ? negar(m.valorCentavos) : m.valorCentavos))),
    [filtrados],
  );

  const temFiltro = busca || filtroTipo || filtroCategoria || de || ate;

  function aoEditarClick(m: MovimentoLista) {
    setDespesaEdicao(m);
    setAberto(true);
  }

  async function aoExcluirClick(m: MovimentoLista) {
    const dia = diaIso(m.dataHora);
    try {
      // A trava de caixa fechado só vale para o dinheiro da gaveta. Saídas de
      // banco/outras contas dinheiro são excluídas direto, mesmo com dia fechado.
      const afetaGaveta = idGaveta != null && m.contaId === idGaveta;
      const statusFechamento = afetaGaveta ? await verificarFechamentoStatus(dia) : 'aberto';
      const isFechado = statusFechamento === 'travado';

      if (isFechado) {
        const temPermissaoRetroativa =
          usuario.permissoes.has('editar_lancamentos_retroativos') ||
          usuario.permissoes.has('reabrir_fechamento');

        if (temPermissaoRetroativa) {
          const confirmar = window.confirm(
            `Atenção: o caixa de ${formatarDataBR(dia)} já está fechado. Como você possui permissão de gerente, você pode prosseguir. Deseja realmente excluir esta saída?`
          );
          if (confirmar) {
            await executarExclusao(m.id);
          }
        } else {
          setIdExcluirConfirmado(m.id);
          setModalAutorizarAberto(true);
        }
      } else {
        const confirmar = window.confirm('Deseja realmente excluir esta saída?');
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
      toast.sucesso('Saída removida com sucesso.');
      await recarregar();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao excluir a saída.');
    }
  }

  const colunas: Coluna<MovimentoLista>[] = [
    {
      chave: 'data',
      titulo: 'Data',
      render: (m) => <span className="whitespace-nowrap text-suave">{formatarDataHora(m.dataHora)}</span>,
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      render: (m) => (
        <span className="inline-flex rounded-full bg-claro/[0.06] px-2 py-0.5 text-xs font-medium text-claro">
          {rotuloLinha(m)}
        </span>
      ),
    },
    {
      chave: 'beneficiario',
      titulo: 'Beneficiário',
      render: (m) => {
        const b = beneficiarioLinha(m);
        return b ? <span className="text-claro">{b}</span> : <span className="text-suave">—</span>;
      },
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
        // Lançamentos DERIVADOS (Pilar 1) não se editam nem excluem à mão:
        // - Taxa de cartão: gerada pelo fechamento do caixa.
        // - Tarifa de PIX: presa ao pagamento via PIX (origemMovimentoId); some
        //   junto quando o pagamento de origem é excluído.
        if (ehAutomatica(m)) {
          const dica =
            m.tipo === 'taxa_cartao'
              ? 'Gerada automaticamente pelo fechamento do caixa (não editável)'
              : 'Tarifa de PIX gerada automaticamente pelo pagamento (não editável)';
          return (
            <div className="flex justify-end">
              <span className="inline-flex items-center gap-1 text-xs text-suave" title={dica}>
                <IconeLock className="h-3.5 w-3.5 text-suave" />
                Automática
              </span>
            </div>
          );
        }
        // Vale e retirada de sócio: editam/excluem AQUI, mas abrindo o fluxo
        // especializado (mantém folha do mês e saldo do sócio corretos — Pilar 2).
        if (m.tipo === 'vale' && podeFolha) {
          return (
            <EditarExcluir
              onEditar={() => {
                setValeEdicao(m);
                setValeAberto(true);
              }}
              onExcluir={() => void aoExcluirClick(m)}
            />
          );
        }
        if ((m.tipo === 'prolabore' || m.tipo === 'devolucao_emprestimo') && podeSocios) {
          return (
            <EditarExcluir
              onEditar={() => {
                setSocioEdicao(m);
                setSocioAberto(true);
              }}
              onExcluir={() => void aoExcluirClick(m)}
            />
          );
        }
        // Salário: gerado no pagamento da Folha; gerenciado lá (só leitura aqui).
        // Vale/sócio sem permissão também caem aqui como leitura.
        const gestao = telaDeGestao(m);
        if (gestao) {
          return (
            <div className="flex justify-end">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-claro/[0.06] px-2 py-0.5 text-xs font-medium text-suave"
                title={gestao === 'folha' ? 'Gerenciado na tela Folha' : 'Gerenciado na tela Sócios'}
              >
                {gestao === 'folha' ? 'Folha' : 'Sócios'}
              </span>
            </div>
          );
        }
        // O cadeado só aparece para saídas da gaveta em dia fechado — são as
        // únicas que mexem na contagem do caixa.
        const isFechado = m.fechamentoStatus === 'travado' && idGaveta != null && m.contaId === idGaveta;
        return (
          <EditarExcluir
            iconeEditar={isFechado ? <IconeLock className="h-4 w-4 text-ambar" /> : <IconePencil className="h-4 w-4" />}
            tituloEditar={isFechado ? 'Editar despesa (caixa fechado)' : 'Editar despesa'}
            onEditar={() => aoEditarClick(m)}
            onExcluir={() => void aoExcluirClick(m)}
          />
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Saídas"
        subtitulo="Tudo que sai do caixa: despesas, salários, vales e retiradas de sócio"
        acao={
          <div className="flex flex-wrap gap-2">
            {podeFolha && (
              <button
                type="button"
                onClick={() => {
                  setValeEdicao(null);
                  setValeAberto(true);
                }}
                className="btn btn-suave px-3 py-2 text-sm"
              >
                <IconePlus /> Vale
              </button>
            )}
            {podeSocios && (
              <button
                type="button"
                onClick={() => {
                  setSocioEdicao(null);
                  setSocioAberto(true);
                }}
                className="btn btn-suave px-3 py-2 text-sm"
              >
                <IconePlus /> Retirada de sócio
              </button>
            )}
            <button type="button" onClick={() => setAberto(true)} className="btn btn-primario px-4 py-2 text-sm">
              <IconePlus /> Nova despesa
            </button>
          </div>
        }
      />

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-medium text-suave">Buscar</label>
          <input
            className={CLASSE_CAMPO}
            placeholder="Descrição, beneficiário ou conta…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="min-w-[150px]">
          <label className="mb-1 block text-xs font-medium text-suave">Tipo</label>
          <select
            aria-label="Filtrar por tipo"
            className={CLASSE_CAMPO}
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
          >
            <option value="">Todos</option>
            {Object.entries(GRUPOS_TIPO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
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
              setFiltroTipo('');
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
        vazio={temFiltro ? 'Nenhuma saída nesse filtro.' : 'Nenhuma saída registrada ainda.'}
        rodape={
          <tr className="border-t-2 border-borda bg-claro/[0.02] font-semibold text-sm">
            <td colSpan={6} className="px-4 py-3 text-right text-suave">
              Total Filtrado:
            </td>
            <td className="px-4 py-3 text-right numeros text-negativo font-bold whitespace-nowrap">
              {formatReais(total ?? ZERO)}
            </td>
            <td className="px-4 py-3"></td>
          </tr>
        }
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

      <ValeModal
        aberto={valeAberto}
        aoFechar={() => {
          setValeAberto(false);
          setValeEdicao(null);
        }}
        usuarioId={usuarioId}
        valeEdicao={valeEdicao}
        aoSalvo={() => void recarregar()}
      />

      <OperacaoSocioModal
        aberto={socioAberto}
        aoFechar={() => {
          setSocioAberto(false);
          setSocioEdicao(null);
        }}
        usuarioId={usuarioId}
        operacaoEdicao={socioEdicao}
        somenteSaidas
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

function EditarExcluir({
  onEditar,
  onExcluir,
  iconeEditar,
  tituloEditar,
}: {
  onEditar: () => void;
  onExcluir: () => void;
  iconeEditar?: ReactNode;
  tituloEditar?: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        className="text-suave hover:text-claro p-1 rounded hover:bg-claro/5 transition-colors"
        title={tituloEditar ?? 'Editar'}
        onClick={onEditar}
      >
        {iconeEditar ?? <IconePencil className="h-4 w-4" />}
      </button>
      <button
        type="button"
        className="text-suave hover:text-negativo p-1 rounded hover:bg-claro/5 transition-colors"
        title="Excluir"
        onClick={onExcluir}
      >
        <IconeTrash className="h-4 w-4" />
      </button>
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
