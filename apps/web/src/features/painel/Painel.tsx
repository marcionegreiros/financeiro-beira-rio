import { useEffect, useState, useMemo } from 'react';
import { formatReais, asCentavos, type Centavos } from '../../lib/money';
import { formatLitros } from '../../domain/tipos';
import { litrosParaMililitros } from '../../data/conversao';
import { MedidorTanque } from '../../components/MedidorTanque';
import { useCoresTema } from '../../hooks/useCoresTema';
import {
  listarTanques,
  obterCapitalDashboard,
  obterVendasMes,
  obterAlertas,
  obterDadosUltimoFechamento,
  obterDespesasPorCategoriaMes,
  obterVendasHistorico,
  obterHistoricoCapital,
  listarSaldos,
  listarFechamentos,
  obterMovimentosFechamento,
  obterFiadosFechamento,
  type TanquePainel,
  type AlertasDashboard,
  type ResumoFechamentoCompleto,
  type DespesaCategoriaResumo,
  type CapitalHistorico,
  type SaldoConta,
  type FechamentoResumo,
  type MovimentoDetalhado,
  type FiadoDetalhado,
} from '../../data/repositorios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface Dados {
  tanques: TanquePainel[];
  capital: { operacional: Centavos; total: Centavos };
  vendas: {
    vendaDia: Centavos;
    vendaMes: Centavos;
    litrosMes: number;
    vendasDiarias: { data: string; valor: number }[];
    litrosGasolinaMes: number;
    litrosDieselMes: number;
    vendaGasolinaMes: Centavos;
    vendaDieselMes: Centavos;
  };
  alertas: AlertasDashboard;
  ultimoFechamento: ResumoFechamentoCompleto | null;
  despesasCategoria: DespesaCategoriaResumo[];
  vendasHistorico: { data: string; valor: number }[];
  capitalHistorico: CapitalHistorico[];
  saldosContas: SaldoConta[];
  fechamentosRecentes: FechamentoResumo[];
}

const PALETA_CORES = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#64748b', // slate
];

const ICO = {
  dia: (c: string) => (
    <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m3-9.5C15 7 13.66 6 12 6S9 7 9 8.5 10.34 11 12 11s3 1 3 2.5S13.66 16 12 16s-3-1-3-2.5" />
    </svg>
  ),
  mes: (c: string) => (
    <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M5 7h14a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z" />
    </svg>
  ),
  litros: (c: string) => (
    <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" />
    </svg>
  ),
  capital: (c: string) => (
    <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10l9-5 9 5M5 10v8m14-8v8M9 18v-5m6 5v-5M3 21h18" />
    </svg>
  ),
};

function agruparPorSemana(dados: { data: string; valor: number }[]) {
  const result: { data: string; valor: number }[] = [];
  const formatDataLabel = (dataStr: string) => {
    const partes = dataStr.split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}` : dataStr;
  };
  
  for (let i = 0; i < dados.length; i += 7) {
    const chunk = dados.slice(i, i + 7);
    const soma = chunk.reduce((sum, item) => sum + item.valor, 0);
    const firstItem = chunk[0];
    const lastItem = chunk[chunk.length - 1];
    const labelInicio = firstItem ? formatDataLabel(firstItem.data) : '';
    const labelFim = lastItem ? formatDataLabel(lastItem.data) : '';
    result.push({
      data: `${labelInicio.split('/')[0]}-${labelFim.split('/')[0]}`,
      valor: soma,
    });
  }
  return result;
}

export function Painel() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modoCapitalTotal, setModoCapitalTotal] = useState(false);
  const [periodoFiltro, setPeriodoFiltro] = useState<'7d' | '30d' | '90d' | 'mes'>('mes');
  const cores = useCoresTema();

  const [detalheFechamentoAba, setDetalheFechamentoAba] = useState<'vendas' | 'despesas' | 'fiado' | 'diferenca' | 'depositar' | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [movimentosDetalhe, setMovimentosDetalhe] = useState<MovimentoDetalhado[]>([]);
  const [fiadosDetalhe, setFiadosDetalhe] = useState<FiadoDetalhado[]>([]);

  const alternarAbaDetalhe = async (aba: 'vendas' | 'despesas' | 'fiado' | 'diferenca' | 'depositar') => {
    if (detalheFechamentoAba === aba) {
      setDetalheFechamentoAba(null);
      return;
    }
    
    setDetalheFechamentoAba(aba);
    
    if (!dados?.ultimoFechamento) return;
    const fechId = dados.ultimoFechamento.id;

    if (aba === 'despesas' && movimentosDetalhe.length === 0) {
      setCarregandoDetalhe(true);
      try {
        const movs = await obterMovimentosFechamento(fechId);
        setMovimentosDetalhe(movs.filter(m => ['despesa', 'prolabore', 'vale'].includes(m.tipo)));
      } catch (err) {
        console.error('Erro ao buscar despesas do fechamento:', err);
      } finally {
        setCarregandoDetalhe(false);
      }
    } else if (aba === 'fiado' && fiadosDetalhe.length === 0) {
      setCarregandoDetalhe(true);
      try {
        const fis = await obterFiadosFechamento(fechId);
        setFiadosDetalhe(fis);
      } catch (err) {
        console.error('Erro ao buscar fiados do fechamento:', err);
      } finally {
        setCarregandoDetalhe(false);
      }
    }
  };

  const hoje = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Manaus' }), []);

  useEffect(() => {
    let ativo = true;

    Promise.all([
      listarTanques(),
      obterCapitalDashboard(),
      obterVendasMes(hoje),
      obterAlertas(),
      obterDadosUltimoFechamento(),
      obterDespesasPorCategoriaMes(hoje),
      obterVendasHistorico(hoje, 90),
      listarSaldos(),
      listarFechamentos(5),
    ])
      .then(async ([tanques, capital, vendas, alertas, ultimoFechamento, despesasCategoria, vendasHistorico, saldosContas, fechamentosRecentes]) => {
        if (!ativo) return;
        const capitalHistorico = await obterHistoricoCapital(hoje, capital, 15);
        setDados({
          tanques,
          capital,
          vendas,
          alertas,
          ultimoFechamento,
          despesasCategoria,
          vendasHistorico,
          capitalHistorico,
          saldosContas,
          fechamentosRecentes,
        });
      })
      .catch((e: unknown) => {
        if (ativo) setErro(e instanceof Error ? e.message : 'Falha ao carregar dados.');
      });
    return () => {
      ativo = false;
    };
  }, [hoje]);

  const exibeAlerta =
    dados && (dados.alertas.produtosBaixo.length > 0 || dados.alertas.tanquesBaixo.length > 0);

  const fechamentoHojeFeito = useMemo(() => dados?.ultimoFechamento?.data === hoje, [dados, hoje]);

  // Filtragem e agrupamento dinâmico de vendas
  const vendasFiltradas = useMemo(() => {
    if (!dados) return [];
    let list = [...dados.vendasHistorico];
    
    if (periodoFiltro === '7d') {
      list = list.slice(-7);
    } else if (periodoFiltro === '30d') {
      list = list.slice(-30);
    } else if (periodoFiltro === 'mes') {
      return dados.vendas.vendasDiarias;
    } else if (periodoFiltro === '90d') {
      return agruparPorSemana(list.slice(-90));
    }

    return list.map((item) => ({
      ...item,
      data: item.data.slice(-2), // Exibe só o dia "DD"
    }));
  }, [dados, periodoFiltro]);

  const totalVendasFiltradas = useMemo(() => vendasFiltradas.reduce((acc, curr) => acc + curr.valor, 0), [vendasFiltradas]);
  const mediaDiariaFiltrada = useMemo(() => totalVendasFiltradas / (vendasFiltradas.length || 1), [totalVendasFiltradas, vendasFiltradas]);

  return (
    <div className="flex flex-col gap-6 w-full">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ambar flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ambar animate-pulse" />
            Pontão Beira Rio
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-claro">Painel de Controle</h1>
          <p className="mt-1 text-xs text-suave">
            Dados operacionais apurados até {new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {dados && (
          <div className="flex p-0.5 rounded-xl border border-borda bg-ardosia/50 backdrop-blur-sm shadow-[var(--sombra-sm)] select-none">
            <button
              type="button"
              onClick={() => setModoCapitalTotal(false)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                !modoCapitalTotal
                  ? 'bg-ambar text-sobreacento shadow-sm shadow-ambar/20'
                  : 'text-suave hover:text-claro'
              }`}
            >
              Capital Operacional
            </button>
            <button
              type="button"
              onClick={() => setModoCapitalTotal(true)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                modoCapitalTotal
                  ? 'bg-ambar text-sobreacento shadow-sm shadow-ambar/20'
                  : 'text-suave hover:text-claro'
              }`}
            >
              Capital Total
            </button>
          </div>
        )}
      </header>

      {erro && (
        <p className="rounded-xl border border-negativo/30 bg-negativo/10 p-4 text-sm font-medium text-negativo">
          {erro}
        </p>
      )}

      <main className="grid gap-8 lg:grid-cols-3 items-start">
        {/* Coluna Esquerda (Banners, KPIs, Gráficos) */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {!dados && !erro && (
            <div className="grid gap-6 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="cartao h-[180px] animate-pulse opacity-60" />
              ))}
            </div>
          )}

          {dados && (
            <>
              {/* Caixa de Fechamento Pendente com Resumo do Último Dia (Banner Compacto) */}
              {!fechamentoHojeFeito && dados.ultimoFechamento && (
                <section className="animar-surgir rounded-xl border border-atencao/20 bg-atencao/[0.02] p-4 shadow-sm flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borda/30 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-atencao animate-pulse" />
                      <h2 className="text-xs font-bold text-claro uppercase tracking-wider">Fechamento de hoje pendente</h2>
                    </div>
                    <span className="text-[10px] text-suave">
                      Exibindo último fechamento ({new Date(dados.ultimoFechamento.data + 'T00:00:00').toLocaleDateString('pt-BR')}) por <strong>{dados.ultimoFechamento.responsavelNome ?? 'Sistema'}</strong>
                    </span>
                  </div>
                  
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-5 text-xs select-none">
                    {/* Card Venda Física */}
                    <button
                      type="button"
                      onClick={() => alternarAbaDetalhe('vendas')}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all duration-300 cursor-pointer ${
                        detalheFechamentoAba === 'vendas'
                          ? 'bg-ardosia border-borda/80 shadow-inner scale-[0.98]'
                          : 'border-borda/30 bg-ardosia/20 hover:border-borda/80 hover:bg-ardosia/40 hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      <span className="text-[10px] text-suave uppercase">Venda Física</span>
                      <span className="numeros font-bold text-claro mt-1.5">{formatReais(dados.ultimoFechamento.vendaFisica)}</span>
                    </button>

                    {/* Card Despesas */}
                    <button
                      type="button"
                      onClick={() => alternarAbaDetalhe('despesas')}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all duration-300 cursor-pointer ${
                        detalheFechamentoAba === 'despesas'
                          ? 'bg-ardosia border-borda/80 shadow-inner scale-[0.98]'
                          : 'border-borda/30 bg-ardosia/20 hover:border-borda/80 hover:bg-ardosia/40 hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      <span className="text-[10px] text-suave uppercase">Despesas ($)</span>
                      <span className="numeros font-bold text-claro mt-1.5">{formatReais(dados.ultimoFechamento.despesa)}</span>
                    </button>

                    {/* Card Fiado */}
                    <button
                      type="button"
                      onClick={() => alternarAbaDetalhe('fiado')}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all duration-300 cursor-pointer ${
                        detalheFechamentoAba === 'fiado'
                          ? 'bg-ardosia border-borda/80 shadow-inner scale-[0.98]'
                          : 'border-borda/30 bg-ardosia/20 hover:border-borda/80 hover:bg-ardosia/40 hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      <span className="text-[10px] text-suave uppercase">Fiado Concedido</span>
                      <span className="numeros font-bold text-claro mt-1.5">{formatReais(dados.ultimoFechamento.fiadoConcedido)}</span>
                    </button>

                    {/* Card Diferença */}
                    <button
                      type="button"
                      onClick={() => alternarAbaDetalhe('diferenca')}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all duration-300 cursor-pointer ${
                        detalheFechamentoAba === 'diferenca'
                          ? 'bg-ardosia border-borda/80 shadow-inner scale-[0.98]'
                          : 'border-borda/30 bg-ardosia/20 hover:border-borda/80 hover:bg-ardosia/40 hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      <span className="text-[10px] text-suave uppercase">Diferença</span>
                      <span className={`numeros font-bold mt-1.5 ${
                        dados.ultimoFechamento.diferenca < 0n
                          ? 'text-negativo'
                          : dados.ultimoFechamento.diferenca > 0n
                            ? 'text-positivo'
                            : 'text-claro'
                      }`}>
                        {formatReais(dados.ultimoFechamento.diferenca)}
                      </span>
                    </button>

                    {/* Card Valor a Depositar */}
                    <button
                      type="button"
                      onClick={() => alternarAbaDetalhe('depositar')}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all duration-300 cursor-pointer ${
                        detalheFechamentoAba === 'depositar'
                          ? 'bg-ambar/15 border-ambar/30 shadow-inner scale-[0.98]'
                          : 'bg-ambar/5 border-ambar/15 hover:border-ambar/30 hover:bg-ambar/10 hover:shadow-md hover:-translate-y-0.5'
                      }`}
                    >
                      <span className="text-[9px] text-ambar font-semibold uppercase">Valor a Depositar</span>
                      <span className="numeros font-extrabold text-ambar mt-1.5">{formatReais(dados.ultimoFechamento.aDepositar)}</span>
                    </button>
                  </div>

                  {/* Área de Detalhes Expandida */}
                  {detalheFechamentoAba && (
                    <div className="animar-surgir mt-2 p-3 bg-ardosia/30 rounded-lg border border-borda/30 text-xs text-claro/90">
                      {carregandoDetalhe ? (
                        <div className="flex items-center justify-center py-4 gap-2 text-suave">
                          <svg className="animate-spin h-4 w-4 text-ambar" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Carregando detalhes...
                        </div>
                      ) : (
                        <>
                          {detalheFechamentoAba === 'vendas' && (
                            <div className="space-y-2">
                              <h4 className="font-bold border-b border-borda/20 pb-1 text-claro uppercase text-[10px]">Detalhamento de Recebimentos</h4>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1">
                                <div>
                                  <span className="text-suave block text-[9px] uppercase">Dinheiro (Caixa)</span>
                                  <span className="numeros font-semibold">{formatReais(dados.ultimoFechamento.dinheiro)}</span>
                                </div>
                                <div>
                                  <span className="text-suave block text-[9px] uppercase">PIX</span>
                                  <span className="numeros font-semibold">{formatReais(dados.ultimoFechamento.pix)}</span>
                                </div>
                                <div>
                                  <span className="text-suave block text-[9px] uppercase">Cartão de Débito</span>
                                  <span className="numeros font-semibold">{formatReais(dados.ultimoFechamento.debito)}</span>
                                </div>
                                <div>
                                  <span className="text-suave block text-[9px] uppercase">Cartão de Crédito</span>
                                  <span className="numeros font-semibold">{formatReais(dados.ultimoFechamento.credito)}</span>
                                </div>
                              </div>
                              <p className="text-[10px] text-suave border-t border-borda/10 pt-1.5 mt-1">
                                * Venda Física total (R$ {formatReais(dados.ultimoFechamento.vendaFisica)}) inclui recebimentos em dinheiro, PIX, débito, crédito e fiados concedidos (R$ {formatReais(dados.ultimoFechamento.fiadoConcedido)}).
                              </p>
                            </div>
                          )}

                          {detalheFechamentoAba === 'despesas' && (
                            <div className="space-y-2">
                              <h4 className="font-bold border-b border-borda/20 pb-1 text-claro uppercase text-[10px]">Movimentos de Saída do Caixa ($)</h4>
                              {movimentosDetalhe.length === 0 ? (
                                <p className="text-suave py-2 text-center">Nenhuma despesa ou retirada registrada neste fechamento.</p>
                              ) : (
                                <div className="max-h-[160px] overflow-y-auto divide-y divide-borda/20 pr-1">
                                  {movimentosDetalhe.map((m, idx) => (
                                    <div key={idx} className="flex justify-between py-1.5 text-[11px] last:pb-0">
                                      <div className="min-w-0 flex-1 mr-2">
                                        <p className="font-medium text-claro truncate">{m.descricao || 'Sem descrição'}</p>
                                        <span className="text-[9px] text-suave font-semibold uppercase tracking-wider">
                                          {m.tipo === 'prolabore' ? 'Retirada de Sócio' : m.tipo === 'vale' ? 'Vale Salário' : 'Despesa'} ({m.formaPagamento})
                                        </span>
                                      </div>
                                      <p className="numeros font-bold text-negativo text-right shrink-0">
                                        -{formatReais(m.valor)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {detalheFechamentoAba === 'fiado' && (
                            <div className="space-y-2">
                              <h4 className="font-bold border-b border-borda/20 pb-1 text-claro uppercase text-[10px]">Fiados Concedidos no Dia</h4>
                              {fiadosDetalhe.length === 0 ? (
                                <p className="text-suave py-2 text-center">Nenhuma venda fiado realizada neste fechamento.</p>
                              ) : (
                                <div className="max-h-[160px] overflow-y-auto divide-y divide-borda/20 pr-1">
                                  {fiadosDetalhe.map((f, idx) => (
                                    <div key={idx} className="flex justify-between py-1.5 text-[11px] last:pb-0">
                                      <span className="font-medium text-claro truncate mr-2">{f.clienteNome}</span>
                                      <span className="numeros font-bold text-claro/80 text-right shrink-0">
                                        {formatReais(f.valor)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {detalheFechamentoAba === 'diferenca' && (
                            <div className="space-y-1 leading-relaxed">
                              <h4 className="font-bold border-b border-borda/20 pb-1 text-claro uppercase text-[10px]">Análise de Diferença de Caixa</h4>
                              <p className="pt-1">
                                A diferença de caixa de <strong className={dados.ultimoFechamento.diferenca < 0n ? 'text-negativo' : dados.ultimoFechamento.diferenca > 0n ? 'text-positivo' : 'text-claro'}>{formatReais(dados.ultimoFechamento.diferenca)}</strong> representa o desvio entre o dinheiro real contado na gaveta e o valor esperado teoricamente pelo sistema.
                              </p>
                              <p className="text-suave text-[10px] mt-1.5">
                                * Diferenças podem ocorrer devido a erros de troco, arredondamentos ou quebras de caixa não registradas.
                              </p>
                            </div>
                          )}

                          {detalheFechamentoAba === 'depositar' && (
                            <div className="space-y-2">
                              <h4 className="font-bold border-b border-borda/20 pb-1 text-ambar uppercase text-[10px]">Fórmula de Cálculo do Depósito</h4>
                              <div className="space-y-1.5 text-[11px] font-mono leading-normal bg-ardosia/20 p-2 rounded border border-borda/10">
                                <div className="flex justify-between">
                                  <span className="text-suave">(+) Vendas em Dinheiro:</span>
                                  <span className="numeros">{formatReais(dados.ultimoFechamento.dinheiro)}</span>
                                </div>
                                <div className="flex justify-between text-negativo">
                                  <span className="text-suave">(-) Saídas em Dinheiro (Despesas/Vales):</span>
                                  <span className="numeros">-{formatReais(dados.ultimoFechamento.despesa)}</span>
                                </div>
                                <div className="flex justify-between text-positivo">
                                  <span className="text-suave">(+) Recebimentos de Fiado (Dinheiro):</span>
                                  <span className="numeros">+{formatReais(dados.ultimoFechamento.fiadoRecebido)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-suave">(+) Troco Fixo de Abertura:</span>
                                  <span className="numeros">+{formatReais(asCentavos(BigInt(dados.ultimoFechamento.esperado) - BigInt(dados.ultimoFechamento.dinheiro) + BigInt(dados.ultimoFechamento.despesa) - BigInt(dados.ultimoFechamento.fiadoRecebido)))}</span>
                                </div>
                                <div className="flex justify-between border-t border-borda/20 pt-1 font-bold">
                                  <span className="text-claro">(=) Dinheiro Esperado:</span>
                                  <span className="numeros">{formatReais(dados.ultimoFechamento.esperado)}</span>
                                </div>
                                <div className="flex justify-between text-suave">
                                  <span className="text-suave">(+/-) Diferença de Caixa Contada:</span>
                                  <span className={`numeros ${dados.ultimoFechamento.diferenca < 0n ? 'text-negativo' : 'text-positivo'}`}>
                                    {dados.ultimoFechamento.diferenca >= 0n ? '+' : ''}{formatReais(dados.ultimoFechamento.diferenca)}
                                  </span>
                                </div>
                                <div className="flex justify-between border-t border-borda/20 pt-1 font-bold">
                                  <span className="text-claro">(=) Total Contado:</span>
                                  <span className="numeros">{formatReais(dados.ultimoFechamento.contado)}</span>
                                </div>
                                <div className="flex justify-between text-suave">
                                  <span className="text-suave">(-) Retenção de Troco Fixo:</span>
                                  <span className="numeros">-{formatReais(asCentavos(BigInt(dados.ultimoFechamento.esperado) - BigInt(dados.ultimoFechamento.dinheiro) + BigInt(dados.ultimoFechamento.despesa) - BigInt(dados.ultimoFechamento.fiadoRecebido)))}</span>
                                </div>
                                <div className="flex justify-between border-t border-ambar/30 pt-1 font-extrabold text-ambar">
                                  <span>(=) Valor Líquido a Depositar:</span>
                                  <span className="numeros">{formatReais(dados.ultimoFechamento.aDepositar)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Alertas */}
              {exibeAlerta && (
                <section className="animar-surgir relative overflow-hidden rounded-2xl border border-negativo/30 bg-gradient-to-r from-negativo/[0.03] to-negativo/[0.08] p-5 shadow-sm shadow-negativo/5">
                  <div className="absolute inset-y-0 left-0 w-1 bg-negativo/80" />
                  <h2 className="mb-3 flex items-center gap-2 font-display font-bold text-negativo">
                    <svg className="h-5 w-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    Controle de Estoque e Nível Crítico
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {dados.alertas.tanquesBaixo.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-xl border border-negativo/15 bg-ardosia/40 p-3 text-sm">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-negativo/10 font-bold text-negativo text-xs">!</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-claro truncate">Tanque {t.nome}</p>
                          <p className="text-xs text-suave mt-0.5">Nível: <strong className="text-negativo font-bold">{t.litros}L</strong> (Alerta: {t.limite}L)</p>
                        </div>
                      </div>
                    ))}
                    {dados.alertas.produtosBaixo.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 rounded-xl border border-negativo/15 bg-ardosia/40 p-3 text-sm">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-negativo/10 font-bold text-negativo text-xs">!</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-claro truncate">{p.nome}</p>
                          <p className="text-xs text-suave mt-0.5">Estoque: <strong className="text-negativo font-bold">{p.quantidade} un</strong> (Alerta: {p.limite})</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* KPIs Simétricos (Faturamento do Mês e Volume Físico do Mês) */}
              <section className="grid gap-6 sm:grid-cols-2">
                {/* Card 1: Faturamento do Mês */}
                <div className="cartao relative overflow-hidden p-6 hover:border-[color-mix(in_srgb,var(--color-ambar)_20%,transparent)] transition-all duration-300 flex flex-col justify-between min-h-[220px]">
                  <div>
                    <div className="flex items-center justify-between border-b border-borda/40 pb-3 mb-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-suave">Acumulado do Mês</span>
                        <h3 className="font-display text-base font-bold text-claro mt-0.5">Vendas do Mês</h3>
                      </div>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ambar/10 text-ambar shadow-sm shadow-ambar/5">
                        {ICO.mes('h-5 w-5')}
                      </span>
                    </div>
                    
                    {/* Informações Principais Individuais */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] font-semibold text-suave flex items-center gap-1.5 uppercase">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          Gasolina
                        </span>
                        <p className="numeros text-lg font-bold text-claro tracking-tight mt-1 truncate">
                          {formatReais(dados.vendas.vendaGasolinaMes)}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-suave flex items-center gap-1.5 uppercase">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Diesel
                        </span>
                        <p className="numeros text-lg font-bold text-claro tracking-tight mt-1 truncate">
                          {formatReais(dados.vendas.vendaDieselMes)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-borda/30 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-suave flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                        Produtos & Outros
                      </span>
                      <span className="numeros font-bold text-claro/80">
                        {formatReais(asCentavos(BigInt(dados.vendas.vendaMes) - BigInt(dados.vendas.vendaGasolinaMes) - BigInt(dados.vendas.vendaDieselMes)))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-suave font-semibold">Total Faturado</span>
                      <span className="numeros font-bold text-ambar">
                        {formatReais(dados.vendas.vendaMes)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Volume de Combustível (Mês) */}
                <div className="cartao relative overflow-hidden p-6 hover:border-[color-mix(in_srgb,var(--color-ambar)_20%,transparent)] transition-all duration-300 flex flex-col justify-between min-h-[220px]">
                  <div>
                    <div className="flex items-center justify-between border-b border-borda/40 pb-3 mb-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-suave">Volume Físico</span>
                        <h3 className="font-display text-base font-bold text-claro mt-0.5">Combustível Vendido</h3>
                      </div>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 shadow-sm shadow-blue-500/5">
                        {ICO.litros('h-5 w-5')}
                      </span>
                    </div>
                    
                    {/* Informações Principais Individuais */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] font-semibold text-suave flex items-center gap-1.5 uppercase">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          Gasolina
                        </span>
                        <p className="numeros text-lg font-bold text-claro tracking-tight mt-1 truncate">
                          {formatLitros(litrosParaMililitros(dados.vendas.litrosGasolinaMes))}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-suave flex items-center gap-1.5 uppercase">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Diesel
                        </span>
                        <p className="numeros text-lg font-bold text-claro tracking-tight mt-1 truncate">
                          {formatLitros(litrosParaMililitros(dados.vendas.litrosDieselMes))}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-borda/30 space-y-2">
                    {/* Espaçador para manter altura e alinhamento simétrico com Card 1 */}
                    <div className="flex items-center justify-between text-xs h-[18px]">
                      <span className="text-suave flex items-center gap-1.5 opacity-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                        &nbsp;
                      </span>
                      <span className="numeros font-bold text-claro/80 opacity-0">
                        &nbsp;
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-suave font-semibold">Volume Total</span>
                      <span className="numeros font-bold text-claro">
                        {formatLitros(litrosParaMililitros(dados.vendas.litrosMes))}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Gráfico de Vendas */}
              <section className="cartao flex min-h-[300px] flex-col p-6">
                <div className="mb-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-lg font-bold text-claro">Faturamento</h2>
                      <p className="text-[10px] text-suave">Histórico de fechamentos confirmados</p>
                    </div>
                    <select
                      value={periodoFiltro}
                      onChange={(e) => setPeriodoFiltro(e.target.value as any)}
                      className="rounded-lg border border-borda bg-ardosia px-2.5 py-1.5 text-xs font-semibold text-claro focus:outline-none cursor-pointer"
                    >
                      <option value="7d">7 dias</option>
                      <option value="30d">30 dias</option>
                      <option value="mes">Mês</option>
                      <option value="90d">90 dias</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between border-t border-borda/30 pt-2.5 mt-1 text-xs">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-suave">Total no Filtro</p>
                      <p className="numeros font-bold text-sm text-claro mt-0.5">
                        R$ {totalVendasFiltradas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-suave">Média/Período</p>
                      <p className="numeros font-bold text-sm text-claro mt-0.5">
                        R$ {mediaDiariaFiltrada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="h-[200px] w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={vendasFiltradas} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradBarra" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={cores.acento} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={cores.acento} stopOpacity={0.45} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={cores.borda} strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis
                        dataKey="data"
                        stroke={cores.borda}
                        tick={{ fill: cores.suave, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        stroke={cores.borda}
                        tick={{ fill: cores.suave, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={48}
                        tickFormatter={(val) => `R$${val}`}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: cores.acento, fillOpacity: 0.04 }} />
                      <Bar dataKey="valor" fill="url(#gradBarra)" radius={[5, 5, 0, 0]} maxBarSize={46} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Gráfico de Evolução do Capital */}
              <section className="cartao flex min-h-[340px] flex-col p-6">
                <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-claro">Evolução do Capital</h2>
                    <p className="text-xs text-suave">Acompanhamento histórico do patrimônio líquido</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-suave">
                      Capital Atual ({modoCapitalTotal ? 'Total' : 'Operacional'})
                    </p>
                    <p className="numeros font-bold text-sm text-claro mt-0.5">
                      {formatReais(modoCapitalTotal ? dados.capital.total : dados.capital.operacional)}
                    </p>
                  </div>
                </div>
                <div className="h-[240px] w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dados.capitalHistorico} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradCapital" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={cores.acento} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={cores.acento} stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={cores.borda} strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis
                        dataKey="data"
                        stroke={cores.borda}
                        tick={{ fill: cores.suave, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        stroke={cores.borda}
                        tick={{ fill: cores.suave, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={64}
                        tickFormatter={(val) => `R$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                      />
                      <Tooltip content={<CustomTooltipCapital />} />
                      <Area
                        type="monotone"
                        dataKey={modoCapitalTotal ? 'total' : 'operacional'}
                        stroke={cores.acento}
                        fill="url(#gradCapital)"
                        strokeWidth={2.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Últimos Fechamentos */}
              <FechamentosRecentes fechamentos={dados.fechamentosRecentes} />
            </>
          )}
        </div>

        {/* Coluna Direita Operacional (Sempre no canto superior direito em telas grandes) */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          {dados && (
            <>
              {/* Tanques */}
              <section className="cartao flex flex-col p-6">
                <div className="mb-5">
                  <h2 className="font-display text-lg font-bold text-claro">Tanques de Combustível</h2>
                  <p className="text-xs text-suave">Nível físico na última medição de régua</p>
                </div>
                <div className="flex flex-1 items-center justify-around gap-4 flex-wrap py-2">
                  {dados.tanques.map((t) => (
                    <MedidorTanque
                      key={t.id}
                      nome={t.nome}
                      combustivel={t.combustivel}
                      nivel={t.nivel}
                      capacidade={t.capacidade}
                      nivelAlerta={t.nivelAlerta}
                    />
                  ))}
                </div>
              </section>

              {/* Painel de Contas */}
              <PainelContas saldos={dados.saldosContas} />

              {/* Gráfico de Despesas (Pizza) */}
              <section className="cartao flex flex-col p-6 min-h-[340px]">
                <div className="mb-4">
                  <h2 className="font-display text-lg font-bold text-claro">Gastos por Categoria</h2>
                  <p className="text-xs text-suave">Distribuição de despesas e vales no mês</p>
                </div>
                {dados.despesasCategoria.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-suave leading-relaxed select-none">
                    <svg className="h-10 w-10 opacity-30 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Nenhuma despesa registrada este mês.
                  </div>
                ) : (
                  <div className="h-[240px] w-full flex-1 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dados.despesasCategoria}
                          dataKey="valor"
                          nameKey="categoriaNome"
                          cx="50%"
                          cy="45%"
                          outerRadius={70}
                          innerRadius={45}
                          paddingAngle={3}
                        >
                          {dados.despesasCategoria.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PALETA_CORES[index % PALETA_CORES.length] || '#64748b'} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltipDespesas />} />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          iconSize={8}
                          iconType="circle"
                          formatter={(value) => <span className="text-[11px] text-suave font-semibold">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// Tooltip customizado premium de Vendas
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="backdrop-blur-md bg-elevado/90 border border-borda p-3.5 rounded-xl shadow-lg leading-tight select-none">
        <p className="text-[10px] font-bold text-suave uppercase tracking-wider mb-1.5">Período: {label}</p>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-ambar animate-pulse" />
          <p className="numeros text-sm font-bold text-claro">
            R$ {Number(payload[0].value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

// Tooltip customizado para o capital
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltipCapital({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="backdrop-blur-md bg-elevado/90 border border-borda p-3.5 rounded-xl shadow-lg leading-tight select-none">
        <p className="text-[10px] font-bold text-suave uppercase tracking-wider mb-1.5">Data: {label}</p>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-ambar animate-pulse" />
          <p className="numeros text-sm font-bold text-claro">
            R$ {Number(payload[0].value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

// Tooltip customizado para despesas por categoria
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltipDespesas({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="backdrop-blur-md bg-elevado/90 border border-borda p-3.5 rounded-xl shadow-lg leading-tight select-none">
        <p className="text-[10px] font-bold text-suave uppercase tracking-wider mb-1.5">{data.categoriaNome}</p>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: payload[0].color }} />
          <p className="numeros text-sm font-bold text-claro">
            R$ {Number(data.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

// Painel de saldos de contas
function PainelContas({ saldos }: { saldos: SaldoConta[] }) {
  const total = useMemo(() => {
    return saldos.reduce((acc, curr) => acc + BigInt(curr.saldo), 0n);
  }, [saldos]);

  return (
    <section className="cartao flex flex-col p-6 h-full min-h-[340px] select-none">
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold text-claro">Saldos das Contas</h2>
        <p className="text-xs text-suave">Recursos disponíveis em caixa e bancos</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {saldos.map((s) => (
          <div key={s.id} className="flex items-center justify-between border-b border-borda/40 pb-2.5 text-sm last:border-0 last:pb-0">
            <div className="min-w-0 flex-1 mr-2">
              <p className="font-bold text-claro truncate">{s.nome}</p>
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider mt-1 ${
                s.tipo === 'dinheiro' 
                  ? 'bg-ambar/15 text-ambar border border-ambar/10' 
                  : 'bg-blue-500/15 text-blue-500 border border-blue-500/10'
              }`}>
                {s.tipo === 'dinheiro' ? 'Caixa' : 'Banco'}
              </span>
            </div>
            <p className="numeros font-bold text-claro text-right shrink-0">
              {formatReais(s.saldo)}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-borda mt-4 pt-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-suave">Total em Contas</p>
        <p className="numeros font-extrabold text-base text-ambar">
          {formatReais(asCentavos(total))}
        </p>
      </div>
    </section>
  );
}

// Histórico de Fechamentos Recentes
function FechamentosRecentes({ fechamentos }: { fechamentos: FechamentoResumo[] }) {
  return (
    <section className="cartao flex flex-col p-6 h-full min-h-[340px] select-none">
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold text-claro">Últimos Fechamentos</h2>
        <p className="text-xs text-suave">Resumo financeiro dos fechamentos mais recentes</p>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-borda text-xs uppercase font-bold text-suave">
              <th className="py-2.5 font-bold">Data</th>
              <th className="py-2.5 font-bold">Responsável</th>
              <th className="py-2.5 font-bold text-right">Vendas</th>
              <th className="py-2.5 font-bold text-right">Diferença</th>
              <th className="py-2.5 font-bold text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda/40">
            {fechamentos.map((f) => (
              <tr key={f.id} className="hover:bg-ardosia/10 transition-colors">
                <td className="py-3 font-semibold text-claro">
                  {new Date(f.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                </td>
                <td className="py-3 text-claro/90 truncate max-w-[120px]" title={f.responsavelNome ?? 'Sistema'}>
                  {f.responsavelNome ?? 'Sistema'}
                </td>
                <td className="numeros py-3 text-right font-bold text-claro">
                  {formatReais(f.vendaRegistrada)}
                </td>
                <td className={`numeros py-3 text-right font-bold ${
                  f.diferenca < 0n 
                    ? 'text-negativo' 
                    : f.diferenca > 0n 
                      ? 'text-positivo' 
                      : 'text-claro/60'
                }`}>
                  {f.diferenca === 0n ? '—' : formatReais(f.diferenca)}
                </td>
                <td className="py-3 text-center">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    f.status === 'travado'
                      ? 'bg-positivo/10 text-positivo border border-positivo/20'
                      : 'bg-atencao/10 text-atencao border border-atencao/20'
                  }`}>
                    {f.status === 'travado' ? 'fechado' : 'aberto'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


