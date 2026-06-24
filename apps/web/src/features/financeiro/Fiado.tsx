import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
  listarFiadosEmAberto,
  salvarClienteFiado,
  receberFiado,
  listarContasCompletas,
  type FiadoEmAberto,
  type ContaCompleta,
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { somar, formatReais, type Centavos } from '../../lib/money';
import { agoraManausISO } from '../../lib/datas';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';

function formatarData(iso: string): string {
  // `data` é DATE puro (YYYY-MM-DD), sem fuso — formata direto.
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function Fiado({ usuarioId }: { usuarioId: string }) {
  const toast = useToast();
  const [fiados, setFiados] = useState<FiadoEmAberto[]>([]);
  const [contas, setContas] = useState<ContaCompleta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');

  // Modal cliente
  const [clienteAberto, setClienteAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [contato, setContato] = useState('');
  const [salvandoCliente, setSalvandoCliente] = useState(false);

  // Modal receber
  const [aReceber, setAReceber] = useState<FiadoEmAberto | null>(null);
  const [recebendo, setRecebendo] = useState(false);

  const contaCaixa = contas.find((c) => c.tipo === 'dinheiro' && c.ativo) ?? contas.find((c) => c.tipo === 'dinheiro');

  async function recarregar() {
    setFiados(await listarFiadosEmAberto());
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [f, c] = await Promise.all([listarFiadosEmAberto(), listarContasCompletas()]);
        if (!ativo) return;
        setFiados(f);
        setContas(c);
      } catch (e) {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar os fiados.');
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
    if (!termo) return fiados;
    return fiados.filter((f) => f.clienteNome.toLowerCase().includes(termo));
  }, [fiados, busca]);

  const totalAReceber: Centavos = useMemo(() => somar(...filtrados.map((f) => f.valor)), [filtrados]);

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });

  async function aoSalvarCliente(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.erro('Informe o nome do cliente.');
      return;
    }
    setSalvandoCliente(true);
    try {
      await salvarClienteFiado({ id: uuidv7(), nome: nome.trim(), contato: contato.trim() || null });
      toast.sucesso('Cliente cadastrado.');
      setClienteAberto(false);
      setNome('');
      setContato('');
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao cadastrar o cliente.');
    } finally {
      setSalvandoCliente(false);
    }
  }

  async function aoReceber() {
    if (!aReceber) return;
    if (!contaCaixa) {
      toast.erro('Nenhuma conta de dinheiro (caixa) cadastrada.');
      return;
    }
    setRecebendo(true);
    try {
      await receberFiado(aReceber.id, contaCaixa.id, aReceber.valor, agoraManausISO(), usuarioId);
      toast.sucesso('Fiado recebido. Entrou no caixa.');
      setAReceber(null);
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao receber o fiado.');
    } finally {
      setRecebendo(false);
    }
  }

  const colunas: Coluna<FiadoEmAberto>[] = [
    { chave: 'cliente', titulo: 'Cliente', render: (f) => <span className="font-medium text-claro">{f.clienteNome}</span> },
    { chave: 'data', titulo: 'Concedido em', render: (f) => <span className="text-suave">{formatarData(f.data)}</span> },
    {
      chave: 'vencimento',
      titulo: 'Vencimento',
      render: (f) => {
        if (!f.vencimento) return <span className="text-suave">—</span>;
        const vencido = f.vencimento < hoje;
        return (
          <span className={vencido ? 'font-medium text-negativo' : 'text-suave'}>
            {formatarData(f.vencimento)}
            {vencido && ' (vencido)'}
          </span>
        );
      },
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      alinhar: 'right',
      render: (f) => <span className="numeros font-semibold text-claro">{formatReais(f.valor)}</span>,
    },
    {
      chave: 'acao',
      titulo: '',
      alinhar: 'right',
      render: (f) => (
        <button type="button" className="btn btn-suave px-3 py-1.5 text-xs" onClick={() => setAReceber(f)}>
          Receber
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Fiado"
        subtitulo="Contas a receber — concessões abertas e baixa por recebimento"
        acao={
          <button type="button" onClick={() => setClienteAberto(true)} className="btn btn-primario px-4 py-2 text-sm">
            <IconePlus /> Novo cliente
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="cartao p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-suave">Total a receber</p>
          <p className="numeros mt-2 text-2xl font-semibold text-claro">{formatReais(totalAReceber)}</p>
        </div>
        <div className="cartao p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-suave">Fiados em aberto</p>
          <p className="numeros mt-2 text-2xl font-semibold text-claro">{filtrados.length}</p>
        </div>
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-suave">Buscar cliente</label>
          <input
            className={CLASSE_CAMPO}
            placeholder="Nome do cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      <DataTable
        colunas={colunas}
        dados={filtrados}
        chaveLinha={(f) => f.id}
        carregando={carregando}
        vazio={busca ? 'Nenhum fiado nesse filtro.' : 'Nenhum fiado em aberto.'}
      />

      {/* Modal: novo cliente */}
      <Modal
        aberto={clienteAberto}
        aoFechar={() => setClienteAberto(false)}
        titulo="Novo cliente de fiado"
        descricao="O fiado em si é concedido no Fechamento do dia; aqui você cadastra o cliente."
      >
        <form onSubmit={aoSalvarCliente} className="flex flex-col gap-4">
          <Campo label="Nome" obrigatorio>
            <input className={CLASSE_CAMPO} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João da Silva" />
          </Campo>
          <Campo label="Contato">
            <input className={CLASSE_CAMPO} value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Telefone / referência" />
          </Campo>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setClienteAberto(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={salvandoCliente} className="btn btn-primario px-4 py-2 text-sm">
              {salvandoCliente ? 'Salvando…' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: receber fiado */}
      <Modal
        aberto={aReceber !== null}
        aoFechar={() => setAReceber(null)}
        titulo="Receber fiado"
        descricao="Entra como dinheiro no caixa e quita o recebível. Não conta como venda do dia."
      >
        {aReceber && (
          <div className="flex flex-col gap-4">
            <div className="cartao p-4">
              <p className="text-sm text-suave">{aReceber.clienteNome}</p>
              <p className="numeros mt-1 text-2xl font-semibold text-claro">{formatReais(aReceber.valor)}</p>
              <p className="mt-2 text-xs text-suave">
                Crédito em: <span className="text-claro">{contaCaixa?.nome ?? '—'}</span>
              </p>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setAReceber(null)}>
                Cancelar
              </button>
              <button type="button" disabled={recebendo} className="btn btn-primario px-4 py-2 text-sm" onClick={() => void aoReceber()}>
                {recebendo ? 'Recebendo…' : 'Confirmar recebimento'}
              </button>
            </div>
          </div>
        )}
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
