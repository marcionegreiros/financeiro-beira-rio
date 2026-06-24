/**
 * caixa — a equação do caixa (§3.3 da spec).
 *
 * `dinheiroEsperado` é o quanto o sistema espera encontrar EM ESPÉCIE na gaveta
 * quando o vendedor a conta. Tudo que não vira dinheiro na gaveta é subtraído da
 * venda física (fiado concedido, PIX, cartões), assim como todo dinheiro que
 * saiu da gaveta durante o dia (despesas, pró-labore e vales pagos em dinheiro).
 * Soma-se o que entrou em dinheiro (recebimento de fiado) e o troco fixo.
 *
 * Regra geral de caixa (§3.3): QUALQUER dinheiro que sai da gaveta no dia entra
 * como saída no esperado, independente de como afeta o capital. Efeito-caixa e
 * efeito-capital são contas separadas.
 */
import { somar, subtrair, type Centavos } from '../lib/money';

const ZERO = 0n as Centavos;

export interface EntradaCaixa {
  /** venda física do dia (combustível + produtos). */
  vendaFisica: Centavos;
  fiadoConcedido?: Centavos;
  pix?: Centavos;
  cartaoDebito?: Centavos;
  cartaoCredito?: Centavos;
  despesasDinheiro?: Centavos;
  prolaboreDinheiro?: Centavos;
  valesDinheiro?: Centavos;
  recebimentosFiadoDinheiro?: Centavos;
  trocoFixo?: Centavos;
}

/** dinheiro_esperado na gaveta, conforme a equação §3.3. */
export function dinheiroEsperado(e: EntradaCaixa): Centavos {
  const saidas = somar(
    e.fiadoConcedido ?? ZERO,
    e.pix ?? ZERO,
    e.cartaoDebito ?? ZERO,
    e.cartaoCredito ?? ZERO,
    e.despesasDinheiro ?? ZERO,
    e.prolaboreDinheiro ?? ZERO,
    e.valesDinheiro ?? ZERO,
  );
  const entradas = somar(e.vendaFisica, e.recebimentosFiadoDinheiro ?? ZERO, e.trocoFixo ?? ZERO);
  return subtrair(entradas, saidas);
}

/**
 * diferença = dinheiro_contado − dinheiro_esperado.
 * Positiva = sobra; negativa = falta. Registrada na categoria própria
 * "Diferença de caixa", nunca diluída em despesa (§2 e §3.4).
 */
export function diferencaCaixa(dinheiroContado: Centavos, esperado: Centavos): Centavos {
  return subtrair(dinheiroContado, esperado);
}

/** Uma despesa do dia, vinda do livro financeiro (magnitude positiva). */
export interface DespesaDoDia {
  valor: Centavos;
  formaPagamento: string | null;
}

/**
 * Soma SÓ as despesas pagas em dinheiro — as únicas que saem da gaveta e, por
 * isso, reduzem o `dinheiro_esperado` (§3.3). Despesas em PIX/cartão afetam o
 * banco, não a gaveta, então não entram aqui (mas constam no relatório do dia).
 */
export function totalDespesasDinheiro(despesas: readonly DespesaDoDia[]): Centavos {
  return somar(...despesas.filter((d) => d.formaPagamento === 'dinheiro').map((d) => d.valor));
}
