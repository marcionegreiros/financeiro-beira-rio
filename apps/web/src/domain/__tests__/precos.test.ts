import { describe, it, expect } from 'vitest';
import { parseReais } from '../../lib/money';
import { precoVigenteEm, custoVigenteEm, type RegistroVigencia } from '../precos';

describe('§11.13 custo histórico', () => {
  const historico: RegistroVigencia[] = [
    { valorCentavos: parseReais('3,00'), validoApartirDe: '2026-01-01T00:00:00-04:00' },
    { valorCentavos: parseReais('4,00'), validoApartirDe: '2026-06-01T00:00:00-04:00' },
  ];

  it('um fechamento de março usa o custo vigente (R$3,00), não o de junho', () => {
    expect(custoVigenteEm(historico, '2026-03-01T12:00:00-04:00')).toBe(parseReais('3,00'));
  });

  it('alterar o custo (entrada de junho) não muda o lucro de fechamentos anteriores', () => {
    // Mesma consulta de março permanece R$3,00 mesmo com o registro de junho presente.
    expect(custoVigenteEm(historico, '2026-03-01T12:00:00-04:00')).toBe(parseReais('3,00'));
    // De junho em diante, vale o novo custo.
    expect(custoVigenteEm(historico, '2026-06-15T08:00:00-04:00')).toBe(parseReais('4,00'));
  });
});

describe('§11.14 preço histórico', () => {
  const historico: RegistroVigencia[] = [
    { valorCentavos: parseReais('7,00'), validoApartirDe: '2026-01-01' },
    { valorCentavos: parseReais('7,70'), validoApartirDe: '2026-06-01' },
  ];

  it('alterar o preço não reescreve fechamentos passados', () => {
    expect(precoVigenteEm(historico, '2026-05-31')).toBe(parseReais('7,00'));
    expect(precoVigenteEm(historico, '2026-06-01')).toBe(parseReais('7,70'));
  });

  it('antes de qualquer preço vigente → undefined', () => {
    expect(precoVigenteEm(historico, '2025-12-31')).toBeUndefined();
  });
});
