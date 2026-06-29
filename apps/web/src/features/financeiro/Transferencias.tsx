import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
  listarContasCompletas,
  lancarTransferencia,
  listarMovimentos,
  resumoEntradasBanco,
  type ContaCompleta,
  type MovimentoLista,
  type ResumoEntradasBanco,
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { parseReais, formatReais, negar, somar, ZERO, type Centavos } from '../../lib/money';
import { agoraManausISO, hojeManaus, formatarDataBR } from '../../lib/datas';
import { formatarDataHora, diaIso } from '../../lib/formato';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import type { UsuarioAtual } from '../../data/usuario';

export function Transferencias({ usuario }: { usuario: UsuarioAtual }) {
  const usuarioId = usuario.id;
  const toast = useToast();
  const [contas, setContas] = useState<ContaCompleta[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentoLista[]>([]);
  const [resumoBanco, setResumoBanco] = useState<ResumoEntradasBanco | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [busca, setBusca] = useState(() => localStorage.getItem('pontao_filtro_transferencias_busca') ?? '');
  const [filtroTipo, setFiltroTipo] = useState(() => localStorage.getItem('pontao_filtro_transferencias_tipo') ?? '');
  const [de, setDe] = useState(() => localStorage.getItem('pontao_filtro_transferencias_de') ?? '');
  const [ate, setAte] = useState(() => localStorage.getItem('pontao_filtro_transferencias_ate') ?? '');

  useEffect(() => {
    localStorage.setItem('pontao_filtro_transferencias_busca', busca);
  }, [busca]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_transferencias_tipo', filtroTipo);
  }, [filtroTipo]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_transferencias_de', de);
  }, [de]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_transferencias_ate', ate);
  }, [ate]);

  // Modal + formulário
  const [aberto, setAberto] = useState(false);
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [dataTransferencia, setDataTransferencia] = useState(() => hojeManaus());
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

  // Período do resumo "Entradas no banco": segue o filtro de datas; sem filtro = hoje.
  const periodoDe = de || ate || hojeManaus();
  const periodoAte = ate || de || hojeManaus();

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await resumoEntradasBanco(periodoDe, periodoAte);
        if (ativo) setResumoBanco(r);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [periodoDe, periodoAte]);

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
      const dataHora = dataTransferencia === hojeManaus()
        ? agoraManausISO()
        : `${dataTransferencia}T12:00:00-04:00`;
      await lancarTransferencia(
        uuidv7(),
        uuidv7(),
        contaOrigemId,
        contaDestinoId,
        valor,
        dataHora,
        descricao,
        usuarioId,
        ehDeposito,
      );
      toast.sucesso(ehDeposito ? 'Depósito registrado.' : 'Transferência realizada.');
      setAberto(false);
      setContaOrigemId('');
      setContaDestinoId('');
      setValorStr('');
      setDataTransferencia(hojeManaus());
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

      {resumoBanco && (
        <div className="cartao p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-claro">Entradas no banco</h2>
              <p className="text-[11px] text-suave">
                Quanto de cada canal caiu no banco — desconto da taxa em separado (não é da gaveta).
              </p>
            </div>
            <span className="numeros text-xs text-suave">
              {periodoDe === periodoAte
                ? formatarDataBR(periodoDe)
                : `${formatarDataBR(periodoDe)} – ${formatarDataBR(periodoAte)}`}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ResumoItem rotulo="PIX (líquido)" valor={resumoBanco.pix} />
            <ResumoItem rotulo="Débito (líquido)" valor={resumoBanco.debito} />
            <ResumoItem rotulo="Crédito (líquido)" valor={resumoBanco.credito} />
            <ResumoItem rotulo="Total no banco" valor={resumoBanco.totalLiquido} destaque />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-borda/40 pt-3 text-sm">
            <span className="text-suave">Desconto do banco (taxa de cartão)</span>
            <span className="numeros font-semibold text-negativo">
              −&nbsp;{formatReais(resumoBanco.taxa)}
            </span>
          </div>
        </div>
      )}

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
          <div className="rounded-lg bg-claro/5 px-3 py-2 text-xs text-suave">
            Operador responsável: <span className="font-semibold text-claro">{usuario.nome}</span>
          </div>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Data da operação" obrigatorio>
              <input
                type="date"
                className={CLASSE_CAMPO}
                value={dataTransferencia}
                onChange={(e) => setDataTransferencia(e.target.value)}
              />
            </Campo>
            <Campo label="Valor (R$)" obrigatorio>
              <input
                inputMode="decimal"
                className={`${CLASSE_CAMPO} numeros text-right`}
                placeholder="0,00"
                value={valorStr}
                onChange={(e) => setValorStr(e.target.value)}
              />
            </Campo>
          </div>
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

function ResumoItem({ rotulo, valor, destaque }: { rotulo: string; valor: Centavos; destaque?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        destaque ? 'border-positivo/50 bg-positivo/[0.06]' : 'border-borda/40'
      }`}
    >
      <p className={`text-[11px] font-medium uppercase tracking-wide ${destaque ? 'text-positivo' : 'text-suave'}`}>
        {rotulo}
      </p>
      <p className={`numeros mt-1 text-lg font-bold ${destaque ? 'text-positivo' : 'text-claro'}`}>
        {formatReais(valor)}
      </p>
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
