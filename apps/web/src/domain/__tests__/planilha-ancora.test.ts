import { describe, it, expect } from 'vitest';
import { parseReais, subtrair } from '../../lib/money';
import { dinheiroEsperado, diferencaCaixa } from '../caixa';

/**
 * §11.1 — VALIDAÇÃO DA PLANILHA REAL (a âncora obrigatória / Definition of Done da Fase 2).
 *
 * Dados (da imagem da planilha enviada na spec):
 *   venda física ....... 2.204,90
 *   despesa em dinheiro ..... 50,00
 *   PIX .................... 383,00
 *   dinheiro contado .... 1.772,00 (em espécie, na gaveta)
 *   fiado ..................... 0,00
 *
 * A asserção que NÃO PODE FALHAR é a diferença = +0,10.
 *
 * Nota de reconciliação (duas leituras equivalentes — ambas dão +0,10):
 *  (A) Equação canônica §3.3 — reconciliação da GAVETA (só dinheiro em espécie):
 *      esperado_gaveta = venda − PIX − despesa = 2.204,90 − 383,00 − 50,00 = 1.771,90
 *      diferença = contado_espécie(1.772,00) − 1.771,90 = +0,10  ← implementação oficial
 *  (B) Leitura "total recebido" usada no texto da §11.1:
 *      esperado_total = venda − despesa = 2.154,90
 *      contado_total  = espécie + PIX = 1.772,00 + 383,00 = 2.155,00
 *      diferença = 2.155,00 − 2.154,90 = +0,10
 */
describe('§11.1 âncora da planilha real', () => {
  const vendaFisica = parseReais('2.204,90');
  const despesasDinheiro = parseReais('50,00');
  const pix = parseReais('383,00');
  const dinheiroContadoEspecie = parseReais('1.772,00');

  const esperado = dinheiroEsperado({ vendaFisica, despesasDinheiro, pix });

  it('(A) equação §3.3: esperado na gaveta = R$ 1.771,90', () => {
    expect(esperado).toBe(parseReais('1.771,90'));
  });

  it('(A) diferença = +0,10 (a asserção obrigatória)', () => {
    expect(diferencaCaixa(dinheiroContadoEspecie, esperado)).toBe(parseReais('0,10'));
  });

  it('(B) reconciliação "total recebido" também dá +0,10', () => {
    const esperadoTotal = subtrair(vendaFisica, despesasDinheiro); // 2.154,90
    const contadoTotal = parseReais('2.155,00'); // espécie + PIX
    expect(esperadoTotal).toBe(parseReais('2.154,90'));
    expect(subtrair(contadoTotal, esperadoTotal)).toBe(parseReais('0,10'));
  });
});
