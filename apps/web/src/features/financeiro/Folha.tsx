import { useState, useEffect, type FormEvent } from 'react';
import {
  listarFuncionarios,
  salvarFuncionario,
  lancarVale,
  totalValesCompetencia,
  listarFechamentosFolha,
  gerarFechamentoFolha,
  listarContasCompletas,
  type Funcionario,
  type FechamentoFolha,
  type ContaCompleta,
} from '../../data/repositorios';
import { aReceberFolha } from '../../domain/folha';
import { uuidv7 } from '../../lib/uuidv7';
import { parseReais, formatReais, asCentavos, type Centavos } from '../../lib/money';
import { agoraManausISO } from '../../lib/datas';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';

function competenciaLabel(iso: string): string {
  const [a, m] = iso.split('-');
  return `${m}/${a}`;
}

/** Mês corrente em Manaus como AAAA-MM-01. */
function mesCorrente(): string {
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });
  return dia.slice(0, 8) + '01';
}

export function Folha({ usuarioId }: { usuarioId: string }) {
  const toast = useToast();
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [folhas, setFolhas] = useState<FechamentoFolha[]>([]);
  const [contas, setContas] = useState<ContaCompleta[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Modal funcionário
  const [funcAberto, setFuncAberto] = useState(false);
  const [editando, setEditando] = useState<Funcionario | null>(null);
  const [nome, setNome] = useState('');
  const [salarioStr, setSalarioStr] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Modal vale
  const [valeFunc, setValeFunc] = useState<Funcionario | null>(null);
  const [valeStr, setValeStr] = useState('');
  const [valeDesc, setValeDesc] = useState('');
  const [contaId, setContaId] = useState('');
  const [lancandoVale, setLancandoVale] = useState(false);

  // Modal fechar mês
  const [fecharFunc, setFecharFunc] = useState<Funcionario | null>(null);
  const [competencia, setCompetencia] = useState(mesCorrente());
  const [valesMes, setValesMes] = useState<Centavos | null>(null);
  const [carregandoVales, setCarregandoVales] = useState(false);
  const [gerando, setGerando] = useState(false);

  const caixaPadrao = contas.find((c) => c.tipo === 'dinheiro' && c.ativo);

  async function recarregar() {
    const [f, fo] = await Promise.all([listarFuncionarios(), listarFechamentosFolha()]);
    setFuncionarios(f);
    setFolhas(fo);
  }

  useEffect(() => {
    let ativoFlag = true;
    (async () => {
      try {
        const [f, fo, c] = await Promise.all([
          listarFuncionarios(),
          listarFechamentosFolha(),
          listarContasCompletas(),
        ]);
        if (!ativoFlag) return;
        setFuncionarios(f);
        setFolhas(fo);
        setContas(c.filter((x) => x.ativo));
      } catch (e) {
        console.error(e);
        if (ativoFlag) toast.erro('Falha ao carregar a folha.');
      } finally {
        if (ativoFlag) setCarregando(false);
      }
    })();
    return () => {
      ativoFlag = false;
    };
  }, [toast]);

  function abrirNovoFuncionario() {
    setEditando(null);
    setNome('');
    setSalarioStr('');
    setAtivo(true);
    setFuncAberto(true);
  }

  function abrirEditarFuncionario(f: Funcionario) {
    setEditando(f);
    setNome(f.nome);
    setSalarioStr(formatReais(f.salarioBase).replace('R$', '').trim());
    setAtivo(f.ativo);
    setFuncAberto(true);
  }

  async function aoSalvarFuncionario(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.erro('Informe o nome.');
      return;
    }
    setSalvando(true);
    try {
      await salvarFuncionario({
        id: editando?.id ?? uuidv7(),
        nome: nome.trim(),
        salarioBase: parseReais(salarioStr),
        ativo,
      });
      toast.sucesso('Funcionário salvo.');
      setFuncAberto(false);
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao salvar o funcionário.');
    } finally {
      setSalvando(false);
    }
  }

  function abrirVale(f: Funcionario) {
    setValeFunc(f);
    setValeStr('');
    setValeDesc('');
    setContaId(caixaPadrao?.id ?? '');
  }

  async function aoLancarVale(e: FormEvent) {
    e.preventDefault();
    if (!valeFunc) return;
    if (!contaId) {
      toast.erro('Selecione a conta de origem.');
      return;
    }
    const valor = parseReais(valeStr);
    if (valor <= 0n) {
      toast.erro('Informe um valor válido.');
      return;
    }
    setLancandoVale(true);
    try {
      await lancarVale(valeFunc.id, contaId, valor, agoraManausISO(), valeDesc.trim() || `Vale — ${valeFunc.nome}`, usuarioId);
      toast.sucesso('Vale lançado (saiu do caixa).');
      setValeFunc(null);
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao lançar o vale.');
    } finally {
      setLancandoVale(false);
    }
  }

  async function abrirFecharMes(f: Funcionario) {
    setFecharFunc(f);
    const comp = mesCorrente();
    setCompetencia(comp);
    await carregarVales(f, comp);
  }

  async function carregarVales(f: Funcionario, comp: string) {
    setCarregandoVales(true);
    setValesMes(null);
    try {
      setValesMes(await totalValesCompetencia(f.id, comp));
    } catch (e) {
      console.error(e);
      toast.erro('Falha ao somar os vales do mês.');
    } finally {
      setCarregandoVales(false);
    }
  }

  async function aoGerarFolha() {
    if (!fecharFunc || valesMes === null) return;
    const aReceber = aReceberFolha(fecharFunc.salarioBase, valesMes);
    setGerando(true);
    try {
      await gerarFechamentoFolha(fecharFunc.id, competencia, fecharFunc.salarioBase, valesMes, aReceber);
      toast.sucesso('Folha do mês fechada.');
      setFecharFunc(null);
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao fechar a folha.');
    } finally {
      setGerando(false);
    }
  }

  const colFunc: Coluna<Funcionario>[] = [
    { chave: 'nome', titulo: 'Funcionário', render: (f) => <span className="font-medium text-claro">{f.nome}</span> },
    { chave: 'salario', titulo: 'Salário base', alinhar: 'right', render: (f) => <span className="numeros text-claro">{formatReais(f.salarioBase)}</span> },
    {
      chave: 'status',
      titulo: 'Status',
      render: (f) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${f.ativo ? 'bg-positivo/10 text-positivo' : 'bg-claro/[0.06] text-suave'}`}>
          {f.ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: '',
      alinhar: 'right',
      render: (f) => (
        <div className="flex justify-end gap-1.5">
          <button type="button" className="btn btn-suave px-2.5 py-1.5 text-xs" onClick={() => abrirVale(f)}>
            Vale
          </button>
          <button type="button" className="btn btn-suave px-2.5 py-1.5 text-xs" onClick={() => void abrirFecharMes(f)}>
            Fechar mês
          </button>
          <button type="button" className="btn btn-suave px-2.5 py-1.5 text-xs" onClick={() => abrirEditarFuncionario(f)}>
            Editar
          </button>
        </div>
      ),
    },
  ];

  const colFolha: Coluna<FechamentoFolha>[] = [
    { chave: 'comp', titulo: 'Competência', render: (l) => <span className="text-claro">{competenciaLabel(l.competencia)}</span> },
    { chave: 'func', titulo: 'Funcionário', render: (l) => <span className="text-claro">{l.funcionarioNome ?? '—'}</span> },
    { chave: 'salario', titulo: 'Salário', alinhar: 'right', render: (l) => <span className="numeros text-suave">{formatReais(l.salarioBase)}</span> },
    { chave: 'vales', titulo: 'Vales', alinhar: 'right', render: (l) => <span className="numeros text-suave">{formatReais(l.totalVales)}</span> },
    {
      chave: 'receber',
      titulo: 'A receber',
      alinhar: 'right',
      render: (l) => <span className={`numeros font-semibold ${l.aReceber < 0n ? 'text-negativo' : 'text-claro'}`}>{formatReais(l.aReceber)}</span>,
    },
  ];

  const aReceberPrevisto = fecharFunc && valesMes !== null ? aReceberFolha(fecharFunc.salarioBase, valesMes) : asCentavos(0n);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Folha"
        subtitulo="Funcionários, vales e fechamento mensal (salário − vales)"
        acao={
          <button type="button" onClick={abrirNovoFuncionario} className="btn btn-primario px-4 py-2 text-sm">
            <IconePlus /> Novo funcionário
          </button>
        }
      />

      <DataTable
        colunas={colFunc}
        dados={funcionarios}
        chaveLinha={(f) => f.id}
        carregando={carregando}
        vazio="Nenhum funcionário cadastrado."
      />

      <div>
        <h2 className="mb-3 px-1 font-display text-lg font-semibold text-claro">Fechamentos de folha</h2>
        <DataTable
          colunas={colFolha}
          dados={folhas}
          chaveLinha={(l) => l.id}
          carregando={carregando}
          vazio="Nenhuma folha fechada ainda."
        />
      </div>

      {/* Modal: funcionário */}
      <Modal aberto={funcAberto} aoFechar={() => setFuncAberto(false)} titulo={editando ? 'Editar funcionário' : 'Novo funcionário'}>
        <form onSubmit={aoSalvarFuncionario} className="flex flex-col gap-4">
          <Campo label="Nome" obrigatorio>
            <input className={CLASSE_CAMPO} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Souza" />
          </Campo>
          <Campo label="Salário base (R$)" obrigatorio>
            <input
              inputMode="decimal"
              className={`${CLASSE_CAMPO} numeros text-right`}
              placeholder="0,00"
              value={salarioStr}
              onChange={(e) => setSalarioStr(e.target.value)}
            />
          </Campo>
          <label className="flex items-center gap-2 text-sm text-claro">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativo
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setFuncAberto(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: vale */}
      <Modal
        aberto={valeFunc !== null}
        aoFechar={() => setValeFunc(null)}
        titulo="Lançar vale"
        descricao="Adiantamento que sai do caixa hoje e desconta do salário no fechamento do mês."
      >
        {valeFunc && (
          <form onSubmit={aoLancarVale} className="flex flex-col gap-4">
            <p className="text-sm text-suave">
              Funcionário: <span className="font-medium text-claro">{valeFunc.nome}</span>
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Valor (R$)" obrigatorio>
                <input
                  inputMode="decimal"
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  placeholder="0,00"
                  value={valeStr}
                  onChange={(e) => setValeStr(e.target.value)}
                />
              </Campo>
              <Campo label="Conta de origem" obrigatorio>
                <select aria-label="Conta de origem" className={CLASSE_CAMPO} value={contaId} onChange={(e) => setContaId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.tipo})
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <Campo label="Descrição">
              <input className={CLASSE_CAMPO} value={valeDesc} onChange={(e) => setValeDesc(e.target.value)} placeholder="Ex.: Vale ref. quinzena" />
            </Campo>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setValeFunc(null)}>
                Cancelar
              </button>
              <button type="submit" disabled={lancandoVale} className="btn btn-primario px-4 py-2 text-sm">
                {lancandoVale ? 'Lançando…' : 'Lançar vale'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: fechar mês */}
      <Modal
        aberto={fecharFunc !== null}
        aoFechar={() => setFecharFunc(null)}
        titulo="Fechar folha do mês"
        descricao="a_receber = salário base − vales do período."
      >
        {fecharFunc && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-suave">
              Funcionário: <span className="font-medium text-claro">{fecharFunc.nome}</span>
            </p>
            <Campo label="Competência (mês)">
              <input
                type="month"
                aria-label="Competência (mês)"
                className={CLASSE_CAMPO}
                value={competencia.slice(0, 7)}
                onChange={(e) => {
                  const comp = `${e.target.value}-01`;
                  setCompetencia(comp);
                  void carregarVales(fecharFunc, comp);
                }}
              />
            </Campo>
            <div className="cartao flex flex-col gap-2 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-suave">Salário base</span>
                <span className="numeros text-claro">{formatReais(fecharFunc.salarioBase)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-suave">Vales no mês</span>
                <span className="numeros text-claro">{carregandoVales ? '…' : formatReais(valesMes ?? asCentavos(0n))}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-borda pt-2">
                <span className="font-medium text-claro">A receber</span>
                <span className={`numeros font-semibold ${aReceberPrevisto < 0n ? 'text-negativo' : 'text-positivo'}`}>
                  {formatReais(aReceberPrevisto)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setFecharFunc(null)}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={gerando || carregandoVales || valesMes === null}
                className="btn btn-primario px-4 py-2 text-sm"
                onClick={() => void aoGerarFolha()}
              >
                {gerando ? 'Fechando…' : 'Fechar folha'}
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
