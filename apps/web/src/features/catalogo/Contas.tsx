import { useState, useEffect, type FormEvent } from 'react';
import {
  listarContasCompletas,
  salvarConta,
  uploadFotoConta,
  removerConta,
  type ContaCompleta,
  temFechamentoOperacional,
  definirSaldoInicialConta,
  buscarSaldoInicialConta
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { asCentavos } from '../../lib/money';
import { PageHeader } from '../../components/ui/PageHeader';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import { Avatar } from '../../components/ui/Avatar';

const TIPOS: Record<string, string> = {
  dinheiro: 'Dinheiro (Físico)',
  banco: 'Banco',
};

export function Contas() {
  const toast = useToast();
  const [contas, setContas] = useState<ContaCompleta[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Modal + formulário
  const [aberto, setAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'dinheiro' | 'banco'>('dinheiro');
  const [ehDestinoPadraoVenda, setEhDestinoPadraoVenda] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [saldoInicial, setSaldoInicial] = useState('');
  const [bloquearDiaZero, setBloquearDiaZero] = useState(false);

  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  async function carregar() {
    try {
      const dados = await listarContasCompletas();
      setContas(dados);
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar contas.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    temFechamentoOperacional().then(setBloquearDiaZero).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limparForm() {
    setEditandoId(null);
    setNome('');
    setTipo('dinheiro');
    setEhDestinoPadraoVenda(false);
    setAtivo(true);
    setFotoFile(null);
    setFotoPreview(null);
    setSaldoInicial('');
  }

  function abrirNova() {
    limparForm();
    setAberto(true);
  }

  function abrirEditar(conta: ContaCompleta) {
    setEditandoId(conta.id);
    setNome(conta.nome);
    setTipo(conta.tipo as 'dinheiro' | 'banco');
    setEhDestinoPadraoVenda(conta.ehDestinoPadraoVenda);
    setAtivo(conta.ativo);
    setFotoFile(null);
    setFotoPreview(conta.fotoUrl ?? null);
    setSaldoInicial('');

    buscarSaldoInicialConta(conta.id)
      .then((val) => {
        if (val !== null) {
          const reais = Number(val) / 100;
          setSaldoInicial(reais.toFixed(2).replace('.', ','));
        }
      })
      .catch(console.error);

    setAberto(true);
  }

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.erro('Informe o nome da conta.');
      return;
    }
    setSalvando(true);
    try {
      const id = editandoId ?? uuidv7();
      let fUrl = editandoId ? (contas.find(c => c.id === editandoId)?.fotoUrl ?? null) : null;

      if (fotoFile) {
        fUrl = await uploadFotoConta(id, fotoFile);
      } else if (fotoPreview === null) {
        fUrl = null;
      }

      const conta: ContaCompleta = {
        id,
        nome: nome.trim(),
        tipo,
        ehDestinoPadraoVenda,
        ativo,
        fotoUrl: fUrl,
      };
      await salvarConta(conta);

      if (!bloquearDiaZero && saldoInicial.trim() !== '') {
        const clean = saldoInicial.trim().replace(/\./g, '').replace(',', '.');
        const num = Number(clean);
        if (!isNaN(num)) {
          const centavos = asCentavos(BigInt(Math.round(num * 100)));
          await definirSaldoInicialConta(id, centavos, null);
        }
      }

      toast.sucesso(editandoId ? 'Conta atualizada.' : 'Conta criada.');
      setAberto(false);
      limparForm();
      await carregar();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao salvar conta.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoExcluir(c: ContaCompleta) {
    if (!confirm(`Excluir a conta "${c.nome}"? Esta ação é definitiva.`)) return;
    try {
      await removerConta(c.id);
      toast.sucesso('Conta excluída.');
      await carregar();
    } catch (err) {
      console.error(err);
      toast.erro(
        (err as Error)?.message === 'NAO_EXCLUIDO'
          ? 'Esta conta já tem movimentos lançados — apenas inative-a.'
          : 'Erro ao excluir conta.',
      );
    }
  }

  const colunas: Coluna<ContaCompleta>[] = [
    {
      chave: 'nome',
      titulo: 'Nome',
      render: (c) => (
        <div className="flex items-center gap-3">
          <Avatar nome={c.nome} fotoUrl={c.fotoUrl} size="sm" />
          <span className="font-medium text-claro">{c.nome}</span>
        </div>
      ),
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      render: (c) => (
        <span className="inline-flex items-center gap-1.5 text-suave">
          {c.tipo === 'banco' ? <IconeBanco /> : <IconeDinheiro />}
          {TIPOS[c.tipo] ?? c.tipo}
        </span>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      render: (c) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            c.ativo ? 'bg-positivo/20 text-positivo' : 'bg-claro/10 text-claro/50'
          }`}
        >
          {c.ativo ? 'Ativa' : 'Inativa'}
        </span>
      ),
    },
    {
      chave: 'destino',
      titulo: 'Destino Venda',
      render: (c) =>
        c.ehDestinoPadraoVenda ? (
          <span className="inline-flex rounded-full border border-ambar/30 px-2 py-0.5 text-xs font-medium text-ambar">
            Padrão
          </span>
        ) : (
          <span className="text-suave">—</span>
        ),
    },
    {
      chave: 'acoes',
      titulo: '',
      alinhar: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => abrirEditar(c)}
            className="rounded-md px-2 py-1 text-xs font-medium text-suave transition-colors hover:bg-claro/10 hover:text-ambar"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => void aoExcluir(c)}
            title="Excluir (só se nunca usada)"
            className="rounded-md px-2 py-1 text-xs font-medium text-negativo transition-colors hover:bg-negativo/10"
          >
            Excluir
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Contas"
        subtitulo="Gerencie as contas físicas e bancárias"
        acao={
          <button type="button" onClick={abrirNova} className="btn btn-primario px-4 py-2 text-sm">
            <IconePlus /> Nova conta
          </button>
        }
      />

      <div className="flex items-center justify-end px-1 text-sm text-suave">
        <span>{contas.length} {contas.length === 1 ? 'conta' : 'contas'} cadastradas</span>
      </div>

      <DataTable
        colunas={colunas}
        dados={contas}
        chaveLinha={(c) => c.id}
        carregando={carregando}
        vazio="Nenhuma conta cadastrada ainda."
      />

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={editandoId ? 'Editar conta' : 'Nova conta'}
        descricao="Configure a conta onde o dinheiro será rastreado."
      >
        <form onSubmit={aoSalvar} className="flex flex-col gap-4">
          <div className="flex items-center gap-4 border-b border-borda/30 pb-3">
            <Avatar nome={nome || 'Conta'} fotoUrl={fotoPreview} size="lg" />
            <label className="btn btn-suave cursor-pointer px-3 py-1.5 text-xs">
              Inserir foto da conta
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setFotoFile(f);
                  setFotoPreview(URL.createObjectURL(f));
                }}
              />
            </label>
            {fotoPreview && (
              <button
                type="button"
                onClick={() => {
                  setFotoFile(null);
                  setFotoPreview(null);
                }}
                className="text-xs text-suave hover:text-negativo transition-colors"
              >
                Remover foto
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nome da conta" obrigatorio>
              <input
                className={CLASSE_CAMPO}
                placeholder="Ex.: Caixa Físico, Bradesco"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Campo>
            <Campo label="Tipo" obrigatorio>
              <select
                aria-label="Tipo da conta"
                className={CLASSE_CAMPO}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'dinheiro' | 'banco')}
              >
                {Object.entries(TIPOS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(editandoId === null || !bloquearDiaZero || saldoInicial !== '') && (
              <Campo 
                label={bloquearDiaZero ? "Saldo inicial (Dia Zero) [Bloqueado]" : "Saldo inicial (Dia Zero)"}
                dica={bloquearDiaZero ? "Bloqueado pois já existem fechamentos posteriores" : "Saldo de partida da conta"}
              >
                <input
                  type="text"
                  disabled={bloquearDiaZero}
                  className={`${CLASSE_CAMPO} ${bloquearDiaZero ? 'bg-claro/5 cursor-not-allowed text-suave' : ''}`}
                  placeholder="0,00"
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(e.target.value)}
                />
              </Campo>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 text-sm text-claro">
              <input
                type="checkbox"
                checked={ehDestinoPadraoVenda}
                onChange={(e) => setEhDestinoPadraoVenda(e.target.checked)}
                className="rounded border-borda bg-transparent text-ambar focus:ring-ambar"
              />
              Destino padrão da venda
            </label>
            <label className="flex items-center gap-2 text-sm text-claro">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="rounded border-borda bg-transparent text-ambar focus:ring-ambar"
              />
              Conta ativa
            </label>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setAberto(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Criar conta'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ────────────────── Ícones inline ────────────────── */

function IconePlus() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconeBanco() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21" />
    </svg>
  );
}

function IconeDinheiro() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  );
}
