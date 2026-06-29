import { describe, it, expect } from 'vitest';
import { parseReais, asCentavos } from '../../lib/money';
import { taxaPixVigenteEm, tarifaPix, type RegistroTaxaPix } from '../taxaPixConta';

describe('tarifa de PIX por conta, vigente por data (histórico)', () => {
  // Exemplo do gerente: 1,45% + mínimo R$1,75 + máximo R$9,80.
  const historico: RegistroTaxaPix[] = [
    { percentualBp: 145n, minimo: parseReais('1,75'), maximo: parseReais('9,80'), validoApartirDe: '2026-01-01' },
    { percentualBp: 99n, minimo: parseReais('1,00'), maximo: parseReais('20,00'), validoApartirDe: '2026-06-01' },
  ];

  it('uma transação de maio usa a regra vigente (1,45%), não a de junho', () => {
    const t = taxaPixVigenteEm(historico, '2026-05-31');
    expect(t.percentualBp).toBe(145n);
    expect(t.minimo).toBe(parseReais('1,75'));
    expect(t.maximo).toBe(parseReais('9,80'));
  });

  it('de junho em diante vale a nova regra', () => {
    const t = taxaPixVigenteEm(historico, '2026-06-15');
    expect(t.percentualBp).toBe(99n);
    expect(t.maximo).toBe(parseReais('20,00'));
  });

  it('antes de qualquer vigência → tarifa zero', () => {
    const t = taxaPixVigenteEm(historico, '2025-12-31');
    expect(t.percentualBp).toBe(0n);
    expect(t.minimo).toBe(asCentavos(0n));
    expect(t.maximo).toBe(asCentavos(0n));
  });

  it('histórico vazio → tarifa zero', () => {
    const t = taxaPixVigenteEm([], '2026-06-15');
    expect(t.percentualBp).toBe(0n);
  });

  const regra = { percentualBp: 145n, minimo: parseReais('1,75'), maximo: parseReais('9,80') };

  it('valor médio: 1,45% de R$200,00 = R$2,90 (entre mín e máx)', () => {
    expect(tarifaPix({ valor: parseReais('200,00'), ...regra })).toBe(parseReais('2,90'));
  });

  it('valor baixo: 1,45% de R$50,00 = R$0,725 → sobe para o mínimo R$1,75', () => {
    expect(tarifaPix({ valor: parseReais('50,00'), ...regra })).toBe(parseReais('1,75'));
  });

  it('valor alto: 1,45% de R$1.000,00 = R$14,50 → desce para o máximo R$9,80', () => {
    expect(tarifaPix({ valor: parseReais('1000,00'), ...regra })).toBe(parseReais('9,80'));
  });

  it('valor zero → tarifa zero', () => {
    expect(tarifaPix({ valor: asCentavos(0n), ...regra })).toBe(asCentavos(0n));
  });

  it('limites zerados = sem grampo: 1,45% de R$50,00 fica R$0,73 (half-up)', () => {
    const t = tarifaPix({
      valor: parseReais('50,00'),
      percentualBp: 145n,
      minimo: asCentavos(0n),
      maximo: asCentavos(0n),
    });
    expect(t).toBe(parseReais('0,73'));
  });
});
