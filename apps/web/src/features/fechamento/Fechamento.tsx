import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type FormEvent, Fragment } from 'react';
import {
  parseReais,
  formatReais,
  somar,
  subtrair,
  asCentavos,
  arredondarDivisao,
  type Centavos,
} from '../../lib/money';
import { formatLitros, asMililitros, type Mililitros } from '../../domain/tipos';
import { vendaCombustivel, vendaProdutoContagem } from '../../domain/venda';
import { dinheiroEsperado, diferencaCaixa, totalDespesasDinheiro } from '../../domain/caixa';
import { liquidoCartao } from '../../domain/capital';
import { litrosParaMililitros, paraQuantidade } from '../../data/conversao';
import {
  carregarContexto,
  confirmarFechamento,
  reabrirFechamento,
  asQuantidade,
  listarDiasAbertosAntes,
  type ContextoFechamento,
  type ResumoConfirmacao,
  salvarRascunhoFechamento,
} from '../../data/fechamento';
import { Relatorio, type RelatorioDados } from './Relatorio';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  listarFechamentosRecentes,
  listarFechamentos,
  listarDespesasDoDia,
  removerDespesa,
  salvarClienteFiado,
  listarContasCompletas,
  listarSaldos,
  obterDadosTanquesFechamento,
  type FechamentoRecente,
  type FechamentoResumo,
  type DespesaDoDia,
  type ContaCompleta,
  type TanqueRelatorioInfo,
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { NovaDespesaModal, FORMAS_PAGAMENTO } from '../financeiro/NovaDespesaModal';
import { hojeManaus, formatarDataBR, agoraManausISO, diaSemanaManaus } from '../../lib/datas';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';

const ZERO = asCentavos(0n);

// Índice = dia da semana (0=Domingo … 6=Sábado).
const DIAS_SEMANA_LONGO = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

function centavosParaString(valor: number | bigint): string {
  const v = BigInt(valor);
  const negativo = v < 0n;
  const abs = negativo ? -v : v;
  const centavosStr = (abs % 100n).toString().padStart(2, '0');
  const inteirosStr = (abs / 100n).toString();
  return `${negativo ? '-' : ''}${inteirosStr},${centavosStr}`;
}

function formatarDinheiroInput(valor: Centavos): string {
  const negativo = valor < 0n;
  const abs = negativo ? -valor : valor;
  const centavosStr = (abs % 100n).toString().padStart(2, '0');
  const inteirosStr = (abs / 100n).toString();
  const comMilhar = inteirosStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${comMilhar},${centavosStr}`;
}

function formatarInteiroDigitado(texto: string): string {
  const apenasDigitos = texto.replace(/\D/g, '');
  if (apenasDigitos === '') return '';
  if (/^0+$/.test(apenasDigitos)) return '0';
  const num = BigInt(apenasDigitos);
  return num.toLocaleString('pt-BR');
}

const inputClasse = 'w-28 rounded-lg px-3 py-2 text-right numeros';

function formatarLeituraAnterior(valor: Mililitros): string {
  const litros = valor / 1000n;
  return Number(litros).toLocaleString('pt-BR');
}

interface Props {
  usuarioId: string | null;
  usuarioNome?: string;
  usuarioFotoUrl?: string | null;
  podeReabrir?: boolean;
}

export function Fechamento({ usuarioId, usuarioNome, usuarioFotoUrl, podeReabrir }: Props) {
  const isOnline = useOnlineStatus();
  const toast = useToast();
  const [aba, setAba] = useState<'fechar' | 'historico'>(() => {
    const salva = localStorage.getItem('pontao_fechamento_aba');
    return (salva === 'fechar' || salva === 'historico') ? salva : 'fechar';
  });
  const [nonceRecarga, setNonceRecarga] = useState(0);
  const [historico, setHistorico] = useState<FechamentoResumo[]>([]);
  const [histCarregando, setHistCarregando] = useState(false);
  const [histDe, setHistDe] = useState(() => localStorage.getItem('pontao_filtro_fechamento_de') ?? '');
  const [histAte, setHistAte] = useState(() => localStorage.getItem('pontao_filtro_fechamento_ate') ?? '');
  const [histStatus, setHistStatus] = useState(() => localStorage.getItem('pontao_filtro_fechamento_status') ?? '');

  useEffect(() => {
    localStorage.setItem('pontao_fechamento_aba', aba);
  }, [aba]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_fechamento_de', histDe);
  }, [histDe]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_fechamento_ate', histAte);
  }, [histAte]);

  useEffect(() => {
    localStorage.setItem('pontao_filtro_fechamento_status', histStatus);
  }, [histStatus]);

  const [reabrirAlvo, setReabrirAlvo] = useState<string | null>(null);
  const [motivoReabrir, setMotivoReabrir] = useState('');
  const [reabrindo, setReabrindo] = useState(false);
  const [recentes, setRecentes] = useState<FechamentoRecente[]>([]);
  const [dataSelecionada, setDataSelecionada] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const dataParam = params.get('data');
      if (dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam)) {
        return dataParam;
      }
    }
    return localStorage.getItem('pontao_fechamento_data_selecionada') ?? hojeManaus();
  });

  useEffect(() => {
    localStorage.setItem('pontao_fechamento_data_selecionada', dataSelecionada);
  }, [dataSelecionada]);

  // Em dia configurado como sem funcionamento, a tela mostra "fechado" até o
  // usuário optar por registrar mesmo assim. Reseta a cada troca de data.
  const [forcarAbertura, setForcarAbertura] = useState(false);
  useEffect(() => {
    setForcarAbertura(false);
  }, [dataSelecionada]);

  // Avisos exibidos antes de travar o fechamento (dia sem registro / dias
  // anteriores em aberto). null = nenhum aviso pendente.
  const [avisoFinalizacao, setAvisoFinalizacao] = useState<{
    semRegistroFisico: boolean;
    diasAbertos: string[];
  } | null>(null);

  const [ctx, setCtx] = useState<ContextoFechamento | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [contas, setContas] = useState<ContaCompleta[]>([]);
  const [saldos, setSaldos] = useState<{ id: string; saldo: Centavos }[]>([]);
  const [destinoTransfId, setDestinoTransfId] = useState(() => {
    const key = usuarioId ? `pontao_fechamento_destino_${usuarioId}` : 'pontao_fechamento_destino_default';
    return localStorage.getItem(key) ?? '';
  });

  useEffect(() => {
    const key = usuarioId ? `pontao_fechamento_destino_${usuarioId}` : 'pontao_fechamento_destino_default';
    localStorage.setItem(key, destinoTransfId);
  }, [destinoTransfId, usuarioId]);

  const [leituras, setLeituras] = useState<Record<string, string>>({});
  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [entradasEstoque, setEntradasEstoque] = useState<Record<string, string>>({});
  const [vendasIndividuais, setVendasIndividuais] = useState<Record<string, string>>({});
  const [pix, setPix] = useState('');
  const [debito, setDebito] = useState('');
  const [credito, setCredito] = useState('');
  const [despesasDoDia, setDespesasDoDia] = useState<DespesaDoDia[]>([]);
  const [modalDespesa, setModalDespesa] = useState(false);
  const [mostrarFiados, setMostrarFiados] = useState(false);
  const [fiadosConcedidos, setFiadosConcedidos] = useState<{ id?: string; clienteId: string; valor: string; vencimento: string | null }[]>([]);
  const [fiadosRecebidos, setFiadosRecebidos] = useState<{ id?: string; clienteId: string; valor: string; fiadoId: string | null }[]>([]);
  const [contado, setContado] = useState('');
  const [observacao, setObservacao] = useState('');

  // Cadastro de novo cliente de fiado direto no fechamento
  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState('');
  const [novoClienteContato, setNovoClienteContato] = useState('');
  const [salvandoNovoCliente, setSalvandoNovoCliente] = useState(false);
  const [novoClienteOrigem, setNovoClienteOrigem] = useState<{ tipo: 'concedido' | 'recebido'; index: number } | null>(null);

  const [confirmando, setConfirmando] = useState(false);
  const [erroConfirmar, setErroConfirmar] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDados | null>(null);
  const [dadosTanques, setDadosTanques] = useState<TanqueRelatorioInfo[]>([]);
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);

  // Manual save draft helper
  const salvarRascunho = async (mostrarToast = false) => {
    if (!ctx || ctx.status === 'travado') return;
    try {
      setSalvandoRascunho(true);
      const rascunhoData = {
        leituras,
        contagens,
        vendasIndividuais,
        pix,
        debito,
        credito,
        fiadosConcedidos,
        fiadosRecebidos,
        contado,
        observacao,
      };
      await salvarRascunhoFechamento(ctx.data, rascunhoData, usuarioId || '');
      if (mostrarToast) {
        toast.sucesso('Rascunho de fechamento salvo.');
      }
    } catch (err) {
      console.error(err);
      if (mostrarToast) {
        toast.erro('Falha ao salvar rascunho.');
      }
    } finally {
      setSalvandoRascunho(false);
    }
  };

  const rascunhoDataRef = useRef({
    leituras, contagens, vendasIndividuais, pix, debito, credito,
    fiadosConcedidos, fiadosRecebidos, contado, observacao
  });

  // Keep ref updated to avoid re-triggering the debounced function
  useEffect(() => {
    rascunhoDataRef.current = {
      leituras, contagens, vendasIndividuais, pix, debito, credito,
      fiadosConcedidos, fiadosRecebidos, contado, observacao
    };
  }, [leituras, contagens, vendasIndividuais, pix, debito, credito, fiadosConcedidos, fiadosRecebidos, contado, observacao]);

  // Debounced auto-save
  useEffect(() => {
    if (!ctx || ctx.status === 'travado') return;

    const timer = setTimeout(() => {
      const data = rascunhoDataRef.current;
      salvarRascunhoFechamento(ctx.data, data, usuarioId || '')
        .catch((err) => console.error('Erro no auto-save do rascunho:', err));
    }, 1500);

    return () => clearTimeout(timer);
  }, [ctx?.data, ctx?.status, leituras, contagens, vendasIndividuais, pix, debito, credito, fiadosConcedidos, fiadosRecebidos, contado, observacao, usuarioId]);

  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    listarFechamentosRecentes()
      .then(setRecentes)
      .catch((err) => console.error('Erro ao listar fechamentos:', err));
  }, [dataSelecionada]);

  useEffect(() => {
    setRelatorio(null);
    setErroConfirmar(null);
    
    listarContasCompletas()
      .then((c) => setContas(c.filter((x) => x.ativo)))
      .catch((err) => console.error('Erro ao carregar contas:', err));

    listarSaldos()
      .then((s) => setSaldos(s))
      .catch((err) => console.error('Erro ao carregar saldos:', err));

    obterDadosTanquesFechamento(dataSelecionada)
      .then((t) => setDadosTanques(t))
      .catch((err) => console.error('Erro ao carregar dados de tanques:', err));

    carregarContexto(dataSelecionada)
      .then((contexto) => {
        setCtx(contexto);
        // Despesas e entradas do dia vêm por DATA (de qualquer origem).
        setDespesasDoDia(contexto.despesasDoDia);
        setEntradasEstoque(contexto.entradasDoDia);
        if (contexto.valoresSalvos) {
          const vs = contexto.valoresSalvos;
          
          // Format integers on load
          const formattedLeituras: Record<string, string> = {};
          for (const [k, v] of Object.entries(vs.leituras || {})) {
            formattedLeituras[k] = formatarInteiroDigitado(String(v));
          }
          setLeituras(formattedLeituras);

          const formattedContagens: Record<string, string> = {};
          for (const [k, v] of Object.entries(vs.contagens || {})) {
            formattedContagens[k] = formatarInteiroDigitado(String(v));
          }
          setContagens(formattedContagens);

          const formattedVendasInd: Record<string, string> = {};
          for (const [k, v] of Object.entries(vs.vendasIndividuais || {})) {
            formattedVendasInd[k] = formatarInteiroDigitado(String(v));
          }
          setVendasIndividuais(formattedVendasInd);

          setPix(formatarDinheiroInput(parseReais(vs.pix || '')));
          setDebito(formatarDinheiroInput(parseReais(vs.debito || '')));
          setCredito(formatarDinheiroInput(parseReais(vs.credito || '')));
          setFiadosConcedidos(
            (vs.fiadosConcedidos || []).map((f: any) => ({
              ...f,
              valor: formatarDinheiroInput(parseReais(f.valor || '')),
            }))
          );
          setFiadosRecebidos(
            (vs.fiadosRecebidos || []).map((f: any) => ({
              ...f,
              valor: formatarDinheiroInput(parseReais(f.valor || '')),
            }))
          );
          setContado(formatarDinheiroInput(parseReais(vs.contado || '')));
          setObservacao(vs.observacao || '');
          if ((vs.fiadosConcedidos && vs.fiadosConcedidos.length > 0) || (vs.fiadosRecebidos && vs.fiadosRecebidos.length > 0)) {
            setMostrarFiados(true);
          } else {
            setMostrarFiados(false);
          }
        } else {
          setLeituras({});
          setContagens({});
          setVendasIndividuais({});
          setPix('');
          setDebito('');
          setCredito('');
          setFiadosConcedidos([]);
          setFiadosRecebidos([]);
          setContado('');
          setObservacao('');
          setMostrarFiados(false);
        }
      })
      .catch((e: unknown) => {
        console.error('Erro ao carregar contexto do fechamento:', e);
        if (e && typeof e === 'object') {
          const errObj = e as Record<string, unknown>;
          const msg = typeof errObj.message === 'string' ? errObj.message : '';
          const details = typeof errObj.details === 'string' ? errObj.details : '';
          const code = typeof errObj.code === 'string' ? errObj.code : '';
          const fullErr = [msg, details, code ? `Código: ${code}` : ''].filter(Boolean).join(' | ');
          setErroCarga(fullErr || String(e));
        } else {
          setErroCarga(e instanceof Error ? e.message : String(e));
        }
      });
  }, [dataSelecionada, nonceRecarga]);

  async function aoSalvarNovoCliente(e: FormEvent) {
    e.preventDefault();
    if (!novoClienteNome.trim()) {
      toast.erro('Informe o nome do cliente.');
      return;
    }
    setSalvandoNovoCliente(true);
    try {
      const novoCliId = uuidv7();
      await salvarClienteFiado({
        id: novoCliId,
        nome: novoClienteNome.trim(),
        contato: novoClienteContato.trim() || null,
      });
      toast.sucesso('Cliente cadastrado com sucesso.');

      // Atualiza o contexto localmente para que o seletor inclua o novo cliente
      if (ctx) {
        const novosClientes = [
          ...ctx.clientesFiado,
          { id: novoCliId, nome: novoClienteNome.trim() },
        ].sort((a, b) => a.nome.localeCompare(b.nome));
        setCtx({
          ...ctx,
          clientesFiado: novosClientes,
        });
      }

      // Define a seleção atual para o novo cliente cadastrado
      if (novoClienteOrigem) {
        const { tipo, index } = novoClienteOrigem;
        if (tipo === 'concedido') {
          setFiadosConcedidos(prev => prev.map((f, idx) => idx === index ? { ...f, clienteId: novoCliId } : f));
        } else if (tipo === 'recebido') {
          setFiadosRecebidos(prev => prev.map((f, idx) => idx === index ? { ...f, clienteId: novoCliId } : f));
        }
      }

      // Fecha e limpa
      setModalNovoCliente(false);
      setNovoClienteNome('');
      setNovoClienteContato('');
      setNovoClienteOrigem(null);
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao cadastrar o cliente.');
    } finally {
      setSalvandoNovoCliente(false);
    }
  }

  // Carrega o histórico de fechamentos quando a aba é aberta
  useEffect(() => {
    if (aba !== 'historico') return;
    let ativo = true;
    setHistCarregando(true);
    listarFechamentos()
      .then((fs) => {
        if (ativo) setHistorico(fs);
      })
      .catch((e) => {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar o histórico.');
      })
      .finally(() => {
        if (ativo) setHistCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [aba, nonceRecarga, toast]);

  async function confirmarReabertura() {
    if (!reabrirAlvo) return;
    if (motivoReabrir.trim() === '') {
      toast.erro('Informe a justificativa da reabertura.');
      return;
    }
    setReabrindo(true);
    try {
      await reabrirFechamento(reabrirAlvo, usuarioId || '', motivoReabrir.trim());
      toast.sucesso('Fechamento reaberto.');
      setReabrirAlvo(null);
      setMotivoReabrir('');
      setNonceRecarga((n) => n + 1);
    } catch (e) {
      toast.erro('Falha ao reabrir: ' + (e instanceof Error ? e.message : 'erro'));
    } finally {
      setReabrindo(false);
    }
  }

  async function recarregarDespesas() {
    try {
      const rawDespesas = await listarDespesasDoDia(dataSelecionada);
      setDespesasDoDia(rawDespesas.filter((d) => d.contaId === ctx?.contaCaixaId));
    } catch (e) {
      console.error('Erro ao recarregar despesas do dia:', e);
    }
  }

  async function excluirDespesa(id: string) {
    try {
      await removerDespesa(id, usuarioId ?? '');
      await recarregarDespesas();
      toast.sucesso('Despesa removida.');
    } catch (e) {
      toast.erro('Falha ao remover a despesa.');
      console.error(e);
    }
  }

  const calc = useMemo(() => {
    if (!ctx) return null;

    const bombas = ctx.bombas.map((b) => {
      const atual = litrosParaMililitros(leituras[b.id] ?? '');
      const preenchido = (leituras[b.id] ?? '').trim() !== '';
      const invalido = preenchido && atual < b.leituraAnterior;
      let litrosMl: Mililitros = asMililitros(0n);
      let valor: Centavos = ZERO;
      if (preenchido && !invalido && b.precoLitro !== undefined) {
        const r = vendaCombustivel({
          leituraAnterior: b.leituraAnterior,
          leituraAtual: atual,
          precoCentavosPorLitro: b.precoLitro,
        });
        litrosMl = r.litrosMl;
        valor = r.valorCentavos;
      }
      return { ...b, atual, invalido, litrosMl, valor };
    });

    const produtos = ctx.produtos.map((p) => {
      const preenchido = (contagens[p.id] ?? '').trim() !== '';
      const ent = paraQuantidade(entradasEstoque[p.id] ?? '');
      const atual = preenchido ? paraQuantidade(contagens[p.id] ?? '') : asQuantidade(p.estoqueAnterior + ent);
      const r = vendaProdutoContagem({
        estoqueAnterior: p.estoqueAnterior,
        entradas: ent,
        estoqueAtual: atual,
        perdas: asQuantidade(0n),
        precoCentavos: p.preco ?? ZERO,
      });
      return { ...p, atual, ent, preenchido, vendido: r.vendido, valor: r.valorCentavos };
    });

    const ind = ctx.produtosIndividuais.map((p) => {
      const preenchido = (vendasIndividuais[p.id] ?? '').trim() !== '';
      const vendido = paraQuantidade(vendasIndividuais[p.id] ?? '');
      const valor = asCentavos(arredondarDivisao(vendido * (p.preco ?? ZERO), 1000n));
      return { ...p, vendido, preenchido, valor };
    });

    const totalCombustivel = somar(...bombas.map((b) => b.valor));
    const totalProdutos = somar(...produtos.map((p) => p.valor));
    const totalIndividuais = somar(...ind.map((p) => p.valor));
    const vendaFisica = somar(totalCombustivel, totalProdutos, totalIndividuais);

    const pixC = parseReais(pix);
    const debitoC = parseReais(debito);
    const creditoC = parseReais(credito);
    const despesaC = totalDespesasDinheiro(despesasDoDia);
    const contadoC = parseReais(contado);
    const fiadoConC = somar(...fiadosConcedidos.map(f => parseReais(f.valor)));
    const fiadoRecC = somar(...fiadosRecebidos.map(f => parseReais(f.valor)));

    const dCartaoDeb = liquidoCartao({
      bruto: debitoC,
      percentualBp: ctx.taxaDebito.percentualBp,
      taxaFixa: ctx.taxaDebito.fixa,
    });
    const dCartaoCred = liquidoCartao({
      bruto: creditoC,
      percentualBp: ctx.taxaCredito.percentualBp,
      taxaFixa: ctx.taxaCredito.fixa,
    });
    // PIX via maquininha também tem taxa (PIX direto na chave é grátis → taxa 0).
    const dCartaoPix = liquidoCartao({
      bruto: pixC,
      percentualBp: ctx.taxaPix.percentualBp,
      taxaFixa: ctx.taxaPix.fixa,
    });

    const esperado = dinheiroEsperado({
      vendaFisica,
      fiadoConcedido: fiadoConC,
      recebimentosFiadoDinheiro: fiadoRecC,
      pix: pixC,
      cartaoDebito: debitoC,
      cartaoCredito: creditoC,
      despesasDinheiro: despesaC,
      trocoFixo: ctx.trocoFixo,
    });
    const diferenca = diferencaCaixa(contadoC, esperado);
    const cashSales = subtrair(subtrair(subtrair(subtrair(vendaFisica, pixC), debitoC), creditoC), fiadoConC);
    const aDepositarBruto = subtrair(contadoC, ctx.trocoFixo);
    const aDepositar = aDepositarBruto < 0n ? ZERO : aDepositarBruto;

    const totalDespesasGeral = somar(...despesasDoDia.map((d) => d.valor));
    const saldoDoDia = subtrair(vendaFisica, totalDespesasGeral);
    const totalNaoDinheiro = somar(pixC, debitoC, creditoC);

    return {
      bombas,
      produtos,
      vendaFisica,
      pixC,
      debitoC,
      creditoC,
      despesaC,
      contadoC,
      fiadoConC,
      fiadoRecC,
      dCartaoDeb,
      dCartaoCred,
      dCartaoPix,
      esperado,
      diferenca,
      cashSales,
      aDepositar,
      ind,
      totalDespesasGeral,
      saldoDoDia,
      totalNaoDinheiro,
    };
  }, [
    ctx, leituras, contagens, entradasEstoque, vendasIndividuais, pix, debito, credito,
    despesasDoDia, contado, fiadosConcedidos, fiadosRecebidos
  ]);

  function aoEnter(e: KeyboardEvent<HTMLInputElement>, indice: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    refs.current[indice + 1]?.focus();
  }

  // Avisos pré-finalização: dia sem registro físico (vai repetir estoque/série
  // da bomba) e/ou dias anteriores ainda em aberto. Se houver algo a avisar,
  // abre o modal; senão, finaliza direto.
  async function confirmar() {
    if (!ctx || !calc || !ctx.contaCaixaId) return;

    const semRegistroFisico =
      calc.bombas.every((b) => (leituras[b.id] ?? '').trim() === '') &&
      calc.produtos.every((p) => (contagens[p.id] ?? '').trim() === '') &&
      calc.ind.every((p) => (vendasIndividuais[p.id] ?? '').trim() === '');

    let diasAbertos: string[] = [];
    try {
      diasAbertos = await listarDiasAbertosAntes(ctx.data);
    } catch (e) {
      console.error('Erro ao checar dias anteriores em aberto', e);
    }

    if (semRegistroFisico || diasAbertos.length > 0) {
      setAvisoFinalizacao({ semRegistroFisico, diasAbertos });
      return;
    }

    await executarConfirmacao();
  }

  async function executarConfirmacao() {
    if (!ctx || !calc || !ctx.contaCaixaId) return;
    setAvisoFinalizacao(null);
    setConfirmando(true);
    setErroConfirmar(null);
    try {
      const resumo: ResumoConfirmacao = {
        data: ctx.data,
        observacao: observacao.trim() || null,
        trocoFixo: ctx.trocoFixo,
        usuarioId,
        contaCaixaId: ctx.contaCaixaId,
        contaBancoId: ctx.contaBancoId,
        // Grava TODAS as bombas. Em branco → repete a leitura anterior (venda 0,
        // série contínua). Sem isso, a bomba em branco não gerava linha e o dia
        // seguinte lia 0 como leitura inicial, acusando "venda de milhões".
        leituras: calc.bombas
          .filter((b) => !b.invalido)
          .map((b) => ({
            bombaId: b.id,
            leitura: (leituras[b.id] ?? '').trim() !== '' ? b.atual : b.leituraAnterior,
          })),
        contagens: calc.produtos
          .map((p) => ({ produtoId: p.id, quantidade: p.atual })),
        entradas: calc.produtos
          .filter((p) => p.ent > 0n)
          .map((p) => ({ produtoId: p.id, quantidade: p.ent })),
        vendasIndividuais: calc.ind
          .filter((p) => p.preenchido)
          .map((p) => ({ produtoId: p.id, quantidade: p.vendido, valor: p.valor })),
        fiadosConcedidos: fiadosConcedidos
          .filter(f => f.clienteId && parseReais(f.valor) > 0n)
          .map(f => ({
            id: f.id,
            clienteId: f.clienteId,
            valor: parseReais(f.valor),
            vencimento: f.vencimento || null,
          })),
        fiadosRecebidos: fiadosRecebidos
          .filter(f => f.clienteId && parseReais(f.valor) > 0n)
          .map(f => ({
            id: f.id,
            clienteId: f.clienteId,
            valor: parseReais(f.valor),
            fiadoId: f.fiadoId || null,
          })),
        cashSales: calc.cashSales,
        pixNet: calc.dCartaoPix.liquido,
        pixTaxa: calc.dCartaoPix.taxa,
        debitoNet: calc.dCartaoDeb.liquido,
        debitoTaxa: calc.dCartaoDeb.taxa,
        creditoNet: calc.dCartaoCred.liquido,
        creditoTaxa: calc.dCartaoCred.taxa,
        despesaIds: despesasDoDia.map((d) => d.id),
        diferenca: calc.diferenca,
        aDepositar: calc.aDepositar,
        transferenciaDestinoId: destinoTransfId || null,
        transferenciaDestinoEhBanco: contas.find(c => c.id === destinoTransfId)?.tipo === 'banco',
      };
      await confirmarFechamento(resumo);
      
      let transferencia;
      
      if (calc.aDepositar && calc.aDepositar !== 0n && destinoTransfId) {
        const conta = contas.find(c => c.id === destinoTransfId);
        const destinoNome = conta?.nome ?? 'Desconhecida';
        const destinoFotoUrl = conta?.fotoUrl ?? null;
        const ehBanco = conta?.tipo === 'banco';
        let saldoDestino;
        try {
          const saldos = await listarSaldos();
          saldoDestino = saldos.find(s => s.id === destinoTransfId)?.saldo;
        } catch (e) {
          console.error('Erro ao buscar saldo destino', e);
        }
        transferencia = {
          destinoNome,
          destinoFotoUrl,
          ehBanco,
          valor: asCentavos(calc.aDepositar),
          ...(saldoDestino !== undefined ? { saldoDestino: asCentavos(saldoDestino) } : {})
        };
      } else {
        const sourceConta = contas.find(c => c.id === ctx.contaCaixaId)
                         || contas.find(c => c.ehDestinoPadraoVenda && c.tipo === 'dinheiro')
                         || contas.find(c => c.tipo === 'dinheiro');
        const destinoNome = sourceConta?.nome ?? 'Caixa Gaveta';
        const destinoFotoUrl = sourceConta?.fotoUrl ?? null;
        let saldoDestino;
        try {
          const saldos = await listarSaldos();
          saldoDestino = sourceConta ? (saldos.find(s => s.id === sourceConta.id)?.saldo ?? 0n) : 0n;
        } catch (e) {
          console.error('Erro ao buscar saldo destino', e);
        }
        transferencia = {
          destinoNome,
          destinoFotoUrl,
          ehBanco: false,
          valor: asCentavos(0n),
          ...(saldoDestino !== undefined ? { saldoDestino: asCentavos(saldoDestino) } : {}),
          permaneuNoCaixa: true,
        };
      }

      setRelatorio({
        data: ctx.data,
        fechadoEm: agoraManausISO(),
        usuarioNome,
        usuarioFotoUrl,
        bombas: calc.bombas.map((b) => ({
          nome: `${b.combustivel} (${b.nome})`,
          litrosMl: b.litrosMl,
          valor: b.valor,
          leituraAtual: b.atual,
          entradasLitrosMl: b.entradasLitrosMl,
          precoLitro: b.precoLitro,
        })),
        produtos: calc.produtos.map((p) => ({
          nome: p.nome,
          categoriaNome: p.categoriaNome,
          estoqueAtual: p.atual,
          entradas: p.ent,
          vendido: p.vendido,
          preco: p.preco ?? asCentavos(0n),
          valor: p.valor,
        })),
        vendaFisica: calc.vendaFisica,
        pix: calc.pixC,
        debito: calc.debitoC,
        credito: calc.creditoC,
        despesa: calc.despesaC,
        esperado: calc.esperado,
        contado: calc.contadoC,
        diferenca: calc.diferenca,
        aDepositar: calc.aDepositar,
        observacao: observacao.trim(),
        fiadoConcedido: calc.fiadoConC,
        fiadoRecebido: calc.fiadoRecC,
        despesasDetalhes: despesasDoDia,
        taxasCartao: {
          pixNet: calc.dCartaoPix.liquido,
          pixTaxa: calc.dCartaoPix.taxa,
          debitoNet: calc.dCartaoDeb.liquido,
          debitoTaxa: calc.dCartaoDeb.taxa,
          creditoNet: calc.dCartaoCred.liquido,
          creditoTaxa: calc.dCartaoCred.taxa,
        },
        destinoBancarioNome: contas.find(c => c.tipo === 'banco')?.nome ?? 'Banco (Padrão)',
        destinoBancarioFotoUrl: contas.find(c => c.tipo === 'banco')?.fotoUrl ?? null,
        transferencia,
        produtosFaltando: calc.produtos
          .filter(p => p.atual <= 0n)
          .map(p => ({ nome: p.nome, estoqueAtual: p.atual })),
        contasDinheiro: contas
          .filter(c => c.tipo === 'dinheiro' && c.id !== (destinoTransfId || ctx.contaCaixaId))
          .map(c => ({
            id: c.id,
            nome: c.nome,
            fotoUrl: c.fotoUrl,
            saldo: saldos.find(s => s.id === c.id)?.saldo ?? asCentavos(0n),
          }))
          .filter(c => c.saldo > 0n),
        tanques: dadosTanques,
      });
      toast.sucesso('Fechamento confirmado e travado.');
    } catch (e) {
      setErroConfirmar(e instanceof Error ? e.message : 'Falha ao confirmar.');
    } finally {
      setConfirmando(false);
    }
  }

  const relatorioParaExibir = useMemo(() => {
    if (relatorio) return relatorio;
    if (ctx && ctx.status === 'travado' && calc) {
      let contaDestinoId: string | null = destinoTransfId;
      if (ctx.valoresSalvos) {
        contaDestinoId = ctx.valoresSalvos.transferenciaDestinoId ?? null;
      }

      let transferencia;
      
      if (calc.aDepositar && calc.aDepositar !== 0n && contaDestinoId) {
        const conta = contas.find(c => c.id === contaDestinoId);
        const destinoNome = conta?.nome ?? 'Desconhecida';
        const destinoFotoUrl = conta?.fotoUrl ?? null;
        const ehBanco = conta?.tipo === 'banco';
        const saldoDestino = saldos.find(s => s.id === contaDestinoId)?.saldo;
        
        transferencia = {
          destinoNome,
          destinoFotoUrl,
          ehBanco,
          valor: asCentavos(calc.aDepositar),
          ...(saldoDestino !== undefined ? { saldoDestino: asCentavos(saldoDestino) } : {})
        };
      } else {
        const sourceConta = contas.find(c => c.id === ctx.contaCaixaId)
                         || contas.find(c => c.ehDestinoPadraoVenda && c.tipo === 'dinheiro')
                         || contas.find(c => c.tipo === 'dinheiro');
        const destinoNome = sourceConta?.nome ?? 'Caixa Gaveta';
        const destinoFotoUrl = sourceConta?.fotoUrl ?? null;
        const saldoDestino = sourceConta ? (saldos.find(s => s.id === sourceConta.id)?.saldo ?? 0n) : 0n;
        
        transferencia = {
          destinoNome,
          destinoFotoUrl,
          ehBanco: false,
          valor: asCentavos(0n),
          saldoDestino: asCentavos(saldoDestino),
          permaneuNoCaixa: true,
        };
      }

      return {
        data: ctx.data,
        fechadoEm: ctx.confirmadoEm ?? null,
        usuarioNome,
        usuarioFotoUrl,
        bombas: calc.bombas.map((b) => ({
          nome: `${b.combustivel} (${b.nome})`,
          litrosMl: b.litrosMl,
          valor: b.valor,
          leituraAtual: b.atual,
          entradasLitrosMl: b.entradasLitrosMl,
          precoLitro: b.precoLitro,
        })),
        produtos: calc.produtos.map((p) => ({
          nome: p.nome,
          categoriaNome: p.categoriaNome,
          estoqueAtual: p.atual,
          entradas: p.ent,
          vendido: p.vendido,
          preco: p.preco ?? asCentavos(0n),
          valor: p.valor,
        })),
        vendaFisica: calc.vendaFisica,
        pix: calc.pixC,
        debito: calc.debitoC,
        credito: calc.creditoC,
        despesa: calc.despesaC,
        esperado: ctx.valoresSalvos?.esperado !== undefined ? ctx.valoresSalvos.esperado : calc.esperado,
        contado: ctx.valoresSalvos?.contado ? parseReais(ctx.valoresSalvos.contado) : calc.contadoC,
        diferenca: ctx.valoresSalvos?.diferenca !== undefined ? ctx.valoresSalvos.diferenca : calc.diferenca,
        aDepositar: calc.aDepositar,
        observacao: observacao,
        fiadoConcedido: calc.fiadoConC,
        fiadoRecebido: calc.fiadoRecC,
        despesasDetalhes: despesasDoDia,
        taxasCartao: {
          pixNet: calc.dCartaoPix.liquido,
          pixTaxa: calc.dCartaoPix.taxa,
          debitoNet: calc.dCartaoDeb.liquido,
          debitoTaxa: calc.dCartaoDeb.taxa,
          creditoNet: calc.dCartaoCred.liquido,
          creditoTaxa: calc.dCartaoCred.taxa,
        },
        destinoBancarioNome: contas.find(c => c.tipo === 'banco')?.nome ?? 'Banco (Padrão)',
        destinoBancarioFotoUrl: contas.find(c => c.tipo === 'banco')?.fotoUrl ?? null,
        transferencia,
        produtosFaltando: calc.produtos
          .filter(p => p.atual <= 0n)
          .map(p => ({ nome: p.nome, estoqueAtual: p.atual })),
        contasDinheiro: contas
          .filter(c => c.tipo === 'dinheiro' && c.id !== (contaDestinoId || ctx.contaCaixaId))
          .map(c => ({
            id: c.id,
            nome: c.nome,
            fotoUrl: c.fotoUrl,
            saldo: saldos.find(s => s.id === c.id)?.saldo ?? asCentavos(0n),
          }))
          .filter(c => c.saldo > 0n),
        tanques: dadosTanques,
      };
    }
    return null;
  }, [relatorio, ctx, calc, observacao, despesasDoDia, destinoTransfId, contas, dadosTanques]);

  if (erroCarga)
    return <div className="cartao p-6 text-sm text-negativo">Erro ao carregar o fechamento: {erroCarga}</div>;
  if (!ctx || !calc) return <p className="p-6 text-sm text-suave">Carregando fechamento…</p>;

  const statusBadge = ctx.status && ctx.status !== 'travado' ? (
    <span className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium bg-atencao/15 text-atencao">
      Rascunho aberto
    </span>
  ) : null;

  const cabecalho = (
    <div className="flex flex-col gap-4 border-b border-borda/50 pb-4 mb-2 print:hidden">
      <PageHeader
        titulo={
          relatorioParaExibir ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Fechamento de caixa</span>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 bg-positivo/20 border border-positivo/40 text-positivo px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider shadow-sm shadow-positivo/10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                  Concluído
                </span>
                <span className="inline-flex items-center justify-center w-6 h-6 bg-ambar/20 border border-ambar/30 text-ambar rounded-full shadow-sm shadow-ambar/10 shrink-0" title="Fechamento travado">
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
              </div>
            </div>
          ) : (
            "Fechamento de caixa"
          )
        }
        subtitulo="Conferência diária de vendas, pagamentos e caixa"
        acao={<AbaSwitch aba={aba} aoTrocar={setAba} />}
      />
      {aba === 'fechar' && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SeletorData
            dataSelecionada={dataSelecionada}
            aoMudar={setDataSelecionada}
            recentes={recentes}
          />
          {statusBadge}
        </div>
      )}
    </div>
  );

  const modalAvisoFinalizacao = (
    <Modal
      aberto={!!avisoFinalizacao}
      aoFechar={() => setAvisoFinalizacao(null)}
      titulo="Confirmar fechamento"
      descricao="Revise os avisos abaixo antes de travar o dia."
    >
      <div className="flex flex-col gap-4">
        {avisoFinalizacao?.semRegistroFisico && (
          <div className="rounded-xl border border-atencao/30 bg-atencao/10 p-4 text-sm text-claro">
            <p className="font-semibold text-atencao">Dia sem registro de vendas</p>
            <p className="mt-1 text-suave">
              Nenhuma leitura de bomba, contagem ou venda foi preenchida. O estoque e a
              série das bombas serão <strong>repetidos do fechamento anterior</strong> (venda
              zero). Use isto para dias em que o estabelecimento não abriu.
            </p>
          </div>
        )}
        {avisoFinalizacao && avisoFinalizacao.diasAbertos.length > 0 && (
          <div className="rounded-xl border border-negativo/30 bg-negativo/10 p-4 text-sm text-claro">
            <p className="font-semibold text-negativo">
              {avisoFinalizacao.diasAbertos.length === 1
                ? 'Existe um dia anterior em aberto'
                : 'Existem dias anteriores em aberto'}
            </p>
            <p className="mt-1 text-suave">
              {avisoFinalizacao.diasAbertos.map(formatarDataBR).join(', ')}
              {' — '}feche-o(s) primeiro para não deixar um dia aberto entre os fechados.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-suave px-4 py-2 text-sm"
            onClick={() => setAvisoFinalizacao(null)}
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={confirmando}
            className="btn btn-primario px-4 py-2 text-sm"
            onClick={() => void executarConfirmacao()}
          >
            {confirmando ? 'Travando…' : 'Confirmar mesmo assim'}
          </button>
        </div>
      </div>
    </Modal>
  );

  const modalReabrir = (
    <Modal
      aberto={!!reabrirAlvo}
      aoFechar={() => {
        setReabrirAlvo(null);
        setMotivoReabrir('');
      }}
      titulo="Reabrir fechamento"
      descricao="Destrava o dia para edição e remove os lançamentos financeiros gerados. A ação fica registrada na auditoria."
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-claro">
          Justificativa
          <textarea
            value={motivoReabrir}
            onChange={(e) => setMotivoReabrir(e.target.value)}
            rows={3}
            className={CLASSE_CAMPO}
            placeholder="Motivo da reabertura (obrigatório)"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-suave px-4 py-2 text-sm"
            onClick={() => {
              setReabrirAlvo(null);
              setMotivoReabrir('');
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={reabrindo}
            className="btn btn-primario px-4 py-2 text-sm"
            onClick={() => void confirmarReabertura()}
          >
            {reabrindo ? 'Reabrindo…' : 'Confirmar reabertura'}
          </button>
        </div>
      </div>
    </Modal>
  );

  if (aba === 'historico') {
    return (
      <div className="flex flex-col gap-6">
        {cabecalho}
        <Historico
          itens={historico}
          carregando={histCarregando}
          de={histDe}
          ate={histAte}
          status={histStatus}
          setDe={setHistDe}
          setAte={setHistAte}
          setStatus={setHistStatus}
          aoAbrir={(data) => {
            setDataSelecionada(data);
            setAba('fechar');
          }}
        />
        {modalReabrir}
      </div>
    );
  }



  // Dia configurado como sem funcionamento e ainda sem nada lançado: mostra o
  // aviso em vez do formulário. Não bloqueia — há um atalho para registrar
  // mesmo assim (ex.: um sábado em que abriu excepcionalmente).
  if (!ctx.diaDeFuncionamento && ctx.status === null && !forcarAbertura) {
    return (
      <div className="flex flex-col gap-6">
        {cabecalho}
        <section className="cartao flex flex-col items-center gap-4 p-10 text-center">
          <div className="rounded-full bg-ambar/10 p-4 text-ambar">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 9h18M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25A2.25 2.25 0 0118.75 21H5.25A2.25 2.25 0 013 18.75z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 14.25l4.5 4.5M14.25 14.25l-4.5 4.5" />
            </svg>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold text-claro">Estabelecimento fechado neste dia</h2>
            <p className="max-w-md text-sm text-suave">
              {DIAS_SEMANA_LONGO[diaSemanaManaus(dataSelecionada)]} está configurado como dia sem
              funcionamento. Não há vendas registradas e o estoque continua o mesmo do último
              fechamento.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-suave px-4 py-2 text-sm"
            onClick={() => setForcarAbertura(true)}
          >
            Registrar fechamento mesmo assim
          </button>
          <p className="text-xs text-suave">
            Os dias de funcionamento são definidos em Configurações.
          </p>
        </section>
      </div>
    );
  }

  if (relatorioParaExibir) {
    return (
      <div className="flex flex-col gap-6">
        {cabecalho}
        <Relatorio
          dados={relatorioParaExibir}
          aoFechar={() => setDataSelecionada(hojeManaus())}
          podeReabrir={podeReabrir ?? false}
          aoReabrir={() => setReabrirAlvo(ctx.fechamentoId)}
        />
        {modalReabrir}
      </div>
    );
  }

  let idx = 0;
  const podeConfirmar = contado.trim() !== '' && !!ctx.contaCaixaId && !confirmando && isOnline;

  return (
    <div className="flex flex-col gap-6">
      {cabecalho}

      {!isOnline && (
        <div className="rounded-xl border border-negativo/30 bg-negativo/10 p-4 text-sm text-negativo">
          Você está offline. Não é possível confirmar fechamentos sem conexão com a internet.
        </div>
      )}

      {/* Combustível */}
      <section className="cartao p-5">
        <h2 className="mb-3 font-display font-semibold text-claro">Combustível (encerrante)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-suave">
              <th className="pb-2 font-medium">Bico</th>
              <th className="pb-2 text-right font-medium">Leitura anterior</th>
              <th className="pb-2 text-right font-medium">Leitura atual</th>
              <th className="pb-2 text-right font-medium">Litros</th>
              <th className="pb-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {calc.bombas.map((b) => {
              const meu = idx++;
              return (
                <tr key={b.id} className="border-t border-borda/60 hover:bg-claro/[0.02] transition-colors">
                  <td className="py-2 text-claro">
                    {b.combustivel} <span className="text-xs text-suave">({b.nome})</span>
                  </td>
                  <td className="numeros py-2 text-right text-claro/60">
                    {formatarLeituraAnterior(b.leituraAnterior)}
                  </td>
                  <td className="py-2 text-right">
                    <input
                      ref={(el) => {
                        refs.current[meu] = el;
                      }}
                      inputMode="decimal"
                      value={leituras[b.id] ?? ''}
                      onChange={(e) => setLeituras((s) => ({ ...s, [b.id]: formatarInteiroDigitado(e.target.value) }))}
                      onKeyDown={(e) => aoEnter(e, meu)}
                      onFocus={(e) => {
                        if (e.target.value === '0') {
                          setLeituras((s) => ({ ...s, [b.id]: '' }));
                        }
                      }}
                      className={`${inputClasse} ${b.invalido ? 'border-negativo' : ''}`}
                      placeholder="0"
                    />
                  </td>
                  <td className="numeros py-2 text-right text-claro/80">
                    {formatLitros(b.litrosMl)}
                  </td>
                  <td className="numeros py-2 text-right text-claro">{formatReais(b.valor)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Produtos por contagem */}
      {(() => {
        // Coluna "Entrada" é só VISUALIZAÇÃO e só aparece quando houve entrada no dia
        // (lançada em Produtos / notinha, por DATA). Não se edita aqui.
        const mostrarColunaEntrada = calc.produtos.some((p) => p.ent > 0n);
        return (
      <section className="cartao p-5">
        <h2 className="mb-3 font-display font-semibold text-claro">Produtos (contagem)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-suave">
              <th className="pb-2 font-medium">Produto</th>
              <th className="pb-2 text-right font-medium">Estoque anterior</th>
              {mostrarColunaEntrada && <th className="pb-2 text-right font-medium">Entrada</th>}
              <th className="pb-2 text-right font-medium">Contagem agora</th>
              <th className="pb-2 text-right font-medium">Vendido</th>
              <th className="pb-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {calc.produtos.map((p) => {
              const meu = idx++;
              return (
                <tr key={p.id} className="border-t border-borda/60 hover:bg-claro/[0.02] transition-colors">
                  <td className="py-2 text-claro">{p.nome}</td>
                  <td className="numeros py-2 text-right text-claro/60">
                    {String(p.estoqueAnterior)}
                  </td>
                  {mostrarColunaEntrada && (
                    <td className="numeros py-2 text-right text-claro/60">
                      {p.ent > 0n ? `+${String(p.ent)}` : '—'}
                    </td>
                  )}
                  <td className="py-2 text-right">
                    <input
                      ref={(el) => {
                        refs.current[meu] = el;
                      }}
                      inputMode="numeric"
                      value={contagens[p.id] ?? ''}
                      onChange={(e) => setContagens((s) => ({ ...s, [p.id]: formatarInteiroDigitado(e.target.value) }))}
                      onKeyDown={(e) => aoEnter(e, meu)}
                      onFocus={(e) => {
                        if (e.target.value === '0') {
                          setContagens((s) => ({ ...s, [p.id]: '' }));
                        }
                      }}
                      className={inputClasse}
                      placeholder="0"
                    />
                  </td>
                  <td className="numeros py-2 text-right text-claro/80">{String(p.vendido)}</td>
                  <td className="numeros py-2 text-right text-claro">{formatReais(p.valor)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
        );
      })()}

      {/* Produtos individuais (Venda Avulsa) */}
      {ctx.mostrarProdutosAvulsos && calc.ind.length > 0 && (
        <section className="cartao p-5">
          <h2 className="mb-3 font-display font-semibold text-claro">Produtos (Avulsos / Serviços)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-suave">
                <th className="pb-2 font-medium">Produto</th>
                <th className="pb-2 text-right font-medium">Qtd. Vendida</th>
                <th className="pb-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {calc.ind.map((p) => {
                const meu = idx++;
                return (
                  <tr key={p.id} className="border-t border-borda/60 hover:bg-claro/[0.02] transition-colors">
                    <td className="py-2 text-claro">{p.nome}</td>
                    <td className="py-2 text-right">
                      <input
                        ref={(el) => {
                          refs.current[meu] = el;
                        }}
                        inputMode="numeric"
                        value={vendasIndividuais[p.id] ?? ''}
                        onChange={(e) => setVendasIndividuais((s) => ({ ...s, [p.id]: formatarInteiroDigitado(e.target.value) }))}
                        onKeyDown={(e) => aoEnter(e, meu)}
                        onFocus={(e) => {
                          if (e.target.value === '0') {
                            setVendasIndividuais((s) => ({ ...s, [p.id]: '' }));
                          }
                        }}
                        className={inputClasse}
                        placeholder="0"
                      />
                    </td>
                    <td className="numeros py-2 text-right text-claro">{formatReais(p.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Venda física e Saldo do Dia */}
      <section className="cartao p-5 grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-suave">Venda física do dia</span>
          <span className="numeros text-2xl font-bold text-claro mt-1">{formatReais(calc.vendaFisica)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-negativo">Saídas (Despesas)</span>
          <span className="numeros text-2xl font-bold text-negativo mt-1">-{formatReais(calc.totalDespesasGeral)}</span>
        </div>
        <div className="flex flex-col border-t border-borda pt-3 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-4 border-borda/40">
          <span className="text-xs font-semibold uppercase tracking-wide text-positivo">Saldo do dia</span>
          <span className="numeros text-2xl font-extrabold text-positivo mt-1">{formatReais(calc.saldoDoDia)}</span>
        </div>
      </section>

      {/* Despesas do dia (vinculadas à janela Despesas) */}
      <section className="cartao p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-claro">Despesas do dia</h2>
            <p className="text-xs text-suave">
              Lançadas aqui ou na janela Despesas. Só as em dinheiro saem da gaveta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalDespesa(true)}
            className="btn btn-suave px-3 py-2 text-sm"
          >
            + Nova despesa
          </button>
        </div>

        {despesasDoDia.length === 0 ? (
          <p className="rounded-lg border border-dashed border-borda px-4 py-6 text-center text-sm text-suave">
            Nenhuma despesa lançada neste dia.
          </p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-suave border-b border-borda/60">
                <th className="pb-2 pl-2 font-medium">Descrição</th>
                <th className="pb-2 font-medium">Forma</th>
                <th className="pb-2 text-right font-medium">Valor</th>
                <th className="pb-2 text-right pr-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const despesasAgrupadas = despesasDoDia.reduce<Record<string, DespesaDoDia[]>>((acc, d) => {
                  const cat = d.categoriaNome || 'Outras despesas';
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(d);
                  return acc;
                }, {});

                return Object.entries(despesasAgrupadas).map(([categoria, lista]) => (
                  <Fragment key={categoria}>
                    <tr className="bg-claro/[0.01]">
                      <td colSpan={4} className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-suave bg-borda/10 border-t border-borda/40">
                        {categoria}
                      </td>
                    </tr>
                    {lista.map((d) => {
                      const ehDinheiro = d.formaPagamento === 'dinheiro';
                      return (
                        <tr key={d.id} className="border-t border-borda/30 hover:bg-claro/[0.02] transition-colors">
                          <td className="py-2 pl-4 text-claro">{d.descricao || '—'}</td>
                          <td className="py-2 text-suave">
                            {FORMAS_PAGAMENTO[d.formaPagamento ?? ''] ?? d.formaPagamento ?? '—'}
                            {!ehDinheiro && <span className="ml-1 text-xs text-suave/70">(não sai da gaveta)</span>}
                          </td>
                          <td className={`numeros py-2 text-right ${ehDinheiro ? 'text-negativo' : 'text-suave'}`}>
                            {formatReais(d.valor)}
                          </td>
                          <td className="py-2 text-right pr-2">
                            <button
                              type="button"
                              aria-label="Remover despesa"
                              onClick={() => void excluirDespesa(d.id)}
                              className="text-suave hover:text-negativo"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ));
              })()}
              <tr className="border-t border-borda">
                <td className="py-2 pl-2 font-semibold text-claro" colSpan={2}>
                  Total em dinheiro (sai da gaveta)
                </td>
                <td className="numeros py-2 text-right font-semibold text-negativo">
                  {formatReais(calc.despesaC)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Fiados do Dia - Relocalizado abaixo de despesas e reduzido */}
      {!mostrarFiados ? (
        <div className="flex justify-end my-1">
          <button
            type="button"
            onClick={() => {
              setMostrarFiados(true);
              if (fiadosConcedidos.length === 0) {
                setFiadosConcedidos([{ clienteId: '', valor: '', vencimento: null }]);
              }
              if (fiadosRecebidos.length === 0) {
                setFiadosRecebidos([{ clienteId: '', valor: '', fiadoId: null }]);
              }
            }}
            className="text-xs text-suave hover:text-ambar flex items-center gap-1 border border-borda/40 rounded-lg px-3 py-1.5 hover:border-suave/50 transition-colors bg-card/10"
          >
            <IconePlus /> Registrar fiado
          </button>
        </div>
      ) : (
        <section className="grid gap-4 cartao p-5 sm:grid-cols-2 relative">
          <div className="sm:col-span-2 flex items-center justify-between">
            <h2 className="font-display font-semibold text-claro">
              Fiados do Dia
            </h2>
            <button
              type="button"
              onClick={() => {
                setMostrarFiados(false);
              }}
              className="text-xs text-suave hover:text-claro font-medium"
            >
              Recolher seção
            </button>
          </div>
          
          <div className="rounded-xl border border-borda p-4 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-claro border-b border-borda pb-2">Fiados Concedidos (Venda pendurada)</h3>
            
            {fiadosConcedidos.map((item, index) => (
              <div key={index} className="flex flex-col gap-3 border-b border-borda/50 pb-4 last:border-0 last:pb-0 relative pt-2">
                {fiadosConcedidos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setFiadosConcedidos(prev => prev.filter((_, idx) => idx !== index))}
                    className="absolute right-0 top-0 text-negativo hover:text-negativo-claro text-xs font-medium"
                  >
                    Remover
                  </button>
                )}
                <div className="flex gap-2">
                  <select
                    aria-label={`Cliente do fiado concedido #${index + 1}`}
                    value={item.clienteId}
                    onChange={(e) => setFiadosConcedidos(prev => prev.map((f, idx) => idx === index ? { ...f, clienteId: e.target.value } : f))}
                    className={`${CLASSE_CAMPO} flex-1`}
                  >
                    <option value="">Selecione o Cliente</option>
                    {ctx.clientesFiado.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <button
                    type="button"
                    className="btn btn-suave p-2.5 flex items-center justify-center shrink-0"
                    title="Cadastrar novo cliente"
                    onClick={() => {
                      setNovoClienteOrigem({ tipo: 'concedido', index });
                      setModalNovoCliente(true);
                    }}
                  >
                    <IconePlus />
                  </button>
                </div>
                <div className="grid gap-3 grid-cols-2">
                  <CampoMoeda rotulo="Valor" valor={item.valor} aoMudar={(val) => setFiadosConcedidos(prev => prev.map((f, idx) => idx === index ? { ...f, valor: val } : f))} />
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-claro">
                    Vencimento
                    <input
                      type="date"
                      aria-label={`Vencimento fiado concedido #${index + 1}`}
                      value={item.vencimento || ''}
                      onChange={(e) => setFiadosConcedidos(prev => prev.map((f, idx) => idx === index ? { ...f, vencimento: e.target.value || null } : f))}
                      className={CLASSE_CAMPO}
                    />
                  </label>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setFiadosConcedidos(prev => [...prev, { clienteId: '', valor: '', vencimento: null }])}
              className="btn btn-suave/50 px-3 py-1.5 text-xs self-start"
            >
              + Adicionar outra concessão
            </button>
          </div>

          <div className="rounded-xl border border-borda p-4 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-claro border-b border-borda pb-2">Recebimento de Fiados (Entrou dinheiro)</h3>
            
            {fiadosRecebidos.map((item, index) => {
              const openFForClient = ctx.fiadosEmAberto.filter(f => f.clienteId === item.clienteId);
              return (
                <div key={index} className="flex flex-col gap-3 border-b border-borda/50 pb-4 last:border-0 last:pb-0 relative pt-2">
                  {fiadosRecebidos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFiadosRecebidos(prev => prev.filter((_, idx) => idx !== index))}
                      className="absolute right-0 top-0 text-negativo hover:text-negativo-claro text-xs font-medium"
                    >
                      Remover
                  </button>
                  )}
                  <div className="flex gap-2">
                    <select
                      aria-label={`Cliente do recebimento #${index + 1}`}
                      value={item.clienteId}
                      onChange={(e) => {
                        const newClientId = e.target.value;
                        setFiadosRecebidos(prev => prev.map((f, idx) => idx === index ? { ...f, clienteId: newClientId, fiadoId: null, valor: '' } : f));
                      }}
                      className={`${CLASSE_CAMPO} flex-1`}
                    >
                      <option value="">Selecione o Cliente</option>
                      {ctx.clientesFiado.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    <button
                      type="button"
                      className="btn btn-suave p-2.5 flex items-center justify-center shrink-0"
                      title="Cadastrar novo cliente"
                      onClick={() => {
                        setNovoClienteOrigem({ tipo: 'recebido', index });
                        setModalNovoCliente(true);
                      }}
                    >
                      <IconePlus />
                    </button>
                  </div>
                  {item.clienteId && openFForClient.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-suave">Débito em aberto para quitar</label>
                      <select
                        aria-label={`Débito do cliente #${index + 1}`}
                        value={item.fiadoId || ''}
                        onChange={(e) => {
                          const selectedFiadoId = e.target.value;
                          const selectedFiado = openFForClient.find(f => f.id === selectedFiadoId);
                          setFiadosRecebidos(prev => prev.map((r, idx) => {
                            if (idx === index) {
                              return {
                                ...r,
                                fiadoId: selectedFiadoId || null,
                                valor: selectedFiado ? centavosParaString(selectedFiado.valor) : r.valor
                              };
                            }
                            return r;
                          }));
                        }}
                        className={CLASSE_CAMPO}
                      >
                        <option value="">Selecione o débito (opcional — preenche valor)</option>
                        {openFForClient.map(f => (
                          <option key={f.id} value={f.id}>
                            {formatarDataBR(f.data)} — {formatReais(f.valor)} {f.vencimento ? `(Venc. ${formatarDataBR(f.vencimento)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {item.clienteId && openFForClient.length === 0 && (
                    <p className="text-xs text-suave italic">Nenhum débito em aberto encontrado.</p>
                  )}
                  <CampoMoeda rotulo="Valor" valor={item.valor} aoMudar={(val) => setFiadosRecebidos(prev => prev.map((f, idx) => idx === index ? { ...f, valor: val } : f))} />
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => setFiadosRecebidos(prev => [...prev, { clienteId: '', valor: '', fiadoId: null }])}
              className="btn btn-suave/50 px-3 py-1.5 text-xs self-start"
            >
              + Adicionar outro recebimento
            </button>
          </div>
        </section>
      )}

      {/* Pagamentos */}
      <section className="grid gap-4 cartao p-5 sm:grid-cols-3">
        <h2 className="font-display font-semibold text-claro sm:col-span-3">
          Pagamentos não-dinheiro
        </h2>
        <CampoMoeda
          rotulo={
            calc.dCartaoPix.taxa > 0n ? `PIX (taxa ${formatReais(calc.dCartaoPix.taxa)})` : 'PIX'
          }
          valor={pix}
          aoMudar={setPix}
          dica={`→ banco ${formatReais(calc.dCartaoPix.liquido)}`}
        />
        <CampoMoeda
          rotulo={`Cartão débito (taxa ${formatReais(calc.dCartaoDeb.taxa)})`}
          valor={debito}
          aoMudar={setDebito}
          dica={`→ banco ${formatReais(calc.dCartaoDeb.liquido)}`}
        />
        <CampoMoeda
          rotulo={`Cartão crédito (taxa ${formatReais(calc.dCartaoCred.taxa)})`}
          valor={credito}
          aoMudar={setCredito}
          dica={`→ banco ${formatReais(calc.dCartaoCred.liquido)}`}
        />
        <div className="sm:col-span-3 flex justify-between border-t border-borda/40 pt-3 text-sm font-semibold text-claro">
          <span>Total não-dinheiro</span>
          <span className="numeros text-base text-ambar font-bold">{formatReais(calc.totalNaoDinheiro)}</span>
        </div>
      </section>

      {/* Contagem do dinheiro + diferença + a depositar (reorganizado) */}
      <section className="grid gap-6 cartao p-5 sm:grid-cols-3">
        {/* Dinheiro contado (mais evidente/maior) */}
        <div className="rounded-xl border border-borda bg-claro/5 p-4 flex flex-col justify-center">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-claro">
            Dinheiro contado na gaveta
            <input
              inputMode="decimal"
              aria-label="Dinheiro contado na gaveta"
              value={contado}
              onChange={(e) => setContado(e.target.value)}
              onBlur={(e) => {
                setContado(formatarDinheiroInput(parseReais(e.target.value)));
              }}
              placeholder="0,00"
              onFocus={(e) => {
                if (e.target.value === '0' || e.target.value === '0,00') setContado('');
              }}
              className={`${CLASSE_CAMPO} numeros text-right text-2xl font-bold py-3 bg-fundo border-borda focus:border-ambar`}
            />
          </label>
        </div>

        {/* Diferença (menos evidente) */}
        <div className="rounded-xl border border-borda/40 p-4 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-suave">Diferença</p>
            <p
              className={`numeros mt-1 text-xl font-bold ${
                calc.diferenca < 0n ? 'text-negativo' : 'text-positivo'
              }`}
            >
              {formatReais(calc.diferenca)}
            </p>
          </div>
          <p className="text-[11px] text-suave">esperado: {formatReais(calc.esperado)}</p>
        </div>

        {/* A depositar (em destaque na direita) */}
        <div className="rounded-xl border border-positivo/50 bg-positivo/[0.06] p-4 flex flex-col justify-center shadow-sm shadow-positivo/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-positivo">A depositar</p>
          <p className="numeros mt-1 text-3xl font-extrabold text-positivo">{formatReais(calc.aDepositar)}</p>
        </div>
      </section>

      {/* Destinação e Transferência do Dinheiro */}
      <section className="cartao p-5 flex flex-col gap-4">
        <h2 className="font-display font-semibold text-claro">
          Destinação e Transferência do Dinheiro
        </h2>
        <p className="text-xs text-suave">
          As vendas e recebimentos em dinheiro entram automaticamente na conta padrão de dinheiro (<strong>Caixa Gaveta Dinheiro</strong>).
        </p>

        {calc.aDepositar > 0n ? (
          <div className="grid gap-4 sm:grid-cols-2 border-t border-borda/40 pt-4">
            <Campo label="Transferir valor restante (A depositar) para:" obrigatorio={false}>
              <select
                aria-label="Conta destino da transferência"
                value={destinoTransfId}
                onChange={(e) => setDestinoTransfId(e.target.value)}
                className={CLASSE_CAMPO}
              >
                <option value="">Não transferir (deixar tudo no Caixa Gaveta Dinheiro)</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.tipo === 'banco' ? 'Banco' : 'Dinheiro'})
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        ) : (
          <p className="text-xs text-suave italic border-t border-borda/40 pt-3">
            Nenhum saldo restante (A depositar) para transferir neste fechamento.
          </p>
        )}

        {/* Resumo no final da destinação dos valores */}
        <div className="mt-2 grid gap-4 grid-cols-1 sm:grid-cols-3 border-t border-borda/40 pt-4">
          <div className="rounded-xl border border-borda/30 p-3 bg-fundo">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-suave">Ficando na Gaveta (Troco Fixo)</span>
            <p className="numeros text-lg font-bold text-claro mt-1">
              {formatReais(destinoTransfId ? ctx.trocoFixo : calc.contadoC)}
            </p>
          </div>
          <div className="rounded-xl border border-borda/30 p-3 bg-fundo">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-suave">Indo para o Banco</span>
            <p className="numeros text-lg font-bold text-claro mt-1">
              {formatReais(
                calc.aDepositar > 0n &&
                contas.find(c => c.id === destinoTransfId)?.tipo === 'banco'
                  ? calc.aDepositar
                  : ZERO
              )}
            </p>
          </div>
          <div className="rounded-xl border border-borda/30 p-3 bg-fundo">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-suave">Indo para Outra Conta Dinheiro</span>
            <p className="numeros text-lg font-bold text-claro mt-1">
              {formatReais(
                calc.aDepositar > 0n &&
                contas.find(c => c.id === destinoTransfId)?.tipo === 'dinheiro'
                  ? calc.aDepositar
                  : ZERO
              )}
            </p>
          </div>
        </div>
      </section>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-claro">
        Observação
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          className={CLASSE_CAMPO}
        />
      </label>

      {erroConfirmar && <p className="text-sm text-negativo">{erroConfirmar}</p>}
      {contado.trim() === '' && (
        <p className="text-sm text-suave">Conte o dinheiro da gaveta para finalizar.</p>
      )}

      <div className="flex justify-end gap-3 mt-4">
        <button
          type="button"
          disabled={confirmando || salvandoRascunho}
          onClick={() => void salvarRascunho(true)}
          className="btn btn-suave px-6 py-3 text-base flex items-center gap-2"
        >
          {salvandoRascunho ? 'Salvando…' : 'Salvar'}
        </button>

        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={!podeConfirmar || confirmando || salvandoRascunho}
          className="btn btn-primario px-8 py-3 text-base font-bold shadow-md shadow-ambar/10"
        >
          {confirmando ? 'Finalizando…' : 'Finalizar'}
        </button>
      </div>

      <NovaDespesaModal
        aberto={modalDespesa}
        aoFechar={() => setModalDespesa(false)}
        usuarioId={usuarioId ?? ''}
        data={ctx.data}
        contaPadraoTipo="dinheiro"
        formaPadrao="dinheiro"
        aoSalvo={() => void recarregarDespesas()}
      />

      {modalReabrir}
      {modalAvisoFinalizacao}

      {/* Modal: novo cliente */}
      <Modal
        aberto={modalNovoCliente}
        aoFechar={() => {
          setModalNovoCliente(false);
          setNovoClienteNome('');
          setNovoClienteContato('');
          setNovoClienteOrigem(null);
        }}
        titulo="Novo cliente de fiado"
        descricao="Cadastre o nome e contato do cliente para habilitá-lo na concessão ou recebimento de fiado."
      >
        <form onSubmit={aoSalvarNovoCliente} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-claro">
            Nome *
            <input
              className={CLASSE_CAMPO}
              value={novoClienteNome}
              onChange={(e) => setNovoClienteNome(e.target.value)}
              placeholder="Ex.: João da Silva"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-claro">
            Contato
            <input
              className={CLASSE_CAMPO}
              value={novoClienteContato}
              onChange={(e) => setNovoClienteContato(e.target.value)}
              placeholder="Telefone / referência"
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-suave px-4 py-2 text-sm"
              onClick={() => {
                setModalNovoCliente(false);
                setNovoClienteNome('');
                setNovoClienteContato('');
                setNovoClienteOrigem(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvandoNovoCliente}
              className="btn btn-primario px-4 py-2 text-sm"
            >
              {salvandoNovoCliente ? 'Salvando…' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function CampoMoeda({
  rotulo,
  valor,
  aoMudar,
  dica,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  dica?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-claro">
      {rotulo}
      <input
        inputMode="decimal"
        aria-label={rotulo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        onBlur={(e) => {
          aoMudar(formatarDinheiroInput(parseReais(e.target.value)));
        }}
        placeholder="0,00"
        onFocus={(e) => {
          if (e.target.value === '0' || e.target.value === '0,00') {
            aoMudar('');
          }
        }}
        className={`${CLASSE_CAMPO} numeros text-right`}
      />
      {dica && <span className="text-[11px] font-normal text-suave">{dica}</span>}
    </label>
  );
}

function AbaSwitch({
  aba,
  aoTrocar,
}: {
  aba: 'fechar' | 'historico';
  aoTrocar: (a: 'fechar' | 'historico') => void;
}) {
  const abas: { id: 'fechar' | 'historico'; label: string }[] = [
    { id: 'fechar', label: 'Fechar caixa' },
    { id: 'historico', label: 'Histórico' },
  ];
  return (
    <div className="inline-flex rounded-xl border border-borda bg-ardosia p-1">
      {abas.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => aoTrocar(a.id)}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
            aba === a.id ? 'bg-ambar text-sobreacento shadow-sm' : 'text-suave hover:text-claro'
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

function SeletorData({
  dataSelecionada,
  aoMudar,
}: {
  dataSelecionada: string;
  aoMudar: (d: string) => void;
  recentes: FechamentoRecente[];
}) {
  function diaAnterior() {
    const d = new Date(dataSelecionada + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    aoMudar(d.toISOString().split('T')[0]!);
  }

  function diaSeguinte() {
    const d = new Date(dataSelecionada + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    aoMudar(d.toISOString().split('T')[0]!);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={diaAnterior}
        className="rounded-lg p-1.5 text-claro border border-borda hover:bg-claro/5 transition-all active:scale-95 flex items-center justify-center"
        title="Dia anterior"
      >
        <IconeAnterior />
      </button>
      <input
        type="date"
        aria-label="Data selecionada"
        className="rounded-lg border border-borda bg-transparent px-2.5 py-1 text-sm font-bold text-claro text-center focus:ring-ambar focus:border-ambar outline-none transition-all w-36"
        value={dataSelecionada}
        onChange={(e) => e.target.value && aoMudar(e.target.value)}
      />
      <button
        type="button"
        onClick={diaSeguinte}
        className="rounded-lg p-1.5 text-claro border border-borda hover:bg-claro/5 transition-all active:scale-95 flex items-center justify-center"
        title="Próximo dia"
      >
        <IconeProximo />
      </button>
      <button
        type="button"
        onClick={() => aoMudar(hojeManaus())}
        className="rounded-lg border border-borda bg-claro/5 px-2.5 py-1 text-xs font-semibold text-claro hover:bg-claro/10 transition-colors flex items-center gap-1 h-8"
        title="Ir para hoje"
      >
        <IconeHoje />
        Hoje
      </button>
    </div>
  );
}

function IconeAnterior() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconeProximo() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconeHoje() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function Historico({
  itens,
  carregando,
  de,
  ate,
  status,
  setDe,
  setAte,
  setStatus,
  aoAbrir,
}: {
  itens: FechamentoResumo[];
  carregando: boolean;
  de: string;
  ate: string;
  status: string;
  setDe: (v: string) => void;
  setAte: (v: string) => void;
  setStatus: (v: string) => void;
  aoAbrir: (data: string) => void;
}) {
  const filtrados = itens.filter((f) => {
    if (status && f.status !== status) return false;
    if (de && f.data < de) return false;
    if (ate && f.data > ate) return false;
    return true;
  });

  const colunas: Coluna<FechamentoResumo>[] = [
    {
      chave: 'data',
      titulo: 'Data',
      render: (f) => <span className="numeros font-medium text-claro">{formatarDataBR(f.data)}</span>,
    },
    {
      chave: 'resp',
      titulo: 'Responsável',
      render: (f) => <span className="text-suave">{f.responsavelNome ?? '—'}</span>,
    },
    {
      chave: 'status',
      titulo: 'Status',
      render: (f) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            f.status === 'travado' ? 'bg-positivo/15 text-positivo' : 'bg-atencao/15 text-atencao'
          }`}
        >
          {f.status === 'travado' ? 'Fechado' : 'Aberto'}
        </span>
      ),
    },
    {
      chave: 'recebido',
      titulo: 'Recebido',
      alinhar: 'right',
      render: (f) => <span className="numeros text-claro">{formatReais(f.vendaRegistrada)}</span>,
    },
    {
      chave: 'dif',
      titulo: 'Diferença',
      alinhar: 'right',
      render: (f) => (
        <span
          className={`numeros font-medium ${
            f.diferenca < 0n ? 'text-negativo' : f.diferenca > 0n ? 'text-positivo' : 'text-suave'
          }`}
        >
          {formatReais(f.diferenca)}
        </span>
      ),
    },
    {
      chave: 'acao',
      titulo: '',
      alinhar: 'right',
      render: (f) => (
        <button type="button" onClick={() => aoAbrir(f.data)} className="btn btn-suave px-3 py-1.5 text-xs">
          Abrir
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-suave">De</label>
          <input aria-label="Data inicial" type="date" className={CLASSE_CAMPO} value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-suave">Até</label>
          <input aria-label="Data final" type="date" className={CLASSE_CAMPO} value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="min-w-[150px]">
          <label className="mb-1 block text-xs font-medium text-suave">Status</label>
          <select aria-label="Filtrar por status" className={CLASSE_CAMPO} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="travado">Fechado</option>
            <option value="aberto">Aberto</option>
          </select>
        </div>
        {(de || ate || status) && (
          <button
            type="button"
            className="btn btn-suave px-3 py-2 text-sm"
            onClick={() => {
              setDe('');
              setAte('');
              setStatus('');
            }}
          >
            Limpar
          </button>
        )}
      </div>
      <DataTable colunas={colunas} dados={filtrados} chaveLinha={(f) => f.id} carregando={carregando} vazio="Nenhum fechamento no período." />
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
