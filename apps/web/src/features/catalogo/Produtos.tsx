import { useState, useEffect, useRef, type FormEvent } from 'react';
import {
  salvarProduto,
  listarCategorias,
  salvarCategoria,
  removerCategoria,
  adicionarPrecoProduto,
  adicionarCustoProduto,
  listarPrecosProduto,
  listarCustosProduto,
  listarEntradasMercadoriaProduto,
  obterDadosProdutosNaData,
  removerPrecoProduto,
  removerCustoProduto,
  removerEntradaMercadoria,
  atualizarEntradaMercadoria,
  registrarEntradaComPreco,
  ultimoCustoEntrada,
  listarSaidasProdutoPeriodo,
  entradasMercadoriaDoDia,
  listarNotasMercadoria,
  listarItensNotaMercadoria,
  type NotaResumo,
  removerProduto,
  verificarFechamentoStatus,
  type Categoria,
  type PrecoProdutoHistorico,
  type CustoProdutoHistorico,
  type EntradaMercadoria,
  type ProdutoNaData,
  temFechamentoOperacional,
  definirEstoqueInicialProduto,
  buscarEstoqueInicialProduto
} from '../../data/repositorios';
import { recalcularCascata } from '../../data/fechamento';
import { uuidv7 } from '../../lib/uuidv7';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import { Combobox } from '../../components/ui/Combobox';
import { hojeManaus, agoraManausISO, formatarDataBR } from '../../lib/datas';
import { parseReais, formatReais, asCentavos, type Centavos } from '../../lib/money';
import type { UsuarioAtual } from '../../data/usuario';

const MODOS: Record<string, string> = {
  contagem: 'Contagem',
  individual: 'Individual',
};

interface ProdutosProps {
  usuario?: UsuarioAtual;
  dataSelecionada: string;
}

/** Uma linha da notinha de entrada (em memória até salvar). */
interface NotaLinha {
  /** id da entrada_mercadoria quando a linha já existe (nota em edição). */
  entradaId?: string;
  produtoId: string;
  nome: string;
  quantidade: number;
  custo: Centavos;
  precoVenda: Centavos | null;
  precoVendaVigente: Centavos | null;
}

export function Produtos({ usuario, dataSelecionada }: ProdutosProps) {
  const toast = useToast();
  const [produtos, setProdutos] = useState<ProdutoNaData[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<'ativos' | 'inativos' | 'todos'>('ativos');

  // Filtros gerais e período (Req 3)
  const [busca, setBusca] = useState(() => localStorage.getItem('pontao_filtro_produtos_busca') ?? '');
  const [filtroCategoriaNome, setFiltroCategoriaNome] = useState(() => localStorage.getItem('pontao_filtro_produtos_categoria') ?? '');
  const [de, setDe] = useState(() => localStorage.getItem('pontao_filtro_produtos_de') ?? '');
  const [ate, setAte] = useState(() => localStorage.getItem('pontao_filtro_produtos_ate') ?? '');
  const [saidasPorProduto, setSaidasPorProduto] = useState<Map<string, number>>(new Map());
  const [entradasDoDia, setEntradasDoDia] = useState<Map<string, number>>(new Map());

  useEffect(() => { localStorage.setItem('pontao_filtro_produtos_busca', busca); }, [busca]);
  useEffect(() => { localStorage.setItem('pontao_filtro_produtos_categoria', filtroCategoriaNome); }, [filtroCategoriaNome]);
  useEffect(() => { localStorage.setItem('pontao_filtro_produtos_de', de); }, [de]);
  useEffect(() => { localStorage.setItem('pontao_filtro_produtos_ate', ate); }, [ate]);

  // Período efetivo das SAÍDAS: usa o filtro; sem filtro, mês corrente até a data selecionada.
  const periodoSaidasDe = de || `${dataSelecionada.slice(0, 8)}01`;
  const periodoSaidasAte = ate || dataSelecionada;

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
  const [modalCategoriasAberto, setModalCategoriasAberto] = useState(false);
  const [modalNotaAberto, setModalNotaAberto] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setMenuAberto(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  // Notinha multi-produto (Req 4 e 6) + edição de nota existente
  const [notaData, setNotaData] = useState('');
  const [notaLinhas, setNotaLinhas] = useState<NotaLinha[]>([]);
  const [notaProdutoId, setNotaProdutoId] = useState('');
  const [notaQtd, setNotaQtd] = useState('');
  const [notaCusto, setNotaCusto] = useState('');
  const [notaPreco, setNotaPreco] = useState('');
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [notaId, setNotaId] = useState('');
  const [notaModo, setNotaModo] = useState<'nova' | 'edicao'>('nova');
  const [notaIdsOriginais, setNotaIdsOriginais] = useState<string[]>([]);
  const [notasExistentes, setNotasExistentes] = useState<NotaResumo[]>([]);

  // Gestão de categorias de produto
  const [catEditandoId, setCatEditandoId] = useState<string | null>(null);
  const [catNome, setCatNome] = useState('');
  const [catOrdem, setCatOrdem] = useState(10);
  const [salvandoCategoria, setSalvandoCategoria] = useState(false);

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
  const [estoqueInicial, setEstoqueInicial] = useState('');
  const [bloquearDiaZero, setBloquearDiaZero] = useState(false);

  // 2. Entrada de Estoque
  const [entradaQtdStr, setEntradaQtdStr] = useState('');
  const [entradaCustoStr, setEntradaCustoStr] = useState('');
  const [entradaPrecoVendaStr, setEntradaPrecoVendaStr] = useState('');
  const [entradaData, setEntradaData] = useState('');
  const [entradaEditandoId, setEntradaEditandoId] = useState<string | null>(null);
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
      const [dados, entradas] = await Promise.all([
        obterDadosProdutosNaData(dataSelecionada),
        entradasMercadoriaDoDia(dataSelecionada),
      ]);
      setProdutos(dados);
      setEntradasDoDia(entradas);
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
    temFechamentoOperacional().then(setBloquearDiaZero).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void carregarProdutos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSelecionada]);

  // Saídas (vendido) por produto no período efetivo (Req 3).
  useEffect(() => {
    let ativo = true;
    listarSaidasProdutoPeriodo(periodoSaidasDe, periodoSaidasAte)
      .then((m) => { if (ativo) setSaidasPorProduto(m); })
      .catch((err) => console.error('Falha ao calcular saídas:', err));
    return () => { ativo = false; };
  }, [periodoSaidasDe, periodoSaidasAte, produtos]);

  function abrirNovo() {
    setNome('');
    setCategoriaId(categorias[0]?.id ?? '');
    setModoApuracao('contagem');
    const proxOrdem = produtos.length > 0 ? Math.max(...produtos.map(p => p.ordem)) + 10 : 10;
    setOrdem(proxOrdem);
    setAlertaBaixo('');
    setAlertaMuitoBaixo('');
    setAtivo(true);
    setEstoqueInicial('');
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
    setEstoqueInicial('');

    if (p.modoApuracao === 'contagem') {
      buscarEstoqueInicialProduto(p.id)
        .then((val) => {
          if (val !== null) setEstoqueInicial(String(val).replace('.', ','));
        })
        .catch(console.error);
    }

    setModalEditarAberto(true);
  }

  function preencherReais(valor: Centavos | number | null, set: (s: string) => void) {
    if (valor === null) {
      set('');
      return;
    }
    set((Number(valor) / 100).toFixed(2).replace('.', ','));
  }

  async function abrirEstoque(p: ProdutoNaData) {
    setSelecionado(p);
    setEntradaQtdStr('');
    setEntradaEditandoId(null);

    // Custo pré-preenchido com o ÚLTIMO custo de entrada (fallback no custo vigente).
    setEntradaCustoStr('');
    void ultimoCustoEntrada(p.id)
      .then((ultimo) => preencherReais(ultimo ?? p.custo, setEntradaCustoStr))
      .catch(() => preencherReais(p.custo, setEntradaCustoStr));
    // Preço de venda pré-preenchido com o vigente.
    preencherReais(p.precoVenda, setEntradaPrecoVendaStr);

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

      if (modoApuracao === 'contagem' && !bloquearDiaZero && estoqueInicial.trim() !== '') {
        const qtd = Number(estoqueInicial.replace(',', '.'));
        if (!isNaN(qtd)) {
          await definirEstoqueInicialProduto(prod.id, qtd);
        }
      }

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

      if (modoApuracao === 'contagem' && !bloquearDiaZero && estoqueInicial.trim() !== '') {
        const qtd = Number(estoqueInicial.replace(',', '.'));
        if (!isNaN(qtd)) {
          await definirEstoqueInicialProduto(prod.id, qtd);
        }
      }

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

  /**
   * Guarda de caixa para mexer numa entrada na `data`: se o dia está travado, exige
   * `editar_lancamentos_retroativos` (senão bloqueia, pedindo gerente/reabrir).
   * Retorna { recalcular } (recalcular=true quando mexeu em dia travado) ou null
   * (bloqueado/cancelado).
   */
  async function guardaEntradaNaData(data: string, acao: string): Promise<{ recalcular: boolean } | null> {
    const status = await verificarFechamentoStatus(data);
    if (status === 'travado') {
      const pode = usuario?.permissoes.has('editar_lancamentos_retroativos') ?? false;
      if (!pode) {
        toast.erro(`O caixa do dia ${formatarDataBR(data)} já está encerrado. ${acao} exige um gerente — reabra o caixa.`);
        return null;
      }
      if (!confirm(`O caixa do dia ${formatarDataBR(data)} já foi encerrado. Como gerente, deseja prosseguir? Isso recalculará a cascata dos saldos.`)) {
        return null;
      }
      return { recalcular: true };
    }
    return { recalcular: false };
  }

  function aoEditarEntrada(e: EntradaMercadoria) {
    setEntradaEditandoId(e.id);
    setEntradaQtdStr(String(e.quantidade));
    preencherReais(e.custoUnitarioCentavos, setEntradaCustoStr);
    setEntradaData(e.data);
  }

  function cancelarEdicaoEntrada() {
    setEntradaEditandoId(null);
    setEntradaQtdStr('');
    if (selecionado) {
      void ultimoCustoEntrada(selecionado.id)
        .then((ultimo) => preencherReais(ultimo ?? selecionado.custo, setEntradaCustoStr))
        .catch(() => preencherReais(selecionado.custo, setEntradaCustoStr));
    }
    setEntradaData(dataSelecionada);
  }

  async function aoSalvarEntrada(e: FormEvent) {
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

    const guarda = await guardaEntradaNaData(entradaData, entradaEditandoId ? 'Editar a entrada' : 'Lançar a entrada');
    if (!guarda) return;

    setAdicionandoEntrada(true);
    try {
      if (entradaEditandoId) {
        await atualizarEntradaMercadoria(entradaEditandoId, {
          quantidade: qtd,
          custoUnitarioCentavos: custo,
          data: entradaData,
        });
        toast.sucesso('Entrada atualizada.');
      } else {
        const preco = parseReais(entradaPrecoVendaStr);
        await registrarEntradaComPreco({
          produtoId: selecionado.id,
          quantidade: qtd,
          custo,
          data: entradaData,
          precoVenda: preco > 0n ? preco : null,
          precoVendaVigente: selecionado.precoVenda,
        });
        toast.sucesso('Entrada de mercadoria registrada.');
      }
      if (guarda.recalcular) await recalcularCascata(entradaData, true);

      setEntradaQtdStr('');
      setEntradaEditandoId(null);
      const hist = await listarEntradasMercadoriaProduto(selecionado.id);
      setEntradasHistorico(hist);
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao salvar entrada de estoque.');
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
      if (status === 'travado') await recalcularCascata(e.data, true);
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

  // ---- Notinha multi-produto (Req 4 e 6), com edição de nota existente ----
  function limparEditorLinhaNota() {
    setNotaProdutoId('');
    setNotaQtd('');
    setNotaCusto('');
    setNotaPreco('');
  }

  function novaNota() {
    setNotaModo('nova');
    setNotaId(uuidv7());
    setNotaIdsOriginais([]);
    setNotaLinhas([]);
    limparEditorLinhaNota();
    setNotaData(dataSelecionada);
  }

  async function abrirNota() {
    novaNota();
    setModalNotaAberto(true);
    try {
      setNotasExistentes(await listarNotasMercadoria());
    } catch (err) {
      console.error(err);
    }
  }

  async function aoEditarNotaExistente(id: string) {
    if (!id) return;
    try {
      const { data, itens } = await listarItensNotaMercadoria(id);
      setNotaModo('edicao');
      setNotaId(id);
      setNotaData(data);
      setNotaIdsOriginais(itens.map((i) => i.entradaId));
      setNotaLinhas(
        itens.map((i) => {
          const prod = produtos.find((p) => p.id === i.produtoId);
          return {
            entradaId: i.entradaId,
            produtoId: i.produtoId,
            nome: i.nome,
            quantidade: i.quantidade,
            custo: i.custoUnitarioCentavos,
            precoVenda: null,
            precoVendaVigente: prod?.precoVenda ?? null,
          };
        }),
      );
      limparEditorLinhaNota();
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar a nota.');
    }
  }

  function aoSelecionarProdutoNota(produtoId: string) {
    setNotaProdutoId(produtoId);
    const p = produtos.find((x) => x.id === produtoId);
    preencherReais(p?.precoVenda ?? null, setNotaPreco);
    setNotaCusto('');
    if (produtoId) {
      void ultimoCustoEntrada(produtoId)
        .then((ultimo) => preencherReais(ultimo ?? p?.custo ?? null, setNotaCusto))
        .catch(() => preencherReais(p?.custo ?? null, setNotaCusto));
    }
  }



  function adicionarLinhaNota() {
    const p = produtos.find((x) => x.id === notaProdutoId);
    if (!p) {
      toast.erro('Selecione um produto.');
      return;
    }
    const qtd = Number(notaQtd);
    if (isNaN(qtd) || qtd <= 0) {
      toast.erro('Informe uma quantidade válida.');
      return;
    }
    const custo = parseReais(notaCusto);
    if (custo <= 0n) {
      toast.erro('Informe um custo unitário válido.');
      return;
    }
    const preco = parseReais(notaPreco);
    setNotaLinhas((linhas) => [
      ...linhas,
      {
        produtoId: p.id,
        nome: p.nome,
        quantidade: qtd,
        custo,
        precoVenda: preco > 0n ? preco : null,
        precoVendaVigente: p.precoVenda,
      },
    ]);
    setNotaProdutoId('');
    setNotaQtd('');
    setNotaCusto('');
    setNotaPreco('');
  }

  function removerLinhaNota(index: number) {
    setNotaLinhas((linhas) => linhas.filter((_, i) => i !== index));
  }

  async function salvarNota() {
    if (notaLinhas.length === 0) {
      toast.erro('Adicione ao menos um produto à nota.');
      return;
    }
    if (!notaData) {
      toast.erro('Informe a data da nota.');
      return;
    }
    const guarda = await guardaEntradaNaData(notaData, 'Salvar a nota');
    if (!guarda) return;

    setSalvandoNota(true);
    try {
      // Linhas removidas (estavam na nota e saíram) → apagar.
      const idsAtuais = new Set(notaLinhas.filter((l) => l.entradaId).map((l) => l.entradaId));
      for (const idOrig of notaIdsOriginais) {
        if (!idsAtuais.has(idOrig)) await removerEntradaMercadoria(idOrig);
      }
      // Linhas existentes alteradas → atualizar; linhas novas → inserir (com nota_id).
      for (const linha of notaLinhas) {
        if (linha.entradaId) {
          await atualizarEntradaMercadoria(linha.entradaId, {
            quantidade: linha.quantidade,
            custoUnitarioCentavos: linha.custo,
            data: notaData,
          });
        } else {
          await registrarEntradaComPreco({
            produtoId: linha.produtoId,
            quantidade: linha.quantidade,
            custo: linha.custo,
            data: notaData,
            precoVenda: linha.precoVenda,
            precoVendaVigente: linha.precoVendaVigente,
            notaId,
          });
        }
      }
      if (guarda.recalcular) await recalcularCascata(notaData, true);
      toast.sucesso(notaModo === 'edicao' ? 'Nota atualizada.' : `Nota lançada: ${notaLinhas.length} ${notaLinhas.length === 1 ? 'item' : 'itens'}.`);
      setModalNotaAberto(false);
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao salvar a nota de entrada.');
    } finally {
      setSalvandoNota(false);
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

  // ---- Gestão de categorias de produto ----
  function limparFormCategoria() {
    setCatEditandoId(null);
    setCatNome('');
    const prox = categorias.length > 0 ? Math.max(...categorias.map((c) => c.ordem)) + 10 : 10;
    setCatOrdem(prox);
  }

  function abrirCategorias() {
    limparFormCategoria();
    setModalCategoriasAberto(true);
  }

  function editarCategoria(c: Categoria) {
    setCatEditandoId(c.id);
    setCatNome(c.nome);
    setCatOrdem(c.ordem);
  }

  async function aoSalvarCategoria(e: FormEvent) {
    e.preventDefault();
    if (!catNome.trim()) {
      toast.erro('Informe o nome da categoria.');
      return;
    }
    setSalvandoCategoria(true);
    try {
      await salvarCategoria({ id: catEditandoId ?? uuidv7(), nome: catNome.trim(), ordem: catOrdem });
      toast.sucesso(catEditandoId ? 'Categoria atualizada.' : 'Categoria cadastrada.');
      await carregarCategorias();
      limparFormCategoria();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao salvar a categoria.');
    } finally {
      setSalvandoCategoria(false);
    }
  }

  async function aoExcluirCategoria(c: Categoria) {
    if (!confirm(`Excluir a categoria "${c.nome}"? Esta ação é definitiva.`)) return;
    try {
      await removerCategoria(c.id);
      toast.sucesso('Categoria excluída.');
      if (catEditandoId === c.id) limparFormCategoria();
      await carregarCategorias();
    } catch (err) {
      console.error(err);
      toast.erro(
        (err as Error)?.message === 'NAO_EXCLUIDO'
          ? 'Esta categoria tem produtos vinculados — mova/remova os produtos antes.'
          : 'Erro ao excluir a categoria.',
      );
    }
  }

  async function aoExcluirProduto(p: ProdutoNaData) {
    if (!confirm(`Excluir o produto "${p.nome}"? Esta ação é definitiva.`)) return;
    try {
      await removerProduto(p.id);
      toast.sucesso('Produto excluído.');
      setModalAcoesAberto(false);
      await carregarProdutos();
    } catch (err) {
      console.error(err);
      toast.erro(
        (err as Error)?.message === 'NAO_EXCLUIDO'
          ? 'Este produto já foi usado (contagem, entrada, perda ou venda) — apenas inative-o.'
          : 'Erro ao excluir produto.',
      );
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
    // Coluna "Entrada" só aparece nos dias com entrada lançada (mostra a do dia selecionado).
    ...(entradasDoDia.size > 0
      ? [{
          chave: 'entradaDia',
          titulo: 'Entrada',
          alinhar: 'right' as const,
          render: (p: ProdutoNaData) => {
            const q = entradasDoDia.get(p.id) ?? 0;
            return <span className="numeros text-claro/60">{q > 0 ? `+${q}` : '—'}</span>;
          },
        }]
      : []),
    {
      chave: 'saidas',
      titulo: 'Saídas',
      alinhar: 'right',
      render: (p) => <span className="numeros text-suave">{saidasPorProduto.get(p.id) ?? 0}</span>,
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

  const termoBusca = busca.trim().toLowerCase();
  const produtosFiltrados = produtos.filter((p) => {
    if (filtroStatus === 'ativos' && !p.ativo) return false;
    if (filtroStatus === 'inativos' && p.ativo) return false;
    if (filtroCategoriaNome && p.categoriaNome !== filtroCategoriaNome) return false;
    if (termoBusca && !`${p.nome} ${p.categoriaNome}`.toLowerCase().includes(termoBusca)) return false;
    return true;
  });
  const temFiltroProdutos = busca || filtroCategoriaNome || de || ate;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-borda/40 relative">
        <h2 className="text-lg font-bold text-claro">Mercadorias & Produtos</h2>
        
        <div className="flex items-center gap-2">
          {/* Botão de Filtro (Toggle) */}
          <button
            type="button"
            onClick={() => setFiltrosAbertos(!filtrosAbertos)}
            className={`p-2 rounded-xl border border-borda transition-all cursor-pointer relative ${
              filtrosAbertos ? 'bg-claro/10 text-claro' : 'bg-claro/[0.02] text-suave hover:text-claro hover:bg-claro/[0.05]'
            }`}
            title="Mostrar/Ocultar Filtros"
          >
            <IconeFiltro />
            {(temFiltroProdutos || filtroStatus !== 'ativos') && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-positivo animate-pulse" />
            )}
          </button>

          {/* Botão de Engrenagem (Ações no Click) */}
          {podeCadastrar && (
            <div className="relative" ref={gearRef}>
              <button
                type="button"
                onClick={() => setMenuAberto(!menuAberto)}
                className={`p-2 rounded-xl border border-borda transition-all cursor-pointer ${
                  menuAberto ? 'bg-claro/10 text-claro' : 'bg-claro/[0.02] text-suave hover:text-claro hover:bg-claro/[0.05]'
                }`}
                title="Outras Ações"
              >
                <IconeEngrenagem />
              </button>
              
              {menuAberto && (
                <div className="absolute right-0 top-full mt-2 z-40 bg-elevado border border-borda rounded-2xl p-3 shadow-2xl w-48 text-left animate-surgir">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => { abrirNovo(); setMenuAberto(false); }}
                      className="w-full btn btn-suave justify-start py-2 text-sm flex items-center gap-2"
                    >
                      <IconePlus /> Novo produto
                    </button>
                    <button
                      type="button"
                      onClick={() => { abrirCategorias(); setMenuAberto(false); }}
                      className="w-full btn btn-suave justify-start py-2 text-sm"
                    >
                      Categorias
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botão principal de Adicionar Estoque */}
          {podeCadastrar && (
            <button
              type="button"
              onClick={abrirNota}
              className="btn btn-primario px-4 py-2 text-sm flex items-center gap-2"
            >
              <IconeEstoque /> Adicionar estoque
            </button>
          )}
        </div>
      </div>

      {/* Filtros em linha (Toggled by filtrosAbertos) */}
      {filtrosAbertos && (
        <div className="cartao flex flex-wrap items-end gap-3 p-4 animar-surgir">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-suave">Buscar</label>
            <input
              className={CLASSE_CAMPO}
              placeholder="Nome ou categoria…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-suave">Categoria</label>
            <select
              aria-label="Filtrar por categoria"
              className={CLASSE_CAMPO}
              value={filtroCategoriaNome}
              onChange={(e) => setFiltroCategoriaNome(e.target.value)}
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.nome}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-suave">Status</label>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as any)}
              className={CLASSE_CAMPO}
            >
              <option value="ativos">Apenas Ativos</option>
              <option value="inativos">Apenas Inativos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-suave">Saídas de</label>
            <input aria-label="Saídas de" type="date" className={CLASSE_CAMPO} value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-suave">Até</label>
            <input aria-label="Saídas até" type="date" className={CLASSE_CAMPO} value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          {temFiltroProdutos && (
            <button
              type="button"
              className="btn btn-suave px-3 py-2 text-sm"
              onClick={() => { setBusca(''); setFiltroCategoriaNome(''); setDe(''); setAte(''); }}
            >
              Limpar
            </button>
          )}
        </div>
      )}

      <div className="px-1 text-xs text-suave">
        Coluna <strong className="text-claro">Saídas</strong> = vendido entre{' '}
        {formatarDataBR(periodoSaidasDe)} e {formatarDataBR(periodoSaidasAte)}.
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
            {modoApuracao === 'contagem' && !bloquearDiaZero && (
              <Campo label="Estoque inicial (Dia Zero)" dica="Apenas para iniciar o sistema">
                <input
                  type="text"
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  placeholder="Ex.: 0,00"
                  value={estoqueInicial}
                  onChange={(e) => setEstoqueInicial(e.target.value)}
                />
              </Campo>
            )}
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
            {modoApuracao === 'contagem' && (
              <Campo 
                label={bloquearDiaZero ? "Estoque inicial (Dia Zero) [Bloqueado]" : "Estoque inicial (Dia Zero)"} 
                dica={bloquearDiaZero ? "Bloqueado pois já existem fechamentos posteriores" : "Estoque de partida do sistema"}
              >
                <input
                  type="text"
                  className={`${CLASSE_CAMPO} numeros text-right ${bloquearDiaZero ? 'bg-claro/5 cursor-not-allowed text-suave' : ''}`}
                  placeholder="Ex.: 0,00"
                  disabled={bloquearDiaZero}
                  value={estoqueInicial}
                  onChange={(e) => setEstoqueInicial(e.target.value)}
                />
              </Campo>
            )}
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
          <form onSubmit={aoSalvarEntrada} className="flex flex-col gap-3 rounded-xl border border-borda bg-claro/[0.02] p-4">
            <div className="max-w-[200px]">
              <Campo label="Data da Entrada" obrigatorio>
                <input
                  type="date"
                  aria-label="Data da entrada"
                  className={CLASSE_CAMPO}
                  value={entradaData}
                  onChange={(e) => setEntradaData(e.target.value)}
                />
              </Campo>
            </div>
            <div className={`grid grid-cols-2 gap-4 items-end ${entradaEditandoId ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
              <Campo label="Quantidade" obrigatorio>
                <input
                  type="number"
                  min="1"
                  step="any"
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
              {!entradaEditandoId && (
                <Campo label="Preço de venda (R$)" dica="Atualiza o preço a partir desta data">
                  <input
                    className={CLASSE_CAMPO}
                    placeholder="Ex.: 5,00"
                    value={entradaPrecoVendaStr}
                    onChange={(e) => setEntradaPrecoVendaStr(e.target.value)}
                  />
                </Campo>
              )}
              <div>
                <button type="submit" disabled={adicionandoEntrada} className="w-full btn btn-primario py-2 text-sm transition-all active:scale-98">
                  {adicionandoEntrada ? 'Salvando…' : entradaEditandoId ? 'Salvar alteração' : 'Registrar'}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-suave">
                {entradaEditandoId ? (
                  <button type="button" onClick={cancelarEdicaoEntrada} className="text-ambar hover:underline">
                    Cancelar edição
                  </button>
                ) : (
                  'Informe o preço de venda só se ele mudou nesta compra.'
                )}
              </span>
              <span className="text-claro">
                Total da compra:{' '}
                <strong className="numeros text-positivo">
                  {formatReais(asCentavos(BigInt(Math.round((Number(entradaQtdStr) || 0) * Number(parseReais(entradaCustoStr))))))}
                </strong>
              </span>
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
                      <th className="p-3 w-[24%] font-semibold">Data</th>
                      <th className="p-3 w-[12%] text-right font-semibold">Qtd</th>
                      <th className="p-3 w-[18%] text-right font-semibold">Unitário</th>
                      <th className="p-3 w-[18%] text-right font-semibold">Total</th>
                      <th className="p-3 w-[12%] text-right font-semibold">Tipo</th>
                      <th className="p-3 w-[16%] text-right font-semibold"></th>
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
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => aoEditarEntrada(e)}
                                  className="text-suave hover:text-ambar p-1"
                                  title="Editar entrada"
                                >
                                  <IconeEditar />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void aoExcluirEntrada(e)}
                                  className="text-negativo hover:text-negativo/80 p-1"
                                  title="Excluir entrada"
                                >
                                  <IconeLixeira />
                                </button>
                              </div>
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

      <Modal
        aberto={modalNotaAberto}
        aoFechar={() => setModalNotaAberto(false)}
        titulo={notaModo === 'edicao' ? 'Editar nota de entrada' : 'Adicionar estoque (nota)'}
        larguraMax="max-w-5xl"
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[45%_55%] lg:items-start">
            {/* Coluna Esquerda: Barra de Edição + Formulário de Produto */}
            <div className="flex flex-col gap-5">
              {/* Barra: nova nota / editar existente + data */}
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-borda bg-claro/[0.02] p-3">
                <div className="min-w-[220px] flex-1">
                  <label className="mb-1 block text-xs font-medium text-suave">Editar nota existente</label>
                  <select
                    aria-label="Editar nota existente"
                    className={CLASSE_CAMPO}
                    value={notaModo === 'edicao' ? notaId : ''}
                    onChange={(e) => void aoEditarNotaExistente(e.target.value)}
                  >
                    <option value="">— nova nota —</option>
                    {notasExistentes.map((n) => (
                      <option key={n.notaId} value={n.notaId}>
                        {formatarDataBR(n.data)} · {n.itens} {n.itens === 1 ? 'item' : 'itens'} · {formatReais(n.totalCentavos)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-[160px]">
                  <label className="mb-1 block text-xs font-medium text-suave">Data da nota</label>
                  <input
                    type="date"
                    aria-label="Data da nota"
                    className={CLASSE_CAMPO}
                    value={notaData}
                    onChange={(e) => setNotaData(e.target.value)}
                  />
                </div>
                {notaModo === 'edicao' && (
                  <button type="button" onClick={novaNota} className="btn btn-suave px-3 py-2 text-sm">
                    Nova nota
                  </button>
                )}
              </div>

              {/* Editor de produto */}
              <div className="flex flex-col gap-3 rounded-xl border border-borda bg-claro/[0.02] p-4">
                <h4 className="text-sm font-bold text-claro">Adicionar produto à nota</h4>
                <div className="flex flex-col gap-3">
                  <Campo label="Produto" obrigatorio>
                    <Combobox
                      options={produtos.filter((p) => p.ativo).map((p) => ({
                        id: p.id,
                        label: p.nome
                      }))}
                      value={notaProdutoId}
                      onChange={(id) => aoSelecionarProdutoNota(id)}
                      placeholder="Digite para buscar ou selecione..."
                    />
                  </Campo>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                    <Campo label="Qtd" obrigatorio>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        className={`${CLASSE_CAMPO} numeros text-right`}
                        placeholder="0"
                        value={notaQtd}
                        onChange={(e) => setNotaQtd(e.target.value)}
                      />
                    </Campo>
                    <Campo label="Custo (R$)" obrigatorio>
                      <input
                        className={`${CLASSE_CAMPO} numeros text-right`}
                        placeholder="0,00"
                        value={notaCusto}
                        onChange={(e) => setNotaCusto(e.target.value)}
                      />
                    </Campo>
                    <Campo label="Preço venda (R$)">
                      <input
                        className={`${CLASSE_CAMPO} numeros text-right`}
                        placeholder="0,00"
                        value={notaPreco}
                        onChange={(e) => setNotaPreco(e.target.value)}
                      />
                    </Campo>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-suave">
                    Total da linha:{' '}
                    <strong className="numeros text-claro">
                      {formatReais(asCentavos(BigInt(Math.round((Number(notaQtd) || 0) * Number(parseReais(notaCusto))))))}
                    </strong>
                  </span>
                  <button type="button" onClick={adicionarLinhaNota} className="btn btn-primario px-4 py-2 text-sm">
                    <IconePlus /> Adicionar
                  </button>
                </div>
              </div>
            </div>

            {/* Coluna Direita: Lista da nota (full width, cresce) */}
            <div className="flex flex-col gap-2 h-full">
            <h4 className="text-sm font-bold text-claro">Itens da nota</h4>
            {notaLinhas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-borda py-8 text-center text-xs text-suave">
                Nenhum item ainda. Use o formulário para adicionar produtos.
              </div>
            ) : (
              <div className="overflow-y-auto rounded-xl border border-borda max-h-72">
                <table className="w-full text-left text-xs table-fixed">
                  <thead className="bg-ardosia text-suave border-b border-borda sticky top-0 z-10">
                    <tr>
                      <th className="p-2 w-[40%] font-semibold">Produto</th>
                      <th className="p-2 w-[14%] text-right font-semibold">Qtd</th>
                      <th className="p-2 w-[20%] text-right font-semibold">Custo</th>
                      <th className="p-2 w-[20%] text-right font-semibold">Total</th>
                      <th className="p-2 w-[6%]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {notaLinhas.map((l, i) => (
                      <tr key={l.entradaId ?? `${l.produtoId}-${i}`} className="hover:bg-claro/[0.01]">
                        <td className="p-2 font-medium text-claro truncate">{l.nome}</td>
                        <td className="p-2 numeros text-right text-claro">{l.quantidade}</td>
                        <td className="p-2 numeros text-right text-claro">{formatReais(l.custo)}</td>
                        <td className="p-2 numeros text-right font-semibold text-positivo">
                          {formatReais(asCentavos(BigInt(Math.round(l.quantidade * Number(l.custo)))))}
                        </td>
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            onClick={() => removerLinhaNota(i)}
                            className="text-negativo hover:text-negativo/80 p-1"
                            title="Remover item"
                          >
                            <IconeLixeira />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl border border-positivo/40 bg-positivo/[0.06] px-4 py-2">
              <span className="text-sm font-semibold text-positivo">Total da nota</span>
              <span className="numeros text-lg font-extrabold text-positivo">
                {formatReais(
                  asCentavos(
                    notaLinhas.reduce((acc, l) => acc + BigInt(Math.round(l.quantidade * Number(l.custo))), 0n),
                  ),
                )}
              </span>
            </div>
          </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalNotaAberto(false)}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void salvarNota()}
              disabled={salvandoNota || notaLinhas.length === 0}
              className="btn btn-primario px-4 py-2 text-sm"
            >
              {salvandoNota ? 'Salvando…' : notaModo === 'edicao' ? 'Salvar alterações' : 'Salvar nota'}
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

          {podeCadastrar && (
            <button
              type="button"
              onClick={() => {
                if (selecionado) void aoExcluirProduto(selecionado);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-negativo/20 bg-negativo/[0.04] hover:bg-negativo/10 hover:border-negativo/40 transition-all text-left text-sm font-semibold text-negativo group"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-negativo/10 text-negativo">
                <IconeLixeira />
              </div>
              <span className="flex-1">Excluir Produto</span>
              <IconeChevronDireita />
            </button>
          )}
        </div>
      </Modal>

      {/* Modal: gestão de categorias de produto */}
      <Modal
        aberto={modalCategoriasAberto}
        aoFechar={() => setModalCategoriasAberto(false)}
        titulo="Categorias de produto"
        descricao="Agrupam os produtos e definem a ordem no fechamento. Só dá para excluir uma categoria sem produtos."
        larguraMax="max-w-lg"
      >
        <div className="flex flex-col gap-6">
          <form onSubmit={aoSalvarCategoria} className="flex flex-col gap-4 rounded-xl border border-borda bg-claro/[0.02] p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Campo label="Nome" obrigatorio>
                  <input
                    className={CLASSE_CAMPO}
                    placeholder="Ex.: Bebidas, Conveniência"
                    value={catNome}
                    onChange={(e) => setCatNome(e.target.value)}
                  />
                </Campo>
              </div>
              <Campo label="Ordem">
                <input
                  type="number"
                  aria-label="Ordem da categoria"
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  value={catOrdem}
                  onChange={(e) => setCatOrdem(Number(e.target.value))}
                />
              </Campo>
            </div>
            <div className="flex justify-end gap-2">
              {catEditandoId && (
                <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={limparFormCategoria}>
                  Cancelar edição
                </button>
              )}
              <button type="submit" disabled={salvandoCategoria} className="btn btn-primario px-4 py-2 text-sm">
                {salvandoCategoria ? 'Salvando…' : catEditandoId ? 'Salvar alterações' : 'Adicionar categoria'}
              </button>
            </div>
          </form>

          {categorias.length === 0 ? (
            <div className="text-center text-xs text-suave py-4">Nenhuma categoria cadastrada.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {[...categorias].sort((a, b) => a.ordem - b.ordem).map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-borda px-3 py-2">
                  <span className="text-sm text-claro">
                    <span className="numeros text-xs text-suave mr-2">{c.ordem}</span>
                    {c.nome}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => editarCategoria(c)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-suave hover:bg-claro/10 hover:text-ambar transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void aoExcluirCategoria(c)}
                      title="Excluir (só se sem produtos)"
                      className="rounded-md px-2 py-1 text-xs font-medium text-negativo hover:bg-negativo/10 transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalCategoriasAberto(false)}>
              Fechar
            </button>
          </div>
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

function IconeEngrenagem() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconeFiltro() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.477 8 1.4V7a1 1 0 01-.293.707L14.414 13a1 1 0 00-.293.707v5.586a1 1 0 01-.293.707l-3.414 3.414A1 1 0 019 22.586V13.707a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4.4C5.545 3.477 8.245 3 12 3z" />
    </svg>
  );
}
