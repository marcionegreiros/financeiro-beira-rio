import { describe, it, expect } from 'vitest';
import { parseReais, subtrair } from '../../lib/money';
import { dinheiroEsperado, diferencaCaixa } from '../caixa';

const venda = parseReais('1.000,00');

describe('§11.4 fiado concedido', () => {
  it('reduz o dinheiro_esperado no valor do fiado', () => {
    const fiado = parseReais('120,00');
    const semFiado = dinheiroEsperado({ vendaFisica: venda });
    const comFiado = dinheiroEsperado({ vendaFisica: venda, fiadoConcedido: fiado });
    expect(subtrair(semFiado, comFiado)).toBe(fiado);
  });
});

describe('§11.5 recebimento de fiado', () => {
  it('entra como dinheiro, somando ao esperado', () => {
    const recebido = parseReais('80,00');
    const sem = dinheiroEsperado({ vendaFisica: venda });
    const com = dinheiroEsperado({ vendaFisica: venda, recebimentosFiadoDinheiro: recebido });
    expect(subtrair(com, sem)).toBe(recebido);
  });

  it('NÃO é venda: o recebimento não está na venda física (entra só como entrada de caixa)', () => {
    // A venda física é insumo independente; o recebimento de fiado quita o
    // recebível, sem inflar a venda do dia do pagamento.
    const com = dinheiroEsperado({
      vendaFisica: venda,
      recebimentosFiadoDinheiro: parseReais('80,00'),
    });
    expect(com).toBe(parseReais('1.080,00'));
  });
});

describe('§11.10 pró-labore em dinheiro', () => {
  it('entra no dinheiro_esperado como saída', () => {
    const prolabore = parseReais('200,00');
    const sem = dinheiroEsperado({ vendaFisica: venda });
    const com = dinheiroEsperado({ vendaFisica: venda, prolaboreDinheiro: prolabore });
    expect(subtrair(sem, com)).toBe(prolabore);
  });
});

describe('§11.12 diferença de caixa', () => {
  const esperado = parseReais('1.771,90');

  it('sobra: contado > esperado → positivo', () => {
    expect(diferencaCaixa(parseReais('1.772,00'), esperado)).toBe(parseReais('0,10'));
  });

  it('falta: contado < esperado → negativo', () => {
    expect(diferencaCaixa(parseReais('1.771,00'), esperado)).toBe(parseReais('-0,90'));
  });
});

describe('troco fixo entra como entrada', () => {
  it('soma o troco fixo ao esperado', () => {
    const com = dinheiroEsperado({ vendaFisica: venda, trocoFixo: parseReais('100,00') });
    expect(com).toBe(parseReais('1.100,00'));
  });
});
