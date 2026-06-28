import { useEffect, useState, type FormEvent } from 'react';
import {
  listarContasCompletas,
  listarCategoriasDespesa,
  lancarDespesa,
  salvarCategoriaDespesa,
  type ContaCompleta,
  type CategoriaDespesa,
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { parseReais } from '../../lib/money';
import { agoraNaDataManaus, hojeManaus } from '../../lib/datas';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';

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
  const [salvando, setSalvando] = useState(false);

  // Cadastrar nova categoria na hora
  const [mostrandoNovaCat, setMostrandoNovaCat] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState('');
  const [salvandoNovaCat, setSalvandoNovaCat] = useState(false);

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
        if (contaPadraoTipo) {
          const padrao = ativas.find((x) => x.tipo === contaPadraoTipo);
          if (padrao) setContaId((atual) => atual || padrao.id);
        }
      } catch (e) {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar contas e categorias.');
      }
    })();
    return () => {
      ativo = false;
    };
  }, [aberto, contaPadraoTipo, toast]);

  function limpar() {
    setContaId('');
    setCategoriaId('');
    setValorStr('');
    setFormaPagamento(formaPadrao ?? '');
    setDescricao('');
    setTagsStr('');
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
    setSalvando(true);
    try {
      const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [];
      await lancarDespesa(
        uuidv7(),
        contaId,
        categoriaId,
        valor,
        agoraNaDataManaus(data ?? hojeManaus()),
        formaPagamento,
        descricao,
        tags,
        usuarioId,
      );
      toast.sucesso('Despesa lançada com sucesso.');
      aoFechar();
      limpar();
      aoSalvo();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao lançar a despesa.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Nova despesa"
      descricao="Registre um pagamento. O valor sai da conta de origem."
    >
      <form onSubmit={aoSalvar} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <div className="flex gap-2">
                <input
                  type="text"
                  className={CLASSE_CAMPO}
                  placeholder="Nome da categoria..."
                  value={novaCatNome}
                  onChange={(e) => setNovaCatNome(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={aoSalvarNovaCat}
                  disabled={salvandoNovaCat}
                  className="btn btn-primario px-3 py-2 text-xs"
                >
                  {salvandoNovaCat ? '...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostrandoNovaCat(false);
                    setNovaCatNome('');
                  }}
                  className="btn btn-suave px-3 py-2 text-xs"
                >
                  Cancelar
                </button>
              </div>
            )}
          </Campo>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Campo label="Valor (R$)" obrigatorio>
            <input
              inputMode="decimal"
              className={`${CLASSE_CAMPO} numeros text-right`}
              placeholder="0,00"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
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
        <Campo label="Tags" dica="Separadas por vírgula. Ex.: luz, manutenção">
          <input
            className={CLASSE_CAMPO}
            placeholder="luz, manutenção, junho"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
          />
        </Campo>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
            {salvando ? 'Salvando…' : 'Lançar despesa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
