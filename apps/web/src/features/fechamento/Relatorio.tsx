import { formatReais, type Centavos } from '../../lib/money';
import { asMililitros, formatLitros } from '../../domain/tipos';
import { formatarDataBR } from '../../lib/datas';

export interface RelatorioDados {
  data: string;
  bombas: { nome: string; litrosMl: bigint; valor: Centavos }[];
  produtos: { nome: string; vendido: bigint; valor: Centavos }[];
  vendaFisica: Centavos;
  pix: Centavos;
  debito: Centavos;
  credito: Centavos;
  despesa: Centavos;
  esperado: Centavos;
  contado: Centavos;
  diferenca: Centavos;
  aDepositar: Centavos;
  observacao: string;
  fiadoConcedido: Centavos;
  fiadoRecebido: Centavos;
}

export function Relatorio({
  dados,
  aoFechar,
  podeReabrir,
  aoReabrir,
}: {
  dados: RelatorioDados;
  aoFechar: () => void;
  podeReabrir?: boolean;
  aoReabrir?: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 print:p-0 print:text-black">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-ambar">Relatório do caixa</p>
          <h1 className="font-display text-2xl font-bold text-claro">{formatarDataBR(dados.data)}</h1>
        </div>
        <span className="rounded-full bg-positivo/20 px-3 py-1 text-sm text-positivo">
          Fechamento travado
        </span>
      </header>

      <section className="rounded-2xl bg-ardosia p-5 print:bg-transparent print:p-0">
        <h2 className="mb-3 font-display font-semibold text-claro print:text-black">Itens vendidos</h2>
        <table className="w-full text-sm">
          <tbody>
            {dados.bombas.map((b, i) => (
              <tr key={`b${i}`} className="border-t border-claro/10">
                <td className="py-2 text-claro">{b.nome}</td>
                <td className="numeros py-2 text-right text-claro/60">
                  {formatLitros(asMililitros(b.litrosMl))}
                </td>
                <td className="numeros py-2 text-right text-claro">{formatReais(b.valor)}</td>
              </tr>
            ))}
            {dados.produtos.map((p, i) => (
              <tr key={`p${i}`} className="border-t border-claro/10">
                <td className="py-2 text-claro">{p.nome}</td>
                <td className="numeros py-2 text-right text-claro/60">{String(p.vendido)} un</td>
                <td className="numeros py-2 text-right text-claro">{formatReais(p.valor)}</td>
              </tr>
            ))}
            <tr className="border-t border-claro/20">
              <td className="py-2 font-semibold text-claro" colSpan={2}>
                Venda física
              </td>
              <td className="numeros py-2 text-right font-semibold text-claro">
                {formatReais(dados.vendaFisica)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="grid grid-cols-2 gap-3 rounded-2xl bg-ardosia p-5 text-sm sm:grid-cols-4 print:bg-transparent print:p-0">
        <Item rotulo="PIX" valor={dados.pix} />
        <Item rotulo="Débito" valor={dados.debito} />
        <Item rotulo="Crédito" valor={dados.credito} />
        <Item rotulo="Despesa $" valor={dados.despesa} />
        <Item rotulo="Fiado Conc." valor={dados.fiadoConcedido} />
        <Item rotulo="Fiado Rec." valor={dados.fiadoRecebido} />
        <Item rotulo="Esperado" valor={dados.esperado} />
        <Item rotulo="Contado" valor={dados.contado} />
        <Item
          rotulo="Diferença"
          valor={dados.diferenca}
          cor={dados.diferenca < 0n ? 'text-negativo' : 'text-positivo'}
        />
      </section>

      <section className="rounded-2xl border border-ambar/40 bg-ambar/10 p-5">
        <p className="text-xs uppercase tracking-wide text-ambar">Valor a depositar</p>
        <p className="numeros mt-1 text-3xl font-bold text-ambar">
          {formatReais(dados.aDepositar)}
        </p>
      </section>

      {dados.observacao && (
        <p className="rounded-xl border border-claro/10 p-4 text-sm text-claro/70">
          <span className="text-claro/50">Observação:</span> {dados.observacao}
        </p>
      )}

      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-claro/20 px-4 py-2 text-claro/80 hover:border-claro/40"
        >
          Imprimir / PDF
        </button>
        {podeReabrir && aoReabrir && (
          <button
            onClick={aoReabrir}
            className="rounded-lg bg-negativo px-4 py-2 font-medium text-claro hover:bg-negativo/80"
          >
            Reabrir Fechamento
          </button>
        )}
        <button
          onClick={aoFechar}
          className="ml-auto rounded-lg bg-ambar px-4 py-2 font-medium text-petroleo"
        >
          Concluir
        </button>
      </div>
    </div>
  );
}

function Item({ rotulo, valor, cor }: { rotulo: string; valor: Centavos; cor?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-claro/50">{rotulo}</p>
      <p className={`numeros mt-0.5 text-lg font-semibold ${cor ?? 'text-claro'}`}>
        {formatReais(valor)}
      </p>
    </div>
  );
}
