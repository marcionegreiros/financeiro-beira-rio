/**
 * precos — resolução de preço/custo vigente por data (§5.6 e §3.5 da spec).
 *
 * Preço e custo têm HISTÓRICO por data (`valido_a_partir_de`). Alterar preço ou
 * custo NÃO reescreve fechamentos passados: cada fechamento usa o valor que
 * estava vigente na sua data. O preço é versionado por `date`; o custo por
 * `timestamptz` (controle fino do gerente).
 *
 * Comparação por string ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ssZ) é
 * lexicograficamente equivalente à ordem cronológica.
 */
import type { Centavos } from '../lib/money';

export interface RegistroVigencia {
  valorCentavos: Centavos;
  /** ISO: "YYYY-MM-DD" (preço) ou "YYYY-MM-DDTHH:mm:ss-04:00" (custo). */
  validoApartirDe: string;
}

/**
 * Retorna o valor vigente no momento dado: o registro mais recente cujo
 * `validoApartirDe` é <= `momento`. Se nenhum se aplica, retorna `undefined`.
 */
export function valorVigenteEm(
  historico: readonly RegistroVigencia[],
  momento: string,
): Centavos | undefined {
  let escolhido: RegistroVigencia | undefined;
  for (const registro of historico) {
    if (registro.validoApartirDe <= momento) {
      if (escolhido === undefined || registro.validoApartirDe > escolhido.validoApartirDe) {
        escolhido = registro;
      }
    }
  }
  return escolhido?.valorCentavos;
}

/** Preço vigente numa data (YYYY-MM-DD). */
export function precoVigenteEm(
  historico: readonly RegistroVigencia[],
  data: string,
): Centavos | undefined {
  return valorVigenteEm(historico, data);
}

/** Custo vigente num instante (timestamp ISO). */
export function custoVigenteEm(
  historico: readonly RegistroVigencia[],
  momento: string,
): Centavos | undefined {
  return valorVigenteEm(historico, momento);
}
