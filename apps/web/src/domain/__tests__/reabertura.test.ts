import { describe, it, expect } from 'vitest';
import { parseReais } from '../../lib/money';
import { vendaCombustivel } from '../venda';
import { dinheiroEsperado, diferencaCaixa } from '../caixa';
import { asMililitros } from '../tipos';

describe('Recálculo de fechamento pós-reabertura', () => {
  it('recalcula faturamento de combustível com base na nova leitura anterior', () => {
    const precoLitro = parseReais('7,70');
    
    // Leitura original
    const leituraAnteriorVelha = asMililitros(1485284000n); // em mililitros
    const leituraAtual = asMililitros(1485561000n); // em mililitros (277 Litros vendidos)
    
    // Leitura corrigida após reabertura do dia anterior (por exemplo, diminuiu a leitura final de ontem)
    const leituraAnteriorNova = asMililitros(1485184000n); // ontem fechou com 100L a menos, logo hoje vendeu 100L a mais (377 Litros)
    
    // Venda velha
    const vendaVelha = vendaCombustivel({
      leituraAnterior: leituraAnteriorVelha,
      leituraAtual,
      precoCentavosPorLitro: precoLitro,
    });
    
    // Venda nova
    const vendaNova = vendaCombustivel({
      leituraAnterior: leituraAnteriorNova,
      leituraAtual,
      precoCentavosPorLitro: precoLitro,
    });
    
    // Esperado: venda velha = 277 * 7.70 = 2132.90, venda nova = 377 * 7.70 = 2902.90
    expect(vendaVelha.litrosMl).toBe(asMililitros(277000n));
    expect(vendaVelha.valorCentavos).toBe(parseReais('2.132,90'));
    
    expect(vendaNova.litrosMl).toBe(asMililitros(377000n));
    expect(vendaNova.valorCentavos).toBe(parseReais('2.902,90'));
    
    // Reconstrução de caixa
    // Pix, cards, despesas, troco fixo são constantes do dia
    const pix = parseReais('383,00');
    const despesa = parseReais('50,00');
    const troco = parseReais('100,00');
    const contado = parseReais('1.899,90'); // Dinheiro fisicamente contato na gaveta (fixo)
    
    // Esperado com venda velha: esperado = 2132.90 - 383.00 - 50.00 + 100.00 = 1799.90
    // Diferença velha: contado (1899.90) - esperado (1799.90) = +100.00
    const esperadoVelho = dinheiroEsperado({
      vendaFisica: vendaVelha.valorCentavos,
      pix,
      despesasDinheiro: despesa,
      trocoFixo: troco,
    });
    const diferencaVelha = diferencaCaixa(contado, esperadoVelho);
    
    expect(esperadoVelho).toBe(parseReais('1.799,90'));
    expect(diferencaVelha).toBe(parseReais('100,00'));
    
    // Esperado com venda nova: esperado = 2902.90 - 383.00 - 50.00 + 100.00 = 2569.90
    // Diferença nova: contado (1899.90) - esperado (2569.90) = -670.00
    const esperadoNovo = dinheiroEsperado({
      vendaFisica: vendaNova.valorCentavos,
      pix,
      despesasDinheiro: despesa,
      trocoFixo: troco,
    });
    const diferencaNova = diferencaCaixa(contado, esperadoNovo);
    
    expect(esperadoNovo).toBe(parseReais('2.569,90'));
    expect(diferencaNova).toBe(parseReais('-670,00'));
  });
});
