import { useEffect, useState, type FormEvent } from 'react';
import {
  listarContasCompletas,
  listarCategoriasDespesa,
  lancarDespesa,
  salvarCategoriaDespesa,
  type ContaCompleta,
  type CategoriaDespesa,
  verificarFechamentoStatus,
  atualizarDespesa,
  type MovimentoLista,
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { parseReais } from '../../lib/money';
import { agoraNaDataManaus, hojeManaus, formatarDataBR } from '../../lib/datas';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import { AutorizacaoGerenteModal } from './AutorizacaoGerenteModal';
import type { UsuarioAtual } from '../../data/usuario';
import type { Centavos } from '../../lib/money';
import type { SupabaseClient } from '@supabase/supabase-js';
import { diaIso } from '../../lib/formato';

export const FORMAS_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Débito',
  credito: 'Crédito',
};

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  usuarioId: string;
  usuario?: UsuarioAtual;
  despesaEdicao?: MovimentoLista | null;
  /** Data (YYYY-MM-DD) do lançamento; o horário usa a hora atual de Manaus. */
  data?: string;
  /** Pré-seleciona a primeira conta deste tipo (ex.: 'dinheiro' no fechamento). */
  contaPadraoTipo?: 'dinheiro' | 'banco';
  /** Pré-seleciona a forma de pagamento (ex.: 'dinheiro' no fechamento). */
  formaPadrao?: string;
  /** Chamado após gravar — recarregar listas que dependem desta despesa. */
  aoSalvo: () => void;
}

/**
 * Modal único de lançamento de despesa, usado tanto na janela Despesas quanto
 * dentro do Fechamento. Como a despesa é gravada na hora (um `movimento`), ela
 * aparece nos dois lugares e, sendo do dia do fechamento, reduz o esperado da
 * gaveta quando for em dinheiro (§3.3, §5.5).
 */
export function NovaDespesaModal({
  aberto,
  aoFechar,
  usuarioId,
  usuario,
  despesaEdicao,
  data,
  contaPadraoTipo,
  formaPadrao,
  aoSalvo,
}: Props) {
  const toast = useToast();
  const [contas, setContas] = useState<ContaCompleta[]>([]);
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>([]);

  const [contaId, setContaId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [formaPagamento, setFormaPagamento] = useState(formaPadrao ?? '');
  const [descricao, setDescricao] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [dataLancamento, setDataLancamento] = useState(data ?? hojeManaus());
  const [salvando, setSalvando] = useState(false);

  // Cadastrar nova categoria na hora
  const [mostrandoNovaCat, setMostrandoNovaCat] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState('');
  const [salvandoNovaCat, setSalvandoNovaCat] = useState(false);

  // Autorização do gerente
  const [modalAutorizarAberto, setModalAutorizarAberto] = useState(false);
  const [dadosAConfirmar, setDadosAConfirmar] = useState<{
    contaId: string;
    categoriaId: string;
    valor: Centavos;
    dataHora: string;
    formaPagamento: string;
    descricao: string;
    tags: string[];
  } | null>(null);

  async function aoSalvarNovaCat() {
    if (!novaCatNome.trim()) {
      toast.erro('Digite o nome da categoria.');
      return;
    }
    setSalvandoNovaCat(true);
    try {
      const novaCat = {
        id: uuidv7(),
        nome: novaCatNome.trim(),
        ehEspecial: false
      };
      await salvarCategoriaDespesa(novaCat);
      toast.sucesso('Categoria cadastrada com sucesso!');
      
      const catAtualizadas = await listarCategoriasDespesa();
      setCategorias(catAtualizadas.filter((x) => x.nome.toLowerCase() !== 'perda'));
      setCategoriaId(novaCat.id);
      
      setMostrandoNovaCat(false);
      setNovaCatNome('');
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao cadastrar categoria.');
    } finally {
      setSalvandoNovaCat(false);
    }
  }

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    (async () => {
      try {
        const [c, cat] = await Promise.all([listarContasCompletas(), listarCategoriasDespesa()]);
        if (!ativo) return;
        const ativas = c.filter((x) => x.ativo);
        setContas(ativas);
        setCategorias(cat.filter((x) => x.nome.toLowerCase() !== 'perda'));
        
        if (despesaEdicao) {
          setContaId(despesaEdicao.contaId ?? '');
          setCategoriaId(despesaEdicao.categoriaDespesaId ?? '');
          setValorStr((Number(despesaEdicao.valorCentavos) / 100).toFixed(2).replace('.', ','));
          setFormaPagamento(despesaEdicao.formaPagamento ?? '');
          setDescricao(despesaEdicao.descricao ?? '');
          setTagsStr(despesaEdicao.tags.join(', '));
          setDataLancamento(diaIso(despesaEdicao.dataHora));
        } else {
          limpar();
          setDataLancamento(data ?? hojeManaus());
          if (contaPadraoTipo) {
            const padrao = ativas.find((x) => x.tipo === contaPadraoTipo);
            if (padrao) setContaId(padrao.id);
          }
        }
      } catch (e) {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar contas e categorias.');
      }
    })();
    return () => {
      ativo = false;
    };
  }, [aberto, despesaEdicao, data, contaPadraoTipo, toast]);

  function limpar() {
    setContaId('');
    setCategoriaId('');
    setValorStr('');
    setFormaPagamento(formaPadrao ?? '');
    setDescricao('');
    setTagsStr('');
    setDataLancamento(data ?? hojeManaus());
  }

  async function executarGravacao(
    cId: string,
    catId: string,
    val: Centavos,
    dtHr: string,
    forma: string,
    desc: string,
    tg: string[],
    clientOverride?: SupabaseClient
  ) {
    try {
      if (despesaEdicao) {
        await atualizarDespesa(
          despesaEdicao.id,
          cId,
          catId,
          val,
          dtHr,
          forma,
          desc,
          tg,
          usuarioId,
          clientOverride
        );
        toast.sucesso('Despesa alterada com sucesso.');
      } else {
        await lancarDespesa(
          uuidv7(),
          cId,
          catId,
          val,
          dtHr,
          forma,
          desc,
          tg,
          usuarioId,
          clientOverride
        );
        toast.sucesso('Despesa lançada com sucesso.');
      }
      aoFechar();
      limpar();
      aoSalvo();
    } catch (e) {
      console.error(e);
      toast.erro(despesaEdicao ? 'Erro ao atualizar a despesa.' : 'Erro ao lançar a despesa.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    if (!contaId || !categoriaId || !formaPagamento) {
      toast.erro('Preencha conta, categoria e forma de pagamento.');
      return;
    }
    const valor = parseReais(valorStr);
    if (valor <= 0n) {
      toast.erro('Informe um valor válido.');
      return;
    }

    const dataHoraObj = agoraNaDataManaus(dataLancamento);
    const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [];

    setSalvando(true);
    try {
      // Verificar se a data do caixa está fechada
      const statusFechamento = await verificarFechamentoStatus(dataLancamento);
      const isFechado = statusFechamento === 'travado';

      if (isFechado) {
        // Se estiver fechado, verificar se o usuário logado possui a permissão de gerente
        const temPermissaoRetroativa =
          usuario?.permissoes?.has('editar_lancamentos_retroativos') ||
          usuario?.permissoes?.has('reabrir_fechamento');

        if (temPermissaoRetroativa) {
          const confirmar = window.confirm(
            `Atenção: o caixa de ${formatarDataBR(dataLancamento)} já está fechado. Deseja prosseguir com esta gravação?`
          );
          if (!confirmar) {
            setSalvando(false);
            return;
          }
          await executarGravacao(contaId, categoriaId, valor, dataHoraObj, formaPagamento, descricao, tags);
        } else {
          // Solicitar autorização de gerente
          setDadosAConfirmar({
            contaId,
            categoriaId,
            valor,
            dataHora: dataHoraObj,
            formaPagamento,
            descricao,
            tags,
          });
          setModalAutorizarAberto(true);
          setSalvando(false);
        }
      } else {
        // Caixa aberto, grava normalmente
        await executarGravacao(contaId, categoriaId, valor, dataHoraObj, formaPagamento, descricao, tags);
      }
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao validar status do caixa.');
      setSalvando(false);
    }
  }

  return (
    <>
      <Modal
        aberto={aberto}
        aoFechar={aoFechar}
        titulo={despesaEdicao ? 'Editar despesa' : 'Nova despesa'}
        descricao={despesaEdicao ? 'Altere as informações do pagamento.' : 'Registre um pagamento. O valor sai da conta de origem.'}
      >
        <form onSubmit={aoSalvar} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Data da despesa" obrigatorio>
              <input
                type="date"
                className={CLASSE_CAMPO}
                value={dataLancamento}
                onChange={(e) => setDataLancamento(e.target.value)}
              />
            </Campo>
            <Campo label="Conta de origem" obrigatorio>
              <select aria-label="Conta de origem" className={CLASSE_CAMPO} value={contaId} onChange={(e) => setContaId(e.target.value)}>
                <option value="">De onde saiu?</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.tipo})
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Categoria" obrigatorio>
              {!mostrandoNovaCat ? (
                <div className="flex gap-2">
                  <select
                    aria-label="Categoria"
                    className={CLASSE_CAMPO}
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(e.target.value)}
                  >
                    <option value="">Tipo da despesa</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setMostrandoNovaCat(true)}
                    className="btn bg-claro/5 text-claro border border-borda hover:bg-claro/10 px-3 flex items-center justify-center font-bold text-lg"
                    title="Cadastrar Nova Categoria"
                  >
                    +
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 w-full">
                  <input
                    type="text"
                    className={CLASSE_CAMPO}
                    placeholder="Nome da categoria..."
                    value={novaCatNome}
                    onChange={(e) => setNovaCatNome(e.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={aoSalvarNovaCat}
                      disabled={salvandoNovaCat}
                      className="btn btn-primario px-3 py-1 text-xs"
                    >
                      {salvandoNovaCat ? '...' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMostrandoNovaCat(false);
                        setNovaCatNome('');
                      }}
                      className="btn btn-suave px-3 py-1 text-xs"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </Campo>
            <Campo label="Forma de pagamento" obrigatorio>
              <select aria-label="Forma de pagamento" className={CLASSE_CAMPO} value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                <option value="">Selecione…</option>
                {Object.entries(FORMAS_PAGAMENTO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Valor (R$)" obrigatorio>
              <input
                inputMode="decimal"
                className={`${CLASSE_CAMPO} numeros text-right`}
                placeholder="0,00"
                value={valorStr}
                onChange={(e) => setValorStr(e.target.value)}
              />
            </Campo>
            <Campo label="Tags" dica="Separadas por vírgula. Ex.: luz, manutenção">
              <input
                className={CLASSE_CAMPO}
                placeholder="luz, manutenção, junho"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
              />
            </Campo>
          </div>
          <Campo label="Descrição">
            <input
              className={CLASSE_CAMPO}
              placeholder="Ex.: Conta de luz / Compra de gelo"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </Campo>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
              {salvando ? 'Salvando…' : despesaEdicao ? 'Salvar alterações' : 'Lançar despesa'}
            </button>
          </div>
        </form>
      </Modal>

      <AutorizacaoGerenteModal
        aberto={modalAutorizarAberto}
        aoFechar={() => setModalAutorizarAberto(false)}
        permissaoRequerida="editar_lancamentos_retroativos"
        aoAutorizado={(managerClient) => {
          if (dadosAConfirmar) {
            setSalvando(true);
            void executarGravacao(
              dadosAConfirmar.contaId,
              dadosAConfirmar.categoriaId,
              dadosAConfirmar.valor,
              dadosAConfirmar.dataHora,
              dadosAConfirmar.formaPagamento,
              dadosAConfirmar.descricao,
              dadosAConfirmar.tags,
              managerClient
            );
          }
        }}
      />
    </>
  );
}
