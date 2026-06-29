import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { listarAuditoria, type AuditoriaLog } from '../../data/repositorios';
import { formatReais, type Centavos } from '../../lib/money';
import { formatarDataHora, diaIso } from '../../lib/formato';
import { useToast } from '../../components/ui/Toast';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { CLASSE_CAMPO } from '../../components/ui/Campo';
import { Avatar } from '../../components/ui/Avatar';

const ACOES: Record<string, { label: string; cls: string }> = {
  criar: { label: 'Criar', cls: 'bg-positivo/15 text-positivo' },
  editar: { label: 'Editar', cls: 'bg-ambar/15 text-ambar' },
  remover: { label: 'Remover', cls: 'bg-negativo/15 text-negativo' },
  reabrir: { label: 'Reabrir', cls: 'bg-ambar/15 text-ambar' },
  ajustar: { label: 'Ajustar', cls: 'bg-claro/10 text-claro' },
};

function Acao({ acao }: { acao: string }) {
  const meta = ACOES[acao];
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
        meta?.cls ?? 'bg-claro/10 text-suave'
      }`}
    >
      {meta?.label ?? acao}
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatarValor(val: any): string {
  if (typeof val === 'number') {
    if (Math.abs(val) > 100 && Number.isInteger(val)) {
      return formatReais(BigInt(val) as Centavos);
    }
    return String(val);
  }
  if (typeof val === 'object' && val !== null) {
    return JSON.stringify(val);
  }
  return String(val ?? '');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Detalhes({ antes, depois }: { antes: any; depois: any }): ReactNode {
  if (!antes && !depois) return <span className="text-suave">Sem detalhes</span>;

  const a = antes || {};
  const d = depois || {};
  const chaves = Array.from(new Set([...Object.keys(a), ...Object.keys(d)]));

  return (
    <div className="flex flex-col gap-1 text-xs text-suave">
      {chaves.map((k) => {
        const va = a[k];
        const vd = d[k];
        if (JSON.stringify(va) === JSON.stringify(vd)) return null;
        return (
          <div key={k} className="flex flex-wrap items-center gap-1 border-b border-borda py-1 last:border-0">
            <span className="font-semibold text-ambar">{k}:</span>
            {va !== undefined && (
              <span className="rounded bg-negativo/10 px-1 text-negativo line-through">{formatarValor(va)}</span>
            )}
            <span>→</span>
            {vd !== undefined && (
              <span className="rounded bg-positivo/10 px-1 text-positivo">{formatarValor(vd)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Auditoria() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditoriaLog[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState(() => localStorage.getItem('pontao_filtro_auditoria_busca') ?? '');
  const [filtroAcao, setFiltroAcao] = useState(() => localStorage.getItem('pontao_filtro_auditoria_acao') ?? '');
  const [filtroEntidade, setFiltroEntidade] = useState(() => localStorage.getItem('pontao_filtro_auditoria_entidade') ?? '');
  const [de, setDe] = useState(() => localStorage.getItem('pontao_filtro_auditoria_de') ?? '');
  const [ate, setAte] = useState(() => localStorage.getItem('pontao_filtro_auditoria_ate') ?? '');

  useEffect(() => {
    localStorage.setItem('pontao_filtro_auditoria_busca', busca);
  }, [busca]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_auditoria_acao', filtroAcao);
  }, [filtroAcao]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_auditoria_entidade', filtroEntidade);
  }, [filtroEntidade]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_auditoria_de', de);
  }, [de]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_auditoria_ate', ate);
  }, [ate]);

  useEffect(() => {
    let ativo = true;
    listarAuditoria()
      .then((l) => {
        if (ativo) setLogs(l);
      })
      .catch((e) => {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar a auditoria.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [toast]);

  const entidades = useMemo(() => Array.from(new Set(logs.map((l) => l.entidade))).sort(), [logs]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return logs.filter((l) => {
      if (filtroAcao && l.acao !== filtroAcao) return false;
      if (filtroEntidade && l.entidade !== filtroEntidade) return false;
      const dia = diaIso(l.criadoEm);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      if (termo) {
        const alvo = `${l.usuarioNome ?? ''} ${l.entidade} ${l.entidadeId} ${l.acao}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [logs, filtroAcao, filtroEntidade, de, ate, busca]);

  const temFiltro = busca || filtroAcao || filtroEntidade || de || ate;

  const colunas: Coluna<AuditoriaLog>[] = [
    {
      chave: 'data',
      titulo: 'Data / hora',
      render: (l) => <span className="numeros whitespace-nowrap text-xs text-suave">{formatarDataHora(l.criadoEm)}</span>,
    },
    {
      chave: 'usuario',
      titulo: 'Usuário',
      render: (l) => (
        <div className="flex items-center gap-2">
          <Avatar nome={l.usuarioNome ?? '?'} fotoUrl={l.usuarioFoto} size="xs" />
          <span className="font-medium text-claro">{l.usuarioNome}</span>
        </div>
      ),
    },
    { chave: 'acao', titulo: 'Ação', render: (l) => <Acao acao={l.acao} /> },
    {
      chave: 'entidade',
      titulo: 'Entidade',
      render: (l) => (
        <div className="text-xs">
          <span className="font-semibold capitalize text-claro">{l.entidade}</span>
          <span className="block font-mono text-[10px] text-suave">{l.entidadeId}</span>
        </div>
      ),
    },
    {
      chave: 'alteracoes',
      titulo: 'Alterações',
      render: (l) => <Detalhes antes={l.dadosAntes} depois={l.dadosDepois} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader titulo="Auditoria" subtitulo="Rastro imutável de ações financeiras e operacionais críticas" />

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-medium text-suave">Buscar</label>
          <input
            className={CLASSE_CAMPO}
            placeholder="Usuário, entidade, ID…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-suave">Ação</label>
          <select aria-label="Filtrar por ação" className={CLASSE_CAMPO} value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ACOES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-suave">Entidade</label>
          <select aria-label="Filtrar por entidade" className={CLASSE_CAMPO} value={filtroEntidade} onChange={(e) => setFiltroEntidade(e.target.value)}>
            <option value="">Todas</option>
            {entidades.map((ent) => (
              <option key={ent} value={ent}>
                {ent}
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
              setFiltroAcao('');
              setFiltroEntidade('');
              setDe('');
              setAte('');
            }}
          >
            Limpar
          </button>
        )}
      </div>

      <div className="px-1 text-sm text-suave">
        {filtrados.length} {filtrados.length === 1 ? 'registro' : 'registros'}
      </div>

      <DataTable
        colunas={colunas}
        dados={filtrados}
        chaveLinha={(l) => l.id}
        carregando={carregando}
        vazio={temFiltro ? 'Nenhum registro nesse filtro.' : 'Nenhum registro de auditoria encontrado.'}
      />
    </div>
  );
}
