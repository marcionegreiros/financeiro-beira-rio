/**
 * Conversão na BORDA: valores que vêm do banco (number/string em JSON) viram
 * tipos do domínio (bigint). É aqui — e só aqui — que float do transporte é
 * transformado em inteiro. O domínio nunca vê float (§0 da spec).
 *
 * (Este arquivo fica fora da regra ESLint no-float-money de propósito: a
 * conversão da borda precisa tocar em number antes de virar bigint.)
 */
import { asCentavos, type Centavos } from '../lib/money';
import { asMililitros, asQuantidade, type Mililitros, type Quantidade } from '../domain/tipos';

const ML_POR_LITRO = 1000;

// ---- Banco → domínio (entrada) ------------------------------------------------

/** number/string (centavos inteiros) → Centavos. */
export function paraCentavos(valor: number | string | null | undefined): Centavos {
  if (valor === null || valor === undefined) return asCentavos(0n);
  const valorStr = String(valor).trim().replace(',', '.');
  if (valorStr === '') return asCentavos(0n);
  const num = Number(valorStr);
  if (isNaN(num)) return asCentavos(0n);
  return asCentavos(BigInt(Math.round(num)));
}

/** litros (numeric, possivelmente fracionário) → Mililitros (inteiro). */
export function litrosParaMililitros(litros: number | string | null | undefined): Mililitros {
  if (litros === null || litros === undefined) return asMililitros(0n);
  const valorStr = String(litros).trim().replace(/\./g, '').replace(',', '.');
  if (valorStr === '') return asMililitros(0n);
  const num = Number(valorStr);
  if (isNaN(num)) return asMililitros(0n);
  return asMililitros(BigInt(Math.round(num * ML_POR_LITRO)));
}

/** quantidade (numeric) → Quantidade (inteiro na v1). */
export function paraQuantidade(valor: number | string | null | undefined): Quantidade {
  if (valor === null || valor === undefined) return asQuantidade(0n);
  const valorStr = String(valor).trim().replace(/\./g, '').replace(',', '.');
  if (valorStr === '') return asQuantidade(0n);
  const num = Number(valorStr);
  if (isNaN(num)) return asQuantidade(0n);
  return asQuantidade(BigInt(Math.round(num)));
}

// ---- Domínio → banco (saída/persistência) ------------------------------------
// JSON não carrega bigint; convertemos no momento de gravar (magnitudes seguras).

export function centavosParaNumero(valor: Centavos): number {
  return Number(valor);
}

export function mililitrosParaLitros(valor: Mililitros): number {
  return Number(valor) / ML_POR_LITRO;
}

export function quantidadeParaNumero(valor: Quantidade): number {
  return Number(valor);
}
