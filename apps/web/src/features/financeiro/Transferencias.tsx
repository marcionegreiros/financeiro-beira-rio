import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
  listarContasCompletas,
  lancarTransferencia,
  listarMovimentos,
  type ContaCompleta,
  type MovimentoLista,
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { parseReais, formatReais, negar, somar, ZERO } from '../../lib/money';
import { agoraManausISO } from '../../lib/datas';
import { formatarDataHora, diaIso } from '../../lib/formato';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';

export function Transferencias({ usuarioId }: { usuarioId: string }) {
  const toast = useToast();
  const [contas, setContas] = useState<ContaCompleta[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentoLista[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  // Modal + formulário
  const [aberto, setAberto] = useState(false);
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function recarregar() {
    setMovimentos(await listarMovimentos(['transferencia', 'deposito']));
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [c, movs] = await Promise.all([
          listarContasCompletas(),
          listarMovimentos(['transferencia', 'deposito']),
        ]);
        if (!ativo) return;
        setContas(c.filter((x) => x.ativo));
        setMovimentos(movs);
      } catch (e) {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar as transferências.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [toast]);

  // Uma linha por operação: a perna de saída (valor negativo) tem origem=conta, destino=contraparte.
  const saidas = useMemo(() => movimentos.filter((m) => m.valorCentavos < 0n), [movimentos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return saidas.filter((m) => {
      if (filtroTipo && m.tipo !== filtroTipo) return false;
      const dia = diaIso(m.dataHora);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      if (termo) {
        const alvo = `${m.descricao ?? ''} ${m.contaNome ?? ''} ${m.contraparteNome ?? ''}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [saidas, filtroTipo, de, ate, busca]);

  const total = useMemo(
    () => somar(...filtrados.map((m) => (m.valorCentavos < 0n ? negar(m.valorCentavos) : m.valorCentavos))),
    [filtrados],
  );

  const temFiltro = busca || filtroTipo || de || ate;

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    if (!contaOrigemId || !contaDestinoId || contaOrigemId === contaDestinoId) {
      toast.erro('Escolha contas diferentes para origem e destino.');
      return;
    }
    const valor = parseReais(valorStr);
    if (valor <= 0n) {
      toast.erro('Informe um valor válido.');
      return;
    }
    setSalvando(true);
    try {
      const destino = contas.find((c) => c.id === contaDestinoId);
      const ehDeposito = destino?.tipo === 'banco';
      await lancarTransferencia(
        uuidv7(),
        uuidv7(),
        contaOrigemId,
        contaDestinoId,
        valor,
        agoraManausISO(),
        descricao,
        usuarioId,
        ehDeposito,
      );
      toast.sucesso(ehDeposito ? 'Depósito registrado.' : 'Transferência realizada.');
      setAberto(false);
      setContaOrigemId('');
      setContaDestinoId('');
      setValorStr('');
      setDescricao('');
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao transferir.');
    } finally {
      setSalvando(false);
    }
  }

  const colunas: Coluna<MovimentoLista>[] = [
    {
      chave: 'data',
      titulo: 'Data',
      render: (m) => <span className="whitespace-nowrap text-suave">{formatarDataHora(m.dataHora)}</span>,
    },
    {
      chave: 'fluxo',
      titulo: 'Origem → Destino',
      render: (m) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-claro">{m.contaNome ?? '—'}</span>
          <span className="text-suave">→</span>
          <span className="text-claro">{m.contraparteNome ?? '—'}</span>
        </span>
      ),
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      render: (m) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            m.tipo === 'deposito' ? 'bg-positivo/15 text-positivo' : 'bg-claro/[0.06] text-claro'
          }`}
        >
          {m.tipo === 'deposito' ? 'Depósito' : 'Transferência'}
        </span>
      ),
    },
    {
      chave: 'descricao',
      titulo: 'Descrição',
      render: (m) => m.descricao || <span className="text-suave">—</span>,
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      alinhar: 'right',
      render: (m) => (
        <span className="numeros font-semibold text-claro">
          {formatReais(m.valorCentavos < 0n ? negar(m.valorCentavos) : m.valorCentavos)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Transferências e depósitos"
        subtitulo="Mova dinheiro entre contas sem alterar o patrimônio"
        acao={
          <button type="button" onClick={() => setAberto(true)} className="btn btn-primario px-4 py-2 text-sm">
            <IconePlus /> Nova transferência
          </button>
        }
      />

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-medium text-suave">Buscar</label>
          <input
            className={CLASSE_CAMPO}
            placeholder="Conta ou descrição…"
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
            <option value="transferencia">Transferência</option>
            <option value="deposito">Depósito</option>
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
          {filtrados.length} {filtrados.length === 1 ? 'operação' : 'operações'}
        </span>
        <span>
          Total movimentado: <strong className="numeros text-claro">{formatReais(total ?? ZERO)}</strong>
        </span>
      </div>

      <DataTable
        colunas={colunas}
        dados={filtrados}
        chaveLinha={(m) => m.id}
        carregando={carregando}
        vazio={temFiltro ? 'Nenhuma operação nesse filtro.' : 'Nenhuma transferência registrada ainda.'}
      />

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Nova transferência"
        descricao="O valor sai da origem e entra no destino. Depósito é quando o destino é uma conta de banco."
      >
        <form onSubmit={aoSalvar} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Conta de origem" obrigatorio>
              <select aria-label="Conta de origem" className={CLASSE_CAMPO} value={contaOrigemId} onChange={(e) => setContaOrigemId(e.target.value)}>
                <option value="">Selecione…</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.tipo})
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Conta de destino" obrigatorio>
              <select aria-label="Conta de destino" className={CLASSE_CAMPO} value={contaDestinoId} onChange={(e) => setContaDestinoId(e.target.value)}>
                <option value="">Selecione…</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.tipo})
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo label="Valor (R$)" obrigatorio>
            <input
              inputMode="decimal"
              className={`${CLASSE_CAMPO} numeros text-right sm:w-1/2`}
              placeholder="0,00"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
            />
          </Campo>
          <Campo label="Descrição">
            <input
              className={CLASSE_CAMPO}
              placeholder="Ex.: Depósito do fim de semana"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </Campo>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setAberto(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
              {salvando ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </form>
      </Modal>
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
