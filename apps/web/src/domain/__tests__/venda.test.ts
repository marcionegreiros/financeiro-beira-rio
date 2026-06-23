import { describe, it, expect } from 'vitest';
import { parseReais } from '../../lib/money';
import { litros, quantidade } from '../tipos';
import {
  vendaCombustivel,
  vendaProdutoContagem,
  vendaProdutoIndividual,
  vendaFisica,
} from '../venda';

describe('§11.2 combustível por encerrante', () => {
  const resultado = vendaCombustivel({
    leituraAnterior: litros(1_485_284n),
    leituraAtual: litros(1_485_561n),
    precoCentavosPorLitro: parseReais('7,70'),
  });

  it('277 L vendidos', () => {
    expect(resultado.litrosMl).toBe(litros(277n));
  });

  it('valor = R$ 2.132,90', () => {
    expect(resultado.valorCentavos).toBe(parseReais('2.132,90'));
  });

  it('entrada de combustível NÃO altera a venda (a venda é só a diferença do encerrante)', () => {
    // A função sequer aceita "entrada"; a venda depende apenas das leituras.
    const denovo = vendaCombustivel({
      leituraAnterior: litros(1_485_284n),
      leituraAtual: litros(1_485_561n),
      precoCentavosPorLitro: parseReais('7,70'),
    });
    expect(denovo.valorCentavos).toBe(resultado.valorCentavos);
  });

  it('encerrante não pode diminuir', () => {
    expect(() =>
      vendaCombustivel({
        leituraAnterior: litros(1_485_561n),
        leituraAtual: litros(1_485_284n),
        precoCentavosPorLitro: parseReais('7,70'),
      }),
    ).toThrow();
  });
});

describe('§11.3 produto por contagem (com e sem perda)', () => {
  it('sem perda: vendido = 30', () => {
    const r = vendaProdutoContagem({
      estoqueAnterior: quantidade(100n),
      entradas: quantidade(50n),
      estoqueAtual: quantidade(120n),
      perdas: quantidade(0n),
      precoCentavos: parseReais('10,00'),
    });
    expect(r.vendido).toBe(quantidade(30n));
    expect(r.valorCentavos).toBe(parseReais('300,00'));
  });

  it('com perda 5: vendido = 25 (a perda ENTRA como baixa, não vira venda fantasma)', () => {
    const r = vendaProdutoContagem({
      estoqueAnterior: quantidade(100n),
      entradas: quantidade(50n),
      estoqueAtual: quantidade(120n),
      perdas: quantidade(5n),
      precoCentavos: parseReais('10,00'),
    });
    expect(r.vendido).toBe(quantidade(25n));
  });
});

describe('produto modo individual e venda física agregada', () => {
  it('venda individual = soma das avulsas', () => {
    const total = vendaProdutoIndividual([parseReais('12,00'), parseReais('8,50')]);
    expect(total).toBe(parseReais('20,50'));
  });

  it('venda física = combustível + contagem + individual', () => {
    const total = vendaFisica({
      combustivel: parseReais('2.132,90'),
      contagem: parseReais('60,00'),
      individual: parseReais('12,00'),
    });
    expect(total).toBe(parseReais('2.204,90'));
  });
});
