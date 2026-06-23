/**
 * tanque — nível calculado e divergência (§3.2 da spec).
 *
 * O nível do tanque é uma RECONCILIAÇÃO PARALELA à venda por encerrante:
 *   nivel_calculado = nivel_anterior + entradas_litros − litros_vendidos
 *   divergencia     = nivel_medido (régua) − nivel_calculado
 *
 * A divergência é o sinal de vazamento/evaporação/furto/erro de bomba. Calculado
 * e medido CONVIVEM; um nunca sobrescreve o outro.
 */
import { asMililitros, type Mililitros } from './tipos';

export interface EntradaNivelTanque {
  nivelAnterior: Mililitros;
  entradas: Mililitros;
  litrosVendidos: Mililitros;
}

/** nivel_calculado = nivel_anterior + entradas − litros_vendidos. */
export function nivelCalculado(entrada: EntradaNivelTanque): Mililitros {
  return asMililitros(entrada.nivelAnterior + entrada.entradas - entrada.litrosVendidos);
}

/** divergencia = nivel_medido − nivel_calculado (positivo = sobrou na régua). */
export function divergenciaTanque(medido: Mililitros, calculado: Mililitros): Mililitros {
  return asMililitros(medido - calculado);
}
