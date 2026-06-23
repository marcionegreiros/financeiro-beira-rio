/**
 * Repositórios — leitura do banco já convertida para tipos do domínio.
 *
 * As telas chamam estas funções e NÃO falam com o Supabase direto. Quando o
 * PowerSync entrar, só a implementação aqui muda (a fonte vira o SQLite local);
 * as telas continuam iguais.
 */
import { supabase } from './supabase';
import { paraCentavos, litrosParaMililitros } from './conversao';
import { precoVigenteEm, type RegistroVigencia } from '../domain/precos';
import { hojeManaus } from '../lib/datas';
import type { Centavos } from '../lib/money';
import type { Mililitros } from '../domain/tipos';

export interface SaldoConta {
  id: string;
  nome: string;
  tipo: string;
  saldo: Centavos;
}

/** Saldos derivados de todas as contas (view vw_saldo_conta). */
export async function listarSaldos(): Promise<SaldoConta[]> {
  const { data, error } = await supabase
    .from('vw_saldo_conta')
    .select('conta_id,nome,tipo,saldo_centavos');
  if (error) throw error;
  const linhas = (data ?? []) as Array<{
    conta_id: string;
    nome: string | null;
    tipo: string | null;
    saldo_centavos: number | null;
  }>;
  return linhas.map((r) => ({
    id: r.conta_id,
    nome: r.nome ?? '',
    tipo: r.tipo ?? '',
    saldo: paraCentavos(r.saldo_centavos),
  }));
}

export interface TanquePainel {
  id: string;
  nome: string;
  combustivel: string;
  capacidade: Mililitros;
  nivelAlerta: Mililitros;
  nivel: Mililitros;
}

/** Tanques com nível atual (última medição de régua) e capacidade. */
export async function listarTanques(): Promise<TanquePainel[]> {
  const [{ data: tanques, error: e1 }, { data: medicoes, error: e2 }] = await Promise.all([
    supabase
      .from('tanque')
      .select('id,nome,capacidade_litros,nivel_alerta_litros,combustivel(nome)'),
    supabase
      .from('medicao_tanque')
      .select('tanque_id,litros_medidos,data_hora')
      .order('data_hora', {
        ascending: false,
      }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const linhasTanque = (tanques ?? []) as Array<{
    id: string;
    nome: string;
    capacidade_litros: number;
    nivel_alerta_litros: number;
    combustivel: { nome: string } | { nome: string }[] | null;
  }>;
  const linhasMedicao = (medicoes ?? []) as Array<{ tanque_id: string; litros_medidos: number }>;

  // Como já vem ordenado desc por data_hora, a primeira medição vista é a última.
  const ultimaMedicao = new Map<string, number>();
  for (const m of linhasMedicao) {
    if (!ultimaMedicao.has(m.tanque_id)) ultimaMedicao.set(m.tanque_id, m.litros_medidos);
  }

  return linhasTanque.map((t) => {
    const comb = Array.isArray(t.combustivel) ? t.combustivel[0] : t.combustivel;
    return {
      id: t.id,
      nome: t.nome,
      combustivel: comb?.nome ?? '',
      capacidade: litrosParaMililitros(t.capacidade_litros),
      nivelAlerta: litrosParaMililitros(t.nivel_alerta_litros),
      nivel: litrosParaMililitros(ultimaMedicao.get(t.id) ?? 0),
    };
  });
}

export interface ProdutoPainel {
  id: string;
  nome: string;
  ordem: number;
  modoApuracao: string;
  preco: Centavos | undefined;
}

/** Produtos ativos com o preço vigente hoje (histórico resolvido no domínio). */
export async function listarProdutos(): Promise<ProdutoPainel[]> {
  const hoje = hojeManaus();
  const [{ data: produtos, error: e1 }, { data: precos, error: e2 }] = await Promise.all([
    supabase.from('produto').select('id,nome,ordem,modo_apuracao').eq('ativo', true).order('ordem'),
    supabase.from('preco_produto').select('produto_id,valor_centavos,valido_a_partir_de'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const linhasProduto = (produtos ?? []) as Array<{
    id: string;
    nome: string;
    ordem: number;
    modo_apuracao: string;
  }>;
  const linhasPreco = (precos ?? []) as Array<{
    produto_id: string;
    valor_centavos: number;
    valido_a_partir_de: string;
  }>;

  const historicoPorProduto = new Map<string, RegistroVigencia[]>();
  for (const p of linhasPreco) {
    const lista = historicoPorProduto.get(p.produto_id) ?? [];
    lista.push({
      valorCentavos: paraCentavos(p.valor_centavos),
      validoApartirDe: p.valido_a_partir_de,
    });
    historicoPorProduto.set(p.produto_id, lista);
  }

  return linhasProduto.map((p) => ({
    id: p.id,
    nome: p.nome,
    ordem: p.ordem,
    modoApuracao: p.modo_apuracao,
    preco: precoVigenteEm(historicoPorProduto.get(p.id) ?? [], hoje),
  }));
}
