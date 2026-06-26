import { useState, useEffect, type FormEvent } from 'react';
import {
  listarFuncionarios,
  salvarFuncionario,
  lancarVale,
  totalValesCompetencia,
  listarFechamentosFolha,
  gerarFechamentoFolha,
  listarContasCompletas,
  pagarFechamentoFolha,
  listarMovimentos,
  removerDespesa,
  removerFuncionario,
  obterValesFuncionariosMes,
  type Funcionario,
  type FechamentoFolha,
  type ContaCompleta,
  type MovimentoLista,
} from '../../data/repositorios';
import { aReceberFolha } from '../../domain/folha';
import { uuidv7 } from '../../lib/uuidv7';
import { parseReais, formatReais, asCentavos, negar, type Centavos } from '../../lib/money';
import { agoraManausISO } from '../../lib/datas';
import { formatarDataHora } from '../../lib/formato';
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
  const [aba, setAba] = useState<'folha' | 'vales'>('folha');
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [folhas, setFolhas] = useState<FechamentoFolha[]>([]);
  const [contas, setContas] = useState<ContaCompleta[]>([]);
  const [vales, setVales] = useState<MovimentoLista[]>([]);
  const [valesMesFuncionarios, setValesMesFuncionarios] = useState<Record<string, Centavos>>({});
  const [carregando, setCarregando] = useState(true);
  const [carregandoValesLista, setCarregandoValesLista] = useState(false);

  // Modal funcionário
  const [funcAberto, setFuncAberto] = useState(false);
  const [editando, setEditando] = useState<Funcionario | null>(null);
  const [nome, setNome] = useState('');
  const [salarioStr, setSalarioStr] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Modal vale
  const [modalValeAberto, setModalValeAberto] = useState(false);
  const [valeFunc, setValeFunc] = useState<Funcionario | null>(null);
  const [funcionarioIdVale, setFuncionarioIdVale] = useState('');
  const [valeStr, setValeStr] = useState('');
  const [valeDesc, setValeDesc] = useState('');
  const [contaId, setContaId] = useState('');
  const [lancandoVale, setLancandoVale] = useState(false);

  // Modal pagar folha
  const [pagarFolha, setPagarFolha] = useState<FechamentoFolha | null>(null);
  const [pagarContaId, setPagarContaId] = useState('');
  const [pagarForma, setPagarForma] = useState('pix');
  const [pagarData, setPagarData] = useState('');
  const [pagando, setPagando] = useState(false);

  // Modal fechar mês
  const [fecharFunc, setFecharFunc] = useState<Funcionario | null>(null);
  const [competencia, setCompetencia] = useState(mesCorrente());
  const [valesMes, setValesMes] = useState<Centavos | null>(null);
  const [carregandoVales, setCarregandoVales] = useState(false);
  const [gerando, setGerando] = useState(false);

  const caixaPadrao = contas.find((c) => c.tipo === 'dinheiro' && c.ativo);

  async function carregarValesLista() {
    setCarregandoValesLista(true);
    try {
      const movs = await listarMovimentos(['vale']);
      setVales(movs);
    } catch (e) {
      console.error(e);
      toast.erro('Falha ao carregar a lista de vales.');
    } finally {
      setCarregandoValesLista(false);
    }
  }

  async function recarregar() {
    const [f, fo, vMap] = await Promise.all([
      listarFuncionarios(),
      listarFechamentosFolha(),
      obterValesFuncionariosMes(mesCorrente()),
    ]);
    setFuncionarios(f);
    setFolhas(fo);
    setValesMesFuncionarios(vMap);
    await carregarValesLista();
  }

  useEffect(() => {
    let ativoFlag = true;
    (async () => {
      try {
        const [f, fo, c, v, vMap] = await Promise.all([
          listarFuncionarios(),
          listarFechamentosFolha(),
          listarContasCompletas(),
          listarMovimentos(['vale']),
          obterValesFuncionariosMes(mesCorrente()),
        ]);
        if (!ativoFlag) return;
        setFuncionarios(f);
        setFolhas(fo);
        setContas(c.filter((x) => x.ativo));
        setVales(v);
        setValesMesFuncionarios(vMap);
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

  function abrirVale(f: Funcionario | null) {
    setValeFunc(f);
    setFuncionarioIdVale(f?.id ?? '');
    setValeStr('');
    setValeDesc('');
    setContaId(caixaPadrao?.id ?? '');
    setModalValeAberto(true);
  }

  async function aoLancarVale(e: FormEvent) {
    e.preventDefault();
    if (!funcionarioIdVale) {
      toast.erro('Selecione o funcionário.');
      return;
    }
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
      const fNome = funcionarios.find((x) => x.id === funcionarioIdVale)?.nome ?? 'Funcionário';
      await lancarVale(funcionarioIdVale, contaId, valor, agoraManausISO(), valeDesc.trim() || `Vale — ${fNome}`, usuarioId);
      toast.sucesso('Vale lançado (saiu do caixa).');
      setModalValeAberto(false);
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao lançar o vale.');
    } finally {
      setLancandoVale(false);
    }
  }

  function abrirPagarFolha(l: FechamentoFolha) {
    setPagarFolha(l);
    setPagarContaId(caixaPadrao?.id ?? '');
    setPagarForma('pix');
    setPagarData(agoraManausISO().slice(0, 16));
  }

  async function aoPagarFolha(e: FormEvent) {
    e.preventDefault();
    if (!pagarFolha) return;
    if (!pagarContaId) {
      toast.erro('Selecione a conta de pagamento.');
      return;
    }
    setPagando(true);
    try {
      const dataHora = `${pagarData}:00-04:00`;
      await pagarFechamentoFolha(pagarFolha.id, pagarContaId, pagarForma, dataHora, usuarioId);
      toast.sucesso('Pagamento de folha registrado.');
      setPagarFolha(null);
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao registrar o pagamento.');
    } finally {
      setPagando(false);
    }
  }

  async function aoExcluirVale(id: string) {
    if (!confirm('Deseja realmente excluir este vale? Isso estornará o saldo para a conta correspondente.')) return;
    try {
      await removerDespesa(id);
      toast.sucesso('Vale excluído com sucesso.');
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao excluir o vale.');
    }
  }

  async function aoExcluirFuncionario(f: Funcionario) {
    if (!confirm(`Excluir o funcionário "${f.nome}"? Esta ação é definitiva.`)) return;
    try {
      await removerFuncionario(f.id);
      toast.sucesso('Funcionário excluído.');
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro(
        (e as Error)?.message === 'NAO_EXCLUIDO'
          ? 'Este funcionário já tem vales ou folha lançados — apenas inative-o.'
          : 'Erro ao excluir o funcionário.',
      );
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
      chave: 'vales_mes',
      titulo: 'Vales no mês',
      alinhar: 'right',
      render: (f) => {
        const v = valesMesFuncionarios[f.id] ?? asCentavos(0n);
        return <span className="numeros text-suave">{formatReais(v)}</span>;
      },
    },
    {
      chave: 'restante',
      titulo: 'Restante a receber',
      alinhar: 'right',
      render: (f) => {
        const v = valesMesFuncionarios[f.id] ?? asCentavos(0n);
        const restante = aReceberFolha(f.salarioBase, v);
        return (
          <span className={`numeros font-semibold ${restante < 0n ? 'text-negativo' : 'text-positivo'}`}>
            {formatReais(restante)}
          </span>
        );
      },
    },
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
          <button
            type="button"
            className="btn px-2.5 py-1.5 text-xs border border-negativo/30 bg-negativo/[0.06] text-negativo hover:bg-negativo/15"
            onClick={() => void aoExcluirFuncionario(f)}
            title="Excluir (só se nunca usado)"
          >
            Excluir
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
    {
      chave: 'status',
      titulo: 'Status',
      render: (l) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            l.status === 'pago' ? 'bg-positivo/10 text-positivo' : 'bg-alerta/10 text-alerta'
          }`}
        >
          {l.status === 'pago' ? 'Pago' : 'Aberto'}
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: '',
      alinhar: 'right',
      render: (l) => (
        <div className="flex justify-end gap-1.5">
          {l.status === 'aberto' && (
            <button
              type="button"
              className="btn btn-primario px-2.5 py-1 text-xs"
              onClick={() => abrirPagarFolha(l)}
            >
              Pagar
            </button>
          )}
          {l.status === 'pago' && l.pagoEm && (
            <span className="text-xs text-suave">
              Pago em: {formatarDataHora(l.pagoEm)}
            </span>
          )}
        </div>
      ),
    },
  ];

  const colVales: Coluna<MovimentoLista>[] = [
    {
      chave: 'data',
      titulo: 'Data',
      render: (m) => <span className="whitespace-nowrap text-suave">{formatarDataHora(m.dataHora)}</span>,
    },
    {
      chave: 'func',
      titulo: 'Funcionário',
      render: (m) => <span className="font-medium text-claro">{m.funcionarioNome ?? '—'}</span>,
    },
    {
      chave: 'descricao',
      titulo: 'Descrição',
      render: (m) => m.descricao || <span className="text-suave">—</span>,
    },
    {
      chave: 'conta',
      titulo: 'Conta de Origem',
      render: (m) => <span className="text-suave">{m.contaNome ?? '—'}</span>,
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
      titulo: '',
      alinhar: 'right',
      render: (m) => (
        <button
          type="button"
          className="btn btn-suave px-2 py-1 text-xs text-negativo hover:bg-negativo/10"
          onClick={() => void aoExcluirVale(m.id)}
        >
          Excluir
        </button>
      ),
    },
  ];

  const aReceberPrevisto = fecharFunc && valesMes !== null ? aReceberFolha(fecharFunc.salarioBase, valesMes) : asCentavos(0n);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Folha"
        subtitulo="Funcionários, vales e fechamento mensal (salário − vales)"
        acao={
          <div className="flex gap-2">
            <button type="button" onClick={() => abrirVale(null)} className="btn btn-suave px-4 py-2 text-sm">
              <IconePlus /> Lançar vale
            </button>
            <button type="button" onClick={abrirNovoFuncionario} className="btn btn-primario px-4 py-2 text-sm">
              <IconePlus /> Novo funcionário
            </button>
          </div>
        }
      />

      <div className="flex gap-4 border-b border-borda">
        <button
          type="button"
          onClick={() => setAba('folha')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all px-1 ${
            aba === 'folha'
              ? 'border-primario text-claro'
              : 'border-transparent text-suave hover:text-claro'
          }`}
        >
          Folha de Pagamento
        </button>
        <button
          type="button"
          onClick={() => setAba('vales')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all px-1 ${
            aba === 'vales'
              ? 'border-primario text-claro'
              : 'border-transparent text-suave hover:text-claro'
          }`}
        >
          Histórico de Vales
        </button>
      </div>

      {aba === 'folha' ? (
        <>
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
        </>
      ) : (
        <div>
          <h2 className="mb-3 px-1 font-display text-lg font-semibold text-claro">Vales (Adiantamentos) Lançados</h2>
          <DataTable
            colunas={colVales}
            dados={vales}
            chaveLinha={(m) => m.id}
            carregando={carregandoValesLista}
            vazio="Nenhum vale lançado."
          />
        </div>
      )}

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
        aberto={modalValeAberto}
        aoFechar={() => setModalValeAberto(false)}
        titulo="Lançar vale"
        descricao="Adiantamento que sai da conta hoje e desconta do salário no fechamento do mês."
      >
        <form onSubmit={aoLancarVale} className="flex flex-col gap-4">
          {valeFunc ? (
            <p className="text-sm text-suave">
              Funcionário: <span className="font-medium text-claro">{valeFunc.nome}</span>
            </p>
          ) : (
            <Campo label="Funcionário" obrigatorio>
              <select
                aria-label="Funcionário"
                className={CLASSE_CAMPO}
                value={funcionarioIdVale}
                onChange={(e) => setFuncionarioIdVale(e.target.value)}
              >
                <option value="">Selecione o funcionário...</option>
                {funcionarios.filter((x) => x.ativo).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}
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
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalValeAberto(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={lancandoVale} className="btn btn-primario px-4 py-2 text-sm">
              {lancandoVale ? 'Lançando…' : 'Lançar vale'}
            </button>
          </div>
        </form>
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

      {/* Modal: pagar folha */}
      <Modal
        aberto={pagarFolha !== null}
        aoFechar={() => setPagarFolha(null)}
        titulo="Registrar pagamento de salário"
        descricao="Liquida o saldo a receber do funcionário para a competência fechada."
      >
        {pagarFolha && (
          <form onSubmit={aoPagarFolha} className="flex flex-col gap-4">
            <div className="cartao p-4 text-sm flex flex-col gap-1.5 mb-2">
              <div className="flex justify-between">
                <span className="text-suave">Funcionário</span>
                <span className="font-semibold text-claro">{pagarFolha.funcionarioNome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-suave">Competência</span>
                <span className="font-semibold text-claro">{competenciaLabel(pagarFolha.competencia)}</span>
              </div>
              <div className="flex justify-between border-t border-borda pt-2 mt-1">
                <span className="font-medium text-suave">Valor a pagar</span>
                <span className="font-bold text-positivo">{formatReais(pagarFolha.aReceber)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Conta de pagamento" obrigatorio>
                <select
                  aria-label="Conta de pagamento"
                  className={CLASSE_CAMPO}
                  value={pagarContaId}
                  onChange={(e) => setPagarContaId(e.target.value)}
                >
                  <option value="">Selecione a conta...</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.tipo})
                    </option>
                  ))}
                </select>
              </Campo>

              <Campo label="Forma de pagamento" obrigatorio>
                <select
                  aria-label="Forma de pagamento"
                  className={CLASSE_CAMPO}
                  value={pagarForma}
                  onChange={(e) => setPagarForma(e.target.value)}
                >
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="debito">Cartão Débito</option>
                  <option value="credito">Cartão Crédito</option>
                </select>
              </Campo>
            </div>

            <Campo label="Data/Hora do pagamento" obrigatorio>
              <input
                type="datetime-local"
                aria-label="Data/Hora do pagamento"
                className={CLASSE_CAMPO}
                value={pagarData}
                onChange={(e) => setPagarData(e.target.value)}
              />
            </Campo>

            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setPagarFolha(null)}>
                Cancelar
              </button>
              <button type="submit" disabled={pagando} className="btn btn-primario px-4 py-2 text-sm">
                {pagando ? 'Registrando...' : 'Confirmar pagamento'}
              </button>
            </div>
          </form>
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
