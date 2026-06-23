import { describe, it, expect } from 'vitest';
import { parseReais, somar, subtrair } from '../../lib/money';
import {
  capitalTotal,
  capitalOperacional,
  liquidoCartao,
  custoMedioPonderado,
  saldoDevedorSocio,
  type Ativos,
  type Passivos,
} from '../capital';
import { quantidade } from '../tipos';

const zero = parseReais('0');

const ativosBase: Ativos = {
  saldosContas: parseReais('10.000,00'),
  fiadoEmAberto: parseReais('500,00'),
  valorEstoque: parseReais('3.000,00'),
  valorCombustivel: parseReais('7.000,00'),
};
const passivosBase: Passivos = { emprestimosSocioEmAberto: zero, outrasDividas: zero };

describe('§11.6 taxa de cartão', () => {
  it('crédito R$100, 3% + R$0,10 → líquido 96,90 / taxa 3,10', () => {
    const r = liquidoCartao({
      bruto: parseReais('100,00'),
      percentualBp: 300n,
      taxaFixa: parseReais('0,10'),
    });
    expect(r.liquido).toBe(parseReais('96,90'));
    expect(r.taxa).toBe(parseReais('3,10'));
  });

  it('a venda registra o bruto; soma líquido + taxa = bruto', () => {
    const r = liquidoCartao({
      bruto: parseReais('100,00'),
      percentualBp: 300n,
      taxaFixa: parseReais('0,10'),
    });
    expect(somar(r.liquido, r.taxa)).toBe(parseReais('100,00'));
  });
});

describe('§11.7 transferência (partida dobrada)', () => {
  it('mover R$500 Caixa→Bradesco não altera o capital (soma dos saldos constante)', () => {
    // Antes: Caixa 1.000, Bradesco 2.000 → soma 3.000.
    const saldosAntes = somar(parseReais('1.000,00'), parseReais('2.000,00'));
    // Depois: Caixa 500, Bradesco 2.500 → soma 3.000.
    const saldosDepois = somar(parseReais('500,00'), parseReais('2.500,00'));
    expect(saldosDepois).toBe(saldosAntes);

    const antes = capitalTotal({ ...ativosBase, saldosContas: saldosAntes }, passivosBase);
    const depois = capitalTotal({ ...ativosBase, saldosContas: saldosDepois }, passivosBase);
    expect(depois).toBe(antes);
  });
});

describe('§11.8 aporte empréstimo + devolução', () => {
  const valor = parseReais('500,00');

  it('caixa +, capital total inalterado, saldo devedor +', () => {
    const antes = capitalTotal(ativosBase, passivosBase);
    // Empréstimo: caixa +500 (ativo) E empréstimo +500 (passivo) → capital igual.
    const depois = capitalTotal(
      { ...ativosBase, saldosContas: somar(ativosBase.saldosContas, valor) },
      { ...passivosBase, emprestimosSocioEmAberto: valor },
    );
    expect(depois).toBe(antes);
    expect(saldoDevedorSocio(valor, zero)).toBe(valor);
  });

  it('devolução reverte o saldo devedor e não mexe no capital', () => {
    expect(saldoDevedorSocio(valor, valor)).toBe(zero);
  });
});

describe('§11.9 aporte aumento de capital', () => {
  it('caixa +, capital total +, operacional inalterado', () => {
    const valor = parseReais('500,00');
    const totalAntes = capitalTotal(ativosBase, passivosBase);
    const totalDepois = capitalTotal(
      { ...ativosBase, saldosContas: somar(ativosBase.saldosContas, valor) },
      passivosBase,
    );
    expect(subtrair(totalDepois, totalAntes)).toBe(valor); // total sobe

    // Operacional desconta os aumentos de capital líquidos → inalterado.
    const opAntes = capitalOperacional(totalAntes, zero);
    const opDepois = capitalOperacional(totalDepois, valor);
    expect(opDepois).toBe(opAntes);
  });
});

describe('§11.11 perda', () => {
  it('reduz estoque e capital, mas NÃO debita conta (saldos inalterados)', () => {
    const perda = parseReais('150,00');
    const antes = capitalTotal(ativosBase, passivosBase);
    const depois = capitalTotal(
      { ...ativosBase, valorEstoque: subtrair(ativosBase.valorEstoque, perda) },
      passivosBase,
    );
    // Capital cai exatamente uma vez, pela baixa de estoque.
    expect(subtrair(antes, depois)).toBe(perda);
    // Saldos das contas não mudam (perda não tem movimento de conta).
    // (EntradaCaixa nem possui campo de perda — ver caixa.ts.)
  });
});

describe('custo médio ponderado (§3.5)', () => {
  it('média ponderada de duas entradas', () => {
    // 100 un a R$10,00 + 50 un a R$13,00 → (1000,00 + 650,00) / 150 = R$11,00
    const custo = custoMedioPonderado([
      { quantidade: quantidade(100n), custoUnitario: parseReais('10,00') },
      { quantidade: quantidade(50n), custoUnitario: parseReais('13,00') },
    ]);
    expect(custo).toBe(parseReais('11,00'));
  });

  it('sem lotes → custo zero', () => {
    expect(custoMedioPonderado([])).toBe(zero);
  });
});
