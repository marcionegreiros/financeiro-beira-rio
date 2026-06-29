import { useState, useEffect, type FormEvent } from 'react';
import {
  lerConfig,
  salvarConfig,
  listarCategoriasDespesa,
  salvarCategoriaDespesa,
  removerCategoriaDespesa,
  type CategoriaDespesa,
  salvarVigenciaTaxaCartao,
  taxaCartaoVigenteEmData,
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { useToast } from '../../components/ui/Toast';
import { PageHeader } from '../../components/ui/PageHeader';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import type { Tema } from '../Shell';
import { hojeManaus } from '../../lib/datas';

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
  const [taxaPixPct, setTaxaPixPct] = useState('');
  const [taxaPixFixa, setTaxaPixFixa] = useState('');
  const [taxaVigenteEm, setTaxaVigenteEm] = useState(() => hojeManaus());
  const [mostrarAvulsos, setMostrarAvulsos] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Categorias de despesa (CRUD)
  const [categoriasDespesa, setCategoriasDespesa] = useState<CategoriaDespesa[]>([]);
  const [cdEditandoId, setCdEditandoId] = useState<string | null>(null);
  const [cdNome, setCdNome] = useState('');
  const [salvandoCd, setSalvandoCd] = useState(false);

  async function recarregarCategoriasDespesa() {
    setCategoriasDespesa(await listarCategoriasDespesa());
  }

  function limparFormCd() {
    setCdEditandoId(null);
    setCdNome('');
  }

  function editarCd(c: CategoriaDespesa) {
    setCdEditandoId(c.id);
    setCdNome(c.nome);
  }

  async function aoSalvarCd(e: FormEvent) {
    e.preventDefault();
    if (!cdNome.trim()) {
      toast.erro('Informe o nome da categoria.');
      return;
    }
    setSalvandoCd(true);
    try {
      const ehEspecial = categoriasDespesa.find((c) => c.id === cdEditandoId)?.ehEspecial ?? false;
      await salvarCategoriaDespesa({ id: cdEditandoId ?? uuidv7(), nome: cdNome.trim(), ehEspecial });
      toast.sucesso(cdEditandoId ? 'Categoria atualizada.' : 'Categoria cadastrada.');
      await recarregarCategoriasDespesa();
      limparFormCd();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao salvar a categoria de despesa.');
    } finally {
      setSalvandoCd(false);
    }
  }

  async function aoExcluirCd(c: CategoriaDespesa) {
    if (!confirm(`Excluir a categoria de despesa "${c.nome}"? Esta ação é definitiva.`)) return;
    try {
      await removerCategoriaDespesa(c.id);
      toast.sucesso('Categoria excluída.');
      if (cdEditandoId === c.id) limparFormCd();
      await recarregarCategoriasDespesa();
    } catch (err) {
      console.error(err);
      toast.erro(
        (err as Error)?.message === 'NAO_EXCLUIDO'
          ? 'Esta categoria já foi usada em alguma despesa — não pode ser excluída.'
          : 'Erro ao excluir a categoria.',
      );
    }
  }

  useEffect(() => {
    async function carregar() {
      try {
        const [troco, avulsos, taxas] = await Promise.all([
          lerConfig('troco_fixo_centavos'),
          lerConfig('fechamento_mostrar_avulsos'),
          taxaCartaoVigenteEmData(),
        ]);
        if (troco !== null) setTrocoFixo(String(Number(troco) / 100));
        if (avulsos !== null) setMostrarAvulsos(Boolean(avulsos));

        if (taxas) {
          setTaxaDebitoPct(String(taxas.debito.percentualBp / 100));
          setTaxaDebitoFixa(String(taxas.debito.fixaCentavos / 100));
          setTaxaCreditoPct(String(taxas.credito.percentualBp / 100));
          setTaxaCreditoFixa(String(taxas.credito.fixaCentavos / 100));
          setTaxaPixPct(String(taxas.pix.percentualBp / 100));
          setTaxaPixFixa(String(taxas.pix.fixaCentavos / 100));
        }

        setCategoriasDespesa(await listarCategoriasDespesa());
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
      const pctDebito = Number(taxaDebitoPct || 0);
      const fixaDebito = Math.round(Number(taxaDebitoFixa || 0) * 100);
      const pctCredito = Number(taxaCreditoPct || 0);
      const fixaCredito = Math.round(Number(taxaCreditoFixa || 0) * 100);
      const pctPix = Number(taxaPixPct || 0);
      const fixaPix = Math.round(Number(taxaPixFixa || 0) * 100);

      await Promise.all([
        salvarConfig('troco_fixo_centavos', Math.round(Number(trocoFixo || 0) * 100)),
        salvarConfig('fechamento_mostrar_avulsos', mostrarAvulsos),
        salvarVigenciaTaxaCartao({
          data: taxaVigenteEm,
          debito: { percentualBp: Math.round(pctDebito * 100), fixaCentavos: fixaDebito },
          credito: { percentualBp: Math.round(pctCredito * 100), fixaCentavos: fixaCredito },
          pix: { percentualBp: Math.round(pctPix * 100), fixaCentavos: fixaPix },
        }),
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
          <div className="mt-4 border-t border-borda pt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-claro cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarAvulsos}
                onChange={(e) => setMostrarAvulsos(e.target.checked)}
                className="rounded border-borda bg-fundo text-ambar focus:ring-ambar h-4 w-4"
              />
              <span>Mostrar produtos avulsos / serviços no fechamento</span>
            </label>
            <p className="mt-1 text-xs text-suave pl-6">
              Se desativado, a seção de vendas avulsas e serviços não será exibida no fechamento de caixa por padrão.
            </p>
          </div>
        </section>

        {/* Seção: Taxas de cartão */}
        <section className="cartao p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-claro">
            <IconeCartao />
            Taxas de Cartão e Pix (Maquininha)
          </h2>
          <p className="mb-4 text-sm text-suave">
            Configuração das taxas cobradas pela operadora. Essas taxas são aplicadas automaticamente
            ao receber pagamentos eletrônicos, gerando despesas de taxa correspondentes.
          </p>

          <div className="mb-6 max-w-xs">
            <Campo label="Vigência das novas taxas" dica="A partir de qual data estas taxas passam a valer.">
              <input
                type="date"
                className={CLASSE_CAMPO}
                value={taxaVigenteEm}
                onChange={(e) => setTaxaVigenteEm(e.target.value)}
                required
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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

            {/* Pix */}
            <div className="flex flex-col gap-3 rounded-xl border border-borda p-4">
              <h3 className="text-sm font-semibold text-claro">PIX (Maquininha)</h3>
              <Campo label="Taxa percentual (%)" dica="Ex.: 0.99 para 0,99%">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  placeholder="0,00"
                  value={taxaPixPct}
                  onChange={(e) => setTaxaPixPct(e.target.value)}
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
                  value={taxaPixFixa}
                  onChange={(e) => setTaxaPixFixa(e.target.value)}
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

      {/* Seção: Categorias de despesa (CRUD próprio, salva na hora) */}
      <section className="cartao p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-claro">
          <IconeCategoria />
          Categorias de Despesa
        </h2>
        <p className="mb-4 text-sm text-suave">
          Organizam as despesas lançadas (aluguel, energia, manutenção…). Só é possível excluir
          uma categoria que nunca foi usada em uma despesa.
        </p>

        <form onSubmit={aoSalvarCd} className="mb-4 flex items-end gap-2">
          <div className="max-w-xs flex-1">
            <Campo label={cdEditandoId ? 'Editar categoria' : 'Nova categoria'} obrigatorio>
              <input
                className={CLASSE_CAMPO}
                placeholder="Ex.: Energia, Aluguel, Manutenção"
                value={cdNome}
                onChange={(e) => setCdNome(e.target.value)}
              />
            </Campo>
          </div>
          {cdEditandoId && (
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={limparFormCd}>
              Cancelar
            </button>
          )}
          <button type="submit" disabled={salvandoCd} className="btn btn-primario px-4 py-2 text-sm">
            {salvandoCd ? 'Salvando…' : cdEditandoId ? 'Salvar' : 'Adicionar'}
          </button>
        </form>

        {categoriasDespesa.length === 0 ? (
          <p className="text-xs text-suave">Nenhuma categoria de despesa cadastrada.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {categoriasDespesa.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-borda px-3 py-2">
                <span className="text-sm text-claro">
                  {c.nome}
                  {c.ehEspecial && (
                    <span className="ml-2 inline-flex rounded-full bg-ambar/10 px-2 py-0.5 text-[10px] font-semibold text-ambar">
                      Especial
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => editarCd(c)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-suave hover:bg-claro/10 hover:text-ambar transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void aoExcluirCd(c)}
                    title="Excluir (só se nunca usada)"
                    className="rounded-md px-2 py-1 text-xs font-medium text-negativo hover:bg-negativo/10 transition-colors"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
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

function IconeCategoria() {
  return (
    <svg className="h-5 w-5 text-ambar" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}
