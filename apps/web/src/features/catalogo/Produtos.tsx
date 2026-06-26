import { useState, useEffect, type FormEvent } from 'react';
import { 
  salvarProduto, 
  listarCategorias, 
  adicionarPrecoProduto,
  adicionarCustoProduto,
  listarPrecosProduto,
  listarCustosProduto,
  listarEntradasMercadoriaProduto,
  adicionarEntradaMercadoria,
  obterDadosProdutosNaData,
  removerPrecoProduto,
  removerCustoProduto,
  removerEntradaMercadoria,
  verificarFechamentoStatus,
  type Categoria,
  type PrecoProdutoHistorico,
  type CustoProdutoHistorico,
  type EntradaMercadoria,
  type ProdutoNaData
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import { hojeManaus, agoraManausISO, formatarDataBR } from '../../lib/datas';
import { parseReais, formatReais, asCentavos } from '../../lib/money';
import type { UsuarioAtual } from '../../data/usuario';

const MODOS: Record<string, string> = {
  contagem: 'Contagem',
  individual: 'Individual',
};

interface ProdutosProps {
  usuario?: UsuarioAtual;
  dataSelecionada: string;
}

export function Produtos({ usuario, dataSelecionada }: ProdutosProps) {
  const toast = useToast();
  const [produtos, setProdutos] = useState<ProdutoNaData[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<'ativos' | 'inativos' | 'todos'>('ativos');

  const podeDefinirPrecoCusto = usuario?.permissoes.has('definir_preco_custo') ?? true;
  // Cadastrar/editar produto e dar entrada de estoque exigem `cadastrar_produto`.
  // O vendedor (só `definir_preco_custo`) vê apenas as ações de Preço/Custo.
  const podeCadastrar = usuario?.permissoes.has('cadastrar_produto') ?? true;

  // Selecionado para modais
  const [selecionado, setSelecionado] = useState<ProdutoNaData | null>(null);

  // Modais abertos
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [modalEditarAberto, setModalEditarAberto] = useState(false);
  const [modalEstoqueAberto, setModalEstoqueAberto] = useState(false);
  const [modalPrecoAberto, setModalPrecoAberto] = useState(false);
  const [modalCustoAberto, setModalCustoAberto] = useState(false);
  const [modalAcoesAberto, setModalAcoesAberto] = useState(false);

  // Estados dos formulários:
  // 1. Dados gerais (Novo / Editar)
  const [nome, setNome] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [modoApuracao, setModoApuracao] = useState('contagem');
  const [ordem, setOrdem] = useState(10);
  const [alertaBaixo, setAlertaBaixo] = useState('');
  const [alertaMuitoBaixo, setAlertaMuitoBaixo] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // 2. Entrada de Estoque
  const [entradaQtdStr, setEntradaQtdStr] = useState('');
  const [entradaCustoStr, setEntradaCustoStr] = useState('');
  const [entradaData, setEntradaData] = useState('');
  const [adicionandoEntrada, setAdicionandoEntrada] = useState(false);
  const [entradasHistorico, setEntradasHistorico] = useState<EntradaMercadoria[]>([]);
  const [carregandoEntradas, setCarregandoEntradas] = useState(false);

  // 3. Preço de venda
  const [novoPrecoStr, setNovoPrecoStr] = useState('');
  const [precoDataVigencia, setPrecoDataVigencia] = useState('');
  const [adicionandoPreco, setAdicionandoPreco] = useState(false);
  const [precosHistorico, setPrecosHistorico] = useState<PrecoProdutoHistorico[]>([]);
  const [carregandoPrecos, setCarregandoPrecos] = useState(false);

  // 4. Custo
  const [novoCustoStr, setNovoCustoStr] = useState('');
  const [custoDataVigencia, setCustoDataVigencia] = useState('');
  const [custoHoraVigencia, setCustoHoraVigencia] = useState('');
  const [adicionandoCusto, setAdicionandoCusto] = useState(false);
  const [custosHistorico, setCustosHistorico] = useState<CustoProdutoHistorico[]>([]);
  const [carregandoCustos, setCarregandoCustos] = useState(false);

  // Carrega produtos na data selecionada
  async function carregarProdutos() {
    setCarregando(true);
    try {
      const dados = await obterDadosProdutosNaData(dataSelecionada);
      setProdutos(dados);
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar produtos na data selecionada.');
    } finally {
      setCarregando(false);
    }
  }

  // Carrega categorias apenas uma vez
  async function carregarCategorias() {
    try {
      const dados = await listarCategorias();
      setCategorias(dados);
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar categorias.');
    }
  }

  useEffect(() => {
    void carregarCategorias();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void carregarProdutos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSelecionada]);



  // Abertura de Modais
  function abrirNovo() {
    setNome('');
    setCategoriaId(categorias[0]?.id ?? '');
    setModoApuracao('contagem');
    const proxOrdem = produtos.length > 0 ? Math.max(...produtos.map(p => p.ordem)) + 10 : 10;
    setOrdem(proxOrdem);
    setAlertaBaixo('');
    setAlertaMuitoBaixo('');
    setAtivo(true);
    setModalNovoAberto(true);
  }

  function abrirEditar(p: ProdutoNaData) {
    setSelecionado(p);
    setNome(p.nome);
    setCategoriaId(p.categoriaId);
    setModoApuracao(p.modoApuracao);
    setOrdem(p.ordem);
    setAlertaBaixo(p.alertaBaixo != null ? String(p.alertaBaixo) : '');
    setAlertaMuitoBaixo(p.alertaMuitoBaixo != null ? String(p.alertaMuitoBaixo) : '');
    setAtivo(p.ativo);
    setModalEditarAberto(true);
  }

  async function abrirEstoque(p: ProdutoNaData) {
    setSelecionado(p);
    setEntradaQtdStr('');
    
    // Custo unitário padrão é o custo ativo na data selecionada
    if (p.custo !== null) {
      const valorReais = Number(p.custo) / 100;
      setEntradaCustoStr(valorReais.toFixed(2).replace('.', ','));
    } else {
      setEntradaCustoStr('');
    }
    setEntradaData(dataSelecionada);
    setModalEstoqueAberto(true);
    
    setCarregandoEntradas(true);
    try {
      const hist = await listarEntradasMercadoriaProduto(p.id);
      setEntradasHistorico(hist);
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar histórico de entradas.');
    } finally {
      setCarregandoEntradas(false);
    }
  }

  async function abrirPreco(p: ProdutoNaData) {
    setSelecionado(p);
    setNovoPrecoStr('');
    setPrecoDataVigencia(dataSelecionada);
    setModalPrecoAberto(true);
    
    setCarregandoPrecos(true);
    try {
      const hist = await listarPrecosProduto(p.id);
      setPrecosHistorico(hist);
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar histórico de preços.');
    } finally {
      setCarregandoPrecos(false);
    }
  }

  async function abrirCusto(p: ProdutoNaData) {
    setSelecionado(p);
    setNovoCustoStr('');
    setCustoDataVigencia(dataSelecionada);
    
    const agora = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setCustoHoraVigencia(`${pad(agora.getHours())}:${pad(agora.getMinutes())}`);
    setModalCustoAberto(true);
    
    setCarregandoCustos(true);
    try {
      const hist = await listarCustosProduto(p.id);
      setCustosHistorico(hist);
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar histórico de custos.');
    } finally {
      setCarregandoCustos(false);
    }
  }

  function abrirAcoes(p: ProdutoNaData) {
    setSelecionado(p);
    setModalAcoesAberto(true);
  }

  // Manipuladores de Salvamento/Registro
  async function aoSalvarNovo(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.erro('Informe o nome do produto.');
      return;
    }
    if (!categoriaId) {
      toast.erro('Selecione uma categoria.');
      return;
    }
    setSalvando(true);
    try {
      const prod = {
        id: uuidv7(),
        nome: nome.trim(),
        categoriaId,
        unidade: 'unidade',
        ordem,
        modoApuracao,
        alertaBaixo: alertaBaixo ? Number(alertaBaixo) : null,
        alertaMuitoBaixo: alertaMuitoBaixo ? Number(alertaMuitoBaixo) : null,
        ativo,
      };
      await salvarProduto(prod);
      toast.sucesso('Produto cadastrado com sucesso.');
      setModalNovoAberto(false);
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao cadastrar produto.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoSalvarEdicao(e: FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    if (!nome.trim()) {
      toast.erro('Informe o nome do produto.');
      return;
    }
    if (!categoriaId) {
      toast.erro('Selecione uma categoria.');
      return;
    }
    setSalvando(true);
    try {
      const prod = {
        id: selecionado.id,
        nome: nome.trim(),
        categoriaId,
        unidade: 'unidade',
        ordem,
        modoApuracao,
        alertaBaixo: alertaBaixo ? Number(alertaBaixo) : null,
        alertaMuitoBaixo: alertaMuitoBaixo ? Number(alertaMuitoBaixo) : null,
        ativo,
      };
      await salvarProduto(prod);
      toast.sucesso('Produto atualizado com sucesso.');
      setModalEditarAberto(false);
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao salvar produto.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoAdicionarEntrada(e: FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    const qtd = Number(entradaQtdStr);
    if (isNaN(qtd) || qtd <= 0) {
      toast.erro('Informe uma quantidade válida.');
      return;
    }
    const custo = parseReais(entradaCustoStr);
    if (custo <= 0n) {
      toast.erro('Informe um custo unitário válido.');
      return;
    }
    if (!entradaData) {
      toast.erro('Informe a data da entrada.');
      return;
    }
    setAdicionandoEntrada(true);
    try {
      await adicionarEntradaMercadoria(uuidv7(), selecionado.id, qtd, custo, entradaData);
      toast.sucesso('Entrada de mercadoria registrada.');
      setEntradaQtdStr('');
      
      // Recarregar histórico e tabela principal
      const hist = await listarEntradasMercadoriaProduto(selecionado.id);
      setEntradasHistorico(hist);
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao registrar entrada de estoque.');
    } finally {
      setAdicionandoEntrada(false);
    }
  }

  async function aoAdicionarPreco(e: FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    const valor = parseReais(novoPrecoStr);
    if (valor <= 0n) {
      toast.erro('Informe um preço de venda válido.');
      return;
    }
    if (!precoDataVigencia) {
      toast.erro('Informe a data de vigência do preço.');
      return;
    }
    setAdicionandoPreco(true);
    try {
      await adicionarPrecoProduto(uuidv7(), selecionado.id, valor, precoDataVigencia);
      toast.sucesso('Preço de venda adicionado.');
      setNovoPrecoStr('');
      
      // Recarregar histórico e tabela principal
      const hist = await listarPrecosProduto(selecionado.id);
      setPrecosHistorico(hist);
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao adicionar preço.');
    } finally {
      setAdicionandoPreco(false);
    }
  }

  async function aoAdicionarCusto(e: FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    const valor = parseReais(novoCustoStr);
    if (valor <= 0n) {
      toast.erro('Informe um custo de compra válido.');
      return;
    }
    if (!custoDataVigencia || !custoHoraVigencia) {
      toast.erro('Informe a data e hora de vigência.');
      return;
    }
    setAdicionandoCusto(true);
    try {
      const validoAPartirDe = `${custoDataVigencia}T${custoHoraVigencia}:00-04:00`;
      await adicionarCustoProduto(uuidv7(), selecionado.id, valor, validoAPartirDe);
      toast.sucesso('Custo de compra adicionado.');
      setNovoCustoStr('');
      
      // Recarregar histórico e tabela principal
      const hist = await listarCustosProduto(selecionado.id);
      setCustosHistorico(hist);
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao adicionar custo.');
    } finally {
      setAdicionandoCusto(false);
    }
  }

  async function aoExcluirEntrada(e: EntradaMercadoria) {
    try {
      const status = await verificarFechamentoStatus(e.data);
      if (status === 'travado') {
        const podeExcluirRetroativo = usuario?.permissoes.has('editar_lancamentos_retroativos') ?? false;
        if (!podeExcluirRetroativo) {
          toast.erro('Esta entrada não pode ser excluída porque o caixa do dia ' + formatarDataBR(e.data) + ' já está encerrado. Solicite a um gerente.');
          return;
        }
        if (!confirm('O caixa do dia ' + formatarDataBR(e.data) + ' já foi encerrado. Como gerente, deseja prosseguir com a exclusão desta entrada de estoque? Isso recalculará a cascata dos saldos.')) {
          return;
        }
      } else {
        if (!confirm('Deseja realmente excluir esta entrada de estoque?')) {
          return;
        }
      }

      await removerEntradaMercadoria(e.id);
      toast.sucesso('Entrada de mercadoria excluída.');
      
      if (selecionado) {
        setEntradasHistorico(await listarEntradasMercadoriaProduto(selecionado.id));
      }
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao excluir entrada de mercadoria.');
    }
  }

  async function aoExcluirPreco(p: PrecoProdutoHistorico) {
    try {
      const status = await verificarFechamentoStatus(p.validoAPartirDe);
      if (status === 'travado') {
        const podeExcluirRetroativo = usuario?.permissoes.has('editar_lancamentos_retroativos') ?? false;
        if (!podeExcluirRetroativo) {
          toast.erro('Este preço não pode ser excluído porque o caixa do dia ' + formatarDataBR(p.validoAPartirDe) + ' já está encerrado. Solicite a um gerente.');
          return;
        }
        if (!confirm('O caixa do dia ' + formatarDataBR(p.validoAPartirDe) + ' já foi encerrado. Como gerente, deseja prosseguir com a exclusão do histórico de preço? Isso pode impactar relatórios retroativos.')) {
          return;
        }
      } else {
        if (!confirm('Deseja realmente excluir esta alteração de preço?')) {
          return;
        }
      }

      await removerPrecoProduto(p.id);
      toast.sucesso('Alteração de preço excluída.');

      if (selecionado) {
        setPrecosHistorico(await listarPrecosProduto(selecionado.id));
      }
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao excluir preço.');
    }
  }

  async function aoExcluirCusto(c: CustoProdutoHistorico) {
    try {
      const dataItem = c.validoAPartirDe.split('T')[0]!;
      const status = await verificarFechamentoStatus(dataItem);
      if (status === 'travado') {
        const podeExcluirRetroativo = usuario?.permissoes.has('editar_lancamentos_retroativos') ?? false;
        if (!podeExcluirRetroativo) {
          toast.erro('Este custo não pode ser excluído porque o caixa do dia ' + formatarDataBR(dataItem) + ' já está encerrado. Solicite a um gerente.');
          return;
        }
        if (!confirm('O caixa do dia ' + formatarDataBR(dataItem) + ' já foi encerrado. Como gerente, deseja prosseguir com a exclusão do histórico de custo? Isso pode impactar relatórios retroativos.')) {
          return;
        }
      } else {
        if (!confirm('Deseja realmente excluir esta alteração de custo?')) {
          return;
        }
      }

      await removerCustoProduto(c.id);
      toast.sucesso('Alteração de custo excluída.');

      if (selecionado) {
        setCustosHistorico(await listarCustosProduto(selecionado.id));
      }
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao excluir custo.');
    }
  }

  const colunas: Coluna<ProdutoNaData>[] = [
    {
      chave: 'ordem',
      titulo: 'Ordem',
      alinhar: 'center',
      render: (p) => <span className="numeros text-suave">{p.ordem}</span>,
    },
    {
      chave: 'nome',
      titulo: 'Nome',
      render: (p) => <span className="font-semibold text-claro">{p.nome}</span>,
    },
    {
      chave: 'categoria',
      titulo: 'Categoria',
      render: (p) => (
        <span className="inline-flex rounded-full bg-claro/[0.06] px-2 py-0.5 text-xs font-medium text-claro">
          {p.categoriaNome}
        </span>
      ),
    },
    {
      chave: 'estoque',
      titulo: 'Estoque',
      alinhar: 'right',
      render: (p) => {
        const isBaixo = p.alertaBaixo !== null && p.estoque <= p.alertaBaixo;
        const isMuitoBaixo = p.alertaMuitoBaixo !== null && p.estoque <= p.alertaMuitoBaixo;
        return (
          <span className={`numeros font-bold ${isMuitoBaixo ? 'text-negativo' : isBaixo ? 'text-ambar' : 'text-positivo'}`}>
            {p.estoque}
          </span>
        );
      },
    },
    {
      chave: 'precoVenda',
      titulo: 'Preço Venda',
      alinhar: 'right',
      render: (p) => (
        <span className="numeros text-claro">
          {p.precoVenda !== null ? formatReais(p.precoVenda) : '—'}
        </span>
      ),
    },
    {
      chave: 'custo',
      titulo: 'Custo',
      alinhar: 'right',
      render: (p) => (
        <span className="numeros text-suave">
          {p.custo !== null ? formatReais(p.custo) : '—'}
        </span>
      ),
    },

    {
      chave: 'status',
      titulo: 'Status',
      render: (p) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
            p.ativo ? 'bg-positivo/10 text-positivo' : 'bg-claro/10 text-claro/40'
          }`}
        >
          {p.ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'right',
      render: (p) => (
        <button
          type="button"
          onClick={() => abrirAcoes(p)}
          className="rounded-lg p-2 text-suave bg-claro/5 hover:bg-ambar hover:text-sobreacento transition-all"
          title="Ações do produto"
        >
          <IconeEditar />
        </button>
      ),
    },
  ];

  const produtosFiltrados = produtos.filter((p) => {
    if (filtroStatus === 'ativos') return p.ativo;
    if (filtroStatus === 'inativos') return !p.ativo;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-borda/40">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-lg font-bold text-claro">Mercadorias & Produtos</h2>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as any)}
            className="rounded border border-borda bg-transparent px-2 py-1 text-xs text-suave focus:ring-ambar focus:border-ambar outline-none"
          >
            <option value="ativos" className="bg-ardosia">Apenas Ativos</option>
            <option value="inativos" className="bg-ardosia">Apenas Inativos</option>
            <option value="todos" className="bg-ardosia">Todos</option>
          </select>
        </div>
        {podeCadastrar && (
          <button type="button" onClick={abrirNovo} className="btn btn-primario px-4 py-2 text-sm">
            <IconePlus /> Novo produto
          </button>
        )}
      </div>

      <DataTable
        colunas={colunas}
        dados={produtosFiltrados}
        chaveLinha={(p) => p.id}
        carregando={carregando}
        vazio={`Nenhum produto cadastrado para a data ${formatarDataBR(dataSelecionada)}.`}
      />

      {/* 1. Modal: Novo Produto */}
      <Modal
        aberto={modalNovoAberto}
        aoFechar={() => setModalNovoAberto(false)}
        titulo="Novo produto"
        descricao="Preencha os dados do produto. Campos com * são obrigatórios."
        larguraMax="max-w-xl"
      >
        <form onSubmit={aoSalvarNovo} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nome do produto" obrigatorio>
              <input
                className={CLASSE_CAMPO}
                placeholder="Ex.: Gasolina Comum"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Campo>
            <Campo label="Categoria" obrigatorio>
              <select
                aria-label="Categoria"
                className={CLASSE_CAMPO}
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
              >
                <option value="" disabled>Selecione…</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Modo de apuração">
              <select
                aria-label="Modo de apuração"
                className={CLASSE_CAMPO}
                value={modoApuracao}
                onChange={(e) => setModoApuracao(e.target.value)}
              >
                {Object.entries(MODOS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Ordem na contagem" dica="Define a sequência no fechamento">
              <input
                type="number"
                className={`${CLASSE_CAMPO} numeros text-right`}
                value={ordem}
                onChange={(e) => setOrdem(Number(e.target.value))}
              />
            </Campo>
            <Campo label="Alerta baixo" dica="Unidades para alerta">
              <input
                type="number"
                inputMode="numeric"
                className={`${CLASSE_CAMPO} numeros text-right`}
                placeholder="Ex.: 50"
                value={alertaBaixo}
                onChange={(e) => setAlertaBaixo(e.target.value)}
              />
            </Campo>
            <Campo label="Alerta muito baixo" dica="Alerta crítico">
              <input
                type="number"
                inputMode="numeric"
                className={`${CLASSE_CAMPO} numeros text-right`}
                placeholder="Ex.: 20"
                value={alertaMuitoBaixo}
                onChange={(e) => setAlertaMuitoBaixo(e.target.value)}
              />
            </Campo>
          </div>

          <label className="flex items-center gap-2 text-sm text-claro mt-2">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="rounded border-borda bg-transparent text-ambar focus:ring-ambar"
            />
            Produto ativo
          </label>

          <div className="mt-4 flex justify-end gap-2 border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalNovoAberto(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
              {salvando ? 'Salvando…' : 'Cadastrar produto'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. Modal: Editar Dados Gerais */}
      <Modal
        aberto={modalEditarAberto}
        aoFechar={() => setModalEditarAberto(false)}
        titulo={`Editar produto: ${selecionado?.nome ?? ''}`}
        descricao="Edite os dados gerais do produto cadastrado."
        larguraMax="max-w-xl"
      >
        <form onSubmit={aoSalvarEdicao} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nome do produto" obrigatorio>
              <input
                className={CLASSE_CAMPO}
                placeholder="Ex.: Gasolina Comum"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Campo>
            <Campo label="Categoria" obrigatorio>
              <select
                aria-label="Categoria"
                className={CLASSE_CAMPO}
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
              >
                <option value="" disabled>Selecione…</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Modo de apuração">
              <select
                aria-label="Modo de apuração"
                className={CLASSE_CAMPO}
                value={modoApuracao}
                onChange={(e) => setModoApuracao(e.target.value)}
              >
                {Object.entries(MODOS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Ordem na contagem" dica="Define a sequência no fechamento">
              <input
                type="number"
                className={`${CLASSE_CAMPO} numeros text-right`}
                value={ordem}
                onChange={(e) => setOrdem(Number(e.target.value))}
              />
            </Campo>
            <Campo label="Alerta baixo" dica="Unidades para alerta">
              <input
                type="number"
                inputMode="numeric"
                className={`${CLASSE_CAMPO} numeros text-right`}
                placeholder="Ex.: 50"
                value={alertaBaixo}
                onChange={(e) => setAlertaBaixo(e.target.value)}
              />
            </Campo>
            <Campo label="Alerta muito baixo" dica="Alerta crítico">
              <input
                type="number"
                inputMode="numeric"
                className={`${CLASSE_CAMPO} numeros text-right`}
                placeholder="Ex.: 20"
                value={alertaMuitoBaixo}
                onChange={(e) => setAlertaMuitoBaixo(e.target.value)}
              />
            </Campo>
          </div>

          <label className="flex items-center gap-2 text-sm text-claro mt-2">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="rounded border-borda bg-transparent text-ambar focus:ring-ambar"
            />
            Produto ativo
          </label>

          <div className="mt-4 flex justify-end gap-2 border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalEditarAberto(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 3. Modal: Registrar Entrada (+ Estoque) */}
      <Modal
        aberto={modalEstoqueAberto}
        aoFechar={() => setModalEstoqueAberto(false)}
        titulo={`Estoque: ${selecionado?.nome ?? ''}`}
        descricao="Gere uma nova entrada física de produtos no estoque do Posto."
        larguraMax="max-w-2xl"
      >
        <div className="flex flex-col gap-6">
          <form onSubmit={aoAdicionarEntrada} className="flex flex-col gap-4 rounded-xl border border-borda bg-claro/[0.02] p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end">
              <Campo label="Quantidade" obrigatorio>
                <input
                  type="number"
                  min="1"
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  placeholder="Ex.: 50"
                  value={entradaQtdStr}
                  onChange={(e) => setEntradaQtdStr(e.target.value)}
                />
              </Campo>
              <Campo label="Custo Unitário (R$)" obrigatorio>
                <input
                  className={CLASSE_CAMPO}
                  placeholder="Ex.: 3,00"
                  value={entradaCustoStr}
                  onChange={(e) => setEntradaCustoStr(e.target.value)}
                />
              </Campo>
              <Campo label="Data da Entrada" obrigatorio>
                <input
                  type="date"
                  className={CLASSE_CAMPO}
                  value={entradaData}
                  onChange={(e) => setEntradaData(e.target.value)}
                />
              </Campo>
              <div>
                <button type="submit" disabled={adicionandoEntrada} className="w-full btn btn-primario py-2 text-sm transition-all active:scale-98">
                  {adicionandoEntrada ? 'Registrando…' : 'Registrar'}
                </button>
              </div>
            </div>
          </form>

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-bold text-claro">Histórico de Entradas de Mercadoria</h4>
            {carregandoEntradas ? (
              <div className="text-center text-xs text-suave py-4">Carregando histórico…</div>
            ) : entradasHistorico.length === 0 ? (
              <div className="text-center text-xs text-suave py-4">Nenhuma entrada registrada para este produto.</div>
            ) : (
              <div className="overflow-y-auto rounded-xl border border-borda max-h-60">
                <table className="w-full text-left text-xs table-fixed">
                  <thead className="bg-claro/[0.02] text-suave border-b border-borda sticky top-0 z-10">
                    <tr>
                      <th className="p-3 w-[25%] font-semibold">Data</th>
                      <th className="p-3 w-[15%] text-right font-semibold">Qtd</th>
                      <th className="p-3 w-[20%] text-right font-semibold">Unitário</th>
                      <th className="p-3 w-[20%] text-right font-semibold">Total</th>
                      <th className="p-3 w-[15%] text-right font-semibold">Tipo</th>
                      <th className="p-3 w-[5%] text-right font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {entradasHistorico.map((e) => {
                      const total = asCentavos(BigInt(Math.round(e.quantidade)) * e.custoUnitarioCentavos);
                      return (
                        <tr key={e.id} className="hover:bg-claro/[0.01]">
                          <td className="p-3 font-medium text-claro truncate">{formatarDataBR(e.data)}</td>
                          <td className="p-3 numeros text-right text-claro">{e.quantidade}</td>
                          <td className="p-3 numeros text-right text-claro">{formatReais(e.custoUnitarioCentavos)}</td>
                          <td className="p-3 numeros text-right font-semibold text-positivo">{formatReais(total)}</td>
                          <td className="p-3 text-right text-suave truncate">
                            {e.fechamentoId ? (
                              <span className="inline-flex rounded-full bg-positivo/10 px-2 py-0.5 text-[10px] font-semibold text-positivo">
                                Fechamento
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-claro/5 px-2 py-0.5 text-[10px] font-semibold text-suave">
                                Avulsa
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {podeCadastrar && (
                              <button
                                type="button"
                                onClick={() => void aoExcluirEntrada(e)}
                                className="text-negativo hover:text-negativo/80 p-1"
                                title="Excluir entrada"
                              >
                                <IconeLixeira />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex justify-end border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalEstoqueAberto(false)}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>

      {/* 4. Modal: Preço de Venda (Preço) */}
      <Modal
        aberto={modalPrecoAberto}
        aoFechar={() => setModalPrecoAberto(false)}
        titulo={`Preço de Venda: ${selecionado?.nome ?? ''}`}
        descricao="Adicione preços de venda com vigências e visualize o histórico."
        larguraMax="max-w-2xl"
      >
        <div className="flex flex-col gap-6">
          {podeDefinirPrecoCusto ? (
            <form onSubmit={aoAdicionarPreco} className="flex flex-col gap-4 rounded-xl border border-borda bg-claro/[0.02] p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-end">
                <Campo label="Preço de Venda (R$)" obrigatorio>
                  <input
                    className={CLASSE_CAMPO}
                    placeholder="Ex.: 5,50"
                    value={novoPrecoStr}
                    onChange={(e) => setNovoPrecoStr(e.target.value)}
                  />
                </Campo>
                <Campo label="Válido a partir de" obrigatorio>
                  <input
                    type="date"
                    className={CLASSE_CAMPO}
                    value={precoDataVigencia}
                    onChange={(e) => setPrecoDataVigencia(e.target.value)}
                  />
                </Campo>
                <div>
                  <button type="submit" disabled={adicionandoPreco} className="w-full btn btn-primario py-2 text-sm transition-all active:scale-98">
                    {adicionandoPreco ? 'Adicionando…' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-500">
              Você não tem permissão para alterar preços e custos.
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-bold text-claro">Histórico de Preços de Venda</h4>
            {carregandoPrecos ? (
              <div className="text-center text-xs text-suave py-4">Carregando histórico…</div>
            ) : precosHistorico.length === 0 ? (
              <div className="text-center text-xs text-suave py-4">Nenhum preço definido para este produto.</div>
            ) : (
              <div className="overflow-y-auto rounded-xl border border-borda max-h-60">
                <table className="w-full text-left text-xs table-fixed">
                  <thead className="bg-claro/[0.02] text-suave border-b border-borda sticky top-0 z-10">
                    <tr>
                      <th className="p-3 w-[45%] font-semibold">Início da Vigência</th>
                      <th className="p-3 w-[25%] font-semibold">Valor</th>
                      <th className="p-3 w-[20%] text-right font-semibold">Situação</th>
                      <th className="p-3 w-[10%] text-right font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {precosHistorico.map((p, idx) => {
                      const hoje = hojeManaus();
                      const vigenteIndex = precosHistorico.findIndex(x => x.validoAPartirDe <= hoje);
                      const situacao = 
                        p.validoAPartirDe > hoje 
                          ? { label: 'Futuro', classe: 'bg-ambar/10 text-ambar' }
                          : idx === vigenteIndex
                            ? { label: 'Vigente', classe: 'bg-positivo/10 text-positivo' }
                            : { label: 'Histórico', classe: 'bg-claro/5 text-suave' };

                      return (
                        <tr key={p.id} className="hover:bg-claro/[0.01]">
                          <td className="p-3 font-medium text-claro truncate">{formatarDataBR(p.validoAPartirDe)}</td>
                          <td className="p-3 numeros text-claro">{formatReais(p.valorCentavos)}</td>
                          <td className="p-3 text-right">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${situacao.classe}`}>
                              {situacao.label}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {podeDefinirPrecoCusto && (
                              <button
                                type="button"
                                onClick={() => void aoExcluirPreco(p)}
                                className="text-negativo hover:text-negativo/80 p-1"
                                title="Excluir preço"
                              >
                                <IconeLixeira />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex justify-end border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalPrecoAberto(false)}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>

      {/* 5. Modal: Custo de Compra (Custo) */}
      <Modal
        aberto={modalCustoAberto}
        aoFechar={() => setModalCustoAberto(false)}
        titulo={`Custo: ${selecionado?.nome ?? ''}`}
        descricao="Adicione custos de compra (para lucro do dia e média) e gerencie o histórico."
        larguraMax="max-w-2xl"
      >
        <div className="flex flex-col gap-6">
          {podeDefinirPrecoCusto ? (
            <form onSubmit={aoAdicionarCusto} className="flex flex-col gap-4 rounded-xl border border-borda bg-claro/[0.02] p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end">
                <Campo label="Custo Unitário (R$)" obrigatorio>
                  <input
                    className={CLASSE_CAMPO}
                    placeholder="Ex.: 3,50"
                    value={novoCustoStr}
                    onChange={(e) => setNovoCustoStr(e.target.value)}
                  />
                </Campo>
                <Campo label="Data de Início" obrigatorio>
                  <input
                    type="date"
                    className={CLASSE_CAMPO}
                    value={custoDataVigencia}
                    onChange={(e) => setCustoDataVigencia(e.target.value)}
                  />
                </Campo>
                <Campo label="Hora de Início" obrigatorio>
                  <input
                    type="time"
                    className={CLASSE_CAMPO}
                    value={custoHoraVigencia}
                    onChange={(e) => setCustoHoraVigencia(e.target.value)}
                  />
                </Campo>
                <div>
                  <button type="submit" disabled={adicionandoCusto} className="w-full btn btn-primario py-2 text-sm transition-all active:scale-98">
                    {adicionandoCusto ? 'Adicionando…' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-500">
              Você não tem permissão para alterar preços e custos.
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-bold text-claro">Histórico de Custos de Compra</h4>
            {carregandoCustos ? (
              <div className="text-center text-xs text-suave py-4">Carregando histórico…</div>
            ) : custosHistorico.length === 0 ? (
              <div className="text-center text-xs text-suave py-4">Nenhum custo definido para este produto.</div>
            ) : (
              <div className="overflow-y-auto rounded-xl border border-borda max-h-60">
                <table className="w-full text-left text-xs table-fixed">
                  <thead className="bg-claro/[0.02] text-suave border-b border-borda sticky top-0 z-10">
                    <tr>
                      <th className="p-3 w-[45%] font-semibold">Início da Vigência</th>
                      <th className="p-3 w-[25%] font-semibold">Custo Unitário</th>
                      <th className="p-3 w-[20%] text-right font-semibold">Situação</th>
                      <th className="p-3 w-[10%] text-right font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {custosHistorico.map((c, idx) => {
                      const agora = agoraManausISO();
                      const vigenteIndex = custosHistorico.findIndex(x => x.validoAPartirDe <= agora);
                      const situacao = 
                        c.validoAPartirDe > agora 
                          ? { label: 'Futuro', classe: 'bg-ambar/10 text-ambar' }
                          : idx === vigenteIndex
                            ? { label: 'Vigente', classe: 'bg-positivo/10 text-positivo' }
                            : { label: 'Histórico', classe: 'bg-claro/5 text-suave' };

                      const partes = c.validoAPartirDe.split('T');
                      const dataFormatada = partes.length > 1
                        ? `${formatarDataBR(partes[0])} ${(partes[1] ?? '').slice(0, 5)}`
                        : formatarDataBR(c.validoAPartirDe);

                      return (
                        <tr key={c.id} className="hover:bg-claro/[0.01]">
                          <td className="p-3 font-medium text-claro truncate">{dataFormatada}</td>
                          <td className="p-3 numeros text-claro">{formatReais(c.valorCentavos)}</td>
                          <td className="p-3 text-right">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${situacao.classe}`}>
                              {situacao.label}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {podeDefinirPrecoCusto && (
                              <button
                                type="button"
                                onClick={() => void aoExcluirCusto(c)}
                                className="text-negativo hover:text-negativo/80 p-1"
                                title="Excluir custo"
                              >
                                <IconeLixeira />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex justify-end border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalCustoAberto(false)}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de Ações Gerais */}
      <Modal
        aberto={modalAcoesAberto}
        aoFechar={() => setModalAcoesAberto(false)}
        titulo={`Ações do Produto`}
        descricao={`Selecione a operação para o produto ${selecionado?.nome ?? ''}:`}
        larguraMax="max-w-sm"
      >
        <div className="flex flex-col gap-2 py-1">
          {podeCadastrar && (
            <>
              <button
                type="button"
                onClick={() => {
                  setModalAcoesAberto(false);
                  if (selecionado) abrirEditar(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-borda bg-claro/[0.02] hover:bg-ambar/10 hover:border-ambar/40 transition-all text-left text-sm font-semibold text-claro group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-claro/5 text-suave group-hover:bg-ambar/20 group-hover:text-ambar transition-colors">
                  <IconeEditar />
                </div>
                <span className="flex-1 text-claro group-hover:text-ambar transition-colors">Editar Cadastro</span>
                <IconeChevronDireita />
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalAcoesAberto(false);
                  if (selecionado) void abrirEstoque(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-borda bg-claro/[0.02] hover:bg-ambar/10 hover:border-ambar/40 transition-all text-left text-sm font-semibold text-claro group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-claro/5 text-suave group-hover:bg-ambar/20 group-hover:text-ambar transition-colors">
                  <IconeEstoque />
                </div>
                <span className="flex-1 text-claro group-hover:text-ambar transition-colors">Entrada de Estoque</span>
                <IconeChevronDireita />
              </button>
            </>
          )}

          {podeDefinirPrecoCusto && (
            <>
              <button
                type="button"
                onClick={() => {
                  setModalAcoesAberto(false);
                  if (selecionado) void abrirPreco(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-borda bg-claro/[0.02] hover:bg-ambar/10 hover:border-ambar/40 transition-all text-left text-sm font-semibold text-claro group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-claro/5 text-suave group-hover:bg-ambar/20 group-hover:text-ambar transition-colors">
                  <IconePreco />
                </div>
                <span className="flex-1 text-claro group-hover:text-ambar transition-colors">Alterar Preço</span>
                <IconeChevronDireita />
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalAcoesAberto(false);
                  if (selecionado) void abrirCusto(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-borda bg-claro/[0.02] hover:bg-ambar/10 hover:border-ambar/40 transition-all text-left text-sm font-semibold text-claro group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-claro/5 text-suave group-hover:bg-ambar/20 group-hover:text-ambar transition-colors">
                  <IconeCusto />
                </div>
                <span className="flex-1 text-claro group-hover:text-ambar transition-colors">Alterar Custo</span>
                <IconeChevronDireita />
              </button>
            </>
          )}
        </div>
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



function IconeEditar() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function IconeEstoque() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function IconePreco() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconeCusto() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

function IconeChevronDireita() {
  return (
    <svg className="h-4 w-4 text-suave group-hover:text-ambar group-hover:translate-x-0.5 transition-all duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconeLixeira() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
