/**
 * taxaPixConta — tarifa de PIX por CONTA de banco, vigente por DATA.
 *
 * Cada conta de banco tem a sua própria regra de tarifa cobrada quando há uma
 * transação PIX (sobre o valor enviado): um PERCENTUAL (basis points) limitado
 * por uma tarifa MÍNIMA e uma tarifa MÁXIMA, ambas em centavos. A regra tem
 * HISTÓRICO por DATA (`valido_a_partir_de`), igual a preço/custo e taxa de cartão:
 * renegociar a tarifa NÃO reescreve transações passadas — cada uma usa a regra
 * vigente na sua data. Sem vigência aplicável, a tarifa é zero (nunca falha).
 *
 * Convenção dos limites: `minimo`/`maximo` iguais a zero significam "sem limite"
 * naquele lado, para que uma configuração ainda incompleta se comporte de forma
 * previsível (Pilar 1 — tudo derivado, nada de saldo editável).
 *
 * Comparação por string ISO (YYYY-MM-DD) é lexicograficamente equivalente à ordem
 * cronológica.
 */
import { aplicarPercentual, asCentavos, type Centavos } from '../lib/money';

export interface RegistroTaxaPix {
  /** taxa percentual em basis points (1,45% = 145). */
  percentualBp: bigint;
  /** tarifa mínima por transação, em centavos (0 = sem mínimo). */
  minimo: Centavos;
  /** tarifa máxima por transação, em centavos (0 = sem máximo). */
  maximo: Centavos;
  /** ISO "YYYY-MM-DD". */
  validoApartirDe: string;
}

export interface TaxaPixVigente {
  percentualBp: bigint;
  minimo: Centavos;
  maximo: Centavos;
}

const SEM_TAXA: TaxaPixVigente = {
  percentualBp: 0n,
  minimo: asCentavos(0n),
  maximo: asCentavos(0n),
};

/**
 * Retorna a tarifa de PIX vigente numa data: o registro mais recente cujo
 * `validoApartirDe` é <= `data`. Se nenhum se aplica (ou histórico vazio),
 * retorna tarifa zero.
 */
export function taxaPixVigenteEm(
  historico: readonly RegistroTaxaPix[],
  data: string,
): TaxaPixVigente {
  let escolhido: RegistroTaxaPix | undefined;
  for (const registro of historico) {
    if (registro.validoApartirDe <= data) {
      if (escolhido === undefined || registro.validoApartirDe > escolhido.validoApartirDe) {
        escolhido = registro;
      }
    }
  }
  if (!escolhido) return SEM_TAXA;
  return {
    percentualBp: escolhido.percentualBp,
    minimo: escolhido.minimo,
    maximo: escolhido.maximo,
  };
}

/**
 * Tarifa cobrada num PIX: percentual sobre o valor enviado, "grampeado" entre a
 * tarifa mínima e a máxima. `minimo`/`maximo` zerados = sem aquele limite.
 * Valor enviado zero (ou negativo) → tarifa zero.
 */
export function tarifaPix(args: {
  valor: Centavos;
  percentualBp: bigint;
  minimo: Centavos;
  maximo: Centavos;
}): Centavos {
  if (args.valor <= 0n) return asCentavos(0n);
  let tarifa = aplicarPercentual(args.valor, args.percentualBp);
  if (args.minimo > 0n && tarifa < args.minimo) tarifa = args.minimo;
  if (args.maximo > 0n && tarifa > args.maximo) tarifa = args.maximo;
  return tarifa;
}
