import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  parseReais,
  formatReais,
  somar,
  subtrair,
  asCentavos,
  type Centavos,
} from '../../lib/money';
import { formatLitros, asMililitros, type Mililitros } from '../../domain/tipos';
import { vendaCombustivel, vendaProdutoContagem } from '../../domain/venda';
import { dinheiroEsperado, diferencaCaixa } from '../../domain/caixa';
import { liquidoCartao } from '../../domain/capital';
import { litrosParaMililitros, paraQuantidade } from '../../data/conversao';
import {
  carregarContexto,
  confirmarFechamento,
  asQuantidade,
  type ContextoFechamento,
  type ResumoConfirmacao,
} from '../../data/fechamento';
import { Relatorio, type RelatorioDados } from './Relatorio';

const ZERO = asCentavos(0n);
const inputClasse =
  'w-32 rounded-lg border border-claro/20 bg-petroleo px-3 py-2 text-right text-claro outline-none focus:border-ambar numeros';

interface Props {
  usuarioId: string | null;
}

export function Fechamento({ usuarioId }: Props) {
  const [ctx, setCtx] = useState<ContextoFechamento | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [leituras, setLeituras] = useState<Record<string, string>>({});
  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [pix, setPix] = useState('');
  const [debito, setDebito] = useState('');
  const [credito, setCredito] = useState('');
  const [despesaValor, setDespesaValor] = useState('');
  const [despesaDescricao, setDespesaDescricao] = useState('');
  const [contado, setContado] = useState('');
  const [observacao, setObservacao] = useState('');

  const [confirmando, setConfirmando] = useState(false);
  const [erroConfirmar, setErroConfirmar] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDados | null>(null);

  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    carregarContexto()
      .then(setCtx)
      .catch((e: unknown) => setErroCarga(e instanceof Error ? e.message : 'Falha ao carregar.'));
  }, []);

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
      const r = vendaProdutoContagem({
        estoqueAnterior: p.estoqueAnterior,
        entradas: asQuantidade(0n),
        estoqueAtual: atual,
        perdas: asQuantidade(0n),
        precoCentavos: p.preco ?? ZERO,
      });
      return { ...p, atual, preenchido, vendido: r.vendido, valor: r.valorCentavos };
    });

    const totalCombustivel = somar(...bombas.map((b) => b.valor));
    const totalProdutos = somar(...produtos.map((p) => p.valor));
    const vendaFisica = somar(totalCombustivel, totalProdutos);

    const pixC = parseReais(pix);
    const debitoC = parseReais(debito);
    const creditoC = parseReais(credito);
    const despesaC = parseReais(despesaValor);
    const contadoC = parseReais(contado);

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
      pix: pixC,
      cartaoDebito: debitoC,
      cartaoCredito: creditoC,
      despesasDinheiro: despesaC,
      trocoFixo: ctx.trocoFixo,
    });
    const diferenca = diferencaCaixa(contadoC, esperado);
    const cashSales = subtrair(subtrair(subtrair(vendaFisica, pixC), debitoC), creditoC);
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
      dCartaoDeb,
      dCartaoCred,
      esperado,
      diferenca,
      cashSales,
      aDepositar,
    };
  }, [ctx, leituras, contagens, pix, debito, credito, despesaValor, contado]);

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
        cashSales: calc.cashSales,
        pix: calc.pixC,
        debitoNet: calc.dCartaoDeb.liquido,
        debitoTaxa: calc.dCartaoDeb.taxa,
        creditoNet: calc.dCartaoCred.liquido,
        creditoTaxa: calc.dCartaoCred.taxa,
        despesa:
          calc.despesaC !== 0n ? { valor: calc.despesaC, descricao: despesaDescricao } : null,
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
      });
    } catch (e) {
      setErroConfirmar(e instanceof Error ? e.message : 'Falha ao confirmar.');
    } finally {
      setConfirmando(false);
    }
  }

  if (relatorio) return <Relatorio dados={relatorio} aoFechar={() => window.location.reload()} />;
  if (erroCarga)
    return <p className="p-6 text-negativo">Erro ao carregar o fechamento: {erroCarga}</p>;
  if (!ctx || !calc) return <p className="p-6 text-claro/60">Carregando fechamento…</p>;

  if (ctx.jaExisteHoje)
    return (
      <div className="p-6">
        <p className="rounded-xl border border-atencao/40 bg-atencao/10 p-4 text-atencao">
          Já existe um fechamento para hoje ({ctx.data}). Reabertura/ajuste é uma ação de gerente
          (Fase 10).
        </p>
      </div>
    );

  let idx = 0;
  const podeConfirmar = contado.trim() !== '' && !!ctx.contaCaixaId && !confirmando;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <header>
        <p className="text-sm uppercase tracking-widest text-ambar">Fechar caixa</p>
        <h1 className="font-display text-2xl font-bold text-claro">Fechamento de {ctx.data}</h1>
        <p className="text-sm text-claro/60">
          Enter avança para o próximo campo, na ordem da contagem.
        </p>
      </header>

      {/* Combustível */}
      <section className="rounded-2xl bg-ardosia p-5">
        <h2 className="mb-3 font-display font-semibold text-claro">Combustível (encerrante)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-claro/50">
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
                <tr key={b.id} className="border-t border-claro/10">
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
      <section className="rounded-2xl bg-ardosia p-5">
        <h2 className="mb-3 font-display font-semibold text-claro">Produtos (contagem)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-claro/50">
              <th className="pb-2 font-medium">Produto</th>
              <th className="pb-2 text-right font-medium">Estoque anterior</th>
              <th className="pb-2 text-right font-medium">Contagem agora</th>
              <th className="pb-2 text-right font-medium">Vendido</th>
              <th className="pb-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {calc.produtos.map((p) => {
              const meu = idx++;
              return (
                <tr key={p.id} className="border-t border-claro/10">
                  <td className="py-2 text-claro">{p.nome}</td>
                  <td className="numeros py-2 text-right text-claro/60">
                    {String(p.estoqueAnterior)}
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

      {/* Venda física ao vivo */}
      <section className="rounded-2xl border border-claro/10 p-5">
        <div className="flex items-center justify-between">
          <span className="text-claro/70">Venda física do dia</span>
          <span className="numeros text-2xl font-semibold text-claro">
            {formatReais(calc.vendaFisica)}
          </span>
        </div>
      </section>

      {/* Pagamentos */}
      <section className="grid gap-4 rounded-2xl bg-ardosia p-5 sm:grid-cols-3">
        <h2 className="font-display font-semibold text-claro sm:col-span-3">
          Pagamentos não-dinheiro
        </h2>
        <Campo rotulo="PIX" valor={pix} aoMudar={setPix} />
        <Campo
          rotulo={`Cartão débito (taxa ${formatReais(calc.dCartaoDeb.taxa)})`}
          valor={debito}
          aoMudar={setDebito}
        />
        <Campo
          rotulo={`Cartão crédito (taxa ${formatReais(calc.dCartaoCred.taxa)})`}
          valor={credito}
          aoMudar={setCredito}
        />
      </section>

      {/* Despesas em dinheiro */}
      <section className="grid gap-4 rounded-2xl bg-ardosia p-5 sm:grid-cols-2">
        <h2 className="font-display font-semibold text-claro sm:col-span-2">
          Despesa em dinheiro (dia)
        </h2>
        <Campo rotulo="Valor" valor={despesaValor} aoMudar={setDespesaValor} />
        <label className="flex flex-col gap-1 text-sm text-claro/70">
          Descrição
          <input
            value={despesaDescricao}
            onChange={(e) => setDespesaDescricao(e.target.value)}
            className="rounded-lg border border-claro/20 bg-petroleo px-3 py-2 text-claro outline-none focus:border-ambar"
            placeholder="ex.: combustível do gerador"
          />
        </label>
      </section>

      {/* Contagem do dinheiro + a depositar + diferença */}
      <section className="grid gap-4 rounded-2xl bg-ardosia p-5 sm:grid-cols-3">
        <Campo rotulo="Dinheiro contado na gaveta" valor={contado} aoMudar={setContado} />
        <div className="rounded-2xl border border-ambar/40 bg-ambar/10 p-4">
          <p className="text-xs uppercase tracking-wide text-ambar">A depositar</p>
          <p className="numeros mt-1 text-2xl font-semibold text-ambar">
            {formatReais(calc.aDepositar)}
          </p>
        </div>
        <div className="rounded-2xl border border-claro/10 p-4">
          <p className="text-xs uppercase tracking-wide text-claro/60">Diferença</p>
          <p
            className={`numeros mt-1 text-2xl font-semibold ${
              calc.diferenca < 0n ? 'text-negativo' : 'text-positivo'
            }`}
          >
            {formatReais(calc.diferenca)}
          </p>
          <p className="mt-1 text-xs text-claro/50">esperado {formatReais(calc.esperado)}</p>
        </div>
      </section>

      <label className="flex flex-col gap-1 text-sm text-claro/70">
        Observação
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          className="rounded-lg border border-claro/20 bg-petroleo px-3 py-2 text-claro outline-none focus:border-ambar"
        />
      </label>

      {erroConfirmar && <p className="text-sm text-negativo">{erroConfirmar}</p>}
      {contado.trim() === '' && (
        <p className="text-sm text-claro/50">Conte o dinheiro da gaveta para confirmar.</p>
      )}

      <button
        onClick={() => void confirmar()}
        disabled={!podeConfirmar}
        className="rounded-xl bg-ambar px-6 py-3 text-lg font-semibold text-petroleo disabled:opacity-50"
      >
        {confirmando ? 'Confirmando…' : 'Confirmar fechamento'}
      </button>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-claro/70">
      {rotulo}
      <input
        inputMode="decimal"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="0,00"
        className="rounded-lg border border-claro/20 bg-petroleo px-3 py-2 text-right text-claro outline-none focus:border-ambar numeros"
      />
    </label>
  );
}
