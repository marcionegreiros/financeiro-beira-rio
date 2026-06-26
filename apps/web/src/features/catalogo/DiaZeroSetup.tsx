import { useState, useEffect } from 'react';
import { useToast } from '../../components/ui/Toast';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import {
  listarCategorias,
  inicializarSistemaLote,
  type Categoria,
  type DadosSetupCombustivel,
  type DadosSetupProduto,
  type DadosSetupConta,
} from '../../data/repositorios';
import { asCentavos, parseReais } from '../../lib/money';
import { hojeManaus, formatarDataBR } from '../../lib/datas';

interface Props {
  usuarioId: string | null;
  aoConcluir: () => void;
}

type Etapa = 'config' | 'combustiveis' | 'produtos' | 'contas' | 'confirmacao';

export function DiaZeroSetup({ usuarioId, aoConcluir }: Props) {
  const toast = useToast();
  const [etapa, setEtapa] = useState<Etapa>('config');

  // Categorias de produtos do banco
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  // ---- ESTADOS DE DADOS DO SETUP ----
  
  // Passo 1: Config Geral
  const [dataDiaZero, setDataDiaZero] = useState(hojeManaus());
  const [trocoGavetaStr, setTrocoGavetaStr] = useState('0,00');

  // Passo 2: Combustíveis, Tanques e Bicos
  const [listaCombustiveis, setListaCombustiveis] = useState<DadosSetupCombustivel[]>([]);
  
  // Formulário ativo para adicionar Combustível/Tanque
  const [combModo, setCombModo] = useState<'lista' | 'livre'>('lista');
  const [combNome, setCombNome] = useState('');
  const [combPrecoVenda, setCombPrecoVenda] = useState('');
  const [combPrecoCusto, setCombPrecoCusto] = useState('');
  const [tanqueModo, setTanqueModo] = useState<'lista' | 'livre'>('lista');
  const [tanqueNome, setTanqueNome] = useState('');
  const [tanqueCapacidade, setTanqueCapacidade] = useState('');
  const [tanqueAlerta, setTanqueAlerta] = useState('');
  const [bicoFormNome, setBicoFormNome] = useState('');
  const [bicoFormLeitura, setBicoFormLeitura] = useState('');
  const [bicosTemporarios, setBicosTemporarios] = useState<{ nome: string; encerranteInicial: number }[]>([]);

  // Passo 3: Produtos
  const [listaProdutos, setListaProdutos] = useState<DadosSetupProduto[]>([]);
  const [prodNome, setProdNome] = useState('');
  const [prodCategoriaId, setProdCategoriaId] = useState('');
  const [prodModo, setProdModo] = useState<'contagem' | 'individual'>('contagem');
  const [prodPrecoVenda, setProdPrecoVenda] = useState('');
  const [prodPrecoCusto, setProdPrecoCusto] = useState('');
  const [prodEstoqueInicial, setProdEstoqueInicial] = useState('');
  const [prodAlertaBaixo, setProdAlertaBaixo] = useState('');
  const [prodAlertaMuitoBaixo, setProdAlertaMuitoBaixo] = useState('');

  // Passo 4: Contas
  const [listaContas, setListaContas] = useState<DadosSetupConta[]>([]);
  const [contaModo, setContaModo] = useState<'lista' | 'livre'>('lista');
  const [contaNovaNome, setContaNovaNome] = useState('');
  const [contaNovaTipoUI, setContaNovaTipoUI] = useState('banco');
  const [contaNovaTipoOutro, setContaNovaTipoOutro] = useState('');
  const [contaNovaSaldo, setContaNovaSaldo] = useState('');

  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    listarCategorias()
      .then((cats) => {
        setCategorias(cats);
        const primeiraCat = cats[0];
        if (primeiraCat) setProdCategoriaId(primeiraCat.id);
      })
      .catch(console.error);
  }, []);

  // ---- AUXILIARES DE FORMATAÇÃO E INPUT ----

  function formatarDinheiroInput(valor: string) {
    const limpo = valor.replace(/\D/g, '');
    if (!limpo) return '0,00';
    const num = Number(limpo) / 100;
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---- ADIÇÃO / MANIPULAÇÃO DE DADOS ----

  function adicionarBicoTemporario() {
    if (!bicoFormNome.trim()) return toast.erro('Informe o nome do bico.');
    const leitura = Number(bicoFormLeitura.replace(',', '.'));
    if (isNaN(leitura) || leitura < 0) return toast.erro('Encerrante inicial inválido.');

    setBicosTemporarios(prev => [...prev, { nome: bicoFormNome.trim(), encerranteInicial: leitura }]);
    setBicoFormNome('');
    setBicoFormLeitura('');
  }

  function removerBicoTemporario(index: number) {
    setBicosTemporarios(prev => prev.filter((_, i) => i !== index));
  }

  function editarBicoTemporario(index: number) {
    if (bicoFormNome.trim()) {
      return toast.erro("Você tem um bico preenchido no formulário. Confirme ou limpe antes de editar outro.");
    }
    const b = bicosTemporarios[index];
    setBicoFormNome(b.nome);
    setBicoFormLeitura(b.encerranteInicial.toLocaleString('pt-BR'));
    removerBicoTemporario(index);
  }

  function adicionarCombustivelCompleto() {
    if (!combNome.trim()) return toast.erro('Informe o nome do combustível.');
    if (!combPrecoVenda) return toast.erro('Informe o preço de venda.');
    if (!combPrecoCusto) return toast.erro('Informe o preço de custo.');
    if (!tanqueNome.trim()) return toast.erro('Informe o nome do tanque.');
    const cap = Number(tanqueCapacidade.replace(/\./g, '').replace(',', '.'));
    if (isNaN(cap) || cap <= 0) return toast.erro('Capacidade do tanque inválida.');
    const alerta = tanqueAlerta ? Number(tanqueAlerta.replace(/\./g, '').replace(',', '.')) : 0;

    if (bicosTemporarios.length === 0) {
      return toast.erro('Adicione pelo menos um bico/bomba ao tanque.');
    }

    const precoV = parseReais(combPrecoVenda);
    const precoC = parseReais(combPrecoCusto);

    const novoComb: DadosSetupCombustivel = {
      nome: combNome.trim(),
      precoVenda: precoV,
      precoCusto: precoC,
      tanque: {
        nome: tanqueNome.trim(),
        capacidade: cap,
        nivelAlerta: alerta
      },
      bicos: bicosTemporarios
    };

    setListaCombustiveis(prev => [...prev, novoComb]);

    // Limpa form
    setCombModo('lista');
    setCombNome('');
    setCombPrecoVenda('');
    setCombPrecoCusto('');
    setTanqueModo('lista');
    setTanqueNome('');
    setTanqueCapacidade('');
    setTanqueAlerta('');
    setBicoFormNome('');
    setBicoFormLeitura('');
    setBicosTemporarios([]);
    toast.sucesso('Combustível e Tanque configurados.');
  }

  function removerCombustivelLista(index: number) {
    setListaCombustiveis(prev => prev.filter((_, i) => i !== index));
  }

  function editarCombustivelLista(index: number) {
    if (combNome.trim() || tanqueNome.trim()) {
      return toast.erro("Você tem um combustível ou tanque preenchido. Confirme ou limpe antes de editar outro.");
    }
    const c = listaCombustiveis[index];
    const ehPadraoComb = ['Gasolina Comum', 'Gasolina Aditivada', 'Etanol', 'Diesel S10', 'Diesel S500'].includes(c.nome);
    setCombModo(ehPadraoComb ? 'lista' : 'livre');
    setCombNome(c.nome);
    setCombPrecoVenda((Number(c.precoVenda) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setCombPrecoCusto((Number(c.precoCusto) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    
    const ehPadraoTanque = ['Tanque 1', 'Tanque 2', 'Tanque 3'].includes(c.tanque.nome) || listaCombustiveis.some((lc, i) => i !== index && lc.tanque.nome === c.tanque.nome);
    setTanqueModo(ehPadraoTanque ? 'lista' : 'livre');
    setTanqueNome(c.tanque.nome);
    setTanqueCapacidade(c.tanque.capacidade.toLocaleString('pt-BR'));
    setTanqueAlerta(c.tanque.nivelAlerta ? c.tanque.nivelAlerta.toLocaleString('pt-BR') : '');
    
    setBicosTemporarios(c.bicos);
    removerCombustivelLista(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function adicionarProdutoLista() {
    if (!prodNome.trim()) return toast.erro('Informe o nome do produto.');
    if (!prodCategoriaId) return toast.erro('Selecione a categoria.');
    if (!prodPrecoVenda) return toast.erro('Informe o preço de venda.');
    if (!prodPrecoCusto) return toast.erro('Informe o preço de custo.');

    const estoque = prodEstoqueInicial ? Number(prodEstoqueInicial.replace(',', '.')) : 0;
    const alertB = prodAlertaBaixo ? Number(prodAlertaBaixo) : null;
    const alertMB = prodAlertaMuitoBaixo ? Number(prodAlertaMuitoBaixo) : null;

    const novoProd: DadosSetupProduto = {
      nome: prodNome.trim(),
      categoriaId: prodCategoriaId,
      modoApuracao: prodModo,
      ordem: (listaProdutos.length + 1) * 10,
      precoVenda: parseReais(prodPrecoVenda),
      precoCusto: parseReais(prodPrecoCusto),
      estoqueInicial: estoque,
      alertaBaixo: alertB,
      alertaMuitoBaixo: alertMB
    };

    setListaProdutos(prev => [...prev, novoProd]);

    // Limpa form
    setProdNome('');
    setProdPrecoVenda('');
    setProdPrecoCusto('');
    setProdEstoqueInicial('');
    setProdAlertaBaixo('');
    setProdAlertaMuitoBaixo('');
    toast.sucesso('Produto adicionado ao catálogo.');
  }

  function removerProdutoLista(index: number) {
    setListaProdutos(prev => prev.filter((_, i) => i !== index));
  }

  function editarProdutoLista(index: number) {
    if (prodNome.trim()) {
      return toast.erro("Você tem um produto preenchido no formulário. Confirme ou limpe antes de editar outro.");
    }
    const p = listaProdutos[index];
    setProdNome(p.nome);
    setProdCategoriaId(p.categoriaId);
    setProdModo(p.modoApuracao as 'contagem' | 'individual');
    setProdPrecoVenda((Number(p.precoVenda) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setProdPrecoCusto((Number(p.precoCusto) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setProdEstoqueInicial(p.estoqueInicial ? p.estoqueInicial.toLocaleString('pt-BR') : '');
    setProdAlertaBaixo(p.alertaBaixo ? p.alertaBaixo.toLocaleString('pt-BR') : '');
    setProdAlertaMuitoBaixo(p.alertaMuitoBaixo ? p.alertaMuitoBaixo.toLocaleString('pt-BR') : '');
    removerProdutoLista(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function adicionarContaLista() {
    if (!contaNovaNome.trim()) return toast.erro('Informe o nome da conta.');
    const saldo = contaNovaSaldo ? parseReais(contaNovaSaldo) : asCentavos(0n);
    
    // Determina o tipo real para o banco de dados (o sistema só opera com dinheiro físico ou banco/digital)
    const tipoRealDB = contaNovaTipoUI === 'dinheiro' ? 'dinheiro' : 'banco';
    
    // Se for a primeira conta bancária (e não houver outra padrão), marca como padrão
    const seraPadrao = tipoRealDB === 'banco' && !listaContas.some(c => c.ehDestinoPadraoVenda);

    const novaConta: DadosSetupConta & { tipoUI?: string } = {
      nome: contaNovaNome.trim(),
      tipo: tipoRealDB,
      tipoUI: contaNovaTipoUI === 'outro' ? contaNovaTipoOutro.trim() || 'Outro' : contaNovaTipoUI,
      ehDestinoPadraoVenda: seraPadrao,
      saldoInicial: saldo
    };

    setListaContas(prev => [...prev, novaConta]);
    setContaModo('lista');
    setContaNovaNome('');
    setContaNovaSaldo('');
    setContaNovaTipoUI('banco');
    setContaNovaTipoOutro('');
    toast.sucesso('Conta cadastrada.');
  }

  function removerContaLista(index: number) {
    setListaContas(prev => prev.filter((_, i) => i !== index));
  }

  function editarContaLista(index: number) {
    if (contaNovaNome.trim()) {
      return toast.erro("Você tem uma conta preenchida no formulário. Confirme ou limpe antes de editar outra.");
    }
    const c = listaContas[index];
    const ehPadraoNome = ['Caixa Gaveta', 'Conta Bradesco', 'Banco do Brasil', 'Nubank'].includes(c.nome);
    setContaModo(ehPadraoNome ? 'lista' : 'livre');
    setContaNovaNome(c.nome);
    
    // Recupera o tipo UI
    const cExt = c as DadosSetupConta & { tipoUI?: string };
    if (cExt.tipoUI && ['dinheiro', 'banco', 'banco_digital'].includes(cExt.tipoUI)) {
      setContaNovaTipoUI(cExt.tipoUI);
    } else if (cExt.tipoUI) {
      setContaNovaTipoUI('outro');
      setContaNovaTipoOutro(cExt.tipoUI);
    } else {
      setContaNovaTipoUI(c.tipo);
    }
    
    setContaNovaSaldo((Number(c.saldoInicial) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    removerContaLista(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function marcarContaComoPadrao(index: number) {
    setListaContas(prev => prev.map((c, i) => ({
      ...c,
      ehDestinoPadraoVenda: i === index
    })));
  }

  // ---- SUBMIT E INICIALIZAÇÃO FINAL ----
  
  function avancarParaProdutos() {
    if (combNome.trim() || tanqueNome.trim()) {
      return toast.erro("Você tem um combustível/tanque preenchido mas não adicionado. Clique em 'Confirmar Combustível & Tanque' ou limpe os campos antes de avançar.");
    }
    setEtapa('produtos');
  }

  function avancarParaContas() {
    if (prodNome.trim()) {
      return toast.erro("Você tem um produto preenchido mas não adicionado. Clique em 'Adicionar Produto' ou limpe os campos antes de avançar.");
    }
    setEtapa('contas');
  }

  function avancarParaConfirmacao() {
    if (contaNovaNome.trim()) {
      return toast.erro("Você tem uma conta preenchida mas não adicionada. Clique em 'Adicionar Conta' ou limpe os campos antes de avançar.");
    }
    if (!listaContas.some(c => c.tipo === 'dinheiro')) {
      return toast.erro('Adicione a conta de Dinheiro Físico antes de avançar.');
    }
    if (!listaContas.some(c => c.tipo !== 'dinheiro' && c.ehDestinoPadraoVenda)) {
      return toast.erro('Adicione pelo menos um Banco marcado como Destino Padrão (Cartão/PIX).');
    }
    setEtapa('confirmacao');
  }

  async function aoConfirmarEAtivar() {
    if (listaCombustiveis.length === 0) {
      return toast.erro('Cadastre pelo menos 1 combustível para iniciar.');
    }
    if (listaContas.length === 0 || !listaContas.some(c => c.tipo === 'dinheiro') || !listaContas.some(c => c.ehDestinoPadraoVenda)) {
      return toast.erro('As contas (Dinheiro e Banco Padrão) não foram configuradas corretamente.');
    }

    setSalvando(true);
    try {
      const trocoCentavos = parseReais(trocoGavetaStr);
      await inicializarSistemaLote({
        dataDiaZero,
        trocoFixoCentavos: Number(trocoCentavos),
        combustiveis: listaCombustiveis,
        produtos: listaProdutos,
        contas: listaContas,
        usuarioId
      });

      toast.sucesso('Sistema inicializado com sucesso!');
      aoConcluir();
    } catch (err) {
      console.error(err);
      toast.erro('Falha crítica na inicialização do sistema.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 animate-fadeIn">
      {/* Topo / Header */}
      <div className="mb-8 flex flex-col items-center justify-center relative text-center">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-claro md:text-4xl">
          Inicialização do Sistema
        </h1>
        <p className="mt-2 text-sm text-suave md:text-base">
          Configure as informações básicas e de partida para ativar o controle financeiro do Pontão Beira Rio.
        </p>
      </div>

      {/* Grid de Navegação e Abas */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
        {/* Barra Lateral de Etapas */}
        <div className="md:col-span-1 flex flex-col gap-2">
          {etapa !== 'config' && (
             <div className="mb-4 rounded-xl border border-ambar/30 bg-ambar/5 p-3 text-center">
               <span className="block text-[10px] uppercase font-bold text-ambar/70">Data de Apuração (Dia Zero)</span>
               <span className="font-bold text-ambar text-sm">{formatarDataBR(dataDiaZero)}</span>
             </div>
          )}
          <h2 className="text-xs font-bold uppercase tracking-wider text-suave mb-2 px-1">Passos</h2>
          
          <button
            onClick={() => setEtapa('config')}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all ${
              etapa === 'config'
                ? 'bg-ambar text-sobreacento shadow-lg shadow-ambar/20'
                : 'bg-ardosia/40 text-suave border border-borda/40 hover:bg-ardosia/65'
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">1</span>
            Data & Caixa
          </button>

          <button
            onClick={() => setEtapa('combustiveis')}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all ${
              etapa === 'combustiveis'
                ? 'bg-ambar text-sobreacento shadow-lg shadow-ambar/20'
                : 'bg-ardosia/40 text-suave border border-borda/40 hover:bg-ardosia/65'
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">2</span>
            Tanques & Bicos
          </button>

          <button
            onClick={() => setEtapa('produtos')}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all ${
              etapa === 'produtos'
                ? 'bg-ambar text-sobreacento shadow-lg shadow-ambar/20'
                : 'bg-ardosia/40 text-suave border border-borda/40 hover:bg-ardosia/65'
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">3</span>
            Catálogo
          </button>

          <button
            onClick={() => setEtapa('contas')}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all ${
              etapa === 'contas'
                ? 'bg-ambar text-sobreacento shadow-lg shadow-ambar/20'
                : 'bg-ardosia/40 text-suave border border-borda/40 hover:bg-ardosia/65'
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">4</span>
            Contas & Saldos
          </button>

          <button
            onClick={() => setEtapa('confirmacao')}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all ${
              etapa === 'confirmacao'
                ? 'bg-ambar text-sobreacento shadow-lg shadow-ambar/20'
                : 'bg-ardosia/40 text-suave border border-borda/40 hover:bg-ardosia/65'
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">5</span>
            Revisão
          </button>
        </div>

        {/* Área de Conteúdo da Etapa */}
        <div className="md:col-span-3 flex flex-col gap-6 rounded-2xl border border-borda bg-ardosia shadow-sm p-6">
          
          {/* PASSO 1: Config Geral */}
          {etapa === 'config' && (
            <div className="flex flex-col gap-5 animate-fadeIn">
              <h3 className="text-lg font-bold text-claro">Passo 1: Data do Dia Zero & Configurações de Partida</h3>
              <p className="text-sm text-suave">
                Selecione a data correspondente ao Dia Zero (o dia anterior ao início das vendas de fato). 
                As séries de encerrante e o estoque cadastrado nas próximas etapas serão válidos para o final desta data.
              </p>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Campo label="Data de Abertura (Dia Zero)" obrigatorio>
                  <input
                    type="date"
                    className={CLASSE_CAMPO}
                    value={dataDiaZero}
                    onChange={(e) => e.target.value && setDataDiaZero(e.target.value)}
                  />
                </Campo>

                <Campo label="Troco de Caixa Padrão (R$)" obrigatorio dica="Fundo de troco fixo que fica na gaveta">
                  <input
                    type="text"
                    className={`${CLASSE_CAMPO} numeros text-right`}
                    value={trocoGavetaStr}
                    onChange={(e) => setTrocoGavetaStr(formatarDinheiroInput(e.target.value))}
                  />
                </Campo>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setEtapa('combustiveis')}
                  className="btn btn-primario px-6 py-2.5 text-sm font-semibold"
                >
                  Avançar: Combustíveis & Tanques
                </button>
              </div>
            </div>
          )}

          {/* PASSO 2: Combustíveis e Tanques */}
          {etapa === 'combustiveis' && (
            <div className="flex flex-col gap-5 animate-fadeIn">
              <h3 className="text-lg font-bold text-claro">Passo 2: Configuração de Combustível, Tanques e Bicos</h3>
              <p className="text-sm text-suave">
                Adicione cada combustível vendido no Pontão. Vincule-o ao seu respectivo tanque e crie as bombas (bicos) definindo o encerrante mecânico inicial.
              </p>

              {/* Form de Inserção */}
              <div className="flex flex-col gap-6 rounded-xl border border-borda bg-elevado shadow-sm p-6">
                
                {/* Secao Combustivel */}
                <div className="flex flex-col gap-4">
                  <h4 className="text-sm font-bold text-ambar uppercase tracking-wider flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ambar/10 text-xs">1</span>
                    Dados do Combustível
                  </h4>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Campo label="Nome do Combustível" obrigatorio>
                    {combModo === 'lista' ? (
                      <select
                        className={CLASSE_CAMPO}
                        value={combNome}
                        onChange={(e) => {
                          if (e.target.value === 'OUTRO') {
                            setCombModo('livre');
                            setCombNome('');
                          } else {
                            setCombNome(e.target.value);
                          }
                        }}
                      >
                        <option value="" disabled>Selecione...</option>
                        <option value="Gasolina Comum">Gasolina Comum</option>
                        <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                        <option value="Etanol">Etanol</option>
                        <option value="Diesel S10">Diesel S10</option>
                        <option value="Diesel S500">Diesel S500</option>
                        <option value="OUTRO">+ Criar novo (digitar)</option>
                      </select>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          className={CLASSE_CAMPO}
                          placeholder="Ex.: Querosene"
                          value={combNome}
                          onChange={(e) => setCombNome(e.target.value)}
                          autoFocus
                        />
                        <button 
                          type="button" 
                          onClick={() => { setCombModo('lista'); setCombNome(''); }} 
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-borda text-suave hover:bg-negativo/10 hover:text-negativo transition-colors"
                          title="Voltar para lista"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </Campo>

                  <Campo label="Preço de Venda Inicial (R$/L)" obrigatorio>
                    <input
                      className={`${CLASSE_CAMPO} numeros text-right`}
                      placeholder="0,00"
                      value={combPrecoVenda}
                      onChange={(e) => setCombPrecoVenda(formatarDinheiroInput(e.target.value))}
                    />
                  </Campo>

                  <Campo label="Preço de Custo Inicial (R$/L)" obrigatorio>
                    <input
                      className={`${CLASSE_CAMPO} numeros text-right`}
                      placeholder="0,00"
                      value={combPrecoCusto}
                      onChange={(e) => setCombPrecoCusto(formatarDinheiroInput(e.target.value))}
                    />
                  </Campo>
                </div>
                </div>

                {/* Secao Tanque */}
                <div className="flex flex-col gap-4 border-t border-borda/30 pt-6">
                  <h4 className="text-sm font-bold text-ambar uppercase tracking-wider flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ambar/10 text-xs">2</span>
                    Armazenamento (Tanque)
                  </h4>
                  
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Campo label="Nome do Tanque" obrigatorio>
                    {tanqueModo === 'lista' ? (
                      <select
                        className={CLASSE_CAMPO}
                        value={tanqueNome}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'OUTRO') {
                            setTanqueModo('livre');
                            setTanqueNome('');
                            setTanqueCapacidade('');
                            setTanqueAlerta('');
                          } else {
                            setTanqueNome(val);
                            const existente = listaCombustiveis.find(c => c.tanque.nome === val);
                            if (existente) {
                              setTanqueCapacidade(existente.tanque.capacidade.toLocaleString('pt-BR'));
                              setTanqueAlerta(existente.tanque.nivelAlerta ? existente.tanque.nivelAlerta.toLocaleString('pt-BR') : '');
                            }
                          }
                        }}
                      >
                        <option value="" disabled>Selecione...</option>
                        {Array.from(new Set(['Tanque 1', 'Tanque 2', 'Tanque 3', ...listaCombustiveis.map(c => c.tanque.nome)])).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                        <option value="OUTRO">+ Criar novo (digitar)</option>
                      </select>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          className={CLASSE_CAMPO}
                          placeholder="Ex.: Tanque Novo"
                          value={tanqueNome}
                          onChange={(e) => setTanqueNome(e.target.value)}
                          autoFocus
                        />
                        <button 
                          type="button" 
                          onClick={() => { setTanqueModo('lista'); setTanqueNome(''); }} 
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-borda text-suave hover:bg-negativo/10 hover:text-negativo transition-colors"
                          title="Voltar para lista"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </Campo>

                  <Campo label="Capacidade do Tanque (Litros)" obrigatorio>
                    <input
                      className={`${CLASSE_CAMPO} numeros text-right`}
                      placeholder="Ex.: 15.000"
                      value={tanqueCapacidade}
                      onChange={(e) => setTanqueCapacidade(e.target.value)}
                    />
                  </Campo>

                  <Campo label="Nível Alerta Mínimo (Litros)">
                    <input
                      className={`${CLASSE_CAMPO} numeros text-right`}
                      placeholder="Ex.: 3.000"
                      value={tanqueAlerta}
                      onChange={(e) => setTanqueAlerta(e.target.value)}
                    />
                  </Campo>
                </div>
                </div>

                {/* Secao Bicos */}
                <div className="flex flex-col gap-4 border-t border-borda/30 pt-6">
                  <h4 className="text-sm font-bold text-ambar uppercase tracking-wider flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ambar/10 text-xs">3</span>
                    Saídas (Bombas / Bicos)
                  </h4>
                  
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
                    <Campo label="Nome da Bomba/Bico">
                      <input
                        className={CLASSE_CAMPO}
                        placeholder="Ex.: Bico 1, Bomba Diesel..."
                        value={bicoFormNome}
                        onChange={(e) => setBicoFormNome(e.target.value)}
                      />
                    </Campo>
                    <Campo label="Encerrante Inicial (Litros)" dica="Leitura mecânica do Dia Zero">
                      <input
                        className={`${CLASSE_CAMPO} numeros text-right`}
                        placeholder="Ex.: 1485284"
                        value={bicoFormLeitura}
                        onChange={(e) => setBicoFormLeitura(e.target.value)}
                      />
                    </Campo>
                    <div className="pb-5">
                      <button
                        type="button"
                        onClick={adicionarBicoTemporario}
                        className="btn bg-suave/10 hover:bg-suave/20 text-claro py-2 px-4 text-sm font-semibold rounded-lg h-10 transition-colors"
                      >
                        + Adicionar Bico
                      </button>
                    </div>
                  </div>

                  {/* Estado vazio ou Lista de bicos */}
                  {bicosTemporarios.length === 0 ? (
                    <div className="mt-1 rounded-lg border border-dashed border-borda/50 bg-fundo/30 p-4 text-center">
                      <p className="text-xs text-suave">Nenhum bico adicionado ainda. É obrigatório adicionar pelo menos um bico para este tanque.</p>
                    </div>
                  ) : (
                    <div className="mt-1 bg-claro/[0.02] border border-borda/40 rounded-lg p-3">
                      <span className="text-xs font-semibold text-suave">Bicos que serão adicionados a este tanque:</span>
                      <ul className="mt-2 flex flex-col gap-1">
                        {bicosTemporarios.map((bt, idx) => (
                          <li key={idx} className="flex items-center justify-between text-xs text-claro bg-claro/5 px-2.5 py-2 rounded">
                            <span>{bt.nome} &mdash; <strong>Leitura inicial: {bt.encerranteInicial.toLocaleString('pt-BR')} L</strong></span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => editarBicoTemporario(idx)}
                                className="text-ambar font-bold hover:underline"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => removerBicoTemporario(idx)}
                                className="text-negativo font-bold hover:underline"
                              >
                                Remover
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={adicionarCombustivelCompleto}
                  className="btn btn-primario py-2.5 text-sm font-semibold mt-2"
                >
                  Confirmar Combustível & Tanque
                </button>
              </div>

              {/* Lista dos Cadastrados */}
              {listaCombustiveis.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-bold text-claro uppercase tracking-wider">Combustíveis a serem Cadastrados:</h4>
                  <div className="flex flex-col gap-2">
                    {listaCombustiveis.map((c, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl border border-borda p-4 bg-claro/[0.01]">
                        <div>
                          <p className="text-sm font-bold text-claro">{c.nome}</p>
                          <p className="text-xs text-suave">
                            Tanque: {c.tanque.nome} (Capacidade: {c.tanque.capacidade.toLocaleString('pt-BR')} L)
                          </p>
                          <p className="text-xs text-suave">
                            Bicos: {c.bicos.map(b => `${b.nome} (partida: ${b.encerranteInicial.toLocaleString('pt-BR')} L)`).join(', ')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editarCombustivelLista(idx)}
                            className="btn py-1 px-3 text-xs bg-ambar/10 text-ambar hover:bg-ambar/20 rounded-lg transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removerCombustivelLista(idx)}
                            className="btn py-1 px-3 text-xs bg-negativo/10 text-negativo hover:bg-negativo/20 rounded-lg transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setEtapa('config')}
                  className="btn btn-suave px-6 py-2.5 text-sm font-semibold"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={avancarParaProdutos}
                  className="btn btn-primario px-6 py-2.5 text-sm font-semibold"
                >
                  Avançar: Catálogo de Produtos
                </button>
              </div>
            </div>
          )}

          {/* PASSO 3: Catálogo de Produtos */}
          {etapa === 'produtos' && (
            <div className="flex flex-col gap-5 animate-fadeIn">
              <h3 className="text-lg font-bold text-claro">Passo 3: Catálogo de Produtos & Estoque Inicial</h3>
              <p className="text-sm text-suave">
                Cadastre os produtos físicos (óleos, filtros, lubrificantes). Defina o preço de venda, custo de aquisição e a quantidade inicial em estoque.
              </p>

              {/* Form de Produto */}
              <div className="flex flex-col gap-4 rounded-xl border border-borda bg-elevado shadow-sm p-5">
                <h4 className="text-sm font-bold text-ambar uppercase tracking-wider">Novo Produto</h4>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Campo label="Nome do Produto" obrigatorio>
                    <input
                      className={CLASSE_CAMPO}
                      placeholder="Ex.: Óleo Lubrax 4T"
                      value={prodNome}
                      onChange={(e) => setProdNome(e.target.value)}
                    />
                  </Campo>

                  <Campo label="Categoria" obrigatorio>
                    <select
                      aria-label="Categoria"
                      className={CLASSE_CAMPO}
                      value={prodCategoriaId}
                      onChange={(e) => setProdCategoriaId(e.target.value)}
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
                      value={prodModo}
                      onChange={(e) => setProdModo(e.target.value as 'contagem' | 'individual')}
                    >
                      <option value="contagem">Por Contagem (oficial no fechamento)</option>
                      <option value="individual">Vendas Individuais (avulsas)</option>
                    </select>
                  </Campo>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 border-t border-borda/30 pt-4">
                  <Campo label="Preço de Venda Inicial (R$)" obrigatorio>
                    <input
                      className={`${CLASSE_CAMPO} numeros text-right`}
                      placeholder="0,00"
                      value={prodPrecoVenda}
                      onChange={(e) => setProdPrecoVenda(formatarDinheiroInput(e.target.value))}
                    />
                  </Campo>

                  <Campo label="Preço de Custo Inicial (R$)" obrigatorio>
                    <input
                      className={`${CLASSE_CAMPO} numeros text-right`}
                      placeholder="0,00"
                      value={prodPrecoCusto}
                      onChange={(e) => setProdPrecoCusto(formatarDinheiroInput(e.target.value))}
                    />
                  </Campo>

                  {prodModo === 'contagem' && (
                    <Campo label="Estoque Físico Inicial (Unidades)">
                      <input
                        className={`${CLASSE_CAMPO} numeros text-right`}
                        placeholder="Ex.: 40"
                        value={prodEstoqueInicial}
                        onChange={(e) => setProdEstoqueInicial(e.target.value)}
                      />
                    </Campo>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-borda/30 pt-4">
                  <Campo label="Alerta de Estoque Baixo">
                    <input
                      className={`${CLASSE_CAMPO} numeros text-right`}
                      placeholder="Ex.: 10"
                      value={prodAlertaBaixo}
                      onChange={(e) => setProdAlertaBaixo(e.target.value)}
                    />
                  </Campo>

                  <Campo label="Alerta de Estoque Muito Baixo">
                    <input
                      className={`${CLASSE_CAMPO} numeros text-right`}
                      placeholder="Ex.: 5"
                      value={prodAlertaMuitoBaixo}
                      onChange={(e) => setProdAlertaMuitoBaixo(e.target.value)}
                    />
                  </Campo>
                </div>

                <button
                  type="button"
                  onClick={adicionarProdutoLista}
                  className="btn btn-primario py-2.5 text-sm font-semibold mt-2"
                >
                  Adicionar Produto
                </button>
              </div>

              {/* Lista dos Cadastrados */}
              {listaProdutos.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-bold text-claro uppercase tracking-wider">Produtos a serem Cadastrados ({listaProdutos.length}):</h4>
                  <div className="flex flex-col gap-2">
                    {listaProdutos.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl border border-borda p-4 bg-claro/[0.01]">
                        <div>
                          <p className="text-sm font-bold text-claro">{p.nome}</p>
                          <p className="text-xs text-suave">
                            Categoria: {categorias.find(c => c.id === p.categoriaId)?.nome ?? ''} | Modo: {p.modoApuracao}
                          </p>
                          <p className="text-xs text-suave">
                            Estoque inicial: {p.estoqueInicial} unidades | Venda: R$ {Number(p.precoVenda / 100n).toFixed(2)} | Custo: R$ {Number(p.precoCusto / 100n).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editarProdutoLista(idx)}
                            className="btn py-1 px-3 text-xs bg-ambar/10 text-ambar hover:bg-ambar/20 rounded-lg transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removerProdutoLista(idx)}
                            className="btn py-1 px-3 text-xs bg-negativo/10 text-negativo hover:bg-negativo/20 rounded-lg transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setEtapa('combustiveis')}
                  className="btn btn-suave px-6 py-2.5 text-sm font-semibold"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={avancarParaContas}
                  className="btn btn-primario px-6 py-2.5 text-sm font-semibold"
                >
                  Avançar: Contas & Saldos
                </button>
              </div>
            </div>
          )}

          {/* PASSO 4: Contas Financeiras */}
          {etapa === 'contas' && (
            <div className="flex flex-col gap-5 animate-fadeIn">
              <h3 className="text-lg font-bold text-claro">Passo 4: Contas Financeiras & Saldos Iniciais</h3>
              <p className="text-sm text-suave">
                Cadastre os locais onde o dinheiro fica custodiado (caixas físicos, contas correntes nos bancos). Insira o saldo de partida (Saldo Inicial) correspondente ao Dia Zero.
              </p>

              {/* Form de Conta */}
              <div className="flex flex-col gap-4 rounded-xl border border-borda bg-elevado shadow-sm p-5">
                <h4 className="text-sm font-bold text-ambar uppercase tracking-wider">Nova Conta</h4>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Campo label="Nome da Conta" obrigatorio>
                    {contaModo === 'lista' ? (
                      <select
                        className={CLASSE_CAMPO}
                        value={contaNovaNome}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'OUTRO') {
                            setContaModo('livre');
                            setContaNovaNome('');
                          } else {
                            setContaNovaNome(val);
                            // Auto-set type based on name suggestion
                            if (val === 'Caixa Gaveta') setContaNovaTipo('dinheiro');
                            else setContaNovaTipo('banco');
                          }
                        }}
                      >
                        <option value="" disabled>Selecione...</option>
                        <option value="Caixa Gaveta">Caixa Gaveta</option>
                        <option value="Conta Bradesco">Conta Bradesco</option>
                        <option value="Banco do Brasil">Banco do Brasil</option>
                        <option value="Nubank">Nubank</option>
                        <option value="OUTRO">+ Criar novo (digitar)</option>
                      </select>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          className={CLASSE_CAMPO}
                          placeholder="Ex.: Conta Caixa Federal"
                          value={contaNovaNome}
                          onChange={(e) => setContaNovaNome(e.target.value)}
                          autoFocus
                        />
                        <button 
                          type="button" 
                          onClick={() => { setContaModo('lista'); setContaNovaNome(''); }} 
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-borda text-suave hover:bg-negativo/10 hover:text-negativo transition-colors"
                          title="Voltar para lista"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </Campo>

                  <Campo label="Tipo da Conta">
                    {contaNovaTipoUI === 'outro' ? (
                      <div className="flex gap-2">
                        <input
                          className={CLASSE_CAMPO}
                          placeholder="Ex.: Carteira Digital, Cofre"
                          value={contaNovaTipoOutro}
                          onChange={(e) => setContaNovaTipoOutro(e.target.value)}
                          autoFocus
                        />
                        <button 
                          type="button" 
                          onClick={() => { setContaNovaTipoUI('banco'); setContaNovaTipoOutro(''); }} 
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-borda text-suave hover:bg-negativo/10 hover:text-negativo transition-colors"
                          title="Voltar para lista"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <select
                        aria-label="Tipo"
                        className={CLASSE_CAMPO}
                        value={contaNovaTipoUI}
                        onChange={(e) => setContaNovaTipoUI(e.target.value)}
                      >
                        <option value="dinheiro">
                          Dinheiro
                        </option>
                        <option value="banco">Banco</option>
                        <option value="banco_digital">Banco Digital</option>
                        <option value="outro">+ Criar novo (digitar)</option>
                      </select>
                    )}
                  </Campo>

                  <Campo label="Saldo de Partida / Inicial (R$)">
                    <input
                      className={`${CLASSE_CAMPO} numeros text-right`}
                      placeholder="0,00"
                      value={contaNovaSaldo}
                      onChange={(e) => setContaNovaSaldo(formatarDinheiroInput(e.target.value))}
                    />
                  </Campo>
                </div>

                <button
                  type="button"
                  onClick={adicionarContaLista}
                  className="btn btn-primario py-2.5 text-sm font-semibold mt-2"
                >
                  Adicionar Conta
                </button>
              </div>

              {/* Lista dos Cadastrados */}
              {listaContas.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-bold text-claro uppercase tracking-wider">Contas Cadastradas para Inicialização:</h4>
                  <div className="flex flex-col gap-2">
                    {listaContas.map((c, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl border border-borda p-4 bg-claro/[0.01]">
                        <div>
                          <p className="text-sm font-bold text-claro">
                            {c.nome} 
                            {c.ehDestinoPadraoVenda && c.tipo !== 'dinheiro' && <span className="text-[10px] bg-ambar/20 text-ambar px-2 py-0.5 rounded-full ml-2">Conta Padrão (Cartão/PIX)</span>}
                            {c.tipo === 'dinheiro' && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full ml-2">Conta Padrão (Dinheiro Físico)</span>}
                          </p>
                          <p className="text-xs text-suave">
                            Tipo: {
                              (c as DadosSetupConta & { tipoUI?: string }).tipoUI === 'dinheiro' ? 'Dinheiro' :
                              (c as DadosSetupConta & { tipoUI?: string }).tipoUI === 'banco' ? 'Banco' :
                              (c as DadosSetupConta & { tipoUI?: string }).tipoUI === 'banco_digital' ? 'Banco Digital' :
                              (c as DadosSetupConta & { tipoUI?: string }).tipoUI || (c.tipo === 'dinheiro' ? 'Dinheiro' : 'Banco')
                            } | Saldo inicial: R$ {Number(c.saldoInicial / 100n).toFixed(2).replace('.', ',')}
                          </p>
                          {c.tipo !== 'dinheiro' && (
                            <label className="flex items-center gap-2 cursor-pointer mt-2 text-xs text-suave w-fit">
                              <input 
                                type="radio" 
                                name="contaPadrao" 
                                checked={c.ehDestinoPadraoVenda} 
                                onChange={() => marcarContaComoPadrao(idx)}
                                className="text-ambar focus:ring-ambar"
                              />
                              Marcar como Destino Padrão de Vendas (Cartão/PIX)
                            </label>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editarContaLista(idx)}
                            className="btn py-1 px-3 text-xs bg-ambar/10 text-ambar hover:bg-ambar/20 rounded-lg transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removerContaLista(idx)}
                            className="btn py-1 px-3 text-xs bg-negativo/10 text-negativo hover:bg-negativo/20 rounded-lg transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setEtapa('produtos')}
                  className="btn btn-suave px-6 py-2.5 text-sm font-semibold"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={avancarParaConfirmacao}
                  className="btn btn-primario px-6 py-2.5 text-sm font-semibold"
                >
                  Avançar: Revisão Final
                </button>
              </div>
            </div>
          )}

          {/* PASSO 5: Confirmação e Ativação */}
          {etapa === 'confirmacao' && (
            <div className="flex flex-col gap-5 animate-fadeIn">
              <h3 className="text-lg font-bold text-claro">Passo 5: Revisão Final & Ativação</h3>
              <p className="text-sm text-suave">
                Verifique se as informações de catálogo e os valores do Dia Zero estão corretos. Ao clicar em Ativar, o sistema entrará em modo operacional completo.
              </p>

              {/* Checklist de Conclusão */}
              <div className="rounded-xl border border-borda bg-claro/[0.02] p-5 flex flex-col gap-3">
                <span className="text-xs font-bold text-suave uppercase tracking-wider">Verificação de Prontidão</span>
                
                <ul className="flex flex-col gap-2.5 text-sm">
                  <li className="flex items-center gap-3 text-positivo">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-positivo/10 text-xs">✓</span>
                    <span>Data de Abertura definida: <strong>{formatarDataBR(dataDiaZero)}</strong></span>
                  </li>
                  
                  <li className={`flex items-center gap-3 ${listaCombustiveis.length > 0 ? 'text-positivo' : 'text-negativo'}`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${listaCombustiveis.length > 0 ? 'bg-positivo/10' : 'bg-negativo/10'}`}>
                      {listaCombustiveis.length > 0 ? '✓' : '✗'}
                    </span>
                    <span>
                      Combustíveis & Tanques: <strong>{listaCombustiveis.length > 0 ? `${listaCombustiveis.length} cadastrados` : 'Nenhum adicionado (Obrigatório)'}</strong>
                    </span>
                  </li>

                  <li className="flex items-center gap-3 text-positivo">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-positivo/10 text-xs">✓</span>
                    <span>Produtos no catálogo: <strong>{listaProdutos.length} cadastrados</strong></span>
                  </li>

                  <li className={`flex items-center gap-3 ${listaContas.length > 0 ? 'text-positivo' : 'text-negativo'}`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${listaContas.length > 0 ? 'bg-positivo/10' : 'bg-negativo/10'}`}>
                      {listaContas.length > 0 ? '✓' : '✗'}
                    </span>
                    <span>
                      Contas financeiras: <strong>{listaContas.length > 0 ? `${listaContas.length} contas configuradas` : 'Nenhuma adicionada (Obrigatório)'}</strong>
                    </span>
                  </li>
                </ul>
              </div>

              {/* Aviso e Botão de Ativação */}
              <div className="rounded-xl border border-ambar/30 bg-ambar/5 p-4 mt-2">
                <p className="text-xs text-ambar leading-relaxed">
                  🔒 <strong>Atenção:</strong> Ao confirmar a ativação, o sistema criará os históricos de encerrante, estoque e saldo com base nas informações inseridas. Esta operação é de auditoria e servirá de base de cálculo para todas as operações subsequentes do Pontão.
                </p>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setEtapa('contas')}
                  className="btn btn-suave px-6 py-2.5 text-sm font-semibold"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={aoConfirmarEAtivar}
                  disabled={salvando || listaCombustiveis.length === 0 || listaContas.length === 0}
                  className="btn btn-primario px-8 py-3 text-sm font-bold shadow-lg shadow-ambar/15 disabled:opacity-50"
                >
                  {salvando ? 'Salvando inicialização…' : 'Ativar e Iniciar Sistema'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
