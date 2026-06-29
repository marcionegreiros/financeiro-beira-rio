/**
 * taxaCartao — resolução da taxa de cartão vigente por data (§3.6 + histórico §5.6).
 *
 * A taxa (percentual em basis points + parte fixa em centavos) tem HISTÓRICO por
 * DATA (`valido_a_partir_de`), igual a preço/custo. Renegociar a taxa NÃO reescreve
 * fechamentos passados: cada fechamento usa a taxa que estava vigente na sua data.
 * Quando não há vigência aplicável, a taxa é zero (sem desconto) — nunca falha.
 *
 * Comparação por string ISO (YYYY-MM-DD) é lexicograficamente equivalente à ordem
 * cronológica.
 */
import { asCentavos, type Centavos } from '../lib/money';

export interface RegistroTaxa {
  /** taxa percentual em basis points (3% = 300). */
  percentualBp: bigint;
  /** parte fixa por transação, em centavos. */
  fixa: Centavos;
  /** ISO "YYYY-MM-DD". */
  validoApartirDe: string;
}

export interface TaxaVigente {
  percentualBp: bigint;
  fixa: Centavos;
}

const SEM_TAXA: TaxaVigente = { percentualBp: 0n, fixa: asCentavos(0n) };

/**
 * Retorna a taxa vigente numa data: o registro mais recente cujo `validoApartirDe`
 * é <= `data`. Se nenhum se aplica (ou histórico vazio), retorna taxa zero.
 */
export function taxaCartaoVigenteEm(
  historico: readonly RegistroTaxa[],
  data: string,
): TaxaVigente {
  let escolhido: RegistroTaxa | undefined;
  for (const registro of historico) {
    if (registro.validoApartirDe <= data) {
      if (escolhido === undefined || registro.validoApartirDe > escolhido.validoApartirDe) {
        escolhido = registro;
      }
    }
  }
  if (!escolhido) return SEM_TAXA;
  return { percentualBp: escolhido.percentualBp, fixa: escolhido.fixa };
}
