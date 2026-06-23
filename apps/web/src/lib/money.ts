/**
 * money — dinheiro em centavos (§0 da spec).
 *
 * REGRA INVIOLÁVEL: dinheiro NUNCA é float. Sempre centavos como `bigint`
 * (tipo branded `Centavos`). Toda formatação para Real (R$) acontece só na
 * borda de exibição (`formatReais`). A entrada vinda de texto passa por
 * `parseReais`, que faz aritmética inteira (sem `parseFloat`).
 *
 * Este arquivo está sob a regra ESLint `no-float-money` (sem float, sem
 * literais decimais).
 */

/** Valor monetário em centavos. Inteiro, com sinal (+ entra, − sai). */
export type Centavos = bigint & { readonly __brand: 'Centavos' };

/** Marca um `bigint` como `Centavos`. Único ponto de "construção" do tipo. */
export function asCentavos(valor: bigint): Centavos {
  return valor as Centavos;
}

export const ZERO: Centavos = asCentavos(0n);

/**
 * Converte texto em formato brasileiro ("R$ 1.234,56", "1234,5", "-50")
 * para `Centavos`, usando apenas aritmética inteira.
 */
export function parseReais(texto: string): Centavos {
  const bruto = texto.trim();
  const negativo = bruto.includes('-');
  const soNumeros = bruto.replace(/[^0-9.,]/g, '');
  const semMilhar = soNumeros.replace(/\./g, ''); // remove separador de milhar
  const partes = semMilhar.split(',');
  const parteInteira = partes[0] === '' || partes[0] === undefined ? '0' : partes[0];
  const parteDecimalBruta = partes.length > 1 ? (partes[1] ?? '') : '';
  const parteDecimal = (parteDecimalBruta + '00').slice(0, 2);
  const valor = BigInt(`${parteInteira}${parteDecimal}` || '0');
  return asCentavos(negativo ? -valor : valor);
}

/** Formata `Centavos` para Real brasileiro: 123456n → "R$ 1.234,56". */
export function formatReais(valor: Centavos): string {
  const negativo = valor < 0n;
  const abs = negativo ? -valor : valor;
  const centavosStr = (abs % 100n).toString().padStart(2, '0');
  const inteirosStr = (abs / 100n).toString();
  const comMilhar = inteirosStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}R$ ${comMilhar},${centavosStr}`;
}

/** Soma uma lista de `Centavos`. */
export function somar(...valores: Centavos[]): Centavos {
  return asCentavos(valores.reduce((acc, v) => acc + v, 0n));
}

/** Subtrai: a − b. */
export function subtrair(a: Centavos, b: Centavos): Centavos {
  return asCentavos(a - b);
}

/** Inverte o sinal. */
export function negar(a: Centavos): Centavos {
  return asCentavos(-a);
}

/** Multiplica um valor por um escalar inteiro (ex.: preço unitário × quantidade). */
export function multiplicarPorEscalar(valor: Centavos, escalar: bigint): Centavos {
  return asCentavos(valor * escalar);
}

/**
 * Divisão inteira com arredondamento half-up por magnitude (0,5 sobe).
 * Mantém o sinal correto. Usado em percentuais e rateios.
 */
export function arredondarDivisao(numerador: bigint, denominador: bigint): bigint {
  if (denominador === 0n) throw new Error('Divisão por zero.');
  const sinalNegativo = numerador < 0n !== denominador < 0n;
  const n = numerador < 0n ? -numerador : numerador;
  const d = denominador < 0n ? -denominador : denominador;
  const quociente = n / d;
  const resto = n % d;
  const arredondado = resto * 2n >= d ? quociente + 1n : quociente;
  return sinalNegativo ? -arredondado : arredondado;
}

/**
 * Aplica um percentual expresso em basis points (1% = 100 bp; 3% = 300 bp).
 * Arredondamento half-up. Ex.: aplicarPercentual(R$100, 300) = R$3,00.
 */
export function aplicarPercentual(base: Centavos, basisPoints: bigint): Centavos {
  return asCentavos(arredondarDivisao(base * basisPoints, 10000n));
}
