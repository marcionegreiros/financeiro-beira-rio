import { useState, useEffect, type FormEvent } from 'react';
import {
  listarSocios,
  listarContasCompletas,
  lancarOperacaoSocio,
  type Socio,
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

export type TipoOperacaoSocio = 'aporte_emprestimo' | 'aporte_aumento' | 'devolucao_emprestimo' | 'prolabore';

export const OPERACOES_SOCIO: Record<TipoOperacaoSocio, { label: string; entrada: boolean }> = {
  aporte_emprestimo: { label: 'Aporte (empréstimo)', entrada: true },
  aporte_aumento: { label: 'Aporte (capital)', entrada: true },
  devolucao_emprestimo: { label: 'Devolução', entrada: false },
  prolabore: { label: 'Pró-labore', entrada: false },
};

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  usuarioId: string;
  /** Quando editando uma operação existente. */
  operacaoEdicao?: MovimentoLista | null;
  /** Restringe aos tipos de SAÍDA (pró-labore/devolução) — usado na janela Saídas. */
  somenteSaidas?: boolean;
  aoSalvo: () => void;
}

/**
 * Modal reutilizável de OPERAÇÃO DE SÓCIO. Usado na tela Sócios (todos os tipos) e
 * na janela Saídas (só saídas). A lógica fica em `lancarOperacaoSocio` (que gera a
 * tarifa de PIX nas saídas por PIX de banco); aqui é só o formulário.
 */
export function OperacaoSocioModal({ aberto, aoFechar, usuarioId, operacaoEdicao, somenteSaidas, aoSalvo }: Props) {
  const toast = useToast();
  const [socios, setSocios] = useState<Socio[]>([]);
  const [contas, setContas] = useState<ContaCompleta[]>([]);

  const tiposDisponiveis = (Object.keys(OPERACOES_SOCIO) as TipoOperacaoSocio[]).filter(
    (t) => !somenteSaidas || !OPERACOES_SOCIO[t].entrada,
  );

  const [socioId, setSocioId] = useState('');
  const [contaId, setContaId] = useState('');
  const [tipoOperacao, setTipoOperacao] = useState<TipoOperacaoSocio>('prolabore');
  const [forma, setForma] = useState('pix');
  const [valorStr, setValorStr] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataHora, setDataHora] = useState(() => agoraManausISO().slice(0, 16));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    (async () => {
      try {
        const [ss, cs] = await Promise.all([listarSocios(), listarContasCompletas()]);
        if (!ativo) return;
        setSocios(ss);
        const contasAtivas = cs.filter((c) => c.ativo);
        setContas(contasAtivas);

        if (operacaoEdicao) {
          setSocioId(operacaoEdicao.socioId ?? '');
          setContaId(operacaoEdicao.contaId ?? '');
          setTipoOperacao(operacaoEdicao.tipo as TipoOperacaoSocio);
          setValorStr(formatReais(operacaoEdicao.valorCentavos < 0n ? negar(operacaoEdicao.valorCentavos) : operacaoEdicao.valorCentavos).replace('R$ ', ''));
          setDataHora(operacaoEdicao.dataHora.slice(0, 16));
          setDescricao(operacaoEdicao.descricao ?? '');
          const tipo = contasAtivas.find((c) => c.id === operacaoEdicao.contaId)?.tipo;
          setForma(formaCoerente(operacaoEdicao.formaPagamento ?? 'pix', tipo));
        } else {
          setSocioId('');
          setContaId('');
          setTipoOperacao(somenteSaidas ? 'prolabore' : 'prolabore');
          setForma('pix');
          setValorStr('');
          setDescricao('');
          setDataHora(agoraManausISO().slice(0, 16));
        }
      } catch (e) {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar sócios e contas.');
      }
    })();
    return () => {
      ativo = false;
    };
  }, [aberto, operacaoEdicao, somenteSaidas, toast]);

  const ehSaida = !OPERACOES_SOCIO[tipoOperacao]?.entrada;

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    if (!socioId || !contaId) {
      toast.erro('Selecione o sócio e a conta.');
      return;
    }
    const valor = parseReais(valorStr);
    if (valor <= 0n) {
      toast.erro('Informe um valor válido.');
      return;
    }
    setSalvando(true);
    try {
      await lancarOperacaoSocio(
        operacaoEdicao?.id ?? uuidv7(),
        tipoOperacao,
        socioId,
        contaId,
        valor,
        `${dataHora}:00-04:00`,
        descricao,
        usuarioId,
        forma,
      );
      toast.sucesso('Operação salva.');
      aoFechar();
      aoSalvo();
    } catch (e) {
      console.error(e);
      toast.erro('Erro ao salvar a operação.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={operacaoEdicao ? 'Editar operação de sócio' : somenteSaidas ? 'Retirada de sócio' : 'Nova operação de sócio'}
      descricao={somenteSaidas ? 'Pró-labore e devoluções saem da conta escolhida.' : 'Aportes aumentam o caixa; pró-labore e devoluções reduzem.'}
    >
      <form onSubmit={aoSalvar} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Sócio" obrigatorio>
            <select aria-label="Sócio" className={CLASSE_CAMPO} value={socioId} onChange={(e) => setSocioId(e.target.value)}>
              <option value="">Selecione…</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Tipo de operação" obrigatorio>
            <select
              aria-label="Tipo de operação"
              className={CLASSE_CAMPO}
              value={tipoOperacao}
              onChange={(e) => setTipoOperacao(e.target.value as TipoOperacaoSocio)}
            >
              {tiposDisponiveis.map((k) => (
                <option key={k} value={k}>
                  {OPERACOES_SOCIO[k].label}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Data e Hora" obrigatorio>
            <input type="datetime-local" className={CLASSE_CAMPO} value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
          </Campo>
          <Campo label="Conta impactada" obrigatorio>
            <select
              aria-label="Conta impactada"
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
          <Campo label="Valor (R$)" obrigatorio>
            <input
              inputMode="decimal"
              className={`${CLASSE_CAMPO} numeros text-right`}
              placeholder="0,00"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
            />
          </Campo>
          {ehSaida && (
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
          )}
        </div>
        <Campo label="Descrição">
          <input
            className={CLASSE_CAMPO}
            placeholder="Ex.: Retirada mensal ref. junho"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </Campo>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
            {salvando ? 'Salvando…' : 'Registrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
