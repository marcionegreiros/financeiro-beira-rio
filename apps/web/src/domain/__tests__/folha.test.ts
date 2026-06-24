import { describe, it, expect } from 'vitest';
import { aReceberFolha } from '../folha';
import { asCentavos } from '../../lib/money';

describe('folha — a_receber = salário − vales (§5.9)', () => {
  it('desconta os vales do salário base', () => {
    expect(aReceberFolha(asCentavos(200000n), asCentavos(50000n))).toBe(150000n);
  });

  it('sem vales, recebe o salário cheio', () => {
    expect(aReceberFolha(asCentavos(200000n), asCentavos(0n))).toBe(200000n);
  });

  it('vales acima do salário deixam saldo negativo (a descontar depois)', () => {
    expect(aReceberFolha(asCentavos(100000n), asCentavos(120000n))).toBe(-20000n);
  });
});
