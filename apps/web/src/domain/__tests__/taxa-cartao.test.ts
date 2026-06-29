import { describe, it, expect } from 'vitest';
import { parseReais, asCentavos } from '../../lib/money';
import { taxaCartaoVigenteEm, type RegistroTaxa } from '../taxaCartao';
import { liquidoCartao } from '../capital';

describe('taxa de cartão vigente por data (§3.6 + §5.6 histórico)', () => {
  const historico: RegistroTaxa[] = [
    { percentualBp: 200n, fixa: asCentavos(0n), validoApartirDe: '2026-01-01' },
    { percentualBp: 300n, fixa: parseReais('0,10'), validoApartirDe: '2026-06-01' },
  ];

  it('um fechamento de maio usa a taxa vigente (2%), não a de junho', () => {
    const t = taxaCartaoVigenteEm(historico, '2026-05-31');
    expect(t.percentualBp).toBe(200n);
    expect(t.fixa).toBe(asCentavos(0n));
  });

  it('de junho em diante vale a nova taxa (3% + R$0,10)', () => {
    const t = taxaCartaoVigenteEm(historico, '2026-06-01');
    expect(t.percentualBp).toBe(300n);
    expect(t.fixa).toBe(parseReais('0,10'));
  });

  it('antes de qualquer vigência → taxa zero (sem desconto)', () => {
    const t = taxaCartaoVigenteEm(historico, '2025-12-31');
    expect(t.percentualBp).toBe(0n);
    expect(t.fixa).toBe(asCentavos(0n));
  });

  it('histórico vazio → taxa zero', () => {
    const t = taxaCartaoVigenteEm([], '2026-06-15');
    expect(t.percentualBp).toBe(0n);
    expect(t.fixa).toBe(asCentavos(0n));
  });

  it('integração §11: crédito R$100 @ 3%+R$0,10 → líquido 96,90 / taxa 3,10', () => {
    const t = taxaCartaoVigenteEm(historico, '2026-06-15');
    const { liquido, taxa } = liquidoCartao({
      bruto: parseReais('100,00'),
      percentualBp: t.percentualBp,
      taxaFixa: t.fixa,
    });
    expect(liquido).toBe(parseReais('96,90'));
    expect(taxa).toBe(parseReais('3,10'));
  });

  it('PIX maquininha R$100 @ 0,99% → líquido 99,01 / taxa 0,99 (PIX direto seria taxa 0)', () => {
    const { liquido, taxa } = liquidoCartao({
      bruto: parseReais('100,00'),
      percentualBp: 99n,
      taxaFixa: asCentavos(0n),
    });
    expect(liquido).toBe(parseReais('99,01'));
    expect(taxa).toBe(parseReais('0,99'));
  });
});
