/**
 * capital — capital (patrimônio), custo médio e taxa de cartão (§3.5 e §3.6).
 *
 * Capital_total       = Ativos − Passivos
 * Capital_operacional = Capital_total − aumentos_de_capital_líquidos
 *
 * O painel mostra por padrão o operacional (o que o negócio gerou sozinho), com
 * toggle para o total (com aportes de aumento de capital somados).
 */
import {
  aplicarPercentual,
  arredondarDivisao,
  asCentavos,
  somar,
  subtrair,
  type Centavos,
} from '../lib/money';
import type { Quantidade } from './tipos';

export interface Ativos {
  saldosContas: Centavos;
  fiadoEmAberto: Centavos;
  valorEstoque: Centavos;
  valorCombustivel: Centavos;
}

export interface Passivos {
  emprestimosSocioEmAberto: Centavos;
  outrasDividas: Centavos;
}

/** Capital total = ativos − passivos (§3.5). */
export function capitalTotal(ativos: Ativos, passivos: Passivos): Centavos {
  const totalAtivos = somar(
    ativos.saldosContas,
    ativos.fiadoEmAberto,
    ativos.valorEstoque,
    ativos.valorCombustivel,
  );
  const totalPassivos = somar(passivos.emprestimosSocioEmAberto, passivos.outrasDividas);
  return subtrair(totalAtivos, totalPassivos);
}

/** Capital operacional = total − aumentos de capital líquidos (§3.5). */
export function capitalOperacional(total: Centavos, aumentosCapitalLiquidos: Centavos): Centavos {
  return subtrair(total, aumentosCapitalLiquidos);
}

export interface EntradaCartao {
  bruto: Centavos;
  /** taxa percentual em basis points (3% = 300). */
  percentualBp: bigint;
  taxaFixa: Centavos;
}

export interface ResultadoCartao {
  liquido: Centavos;
  taxa: Centavos;
}

/**
 * Taxa de cartão (§3.6): líquido_no_banco = bruto − (bruto × percentual) − taxa_fixa.
 * A venda registra o bruto; a conta recebe o líquido; a diferença vira despesa
 * automática "Taxa de cartão".
 */
export function liquidoCartao(entrada: EntradaCartao): ResultadoCartao {
  const taxa = somar(aplicarPercentual(entrada.bruto, entrada.percentualBp), entrada.taxaFixa);
  const liquido = subtrair(entrada.bruto, taxa);
  return { liquido, taxa };
}

export interface LoteCusto {
  quantidade: Quantidade;
  custoUnitario: Centavos;
}

/**
 * Custo médio ponderado (§3.5): média ponderada das entradas, recalculada a cada
 * entrada de mercadoria/combustível. Retorna o custo unitário em centavos.
 * Sem lotes (quantidade total zero) → custo zero.
 */
export function custoMedioPonderado(lotes: LoteCusto[]): Centavos {
  let quantidadeTotal = 0n;
  let valorTotal = 0n;
  for (const lote of lotes) {
    quantidadeTotal += lote.quantidade;
    valorTotal += lote.quantidade * lote.custoUnitario;
  }
  if (quantidadeTotal === 0n) return asCentavos(0n);
  return asCentavos(arredondarDivisao(valorTotal, quantidadeTotal));
}

/**
 * Saldo devedor do sócio (§3.6): sobe no aporte tipo empréstimo, desce só na
 * devolução explícita. Pró-labore não amortiza empréstimo (corre por fora).
 */
export function saldoDevedorSocio(aportesEmprestimo: Centavos, devolucoes: Centavos): Centavos {
  return subtrair(aportesEmprestimo, devolucoes);
}
