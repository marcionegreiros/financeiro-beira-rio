/**
 * formasPagamento — formas de pagamento coerentes com o TIPO da conta.
 *
 * Regra de coerência (Pilar 2 — caixa físico ≠ banco):
 * - Conta de DINHEIRO (gaveta) só paga/recebe em dinheiro.
 * - Conta de BANCO paga por meios eletrônicos (PIX, transferência, boleto,
 *   débito, crédito) — NUNCA "dinheiro".
 *
 * A tarifa de PIX só incide quando a forma é exatamente 'pix' saindo de uma conta
 * de banco. Boleto, transferência, débito e crédito NÃO pagam a tarifa.
 */

/** Rótulos de exibição de todas as formas (borda de UI). */
export const FORMAS_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  transferencia: 'Transferência',
  boleto: 'Boleto',
  debito: 'Débito',
  credito: 'Crédito',
};

const FORMAS_BANCO = ['pix', 'transferencia', 'boleto', 'debito', 'credito'];
const FORMAS_DINHEIRO = ['dinheiro'];

/**
 * Resolve o id da conta "Caixa Físico Padrão (Gaveta)" — a única conta de
 * dinheiro cujos movimentos entram na contagem do fechamento de caixa. Mesma
 * regra de desempate usada no motor do fechamento (data/fechamento.ts): a conta
 * de dinheiro marcada como destino padrão; senão, a primeira conta de dinheiro.
 */
export function idContaGaveta(
  contas: Array<{ id: string; tipo: string; ehDestinoPadraoVenda: boolean }>,
): string | null {
  return (
    contas.find((c) => c.tipo === 'dinheiro' && c.ehDestinoPadraoVenda)?.id ??
    contas.find((c) => c.tipo === 'dinheiro')?.id ??
    null
  );
}

/** Formas válidas para uma conta conforme seu tipo ('banco' | 'dinheiro'). */
export function formasParaConta(tipoConta: string | undefined | null): string[] {
  return tipoConta === 'banco' ? FORMAS_BANCO : FORMAS_DINHEIRO;
}

/** Forma padrão sugerida para uma conta conforme seu tipo. */
export function formaPadraoConta(tipoConta: string | undefined | null): string {
  return tipoConta === 'banco' ? 'pix' : 'dinheiro';
}

/**
 * Mantém a forma atual se ainda for válida para a conta; caso contrário devolve a
 * forma padrão do tipo. Usado ao trocar a conta num formulário.
 */
export function formaCoerente(formaAtual: string, tipoConta: string | undefined | null): string {
  return formasParaConta(tipoConta).includes(formaAtual)
    ? formaAtual
    : formaPadraoConta(tipoConta);
}
