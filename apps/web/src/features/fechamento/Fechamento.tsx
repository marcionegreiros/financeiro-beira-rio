import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
  type ContextoFechamento,
  type ResumoConfirmacao,
} from '../../data/fechamento';
import { Relatorio, type RelatorioDados } from './Relatorio';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { listarFechamentosRecentes, listarFechamentos, listarDespesasDoDia, removerDespesa, type FechamentoRecente, type FechamentoResumo, type DespesaDoDia } from '../../data/repositorios';
import { NovaDespesaModal, FORMAS_PAGAMENTO } from '../financeiro/NovaDespesaModal';
import { hojeManaus, formatarDataBR } from '../../lib/datas';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { CLASSE_CAMPO } from '../../components/ui/Campo';

const ZERO = asCentavos(0n);
const inputClasse = 'w-28 rounded-lg px-3 py-2 text-right numeros';

interface Props {
  usuarioId: string | null;
  podeReabrir?: boolean;
}

export function Fechamento({ usuarioId, podeReabrir }: Props) {
  const isOnline = useOnlineStatus();
  const toast = useToast();
  const [aba, setAba] = useState<'fechar' | 'historico'>('fechar');
  const [nonceRecarga, setNonceRecarga] = useState(0);
  const [historico, setHistorico] = useState<FechamentoResumo[]>([]);
  const [histCarregando, setHistCarregando] = useState(false);
  const [histDe, setHistDe] = useState('');
  const [histAte, setHistAte] = useState('');
  const [histStatus, setHistStatus] = useState('');
  const [reabrirAlvo, setReabrirAlvo] = useState<string | null>(null);
  const [motivoReabrir, setMotivoReabrir] = useState('');
  const [reabrindo, setReabrindo] = useState(false);
  const [recentes, setRecentes] = useState<FechamentoRecente[]>([]);
  const [dataSelecionada, setDataSelecionada] = useState(hojeManaus());

  const [ctx, setCtx] = useState<ContextoFechamento | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [leituras, setLeituras] = useState<Record<string, string>>({});
  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [entradasEstoque, setEntradasEstoque] = useState<Record<string, string>>({});
  const [vendasIndividuais, setVendasIndividuais] = useState<Record<string, string>>({});
  const [pix, setPix] = useState('');
  const [debito, setDebito] = useState('');
  const [credito, setCredito] = useState('');
  const [despesasDoDia, setDespesasDoDia] = useState<DespesaDoDia[]>([]);
  const [modalDespesa, setModalDespesa] = useState(false);
  const [fiadoConClienteId, setFiadoConClienteId] = useState('');
  const [fiadoConValor, setFiadoConValor] = useState('');
  const [fiadoRecClienteId, setFiadoRecClienteId] = useState('');
  const [fiadoRecValor, setFiadoRecValor] = useState('');
  const [contado, setContado] = useState('');
  const [observacao, setObservacao] = useState('');

  const [confirmando, setConfirmando] = useState(false);
  const [erroConfirmar, setErroConfirmar] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDados | null>(null);

  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    listarFechamentosRecentes()
      .then(setRecentes)
      .catch((err) => console.error('Erro ao listar fechamentos:', err));
  }, [dataSelecionada]);

  useEffect(() => {
    setRelatorio(null);
    setErroConfirmar(null);
    carregarContexto(dataSelecionada)
      .then((contexto) => {
        setCtx(contexto);
        // Despesas e entradas do dia vêm por DATA (de qualquer origem).
        setDespesasDoDia(contexto.despesasDoDia);
        setEntradasEstoque(contexto.entradasDoDia);
        if (contexto.valoresSalvos) {
          const vs = contexto.valoresSalvos;
          setLeituras(vs.leituras);
          setContagens(vs.contagens);
          setVendasIndividuais(vs.vendasIndividuais);
          setPix(vs.pix);
          setDebito(vs.debito);
          setCredito(vs.credito);
          setFiadoConClienteId(vs.fiadoConClienteId);
          setFiadoConValor(vs.fiadoConValor);
          setFiadoRecClienteId(vs.fiadoRecClienteId);
          setFiadoRecValor(vs.fiadoRecValor);
          setContado(vs.contado);
          setObservacao(vs.observacao);
        } else {
          setLeituras({});
          setContagens({});
          setVendasIndividuais({});
          setPix('');
          setDebito('');
          setCredito('');
          setFiadoConClienteId('');
          setFiadoConValor('');
          setFiadoRecClienteId('');
          setFiadoRecValor('');
          setContado('');
          setObservacao('');
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
      setDespesasDoDia(await listarDespesasDoDia(dataSelecionada));
    } catch (e) {
      console.error('Erro ao recarregar despesas do dia:', e);
    }
  }

  async function excluirDespesa(id: string) {
    try {
      await removerDespesa(id);
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
      const atual = paraQuantidade(contagens[p.id] ?? '');
      const ent = paraQuantidade(entradasEstoque[p.id] ?? '');
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
    const fiadoConC = parseReais(fiadoConValor);
    const fiadoRecC = parseReais(fiadoRecValor);

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
      esperado,
      diferenca,
      cashSales,
      aDepositar,
      ind,
    };
  }, [
    ctx, leituras, contagens, entradasEstoque, vendasIndividuais, pix, debito, credito,
    despesasDoDia, contado, fiadoConValor, fiadoRecValor
  ]);

  function aoEnter(e: KeyboardEvent<HTMLInputElement>, indice: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    refs.current[indice + 1]?.focus();
  }

  async function confirmar() {
    if (!ctx || !calc || !ctx.contaCaixaId) return;
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
        leituras: calc.bombas
          .filter((b) => (leituras[b.id] ?? '').trim() !== '' && !b.invalido)
          .map((b) => ({ bombaId: b.id, leitura: b.atual })),
        contagens: calc.produtos
          .filter((p) => p.preenchido)
          .map((p) => ({ produtoId: p.id, quantidade: p.atual })),
        entradas: calc.produtos
          .filter((p) => p.ent > 0n)
          .map((p) => ({ produtoId: p.id, quantidade: p.ent })),
        vendasIndividuais: calc.ind
          .filter((p) => p.preenchido)
          .map((p) => ({ produtoId: p.id, quantidade: p.vendido, valor: p.valor })),
        fiadosConcedidos:
          calc.fiadoConC > 0n && fiadoConClienteId
            ? [{ clienteId: fiadoConClienteId, valor: calc.fiadoConC }]
            : [],
        fiadosRecebidos:
          calc.fiadoRecC > 0n && fiadoRecClienteId
            ? [{ clienteId: fiadoRecClienteId, valor: calc.fiadoRecC }]
            : [],
        cashSales: calc.cashSales,
        pix: calc.pixC,
        debitoNet: calc.dCartaoDeb.liquido,
        debitoTaxa: calc.dCartaoDeb.taxa,
        creditoNet: calc.dCartaoCred.liquido,
        creditoTaxa: calc.dCartaoCred.taxa,
        despesaIds: despesasDoDia.map((d) => d.id),
        diferenca: calc.diferenca,
      };
      await confirmarFechamento(resumo);
      setRelatorio({
        data: ctx.data,
        bombas: calc.bombas.map((b) => ({
          nome: b.combustivel,
          litrosMl: b.litrosMl,
          valor: b.valor,
        })),
        produtos: calc.produtos
          .filter((p) => p.preenchido)
          .map((p) => ({ nome: p.nome, vendido: p.vendido, valor: p.valor })),
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
      return {
        data: ctx.data,
        bombas: calc.bombas.map((b) => ({
          nome: b.combustivel,
          litrosMl: b.litrosMl,
          valor: b.valor,
        })),
        produtos: calc.produtos
          .filter((p) => p.preenchido)
          .map((p) => ({ nome: p.nome, vendido: p.vendido, valor: p.valor })),
        vendaFisica: calc.vendaFisica,
        pix: calc.pixC,
        debito: calc.debitoC,
        credito: calc.creditoC,
        despesa: calc.despesaC,
        esperado: calc.esperado,
        contado: calc.contadoC,
        diferenca: calc.diferenca,
        aDepositar: calc.aDepositar,
        observacao: observacao,
        fiadoConcedido: calc.fiadoConC,
        fiadoRecebido: calc.fiadoRecC,
      };
    }
    return null;
  }, [relatorio, ctx, calc, observacao]);

  if (erroCarga)
    return <div className="cartao p-6 text-sm text-negativo">Erro ao carregar o fechamento: {erroCarga}</div>;
  if (!ctx || !calc) return <p className="p-6 text-sm text-suave">Carregando fechamento…</p>;

  const cabecalho = (
    <PageHeader
      titulo="Fechamento de caixa"
      subtitulo="Conferência diária de vendas, pagamentos e caixa"
      acao={<AbaSwitch aba={aba} aoTrocar={setAba} />}
    />
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

  const statusBadge = ctx.status ? (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
        ctx.status === 'travado' ? 'bg-positivo/15 text-positivo' : 'bg-atencao/15 text-atencao'
      }`}
    >
      {ctx.status === 'travado' ? 'Fechamento travado' : 'Rascunho aberto'}
    </span>
  ) : null;

  if (relatorioParaExibir) {
    return (
      <div className="flex flex-col gap-6">
        {cabecalho}
        <SeletorData dataSelecionada={dataSelecionada} aoMudar={setDataSelecionada} recentes={recentes} badge={statusBadge} />
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
      <SeletorData dataSelecionada={dataSelecionada} aoMudar={setDataSelecionada} recentes={recentes} badge={statusBadge} />

      {!isOnline && (
        <div className="rounded-xl border border-negativo/30 bg-negativo/10 p-4 text-sm text-negativo">
          Você está offline. Não é possível confirmar fechamentos sem conexão com a internet.
        </div>
      )}

      <header>
        <h2 className="font-display text-xl font-bold text-claro">Fechamento de {formatarDataBR(ctx.data)}</h2>
        <p className="text-sm text-suave">Enter avança para o próximo campo, na ordem da contagem.</p>
      </header>

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
                <tr key={b.id} className="border-t border-borda">
                  <td className="py-2 text-claro">{b.combustivel}</td>
                  <td className="numeros py-2 text-right text-claro/60">
                    {formatLitros(b.leituraAnterior)}
                  </td>
                  <td className="py-2 text-right">
                    <input
                      ref={(el) => {
                        refs.current[meu] = el;
                      }}
                      inputMode="decimal"
                      value={leituras[b.id] ?? ''}
                      onChange={(e) => setLeituras((s) => ({ ...s, [b.id]: e.target.value }))}
                      onKeyDown={(e) => aoEnter(e, meu)}
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
      <section className="cartao p-5">
        <h2 className="mb-3 font-display font-semibold text-claro">Produtos (contagem)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-suave">
              <th className="pb-2 font-medium">Produto</th>
              <th className="pb-2 text-right font-medium">Estoque anterior</th>
              <th className="pb-2 text-right font-medium">Entradas</th>
              <th className="pb-2 text-right font-medium">Contagem agora</th>
              <th className="pb-2 text-right font-medium">Vendido</th>
              <th className="pb-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {calc.produtos.map((p) => {
              const meu = idx++;
              return (
                <tr key={p.id} className="border-t border-borda">
                  <td className="py-2 text-claro">{p.nome}</td>
                  <td className="numeros py-2 text-right text-claro/60">
                    {String(p.estoqueAnterior)}
                  </td>
                  <td className="py-2 text-right">
                    <input
                      inputMode="numeric"
                      value={entradasEstoque[p.id] ?? ''}
                      onChange={(e) => setEntradasEstoque((s) => ({ ...s, [p.id]: e.target.value }))}
                      className={inputClasse + ' !w-20'}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <input
                      ref={(el) => {
                        refs.current[meu] = el;
                      }}
                      inputMode="numeric"
                      value={contagens[p.id] ?? ''}
                      onChange={(e) => setContagens((s) => ({ ...s, [p.id]: e.target.value }))}
                      onKeyDown={(e) => aoEnter(e, meu)}
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

      {/* Produtos individuais (Venda Avulsa) */}
      {calc.ind.length > 0 && (
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
                  <tr key={p.id} className="border-t border-borda">
                    <td className="py-2 text-claro">{p.nome}</td>
                    <td className="py-2 text-right">
                      <input
                        ref={(el) => {
                          refs.current[meu] = el;
                        }}
                        inputMode="numeric"
                        value={vendasIndividuais[p.id] ?? ''}
                        onChange={(e) => setVendasIndividuais((s) => ({ ...s, [p.id]: e.target.value }))}
                        onKeyDown={(e) => aoEnter(e, meu)}
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

      {/* Venda física ao vivo */}
      <section className="cartao flex items-center justify-between p-5">
        <span className="text-suave">Venda física do dia</span>
        <span className="numeros text-2xl font-bold text-claro">{formatReais(calc.vendaFisica)}</span>
      </section>

      {/* Fiados */}
      <section className="grid gap-4 cartao p-5 sm:grid-cols-2">
        <h2 className="font-display font-semibold text-claro sm:col-span-2">
          Fiados do Dia
        </h2>
        
        <div className="rounded-xl border border-borda p-4">
          <h3 className="mb-3 text-sm font-semibold text-claro">Fiado Concedido (Venda pendurada)</h3>
          <div className="flex flex-col gap-3">
            <select
              aria-label="Cliente do fiado concedido"
              value={fiadoConClienteId}
              onChange={(e) => setFiadoConClienteId(e.target.value)}
              className={CLASSE_CAMPO}
            >
              <option value="">Selecione o Cliente</option>
              {ctx.clientesFiado.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <CampoMoeda rotulo="Valor" valor={fiadoConValor} aoMudar={setFiadoConValor} />
          </div>
        </div>

        <div className="rounded-xl border border-borda p-4">
          <h3 className="mb-3 text-sm font-semibold text-claro">Recebimento de Fiado (Entrou dinheiro)</h3>
          <div className="flex flex-col gap-3">
            <select
              aria-label="Cliente do recebimento de fiado"
              value={fiadoRecClienteId}
              onChange={(e) => setFiadoRecClienteId(e.target.value)}
              className={CLASSE_CAMPO}
            >
              <option value="">Selecione o Cliente</option>
              {ctx.clientesFiado.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <CampoMoeda rotulo="Valor" valor={fiadoRecValor} aoMudar={setFiadoRecValor} />
          </div>
        </div>
      </section>

      {/* Pagamentos */}
      <section className="grid gap-4 cartao p-5 sm:grid-cols-3">
        <h2 className="font-display font-semibold text-claro sm:col-span-3">
          Pagamentos não-dinheiro
        </h2>
        <CampoMoeda rotulo="PIX" valor={pix} aoMudar={setPix} />
        <CampoMoeda
          rotulo={`Cartão débito (taxa ${formatReais(calc.dCartaoDeb.taxa)})`}
          valor={debito}
          aoMudar={setDebito}
        />
        <CampoMoeda
          rotulo={`Cartão crédito (taxa ${formatReais(calc.dCartaoCred.taxa)})`}
          valor={credito}
          aoMudar={setCredito}
        />
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-suave">
                <th className="pb-2 font-medium">Descrição</th>
                <th className="pb-2 font-medium">Categoria</th>
                <th className="pb-2 font-medium">Forma</th>
                <th className="pb-2 text-right font-medium">Valor</th>
                <th className="pb-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {despesasDoDia.map((d) => {
                const ehDinheiro = d.formaPagamento === 'dinheiro';
                return (
                  <tr key={d.id} className="border-t border-borda">
                    <td className="py-2 text-claro">{d.descricao || '—'}</td>
                    <td className="py-2 text-suave">{d.categoriaNome ?? '—'}</td>
                    <td className="py-2 text-suave">
                      {FORMAS_PAGAMENTO[d.formaPagamento ?? ''] ?? d.formaPagamento ?? '—'}
                      {!ehDinheiro && <span className="ml-1 text-xs text-suave/70">(não sai da gaveta)</span>}
                    </td>
                    <td className={`numeros py-2 text-right ${ehDinheiro ? 'text-negativo' : 'text-suave'}`}>
                      {formatReais(d.valor)}
                    </td>
                    <td className="py-2 text-right">
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
              <tr className="border-t border-borda">
                <td className="py-2 font-semibold text-claro" colSpan={3}>
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

      {/* Contagem do dinheiro + a depositar + diferença */}
      <section className="grid gap-4 cartao p-5 sm:grid-cols-3">
        <CampoMoeda rotulo="Dinheiro contado na gaveta" valor={contado} aoMudar={setContado} />
        <div className="rounded-xl border border-ambar/40 bg-ambar/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ambar">A depositar</p>
          <p className="numeros mt-1 text-2xl font-bold text-ambar">{formatReais(calc.aDepositar)}</p>
        </div>
        <div className="rounded-xl border border-borda p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-suave">Diferença</p>
          <p
            className={`numeros mt-1 text-2xl font-bold ${
              calc.diferenca < 0n ? 'text-negativo' : 'text-positivo'
            }`}
          >
            {formatReais(calc.diferenca)}
          </p>
          <p className="mt-1 text-xs text-suave">esperado {formatReais(calc.esperado)}</p>
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
        <p className="text-sm text-suave">Conte o dinheiro da gaveta para confirmar.</p>
      )}

      <button
        type="button"
        onClick={() => void confirmar()}
        disabled={!podeConfirmar}
        className="btn btn-primario px-6 py-3 text-base"
      >
        {confirmando ? 'Confirmando…' : 'Confirmar fechamento'}
      </button>

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
    </div>
  );
}

function CampoMoeda({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-claro">
      {rotulo}
      <input
        inputMode="decimal"
        aria-label={rotulo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="0,00"
        className={`${CLASSE_CAMPO} numeros text-right`}
      />
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
  recentes,
  badge,
}: {
  dataSelecionada: string;
  aoMudar: (d: string) => void;
  recentes: FechamentoRecente[];
  badge: ReactNode;
}) {
  return (
    <div className="cartao flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-suave">
          Data
          <input
            type="date"
            aria-label="Data do fechamento"
            value={dataSelecionada}
            onChange={(e) => aoMudar(e.target.value)}
            className="numeros rounded-lg px-3 py-2 text-sm font-semibold"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-suave">
          Recentes
          <select
            aria-label="Fechamentos recentes"
            value={dataSelecionada}
            onChange={(e) => aoMudar(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm font-semibold"
          >
            <option value={hojeManaus()}>Hoje ({formatarDataBR(hojeManaus())})</option>
            {recentes.map((r) => (
              <option key={r.data} value={r.data}>
                {formatarDataBR(r.data)} — {r.status === 'travado' ? 'Fechado' : 'Aberto'}
              </option>
            ))}
          </select>
        </label>
      </div>
      {badge}
    </div>
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
