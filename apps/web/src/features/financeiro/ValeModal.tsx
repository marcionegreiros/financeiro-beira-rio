import { useState, useEffect, type FormEvent } from 'react';
import {
  listarFuncionarios,
  listarContasCompletas,
  lancarVale,
  type Funcionario,
  type ContaCompleta,
  type MovimentoLista,
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { parseReais, formatReais, negar } from '../../lib/money';
import { FORMAS_PAGAMENTO, formasParaConta, formaCoerente } from '../../lib/formasPagamento';
import { agoraManausISO } from '../../lib/datas';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  usuarioId: string;
  /** Quando editando um vale existente. */
  valeEdicao?: MovimentoLista | null;
  /** Pré-seleciona e trava o funcionário (ex.: aberto a partir de uma linha da Folha). */
  funcionarioFixo?: Funcionario | null;
  aoSalvo: () => void;
}

/**
 * Modal reutilizável de VALE (adiantamento ao funcionário). Usado na Folha e na
 * janela Saídas. A lógica financeira fica em `lancarVale` (que ainda gera a tarifa
 * de PIX quando for PIX de banco); aqui é só o formulário.
 */
export function ValeModal({ aberto, aoFechar, usuarioId, valeEdicao, funcionarioFixo, aoSalvo }: Props) {
  const toast = useToast();
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [contas, setContas] = useState<ContaCompleta[]>([]);

  const [funcionarioId, setFuncionarioId] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataHora, setDataHora] = useState(() => agoraManausISO().slice(0, 16));
  const [contaId, setContaId] = useState('');
  const [forma, setForma] = useState('dinheiro');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    (async () => {
      try {
        const [funcs, cs] = await Promise.all([listarFuncionarios(), listarContasCompletas()]);
        if (!ativo) return;
        setFuncionarios(funcs);
        const contasAtivas = cs.filter((c) => c.ativo);
        setContas(contasAtivas);
        const caixaPadrao = contasAtivas.find((c) => c.tipo === 'dinheiro');

        if (valeEdicao) {
          setFuncionarioId(valeEdicao.funcionarioId ?? '');
          setValorStr(formatReais(valeEdicao.valorCentavos < 0n ? negar(valeEdicao.valorCentavos) : valeEdicao.valorCentavos).replace('R$ ', ''));
          setDataHora(valeEdicao.dataHora.slice(0, 16));
          setDescricao(valeEdicao.descricao ?? '');
          setContaId(valeEdicao.contaId ?? '');
          const tipo = contasAtivas.find((c) => c.id === valeEdicao.contaId)?.tipo;
          setForma(formaCoerente(valeEdicao.formaPagamento ?? 'dinheiro', tipo));
        } else {
          setFuncionarioId(funcionarioFixo?.id ?? '');
          setValorStr('');
          setDescricao('');
          setDataHora(agoraManausISO().slice(0, 16));
          setContaId(caixaPadrao?.id ?? '');
          setForma('dinheiro');
        }
      } catch (e) {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar funcionários e contas.');
      }
    })();
    return () => {
      ativo = false;
    };
  }, [aberto, valeEdicao, funcionarioFixo, toast]);

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    if (!funcionarioId) {
      toast.erro('Selecione o funcionário.');
      return;
    }
    if (!contaId) {
      toast.erro('Selecione a conta de origem.');
      return;
    }
    const valor = parseReais(valorStr);
    if (valor <= 0n) {
      toast.erro('Informe um valor válido.');
      return;
    }
    setSalvando(true);
    try {
      const fNome = funcionarios.find((x) => x.id === funcionarioId)?.nome ?? 'Funcionário';
      await lancarVale(
        valeEdicao?.id ?? uuidv7(),
        funcionarioId,
        contaId,
        valor,
        `${dataHora}:00-04:00`,
        descricao.trim() || `Vale — ${fNome}`,
        usuarioId,
        forma,
      );
      toast.sucesso('Vale salvo.');
      aoFechar();
      aoSalvo();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao lançar o vale.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={valeEdicao ? 'Editar vale' : 'Lançar vale'}
      descricao="Adiantamento que sai da conta hoje e desconta do salário no fechamento do mês."
    >
      <form onSubmit={aoSalvar} className="flex flex-col gap-4">
        {funcionarioFixo ? (
          <p className="text-sm text-suave">
            Funcionário: <span className="font-medium text-claro">{funcionarioFixo.nome}</span>
          </p>
        ) : (
          <Campo label="Funcionário" obrigatorio>
            <select
              aria-label="Funcionário"
              className={CLASSE_CAMPO}
              value={funcionarioId}
              onChange={(e) => setFuncionarioId(e.target.value)}
            >
              <option value="">Selecione o funcionário...</option>
              {funcionarios.filter((x) => x.ativo).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Data e Hora" obrigatorio>
            <input type="datetime-local" className={CLASSE_CAMPO} value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
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
          <Campo label="Conta de origem" obrigatorio>
            <select
              aria-label="Conta de origem"
              className={CLASSE_CAMPO}
              value={contaId}
              onChange={(e) => {
                const nova = e.target.value;
                setContaId(nova);
                const tipo = contas.find((c) => c.id === nova)?.tipo;
                setForma((prev) => formaCoerente(prev, tipo));
              }}
            >
              <option value="">Selecione…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.tipo})
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            label="Forma de pagamento"
            dica="PIX de conta de banco com tarifa configurada gera a tarifa automática em Saídas."
          >
            <select aria-label="Forma de pagamento" className={CLASSE_CAMPO} value={forma} onChange={(e) => setForma(e.target.value)}>
              {formasParaConta(contas.find((c) => c.id === contaId)?.tipo).map((k) => (
                <option key={k} value={k}>
                  {FORMAS_PAGAMENTO[k]}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo label="Descrição">
          <input className={CLASSE_CAMPO} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Vale ref. quinzena" />
        </Campo>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
            {salvando ? 'Salvando…' : valeEdicao ? 'Salvar alterações' : 'Lançar vale'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
