import { describe, it, expect } from 'vitest';
import { litros } from '../tipos';
import { nivelCalculado, divergenciaTanque } from '../tanque';

describe('reconciliação de tanque (§3.2)', () => {
  it('nivel_calculado = anterior + entradas − vendidos', () => {
    const calc = nivelCalculado({
      nivelAnterior: litros(10_000n),
      entradas: litros(5_000n),
      litrosVendidos: litros(277n),
    });
    expect(calc).toBe(litros(14_723n));
  });

  it('divergência = medido − calculado (régua a menos = negativo)', () => {
    const calc = litros(14_723n);
    const medido = litros(14_720n);
    expect(divergenciaTanque(medido, calc)).toBe(litros(-3n));
  });

  it('sem divergência quando régua bate com o calculado', () => {
    const calc = litros(14_723n);
    expect(divergenciaTanque(litros(14_723n), calc)).toBe(litros(0n));
  });
});
