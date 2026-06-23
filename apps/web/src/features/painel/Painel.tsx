import { useEffect, useState } from 'react';
import { formatReais, somar, asCentavos, type Centavos } from '../../lib/money';
import { MedidorTanque } from '../../components/MedidorTanque';
import {
  listarSaldos,
  listarTanques,
  listarProdutos,
  type SaldoConta,
  type TanquePainel,
  type ProdutoPainel,
} from '../../data/repositorios';

interface Dados {
  saldos: SaldoConta[];
  tanques: TanquePainel[];
  produtos: ProdutoPainel[];
}

export function Painel() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([listarSaldos(), listarTanques(), listarProdutos()])
      .then(([saldos, tanques, produtos]) => {
        if (ativo) setDados({ saldos, tanques, produtos });
      })
      .catch((e: unknown) => {
        if (ativo) setErro(e instanceof Error ? e.message : 'Falha ao carregar dados.');
      });
    return () => {
      ativo = false;
    };
  }, []);

  const totalCaixa: Centavos = dados ? somar(...dados.saldos.map((s) => s.saldo)) : asCentavos(0n);

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 px-6 py-8">
      <header>
        <p className="text-sm uppercase tracking-widest text-ambar">Pontão Beira Rio</p>
        <h1 className="font-display text-3xl font-bold text-claro">Painel</h1>
      </header>

      {erro && (
        <p className="rounded-xl border border-negativo/40 bg-negativo/10 p-4 text-sm text-negativo">
          {erro}
        </p>
      )}

      {!dados && !erro && <p className="text-claro/60">Carregando dados do Pontão…</p>}

      {dados && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-ambar/40 bg-ambar/10 p-5 sm:col-span-1">
              <p className="text-xs uppercase tracking-wide text-ambar">Dinheiro total (contas)</p>
              <p className="numeros mt-1 text-2xl font-semibold text-ambar">
                {formatReais(totalCaixa)}
              </p>
            </div>
            {dados.saldos.map((s) => (
              <div key={s.id} className="rounded-2xl bg-ardosia p-5">
                <p className="text-xs uppercase tracking-wide text-claro/60">
                  {s.nome} <span className="text-claro/40">· {s.tipo}</span>
                </p>
                <p className="numeros mt-1 text-2xl font-semibold">{formatReais(s.saldo)}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl bg-ardosia p-6">
            <h2 className="font-display text-lg font-semibold text-claro">Tanques</h2>
            <p className="mb-4 text-sm text-claro/60">Nível pela última medição de régua.</p>
            <div className="flex flex-wrap gap-10">
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

          <section className="rounded-2xl bg-ardosia p-6">
            <h2 className="mb-4 font-display text-lg font-semibold text-claro">Produtos</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-claro/50">
                  <th className="pb-2 font-medium">Produto</th>
                  <th className="pb-2 font-medium">Apuração</th>
                  <th className="pb-2 text-right font-medium">Preço</th>
                </tr>
              </thead>
              <tbody>
                {dados.produtos.map((p) => (
                  <tr key={p.id} className="border-t border-claro/10">
                    <td className="py-2 text-claro">{p.nome}</td>
                    <td className="py-2 text-claro/60">{p.modoApuracao}</td>
                    <td className="numeros py-2 text-right text-claro">
                      {p.preco === undefined ? '—' : formatReais(p.preco)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
