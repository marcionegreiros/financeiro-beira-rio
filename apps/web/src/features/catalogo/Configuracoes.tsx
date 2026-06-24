import { useState, useEffect, type FormEvent } from 'react';
import { lerConfig, salvarConfig } from '../../data/repositorios';
import { useToast } from '../../components/ui/Toast';
import { PageHeader } from '../../components/ui/PageHeader';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import type { Tema } from '../Shell';

interface Props {
  tema: Tema;
  aoTrocarTema: (t: Tema) => void;
}

const TEMAS_CONFIG = [
  {
    id: 'light' as Tema,
    titulo: 'Claro',
    desc: 'Visual clean e profissional',
    icone: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
  {
    id: 'dark' as Tema,
    titulo: 'Petróleo',
    desc: 'Fundo clássico e âmbar quente',
    icone: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 12.75A9.75 9.75 0 0111.25 2.25a9 9 0 0010.5 10.5z" />
      </svg>
    ),
  },
  {
    id: 'dark2' as Tema,
    titulo: 'Premium',
    desc: 'Fundo profundo e azul elétrico',
    icone: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3.091 15.1l5.096-.813L9 9.187l.813 5.096 5.096.813-5.096.813zM19.071 4.929l-.361 2.261-2.261.361 2.261.361.361 2.261.361-2.261 2.261-.361-2.261-.361-.361-2.261zM19.071 19.071l-.361 2.261-2.261.361 2.261.361.361 2.261.361-2.261 2.261-.361-2.261-.361-.361-2.261z" />
      </svg>
    ),
  },
  {
    id: 'system' as Tema,
    titulo: 'Automático',
    desc: 'Sincroniza com o seu dispositivo',
    icone: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
];

export function Configuracoes({ tema, aoTrocarTema }: Props) {
  const toast = useToast();
  const [trocoFixo, setTrocoFixo] = useState('');
  const [taxaDebitoPct, setTaxaDebitoPct] = useState('');
  const [taxaDebitoFixa, setTaxaDebitoFixa] = useState('');
  const [taxaCreditoPct, setTaxaCreditoPct] = useState('');
  const [taxaCreditoFixa, setTaxaCreditoFixa] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      try {
        const [troco, debPct, debFixa, credPct, credFixa] = await Promise.all([
          lerConfig('troco_fixo_centavos'),
          lerConfig('taxa_cartao_debito_pct'),
          lerConfig('taxa_cartao_debito_fixa_centavos'),
          lerConfig('taxa_cartao_credito_pct'),
          lerConfig('taxa_cartao_credito_fixa_centavos'),
        ]);
        if (troco !== null) setTrocoFixo(String(Number(troco) / 100));
        if (debPct !== null) setTaxaDebitoPct(String(debPct));
        if (debFixa !== null) setTaxaDebitoFixa(String(Number(debFixa) / 100));
        if (credPct !== null) setTaxaCreditoPct(String(credPct));
        if (credFixa !== null) setTaxaCreditoFixa(String(Number(credFixa) / 100));
      } catch (err) {
        console.error('Erro ao carregar configs', err);
        toast.erro('Falha ao carregar configurações.');
      } finally {
        setCarregando(false);
      }
    }
    void carregar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await Promise.all([
        salvarConfig('troco_fixo_centavos', Math.round(Number(trocoFixo || 0) * 100)),
        salvarConfig('taxa_cartao_debito_pct', Number(taxaDebitoPct || 0)),
        salvarConfig('taxa_cartao_debito_fixa_centavos', Math.round(Number(taxaDebitoFixa || 0) * 100)),
        salvarConfig('taxa_cartao_credito_pct', Number(taxaCreditoPct || 0)),
        salvarConfig('taxa_cartao_credito_fixa_centavos', Math.round(Number(taxaCreditoFixa || 0) * 100)),
      ]);
      toast.sucesso('Configurações salvas com sucesso.');
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao salvar configurações.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader titulo="Configurações" subtitulo="Parâmetros de funcionamento do sistema" />
        <div className="cartao p-12 text-center text-suave">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader titulo="Configurações" subtitulo="Parâmetros de funcionamento do sistema" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Seção: Caixa */}
        <section className="cartao p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-claro">
            <IconeCaixa />
            Caixa
          </h2>
          <div className="max-w-xs">
            <Campo label="Troco fixo (R$)" dica="Valor base que fica na gaveta para o próximo dia.">
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className={`${CLASSE_CAMPO} numeros text-right`}
                placeholder="0,00"
                value={trocoFixo}
                onChange={(e) => setTrocoFixo(e.target.value)}
              />
            </Campo>
          </div>
        </section>

        {/* Seção: Taxas de cartão */}
        <section className="cartao p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-claro">
            <IconeCartao />
            Taxas de Cartão
          </h2>
          <p className="mb-4 text-sm text-suave">
            Configuração das taxas cobradas pela operadora. Essas taxas são aplicadas automaticamente
            ao receber pagamento em cartão, gerando uma despesa de &quot;taxa de cartão&quot;.
          </p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Débito */}
            <div className="flex flex-col gap-3 rounded-xl border border-borda p-4">
              <h3 className="text-sm font-semibold text-claro">Cartão de Débito</h3>
              <Campo label="Taxa percentual (%)" dica="Ex.: 1.99 para 1,99%">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  placeholder="0,00"
                  value={taxaDebitoPct}
                  onChange={(e) => setTaxaDebitoPct(e.target.value)}
                />
              </Campo>
              <Campo label="Taxa fixa por operação (R$)" dica="Valor fixo descontado por transação">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  placeholder="0,00"
                  value={taxaDebitoFixa}
                  onChange={(e) => setTaxaDebitoFixa(e.target.value)}
                />
              </Campo>
            </div>

            {/* Crédito */}
            <div className="flex flex-col gap-3 rounded-xl border border-borda p-4">
              <h3 className="text-sm font-semibold text-claro">Cartão de Crédito</h3>
              <Campo label="Taxa percentual (%)" dica="Ex.: 3.49 para 3,49%">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  placeholder="0,00"
                  value={taxaCreditoPct}
                  onChange={(e) => setTaxaCreditoPct(e.target.value)}
                />
              </Campo>
              <Campo label="Taxa fixa por operação (R$)" dica="Valor fixo descontado por transação">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  placeholder="0,00"
                  value={taxaCreditoFixa}
                  onChange={(e) => setTaxaCreditoFixa(e.target.value)}
                />
              </Campo>
            </div>
          </div>
        </section>

        {/* Seção: Tema Visual */}
        <section className="cartao p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-claro">
            <IconeTema />
            Tema Visual
          </h2>
          <p className="mb-4 text-sm text-suave">
            Escolha o tema de cores do sistema de acordo com sua preferência. O tema é aplicado instantaneamente e salvo no seu dispositivo.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TEMAS_CONFIG.map((t) => {
              const selecionado = tema === t.id;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => aoTrocarTema(t.id)}
                  className={`flex flex-col items-center gap-3 rounded-xl border p-4 text-center transition-all ${
                    selecionado
                      ? 'border-ambar bg-ambar/[0.06] text-ambar ring-2 ring-ambar/20 shadow-sm shadow-ambar/5'
                      : 'border-borda bg-transparent text-suave hover:border-claro/20 hover:text-claro'
                  }`}
                >
                  <div className={`rounded-xl p-2.5 transition-colors ${selecionado ? 'bg-ambar/10 text-ambar' : 'bg-claro/5 text-suave'}`}>
                    {t.icone}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <h3 className={`text-sm font-bold transition-colors ${selecionado ? 'text-ambar' : 'text-claro'}`}>
                      {t.titulo}
                    </h3>
                    <p className="text-[11px] font-medium text-suave max-w-[150px]">
                      {t.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={salvando}
            className="btn btn-primario px-6 py-2 text-sm"
          >
            {salvando ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ────────────────── Ícones inline ────────────────── */

function IconeCaixa() {
  return (
    <svg className="h-5 w-5 text-ambar" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function IconeCartao() {
  return (
    <svg className="h-5 w-5 text-ambar" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}

function IconeTema() {
  return (
    <svg className="h-5 w-5 text-ambar" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3.091 15.1l5.096-.813L9 9.187l.813 5.096 5.096.813-5.096.813z" />
    </svg>
  );
}
