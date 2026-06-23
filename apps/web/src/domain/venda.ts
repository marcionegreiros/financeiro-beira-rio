/**
 * venda — cálculo da venda física (§3.2 e §3.3 da spec).
 *
 * Assimetria fundamental combustível × produto:
 *  - Combustível: venda = diferença de encerrante (leitura cumulativa). A
 *    ENTRADA de combustível NÃO entra na conta da venda (já é a diferença).
 *  - Produto (contagem): venda = anterior + entradas − atual − perdas. A
 *    ENTRADA de mercadoria ENTRA; a PERDA ENTRA como baixa (senão vira venda
 *    fantasma).
 *  - Produto (individual): a soma das vendas avulsas É a venda oficial.
 */
import {
  arredondarDivisao,
  asCentavos,
  multiplicarPorEscalar,
  somar,
  type Centavos,
} from '../lib/money';
import { asMililitros, type Mililitros, type Quantidade } from './tipos';

const ML_POR_LITRO = 1000n;

export interface EntradaCombustivel {
  leituraAnterior: Mililitros;
  leituraAtual: Mililitros;
  precoCentavosPorLitro: Centavos;
}

export interface ResultadoCombustivel {
  litrosMl: Mililitros;
  valorCentavos: Centavos;
}

/**
 * Venda de combustível pela diferença de encerrante.
 * litros_vendidos = leitura_atual − leitura_anterior; valor = litros × preço/L.
 */
export function vendaCombustivel(entrada: EntradaCombustivel): ResultadoCombustivel {
  const { leituraAnterior, leituraAtual, precoCentavosPorLitro } = entrada;
  if (leituraAtual < leituraAnterior) {
    throw new Error('Encerrante não pode diminuir (leitura é cumulativa e crescente).');
  }
  const litrosMl = asMililitros(leituraAtual - leituraAnterior);
  const valorCentavos = asCentavos(
    arredondarDivisao(litrosMl * precoCentavosPorLitro, ML_POR_LITRO),
  );
  return { litrosMl, valorCentavos };
}

export interface EntradaProdutoContagem {
  estoqueAnterior: Quantidade;
  entradas: Quantidade;
  estoqueAtual: Quantidade;
  perdas: Quantidade;
  precoCentavos: Centavos;
}

export interface ResultadoProduto {
  vendido: Quantidade;
  valorCentavos: Centavos;
}

/**
 * Venda de produto no modo contagem.
 * vendido = anterior + entradas − atual − perdas.
 */
export function vendaProdutoContagem(entrada: EntradaProdutoContagem): ResultadoProduto {
  const { estoqueAnterior, entradas, estoqueAtual, perdas, precoCentavos } = entrada;
  const vendido = (estoqueAnterior + entradas - estoqueAtual - perdas) as Quantidade;
  const valorCentavos = multiplicarPorEscalar(precoCentavos, vendido);
  return { vendido, valorCentavos };
}

/** Venda de produto no modo individual: a soma das avulsas É a venda oficial. */
export function vendaProdutoIndividual(vendasAvulsas: Centavos[]): Centavos {
  return somar(...vendasAvulsas);
}

export interface PartesVendaFisica {
  combustivel?: Centavos;
  contagem?: Centavos;
  individual?: Centavos;
}

/** venda_fisica = combustível + produtos(contagem) + produtos(individual). */
export function vendaFisica(partes: PartesVendaFisica): Centavos {
  return somar(
    partes.combustivel ?? asCentavos(0n),
    partes.contagem ?? asCentavos(0n),
    partes.individual ?? asCentavos(0n),
  );
}
