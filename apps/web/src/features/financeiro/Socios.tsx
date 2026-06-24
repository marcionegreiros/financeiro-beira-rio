import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
  listarSocios,
  listarContasCompletas,
  lancarOperacaoSocio,
  listarMovimentos,
  type Socio,
  type ContaCompleta,
  type MovimentoLista,
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { parseReais, formatReais, negar } from '../../lib/money';
import { agoraManausISO } from '../../lib/datas';
import { formatarDataHora, diaIso } from '../../lib/formato';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';

type TipoOperacao = 'aporte_emprestimo' | 'aporte_aumento' | 'devolucao_emprestimo' | 'prolabore';

const OPERACOES: Record<string, { label: string; entrada: boolean }> = {
  aporte_emprestimo: { label: 'Aporte (empréstimo)', entrada: true },
  aporte_aumento: { label: 'Aporte (capital)', entrada: true },
  devolucao_emprestimo: { label: 'Devolução', entrada: false },
  prolabore: { label: 'Pró-labore', entrada: false },
};

export function Socios({ usuarioId }: { usuarioId: string }) {
  const toast = useToast();
  const [socios, setSocios] = useState<Socio[]>([]);
  const [contas, setContas] = useState<ContaCompleta[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentoLista[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroSocio, setFiltroSocio] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  // Modal + formulário
  const [aberto, setAberto] = useState(false);
  const [socioId, setSocioId] = useState('');
  const [contaId, setContaId] = useState('');
  const [tipoOperacao, setTipoOperacao] = useState<TipoOperacao>('prolabore');
  const [valorStr, setValorStr] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const tiposSocio = Object.keys(OPERACOES);

  async function recarregar() {
    setMovimentos(await listarMovimentos(tiposSocio));
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [s, c, movs] = await Promise.all([
          listarSocios(),
          listarContasCompletas(),
          listarMovimentos(tiposSocio),
        ]);
        if (!ativo) return;
        setSocios(s);
        setContas(c.filter((x) => x.ativo));
        setMovimentos(movs);
      } catch (e) {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar as operações de sócios.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return movimentos.filter((m) => {
      if (filtroSocio && m.socioNome !== filtroSocio) return false;
      if (filtroTipo && m.tipo !== filtroTipo) return false;
      const dia = diaIso(m.dataHora);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      if (termo) {
        const alvo = `${m.descricao ?? ''} ${m.socioNome ?? ''} ${m.contaNome ?? ''}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [movimentos, filtroSocio, filtroTipo, de, ate, busca]);

  const temFiltro = busca || filtroSocio || filtroTipo || de || ate;

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    if (!socioId || !contaId) {
      toast.erro('Selecione o sócio e a conta.');
      return;
    }
    const valor = parseReais(valorStr);
    if (valor <= 0n) {
      toast.erro('Informe um valor válido.');
      return;
    }
    setSalvando(true);
    try {
      await lancarOperacaoSocio(uuidv7(), tipoOperacao, socioId, contaId, valor, agoraManausISO(), descricao, usuarioId);
      toast.sucesso('Operação registrada.');
      setAberto(false);
      setValorStr('');
      setDescricao('');
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao registrar a operação.');
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
    { chave: 'socio', titulo: 'Sócio', render: (m) => <span className="font-medium text-claro">{m.socioNome ?? '—'}</span> },
    {
      chave: 'operacao',
      titulo: 'Operação',
      render: (m) => (
        <span className="inline-flex rounded-full bg-claro/[0.06] px-2 py-0.5 text-xs font-medium text-claro">
          {OPERACOES[m.tipo]?.label ?? m.tipo}
        </span>
      ),
    },
    { chave: 'conta', titulo: 'Conta', render: (m) => <span className="text-suave">{m.contaNome ?? '—'}</span> },
    {
      chave: 'valor',
      titulo: 'Valor',
      alinhar: 'right',
      render: (m) => {
        const entrada = m.valorCentavos > 0n;
        return (
          <span className={`numeros font-semibold ${entrada ? 'text-positivo' : 'text-negativo'}`}>
            {entrada ? '+' : '−'}
            {formatReais(m.valorCentavos < 0n ? negar(m.valorCentavos) : m.valorCentavos)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Sócios"
        subtitulo="Aportes, pró-labore e devoluções de empréstimo"
        acao={
          <button type="button" onClick={() => setAberto(true)} className="btn btn-primario px-4 py-2 text-sm">
            <IconePlus /> Nova operação
          </button>
        }
      />

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-suave">Buscar</label>
          <input
            className={CLASSE_CAMPO}
            placeholder="Sócio, conta ou descrição…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-suave">Sócio</label>
          <select aria-label="Filtrar por sócio" className={CLASSE_CAMPO} value={filtroSocio} onChange={(e) => setFiltroSocio(e.target.value)}>
            <option value="">Todos</option>
            {socios.map((s) => (
              <option key={s.id} value={s.nome}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[150px]">
          <label className="mb-1 block text-xs font-medium text-suave">Operação</label>
          <select aria-label="Filtrar por operação" className={CLASSE_CAMPO} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(OPERACOES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
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
              setFiltroSocio('');
              setFiltroTipo('');
              setDe('');
              setAte('');
            }}
          >
            Limpar
          </button>
        )}
      </div>

      <div className="px-1 text-sm text-suave">
        {filtrados.length} {filtrados.length === 1 ? 'operação' : 'operações'}
      </div>

      <DataTable
        colunas={colunas}
        dados={filtrados}
        chaveLinha={(m) => m.id}
        carregando={carregando}
        vazio={temFiltro ? 'Nenhuma operação nesse filtro.' : 'Nenhuma operação registrada ainda.'}
      />

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Nova operação de sócio"
        descricao="Aportes aumentam o caixa; pró-labore e devoluções reduzem."
      >
        <form onSubmit={aoSalvar} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Sócio" obrigatorio>
              <select aria-label="Sócio" className={CLASSE_CAMPO} value={socioId} onChange={(e) => setSocioId(e.target.value)}>
                <option value="">Selecione…</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Tipo de operação" obrigatorio>
              <select
                aria-label="Tipo de operação"
                className={CLASSE_CAMPO}
                value={tipoOperacao}
                onChange={(e) => setTipoOperacao(e.target.value as TipoOperacao)}
              >
                {Object.entries(OPERACOES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Conta impactada" obrigatorio>
              <select aria-label="Conta impactada" className={CLASSE_CAMPO} value={contaId} onChange={(e) => setContaId(e.target.value)}>
                <option value="">Selecione…</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.tipo})
                  </option>
                ))}
              </select>
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
              placeholder="Ex.: Retirada mensal ref. junho"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </Campo>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setAberto(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
              {salvando ? 'Salvando…' : 'Registrar'}
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
