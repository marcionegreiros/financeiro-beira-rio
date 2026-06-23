import { describe, it, expect } from 'vitest';
import {
  asCentavos,
  parseReais,
  formatReais,
  somar,
  subtrair,
  aplicarPercentual,
  arredondarDivisao,
  multiplicarPorEscalar,
} from '../money';

describe('parseReais / formatReais (borda de exibição)', () => {
  it('faz roundtrip de valores brasileiros', () => {
    expect(parseReais('R$ 1.234,56')).toBe(asCentavos(123456n));
    expect(formatReais(parseReais('R$ 1.234,56'))).toBe('R$ 1.234,56');
  });

  it('trata centavos e zero à esquerda', () => {
    expect(parseReais('0,10')).toBe(asCentavos(10n));
    expect(formatReais(parseReais('0,10'))).toBe('R$ 0,10');
  });

  it('trata negativos', () => {
    expect(formatReais(parseReais('-50,00'))).toBe('-R$ 50,00');
    expect(parseReais('-0,90')).toBe(asCentavos(-90n));
  });

  it('aceita texto sem separador decimal', () => {
    expect(parseReais('1000')).toBe(asCentavos(100000n));
  });
});

describe('aritmética inteira', () => {
  it('soma e subtrai', () => {
    expect(somar(parseReais('10,00'), parseReais('5,50'))).toBe(parseReais('15,50'));
    expect(subtrair(parseReais('10,00'), parseReais('2,30'))).toBe(parseReais('7,70'));
  });

  it('multiplica por escalar', () => {
    expect(multiplicarPorEscalar(parseReais('7,70'), 277n)).toBe(parseReais('2.132,90'));
  });
});

describe('percentual e arredondamento half-up', () => {
  it('aplica 3% sobre R$100,00', () => {
    expect(aplicarPercentual(parseReais('100,00'), 300n)).toBe(parseReais('3,00'));
  });

  it('arredonda 0,5 para cima (half-up), preservando sinal', () => {
    expect(arredondarDivisao(5n, 2n)).toBe(3n);
    expect(arredondarDivisao(-5n, 2n)).toBe(-3n);
    expect(arredondarDivisao(4n, 2n)).toBe(2n);
  });
});
