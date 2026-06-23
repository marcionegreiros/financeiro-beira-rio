/**
 * Conversão na BORDA: valores que vêm do banco (number/string em JSON) viram
 * tipos do domínio (bigint). É aqui — e só aqui — que float do transporte é
 * transformado em inteiro. O domínio nunca vê float (§0 da spec).
 *
 * (Este arquivo fica fora da regra ESLint no-float-money de propósito: a
 * conversão da borda precisa tocar em number antes de virar bigint.)
 */
import { asCentavos, type Centavos } from '../lib/money';
import { asMililitros, type Mililitros } from '../domain/tipos';

/** number/string (centavos inteiros) → Centavos. */
export function paraCentavos(valor: number | string | null | undefined): Centavos {
  if (valor === null || valor === undefined) return asCentavos(0n);
  return asCentavos(BigInt(Math.round(Number(valor))));
}

/** litros (numeric, possivelmente fracionário) → Mililitros (inteiro). */
export function litrosParaMililitros(litros: number | string | null | undefined): Mililitros {
  if (litros === null || litros === undefined) return asMililitros(0n);
  return asMililitros(BigInt(Math.round(Number(litros) * 1000)));
}
