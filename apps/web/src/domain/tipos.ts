/**
 * tipos — tipos branded compartilhados do núcleo de domínio.
 *
 * Tudo que é dinheiro ou volume é inteiro (`bigint`), nunca float (§0 da spec).
 * Os tipos branded fazem o compilador recusar a mistura acidental de um `number`
 * comum com dinheiro/volume — a defesa PRIMÁRIA contra float.
 */

export type { Centavos } from '../lib/money';

/** Volume em mililitros inteiros (1 L = 1000 mL). Encerrante e nível de tanque. */
export type Mililitros = bigint & { readonly __brand: 'Mililitros' };

/** Quantidade de produto contada/vendida. Inteira na v1 (unidade). */
export type Quantidade = bigint & { readonly __brand: 'Quantidade' };

const ML_POR_LITRO = 1000n;

export function asMililitros(valor: bigint): Mililitros {
  return valor as Mililitros;
}

/** Constrói `Mililitros` a partir de litros inteiros (ex.: leitura de bomba). */
export function litros(quantidadeLitros: bigint): Mililitros {
  return asMililitros(quantidadeLitros * ML_POR_LITRO);
}

export function asQuantidade(valor: bigint): Quantidade {
  return valor as Quantidade;
}

export function quantidade(valor: bigint): Quantidade {
  return asQuantidade(valor);
}

/** Formata mililitros para litros com 3 casas: 277000n → "277,000 L". */
export function formatLitros(valor: Mililitros): string {
  const negativo = valor < 0n;
  const abs = negativo ? -valor : valor;
  const inteiros = (abs / ML_POR_LITRO).toString();
  const resto = (abs % ML_POR_LITRO).toString().padStart(3, '0');
  return `${negativo ? '-' : ''}${inteiros},${resto} L`;
}
