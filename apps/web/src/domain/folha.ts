/**
 * folha — salário a receber do funcionário (§5.9, §6.6).
 *
 * Vale é adiantamento de salário: sai do caixa no dia (regra geral de caixa,
 * §3.4) e desconta do salário no fechamento mensal. Logo:
 *   a_receber = salário_base − vales_do_período.
 * Pode ficar negativo (vales acima do salário) — saldo a descontar no mês seguinte.
 */
import { subtrair, type Centavos } from '../lib/money';

export function aReceberFolha(salarioBase: Centavos, totalVales: Centavos): Centavos {
  return subtrair(salarioBase, totalVales);
}
