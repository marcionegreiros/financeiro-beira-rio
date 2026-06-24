import { useEffect, useState, type ReactNode } from 'react';
import { formatReais, type Centavos } from '../../lib/money';
import { formatLitros } from '../../domain/tipos';
import { litrosParaMililitros } from '../../data/conversao';
import { MedidorTanque } from '../../components/MedidorTanque';
import { useCoresTema } from '../../hooks/useCoresTema';
import {
  listarTanques,
  obterCapitalDashboard,
  obterVendasMes,
  obterAlertas,
  type TanquePainel,
  type AlertasDashboard,
} from '../../data/repositorios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Dados {
  tanques: TanquePainel[];
  capital: { operacional: Centavos; total: Centavos };
  vendas: {
    vendaDia: Centavos;
    vendaMes: Centavos;
    litrosMes: number;
    vendasDiarias: { data: string; valor: number }[];
  };
  alertas: AlertasDashboard;
}

// Mini-ícones (traço fino) para os KPIs
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

export function Painel() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modoCapitalTotal, setModoCapitalTotal] = useState(false);
  const cores = useCoresTema();

  useEffect(() => {
    let ativo = true;
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });

    Promise.all([listarTanques(), obterCapitalDashboard(), obterVendasMes(hoje), obterAlertas()])
      .then(([tanques, capital, vendas, alertas]) => {
        if (ativo) setDados({ tanques, capital, vendas, alertas });
      })
      .catch((e: unknown) => {
        if (ativo) setErro(e instanceof Error ? e.message : 'Falha ao carregar dados.');
      });
    return () => {
      ativo = false;
    };
  }, []);

  const exibeAlerta =
    dados && (dados.alertas.produtosBaixo.length > 0 || dados.alertas.tanquesBaixo.length > 0);

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ambar">Pontão Beira Rio</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-claro">Painel de Controle</h1>
        </div>
        {dados && (
          <div className="flex items-center gap-2 rounded-xl border border-borda bg-ardosia p-1 pl-3 text-sm shadow-[var(--sombra-sm)]">
            <span className="text-suave">
              Capital: <span className="font-semibold text-claro">{modoCapitalTotal ? 'Total' : 'Operacional'}</span>
            </span>
            <button
              type="button"
              onClick={() => setModoCapitalTotal((v) => !v)}
              className="btn btn-suave px-2.5 py-1.5 text-xs"
            >
              Alternar
            </button>
          </div>
        )}
      </header>

      {erro && (
        <p className="rounded-xl border border-negativo/30 bg-negativo/10 p-4 text-sm font-medium text-negativo">
          {erro}
        </p>
      )}

      {!dados && !erro && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cartao h-[104px] animate-pulse opacity-60" />
          ))}
        </div>
      )}

      {dados && (
        <>
          {/* Alertas */}
          {exibeAlerta && (
            <section className="animar-surgir rounded-2xl border border-negativo/30 bg-negativo/[0.07] p-5">
              <h2 className="mb-2 flex items-center gap-2 font-display font-semibold text-negativo">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                Atenção necessária
              </h2>
              <ul className="space-y-1 pl-1 text-sm text-negativo/90">
                {dados.alertas.tanquesBaixo.map((t) => (
                  <li key={t.id}>
                    Tanque <strong>{t.nome}</strong> com nível crítico ({t.litros}L).
                  </li>
                ))}
                {dados.alertas.produtosBaixo.map((p) => (
                  <li key={p.id}>
                    Estoque de <strong>{p.nome}</strong> está baixo ({p.quantidade}).
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* KPIs */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              rotulo="Venda do dia"
              valor={formatReais(dados.vendas.vendaDia)}
              icone={ICO.dia('h-5 w-5')}
              destaque
            />
            <Kpi
              rotulo="Venda do mês"
              valor={formatReais(dados.vendas.vendaMes)}
              icone={ICO.mes('h-5 w-5')}
            />
            <Kpi
              rotulo="Litros vendidos (mês)"
              valor={formatLitros(litrosParaMililitros(dados.vendas.litrosMes))}
              icone={ICO.litros('h-5 w-5')}
            />
            <Kpi
              rotulo={`Capital ${modoCapitalTotal ? 'total' : 'operacional'}`}
              valor={formatReais(modoCapitalTotal ? dados.capital.total : dados.capital.operacional)}
              icone={ICO.capital('h-5 w-5')}
            />
          </section>

          <div className="grid items-start gap-6 lg:grid-cols-3">
            {/* Gráfico */}
            <section className="cartao flex min-h-[320px] flex-col p-6 lg:col-span-2">
              <div className="mb-5 flex items-baseline justify-between">
                <h2 className="font-display text-lg font-semibold text-claro">Faturamento diário</h2>
                <span className="text-xs text-suave">Mês vigente</span>
              </div>
              <div className="h-[260px] w-full flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dados.vendas.vendasDiarias} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradBarra" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={cores.acento} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={cores.acento} stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={cores.borda} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="data"
                      stroke={cores.borda}
                      tick={{ fill: cores.suave, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke={cores.borda}
                      tick={{ fill: cores.suave, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tickFormatter={(val) => `R$${val}`}
                    />
                    <Tooltip
                      cursor={{ fill: cores.acento, fillOpacity: 0.08 }}
                      contentStyle={{
                        backgroundColor: cores.superficie,
                        border: `1px solid ${cores.borda}`,
                        borderRadius: '12px',
                        boxShadow: 'var(--sombra-md)',
                        color: cores.texto,
                      }}
                      labelStyle={{ color: cores.suave, fontSize: 12, marginBottom: 4 }}
                      itemStyle={{ color: cores.texto, fontWeight: 600 }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(val: any) => [`R$ ${Number(val).toFixed(2)}`, 'Venda']}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      labelFormatter={(label: any) => `Dia ${label}`}
                    />
                    <Bar dataKey="valor" fill="url(#gradBarra)" radius={[5, 5, 0, 0]} maxBarSize={46} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Tanques */}
            <section className="cartao h-full p-6">
              <h2 className="font-display text-lg font-semibold text-claro">Tanques</h2>
              <p className="mb-6 text-sm text-suave">Nível pela última medição.</p>
              <div className="flex flex-wrap justify-around gap-4">
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
          </div>
        </>
      )}
    </main>
  );
}

function Kpi({
  rotulo,
  valor,
  icone,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  icone: ReactNode;
  destaque?: boolean;
}) {
  return (
    <div className={`cartao relative overflow-hidden p-5 ${destaque ? 'ring-1 ring-ambar/30' : ''}`}>
      {destaque && <span className="absolute inset-x-0 top-0 h-0.5 bg-ambar" />}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-suave">{rotulo}</p>
        <span className={destaque ? 'text-ambar' : 'text-suave/70'}>{icone}</span>
      </div>
      <p className={`numeros mt-2 text-2xl font-semibold ${destaque ? 'text-ambar' : 'text-claro'}`}>{valor}</p>
    </div>
  );
}
