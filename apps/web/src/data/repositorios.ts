/**
 * Repositórios — leitura do banco já convertida para tipos do domínio.
 *
 * As telas chamam estas funções e NÃO falam com o Supabase direto. Quando o
 * PowerSync entrar, só a implementação aqui muda (a fonte vira o SQLite local);
 * as telas continuam iguais.
 */
import { supabase } from './supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { paraCentavos, litrosParaMililitros, centavosParaNumero, quantidadeParaNumero } from './conversao';
import { precoVigenteEm, custoVigenteEm, type RegistroVigencia } from '../domain/precos';
import { taxaCartaoVigenteEm, type RegistroTaxa } from '../domain/taxaCartao';
import { taxaPixVigenteEm, tarifaPix, type RegistroTaxaPix } from '../domain/taxaPixConta';
import { capitalTotal, capitalOperacional } from '../domain/capital';
import { nivelCalculado } from '../domain/tanque';
import { hojeManaus, limitesDoDiaManaus } from '../lib/datas';
import { uuidv7 } from '../lib/uuidv7';
import { somar, asCentavos, formatReais, type Centavos } from '../lib/money';
import { asMililitros, type Mililitros, type Quantidade } from '../domain/tipos';

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

/**
 * Nível DERIVADO de eventos (Pilar 1), em mililitros, por tanque:
 *
 *   nivel = última medição de régua
 *         + Σ entradas de carga posteriores à medição
 *         − litros vendidos desde a medição
 *
 * Litros vendidos saem do encerrante (cumulativo): para cada bomba do tanque,
 * vendido = leitura mais recente − leitura no fechamento vigente na data da
 * medição. Sem medição, parte de 0 e desconta tudo o que foi vendido. A régua
 * deixa de SER o nível e passa a ser a ân * Granularidade de DIA: entradas/vendas são atribuídas pela data, não pela hora.
 */
async function calcularNiveisDerivados(dataLimite?: string): Promise<Map<string, Mililitros>> {
  const [
    { data: medicoes, error: e1 },
    { data: entradas, error: e2 },
    { data: bombas, error: e3 },
    { data: leituras, error: e4 },
    { data: fechamentos, error: e5 },
  ] = await Promise.all([
    supabase
      .from('medicao_tanque')
      .select('tanque_id,litros_medidos,data_hora')
      .order('data_hora', { ascending: false }),
    supabase.from('entrada_combustivel').select('tanque_id,litros,data'),
    supabase.from('bomba').select('id,tanque_id'),
    supabase.from('leitura_bomba').select('fechamento_id,bomba_id,leitura'),
    supabase.from('fechamento').select('id,data'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;
  if (e5) throw e5;

  // Filtrar medições e entradas em memória se houver dataLimite
  let listaMedicoes = (medicoes ?? []) as Array<{ tanque_id: string; litros_medidos: number; data_hora: string }>;
  if (dataLimite) {
    listaMedicoes = listaMedicoes.filter((m) => m.data_hora.slice(0, 10) <= dataLimite);
  }

  // Última medição (litros + data) por tanque
  const ultimaMedicao = new Map<string, { litros: number; data: string }>();
  for (const m of listaMedicoes) {
    if (!ultimaMedicao.has(m.tanque_id)) {
      ultimaMedicao.set(m.tanque_id, { litros: Number(m.litros_medidos), data: m.data_hora.slice(0, 10) });
    }
  }

  // Data de cada fechamento e bomba→tanque.
  const dataFech = new Map<string, string>();
  for (const f of (fechamentos ?? []) as Array<{ id: string; data: string }>) {
    if (!dataLimite || f.data <= dataLimite) {
      dataFech.set(f.id, f.data);
    }
  }

  const tanqueDaBomba = new Map<string, string>();
  const bombasDoTanque = new Map<string, string[]>();
  for (const b of (bombas ?? []) as Array<{ id: string; tanque_id: string }>) {
    tanqueDaBomba.set(b.id, b.tanque_id);
    const lista = bombasDoTanque.get(b.tanque_id) ?? [];
    lista.push(b.id);
    bombasDoTanque.set(b.tanque_id, lista);
  }

  // Leituras por bomba, ordenadas por data do fechamento (asc).
  const leiturasPorBomba = new Map<string, Array<{ data: string; leitura: number }>>();
  for (const l of (leituras ?? []) as Array<{ fechamento_id: string; bomba_id: string; leitura: number }>) {
    const data = dataFech.get(l.fechamento_id);
    if (!data) continue;
    const lista = leiturasPorBomba.get(l.bomba_id) ?? [];
    lista.push({ data, leitura: Number(l.leitura) });
    leiturasPorBomba.set(l.bomba_id, lista);
  }
  for (const lista of leiturasPorBomba.values()) lista.sort((a, b) => a.data.localeCompare(b.data));

  // Entradas posteriores à medição (litros) por tanque.
  const entradasPorTanque = new Map<string, Array<{ data: string; litros: number }>>();
  for (const e of (entradas ?? []) as Array<{ tanque_id: string; litros: number; data: string }>) {
    if (!dataLimite || e.data <= dataLimite) {
      const lista = entradasPorTanque.get(e.tanque_id) ?? [];
      lista.push({ data: e.data, litros: Number(e.litros) });
      entradasPorTanque.set(e.tanque_id, lista);
    }
  }

  // Litros vendidos por bomba desde uma data: encerrante atual − encerrante na data.
  function vendidoDesde(bombaId: string, dataMedicao: string | null): number {
    const lista = leiturasPorBomba.get(bombaId);
    if (!lista || lista.length === 0) return 0;
    
    // O encerrante atual sob a ótica da data limite é a última leitura <= dataLimite
    let indexAtual = lista.length - 1;
    if (dataLimite) {
      indexAtual = -1;
      for (let i = lista.length - 1; i >= 0; i--) {
        if (lista[i]!.data <= dataLimite) {
          indexAtual = i;
          break;
        }
      }
    }
    if (indexAtual === -1) return 0;

    const atual = lista[indexAtual]!.leitura;
    if (!dataMedicao) return Math.max(0, atual - lista[0]!.leitura);

    // Encerrante base na medição:
    let base: number | null = null;
    for (let i = 0; i <= indexAtual; i++) {
      const r = lista[i]!;
      if (r.data <= dataMedicao) base = r.leitura;
      else break;
    }
    if (base === null) base = lista[0]!.leitura;
    return Math.max(0, atual - base);
  }

  const tanqueIds = new Set<string>([
    ...ultimaMedicao.keys(),
    ...bombasDoTanque.keys(),
    ...entradasPorTanque.keys(),
  ]);

  const niveis = new Map<string, Mililitros>();
  for (const tanqueId of tanqueIds) {
    const med = ultimaMedicao.get(tanqueId) ?? null;
    const nivelAnterior = litrosParaMililitros(med?.litros ?? 0);

    let entradasMl = 0n;
    for (const e of entradasPorTanque.get(tanqueId) ?? []) {
      if (!med || e.data > med.data) {
        entradasMl += litrosParaMililitros(e.litros);
      }
    }

    let vendidoLitros = 0;
    for (const bombaId of bombasDoTanque.get(tanqueId) ?? []) {
      vendidoLitros += vendidoDesde(bombaId, med?.data ?? null);
    }

    niveis.set(
      tanqueId,
      nivelCalculado({
        nivelAnterior,
        entradas: asMililitros(entradasMl),
        litrosVendidos: litrosParaMililitros(vendidoLitros),
      }),
    );
  }
  return niveis;
}

/** Tanques com nível ATUAL derivado de eventos (medição + entradas − vendido). */
export async function listarTanques(): Promise<TanquePainel[]> {
  const [{ data: tanques, error: e1 }, niveis] = await Promise.all([
    supabase
      .from('tanque')
      .select('id,nome,capacidade_litros,nivel_alerta_litros,combustivel(nome)')
      .eq('ativo', true),
    calcularNiveisDerivados(),
  ]);
  if (e1) throw e1;

  const linhasTanque = (tanques ?? []) as Array<{
    id: string;
    nome: string;
    capacidade_litros: number;
    nivel_alerta_litros: number;
    combustivel: { nome: string } | { nome: string }[] | null;
  }>;

  return linhasTanque.map((t) => {
    const comb = Array.isArray(t.combustivel) ? t.combustivel[0] : t.combustivel;
    return {
      id: t.id,
      nome: t.nome,
      combustivel: comb?.nome ?? '',
      capacidade: litrosParaMililitros(t.capacidade_litros),
      nivelAlerta: litrosParaMililitros(t.nivel_alerta_litros),
      nivel: niveis.get(t.id) ?? asMililitros(0n),
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

// ---- Fase 4: Catálogo e Configuração -------------------------------------------

export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
}

export async function listarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase.from('categoria').select('id,nome,ordem').order('ordem');
  if (error) throw error;
  return (data ?? []) as Categoria[];
}

export async function salvarCategoria(cat: Categoria): Promise<void> {
  const { error } = await supabase.from('categoria').upsert({
    id: cat.id,
    nome: cat.nome,
    ordem: cat.ordem,
  });
  if (error) throw error;
}

export interface ContaCompleta {
  id: string;
  nome: string;
  tipo: string;
  ehDestinoPadraoVenda: boolean;
  ativo: boolean;
  fotoUrl?: string | null;
}

export async function listarContasCompletas(): Promise<ContaCompleta[]> {
  const { data, error } = await supabase.from('conta').select('id,nome,tipo,eh_destino_padrao_venda,ativo,foto_url').order('nome');
  if (error) throw error;
  const linhas = (data ?? []) as Array<{ id: string, nome: string, tipo: string, eh_destino_padrao_venda: boolean, ativo: boolean, foto_url: string | null }>;
  return linhas.map(r => ({
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    ehDestinoPadraoVenda: r.eh_destino_padrao_venda,
    ativo: r.ativo,
    fotoUrl: r.foto_url,
  }));
}

export async function salvarConta(conta: ContaCompleta): Promise<void> {
  const { error } = await supabase.from('conta').upsert({
    id: conta.id,
    nome: conta.nome,
    tipo: conta.tipo,
    eh_destino_padrao_venda: conta.ehDestinoPadraoVenda,
    ativo: conta.ativo,
    foto_url: conta.fotoUrl,
  });
  if (error) throw error;
}

export async function uploadFotoConta(contaId: string, arquivo: File): Promise<string> {
  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
  const caminho = `contas/${contaId}/avatar.${ext}`;
  const { error: eUp } = await supabase.storage
    .from('avatares')
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
  if (eUp) throw eUp;

  const { data: pub } = supabase.storage.from('avatares').getPublicUrl(caminho);
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: eUsr } = await supabase.from('conta').update({ foto_url: url }).eq('id', contaId);
  if (eUsr) throw eUsr;
  return url;
}

export async function lerConfig(chave: string): Promise<unknown> {
  const { data, error } = await supabase.from('config').select('valor_json').eq('chave', chave).maybeSingle();
  if (error) throw error;
  return data?.valor_json ?? null;
}

export async function salvarConfig(chave: string, valorJson: unknown): Promise<void> {
  const { error } = await supabase.from('config').upsert({
    chave,
    valor_json: valorJson,
  });
  if (error) throw error;
}

// ---- Taxa de cartão (histórico por vigência §3.6 + §5.6) ----------------------

export interface TaxaCartaoConfig {
  /** percentual em basis points (3% = 300). */
  percentualBp: number;
  fixaCentavos: number;
}

export interface TaxasCartaoVigentes {
  debito: TaxaCartaoConfig;
  credito: TaxaCartaoConfig;
  /** PIX via maquininha (PIX direto na chave do banco é grátis). */
  pix: TaxaCartaoConfig;
}

interface TaxaCartaoRow {
  forma: string;
  percentual_bp: number;
  fixa_centavos: number;
  valido_a_partir_de: string;
}

function agruparTaxasPorForma(rows: TaxaCartaoRow[]): Map<string, RegistroTaxa[]> {
  const porForma = new Map<string, RegistroTaxa[]>();
  for (const t of rows) {
    const lista = porForma.get(t.forma) ?? [];
    lista.push({
      percentualBp: BigInt(t.percentual_bp),
      fixa: asCentavos(BigInt(t.fixa_centavos)),
      validoApartirDe: t.valido_a_partir_de,
    });
    porForma.set(t.forma, lista);
  }
  return porForma;
}

/** Taxa de cartão vigente numa data (default: hoje, Manaus), resolvida do histórico. */
export async function taxaCartaoVigenteEmData(data?: string): Promise<TaxasCartaoVigentes> {
  const ref = data ?? hojeManaus();
  const { data: rows, error } = await supabase
    .from('taxa_cartao')
    .select('forma,percentual_bp,fixa_centavos,valido_a_partir_de');
  if (error) throw error;
  const porForma = agruparTaxasPorForma((rows ?? []) as TaxaCartaoRow[]);
  const deb = taxaCartaoVigenteEm(porForma.get('debito') ?? [], ref);
  const cred = taxaCartaoVigenteEm(porForma.get('credito') ?? [], ref);
  const pix = taxaCartaoVigenteEm(porForma.get('pix') ?? [], ref);
  return {
    debito: { percentualBp: Number(deb.percentualBp), fixaCentavos: Number(deb.fixa) },
    credito: { percentualBp: Number(cred.percentualBp), fixaCentavos: Number(cred.fixa) },
    pix: { percentualBp: Number(pix.percentualBp), fixaCentavos: Number(pix.fixa) },
  };
}

/**
 * Insere uma nova vigência de taxa (débito + crédito) a partir de `data`
 * (YYYY-MM-DD). NÃO sobrescreve o histórico — adiciona um registro novo, igual a
 * preço/custo. Escrita gated por `editar_configuracoes` (RLS).
 */
export async function salvarVigenciaTaxaCartao(args: {
  data: string;
  debito: TaxaCartaoConfig;
  credito: TaxaCartaoConfig;
  pix: TaxaCartaoConfig;
}): Promise<void> {
  const linha = (forma: string, t: TaxaCartaoConfig) => ({
    id: uuidv7(),
    forma,
    percentual_bp: t.percentualBp,
    fixa_centavos: t.fixaCentavos,
    valido_a_partir_de: args.data,
  });
  const linhas = [
    linha('debito', args.debito),
    linha('credito', args.credito),
    linha('pix', args.pix),
  ];
  const { error } = await supabase.from('taxa_cartao').insert(linhas);
  if (error) throw error;
}

// ---- Tarifa de PIX por conta de banco (histórico por vigência) ----------------

export interface TaxaPixContaConfig {
  /** percentual em basis points (1,45% = 145). */
  percentualBp: number;
  /** tarifa mínima por transação, em centavos (0 = sem mínimo). */
  minimoCentavos: number;
  /** tarifa máxima por transação, em centavos (0 = sem máximo). */
  maximoCentavos: number;
}

interface TaxaPixContaRow {
  conta_id: string;
  percentual_bp: number;
  minimo_centavos: number;
  maximo_centavos: number;
  valido_a_partir_de: string;
}

/**
 * Tarifa de PIX vigente numa data (default: hoje, Manaus) para CADA conta de banco,
 * resolvida do histórico. Retorna Map<contaId, regra vigente>. Contas sem nenhuma
 * vigência ficam fora do mapa (tratar como tarifa zero na borda).
 */
export async function taxasPixContaVigentesEmData(
  data?: string,
): Promise<Map<string, TaxaPixContaConfig>> {
  const ref = data ?? hojeManaus();
  const { data: rows, error } = await supabase
    .from('taxa_pix_conta')
    .select('conta_id,percentual_bp,minimo_centavos,maximo_centavos,valido_a_partir_de');
  if (error) throw error;

  const porConta = new Map<string, RegistroTaxaPix[]>();
  for (const t of (rows ?? []) as TaxaPixContaRow[]) {
    const lista = porConta.get(t.conta_id) ?? [];
    lista.push({
      percentualBp: BigInt(t.percentual_bp),
      minimo: asCentavos(BigInt(t.minimo_centavos)),
      maximo: asCentavos(BigInt(t.maximo_centavos)),
      validoApartirDe: t.valido_a_partir_de,
    });
    porConta.set(t.conta_id, lista);
  }

  const resultado = new Map<string, TaxaPixContaConfig>();
  for (const [contaId, historico] of porConta) {
    const v = taxaPixVigenteEm(historico, ref);
    resultado.set(contaId, {
      percentualBp: Number(v.percentualBp),
      minimoCentavos: Number(v.minimo),
      maximoCentavos: Number(v.maximo),
    });
  }
  return resultado;
}

export interface VigenciaTaxaPixConta {
  id: string;
  contaId: string;
  percentualBp: number;
  minimoCentavos: number;
  maximoCentavos: number;
  validoAPartirDe: string;
}

/** Histórico de tarifas de PIX de uma conta, mais recentes primeiro. */
export async function listarVigenciasTaxaPixConta(contaId: string): Promise<VigenciaTaxaPixConta[]> {
  const { data, error } = await supabase
    .from('taxa_pix_conta')
    .select('id,conta_id,percentual_bp,minimo_centavos,maximo_centavos,valido_a_partir_de')
    .eq('conta_id', contaId)
    .order('valido_a_partir_de', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string } & TaxaPixContaRow>).map((r) => ({
    id: r.id,
    contaId: r.conta_id,
    percentualBp: Number(r.percentual_bp),
    minimoCentavos: Number(r.minimo_centavos),
    maximoCentavos: Number(r.maximo_centavos),
    validoAPartirDe: r.valido_a_partir_de,
  }));
}

/**
 * Insere uma nova vigência de tarifa de PIX para uma conta a partir de `data`
 * (YYYY-MM-DD). NÃO sobrescreve o histórico — adiciona um registro novo, igual a
 * preço/custo. Escrita gated por `gerenciar_contas` (RLS).
 */
export async function salvarVigenciaTaxaPixConta(args: {
  contaId: string;
  data: string;
  taxa: TaxaPixContaConfig;
}): Promise<void> {
  const { error } = await supabase.from('taxa_pix_conta').insert({
    id: uuidv7(),
    conta_id: args.contaId,
    percentual_bp: args.taxa.percentualBp,
    minimo_centavos: args.taxa.minimoCentavos,
    maximo_centavos: args.taxa.maximoCentavos,
    valido_a_partir_de: args.data,
  });
  if (error) throw error;
}

export interface ResumoEntradasBanco {
  /** PIX que entrou no banco (sem taxa). */
  pix: Centavos;
  /** Débito LÍQUIDO que entrou no banco (já sem a taxa). */
  debito: Centavos;
  /** Crédito LÍQUIDO que entrou no banco (já sem a taxa). */
  credito: Centavos;
  /** Desconto do banco (taxa de cartão), magnitude positiva. */
  taxa: Centavos;
  /** Total que realmente entrou no banco (pix + débito + crédito líquidos). */
  totalLiquido: Centavos;
}

/**
 * Soma, por canal, quanto de PIX / débito / crédito entrou no BANCO no período, e
 * o desconto do banco (taxa de cartão) separado — para o painel de Transferências.
 * Reforça o Pilar 2: isso é dinheiro do banco, não da gaveta. Intervalo por data de
 * Manaus (inclusivo nas duas pontas).
 */
export async function resumoEntradasBanco(de: string, ate: string): Promise<ResumoEntradasBanco> {
  const { data: rows, error } = await supabase
    .from('movimento')
    .select('tipo,forma_pagamento,valor_centavos,conta:conta_id(tipo)')
    .in('tipo', ['recebimento_venda', 'taxa_cartao'])
    .gte('data_hora', limitesDoDiaManaus(de).inicio)
    .lt('data_hora', limitesDoDiaManaus(ate).fim);
  if (error) throw error;

  const linhas = (rows ?? []) as unknown as Array<{
    tipo: string;
    forma_pagamento: string | null;
    valor_centavos: number;
    conta: { tipo: string } | { tipo: string }[] | null;
  }>;

  let pix = 0n;
  let debito = 0n;
  let credito = 0n;
  let taxa = 0n;
  for (const m of linhas) {
    const conta = Array.isArray(m.conta) ? m.conta[0] : m.conta;
    if (m.tipo === 'recebimento_venda' && conta?.tipo === 'banco') {
      if (m.forma_pagamento === 'pix') pix += BigInt(m.valor_centavos);
      else if (m.forma_pagamento === 'debito') debito += BigInt(m.valor_centavos);
      else if (m.forma_pagamento === 'credito') credito += BigInt(m.valor_centavos);
    } else if (m.tipo === 'taxa_cartao') {
      const v = BigInt(m.valor_centavos);
      taxa += v < 0n ? -v : v;
    }
  }

  return {
    pix: asCentavos(pix),
    debito: asCentavos(debito),
    credito: asCentavos(credito),
    taxa: asCentavos(taxa),
    totalLiquido: asCentavos(pix + debito + credito),
  };
}

export interface ProdutoCompleto {
  id: string;
  nome: string;
  categoriaId: string;
  unidade: string;
  ordem: number;
  modoApuracao: string;
  alertaBaixo: number | null;
  alertaMuitoBaixo: number | null;
  ativo: boolean;
}

export async function listarTodosProdutos(): Promise<ProdutoCompleto[]> {
  const { data, error } = await supabase.from('produto').select('*').order('ordem');
  if (error) throw error;
  const linhas = (data ?? []) as Array<{
    id: string; nome: string; categoria_id: string; unidade: string;
    ordem: number; modo_apuracao: string; alerta_baixo: number | null;
    alerta_muito_baixo: number | null; ativo: boolean;
  }>;
  return linhas.map(p => ({
    id: p.id,
    nome: p.nome,
    categoriaId: p.categoria_id,
    unidade: p.unidade,
    ordem: p.ordem,
    modoApuracao: p.modo_apuracao,
    alertaBaixo: p.alerta_baixo,
    alertaMuitoBaixo: p.alerta_muito_baixo,
    ativo: p.ativo,
  }));
}

export async function salvarProduto(prod: ProdutoCompleto): Promise<void> {
  const { error } = await supabase.from('produto').upsert({
    id: prod.id,
    nome: prod.nome,
    categoria_id: prod.categoriaId,
    unidade: prod.unidade,
    ordem: prod.ordem,
    modo_apuracao: prod.modoApuracao,
    alerta_baixo: prod.alertaBaixo,
    alerta_muito_baixo: prod.alertaMuitoBaixo,
    ativo: prod.ativo,
  });
  if (error) throw error;
}

export async function adicionarPrecoProduto(id: string, produtoId: string, valorCentavos: Centavos, validoAPartirDe: string): Promise<void> {
  const { error } = await supabase.from('preco_produto').insert({
    id,
    produto_id: produtoId,
    valor_centavos: centavosParaNumero(valorCentavos),
    valido_a_partir_de: validoAPartirDe,
  });
  if (error) throw error;
}

export async function adicionarCustoProduto(id: string, produtoId: string, valorCentavos: Centavos, validoAPartirDe: string): Promise<void> {
  const { error } = await supabase.from('custo_produto').insert({
    id,
    produto_id: produtoId,
    valor_centavos: centavosParaNumero(valorCentavos),
    valido_a_partir_de: validoAPartirDe,
  });
  if (error) throw error;
}

export interface PrecoProdutoHistorico {
  id: string;
  produtoId: string;
  valorCentavos: Centavos;
  validoAPartirDe: string;
}

export async function listarPrecosProduto(produtoId: string): Promise<PrecoProdutoHistorico[]> {
  const { data, error } = await supabase
    .from('preco_produto')
    .select('id,produto_id,valor_centavos,valido_a_partir_de')
    .eq('produto_id', produtoId)
    .order('valido_a_partir_de', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    produtoId: p.produto_id,
    valorCentavos: paraCentavos(p.valor_centavos),
    validoAPartirDe: p.valido_a_partir_de,
  }));
}

export interface CustoProdutoHistorico {
  id: string;
  produtoId: string;
  valorCentavos: Centavos;
  validoAPartirDe: string;
}

export async function listarCustosProduto(produtoId: string): Promise<CustoProdutoHistorico[]> {
  const { data, error } = await supabase
    .from('custo_produto')
    .select('id,produto_id,valor_centavos,valido_a_partir_de')
    .eq('produto_id', produtoId)
    .order('valido_a_partir_de', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    produtoId: p.produto_id,
    valorCentavos: paraCentavos(p.valor_centavos),
    validoAPartirDe: p.valido_a_partir_de,
  }));
}

export interface EntradaMercadoria {
  id: string;
  produtoId: string;
  quantidade: number;
  custoUnitarioCentavos: Centavos;
  data: string;
  fechamentoId: string | null;
  criadoEm: string;
}

export async function listarEntradasMercadoriaProduto(produtoId: string): Promise<EntradaMercadoria[]> {
  const { data, error } = await supabase
    .from('entrada_mercadoria')
    .select('id,produto_id,quantidade,custo_unitario_centavos,data,fechamento_id,criado_em')
    .eq('produto_id', produtoId)
    .order('data', { ascending: false })
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    produtoId: p.produto_id,
    quantidade: Number(p.quantidade),
    custoUnitarioCentavos: paraCentavos(p.custo_unitario_centavos),
    data: p.data,
    fechamentoId: p.fechamento_id,
    criadoEm: p.criado_em,
  }));
}

export async function adicionarEntradaMercadoria(
  id: string,
  produtoId: string,
  quantidade: number,
  custoUnitarioCentavos: Centavos,
  data: string,
  notaId?: string | null
): Promise<void> {
  const { error } = await supabase.from('entrada_mercadoria').insert({
    id,
    produto_id: produtoId,
    quantidade,
    custo_unitario_centavos: centavosParaNumero(custoUnitarioCentavos),
    data,
    nota_id: notaId ?? null,
  });
  if (error) throw error;
}

/** Atualiza uma entrada de mercadoria existente (edição — Req 1). RLS: editar_entrada_merc. */
export async function atualizarEntradaMercadoria(
  id: string,
  campos: { quantidade: number; custoUnitarioCentavos: Centavos; data: string }
): Promise<void> {
  const { error } = await supabase
    .from('entrada_mercadoria')
    .update({
      quantidade: campos.quantidade,
      custo_unitario_centavos: centavosParaNumero(campos.custoUnitarioCentavos),
      data: campos.data,
    })
    .eq('id', id);
  if (error) throw error;
}

/** Custo unitário da entrada mais recente do produto (para pré-preencher). */
export async function ultimoCustoEntrada(produtoId: string): Promise<Centavos | null> {
  const { data, error } = await supabase
    .from('entrada_mercadoria')
    .select('custo_unitario_centavos')
    .eq('produto_id', produtoId)
    .order('data', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? paraCentavos(data.custo_unitario_centavos) : null;
}

/**
 * Registra uma entrada de mercadoria e, opcionalmente, atualiza o PREÇO DE VENDA do
 * produto criando uma vigência em `preco_produto` na data da nota (decisão: preço
 * vale a partir da data da entrada). Só grava preço se veio e difere do vigente.
 * O custo da entrada fica só na linha (alimenta valor do estoque, §3.5) — NÃO mexe
 * em `custo_produto` (custo de lucro fixado pelo gerente).
 */
export async function registrarEntradaComPreco(args: {
  produtoId: string;
  quantidade: number;
  custo: Centavos;
  data: string;
  precoVenda?: Centavos | null;
  precoVendaVigente?: Centavos | null;
  notaId?: string | null;
}): Promise<void> {
  await adicionarEntradaMercadoria(uuidv7(), args.produtoId, args.quantidade, args.custo, args.data, args.notaId ?? null);
  if (
    args.precoVenda != null &&
    args.precoVenda > 0n &&
    args.precoVenda !== (args.precoVendaVigente ?? null)
  ) {
    await adicionarPrecoProduto(uuidv7(), args.produtoId, args.precoVenda, args.data);
  }
}

export interface NotaResumo {
  notaId: string;
  data: string;
  itens: number;
  totalCentavos: Centavos;
}

/** Notas de entrada de mercadoria (agrupadas por nota_id), mais recentes primeiro. */
export async function listarNotasMercadoria(): Promise<NotaResumo[]> {
  const { data, error } = await supabase
    .from('entrada_mercadoria')
    .select('nota_id, quantidade, custo_unitario_centavos, data')
    .not('nota_id', 'is', null)
    .order('data', { ascending: false });
  if (error) throw error;
  const linhas = (data ?? []) as Array<{ nota_id: string; quantidade: number; custo_unitario_centavos: number; data: string }>;
  const mapa = new Map<string, NotaResumo>();
  for (const l of linhas) {
    const atual = mapa.get(l.nota_id) ?? { notaId: l.nota_id, data: l.data, itens: 0, totalCentavos: asCentavos(0n) };
    atual.itens += 1;
    atual.totalCentavos = asCentavos(
      (atual.totalCentavos as bigint) + BigInt(Math.round(Number(l.quantidade) * l.custo_unitario_centavos)),
    );
    mapa.set(l.nota_id, atual);
  }
  return [...mapa.values()];
}

export interface ItemNota {
  entradaId: string;
  produtoId: string;
  nome: string;
  quantidade: number;
  custoUnitarioCentavos: Centavos;
  precoVendaVigente: Centavos | null;
}

/** Itens de uma nota de mercadoria, para carregar no editor da notinha. */
export async function listarItensNotaMercadoria(notaId: string): Promise<{ data: string; itens: ItemNota[] }> {
  const { data, error } = await supabase
    .from('entrada_mercadoria')
    .select('id, produto_id, quantidade, custo_unitario_centavos, data, produto:produto_id(nome)')
    .eq('nota_id', notaId)
    .order('criado_em', { ascending: true });
  if (error) throw error;
  const linhas = (data ?? []) as unknown as Array<{
    id: string; produto_id: string; quantidade: number; custo_unitario_centavos: number; data: string;
    produto: { nome: string } | { nome: string }[] | null;
  }>;
  const itens: ItemNota[] = linhas.map((l) => ({
    entradaId: l.id,
    produtoId: l.produto_id,
    nome: nomeRel(l.produto) ?? '—',
    quantidade: Number(l.quantidade),
    custoUnitarioCentavos: paraCentavos(l.custo_unitario_centavos),
    precoVendaVigente: null,
  }));
  return { data: linhas[0]?.data ?? hojeManaus(), itens };
}

/**
 * Total de SAÍDAS (vendido) por produto no período [de, ate], por conservação de
 * estoque: contagem → estoque_início + entradas − perdas − estoque_fim; individual
 * → soma de venda_avulsa. Reusa `obterDadosProdutosNaData` (estoque derivado numa
 * data). Retorna Map<produtoId, unidades>.
 */
export async function listarSaidasProdutoPeriodo(de: string, ate: string): Promise<Map<string, number>> {
  const diaAntesDe = (() => {
    const d = new Date(`${de}T00:00:00`);
    d.setDate(d.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();
  const inicioVenda = limitesDoDiaManaus(de).inicio;
  const fimVenda = limitesDoDiaManaus(ate).fim;

  const [estoqueInicioArr, estoqueFimArr, entRes, perdaRes, vendaRes, prodRes] = await Promise.all([
    obterDadosProdutosNaData(diaAntesDe),
    obterDadosProdutosNaData(ate),
    supabase.from('entrada_mercadoria').select('produto_id, quantidade').gte('data', de).lte('data', ate),
    supabase.from('perda').select('produto_id, quantidade').gte('data', de).lte('data', ate),
    supabase.from('venda_avulsa').select('produto_id, quantidade').gte('data_hora', inicioVenda).lt('data_hora', fimVenda),
    supabase.from('produto').select('id, modo_apuracao'),
  ]);

  const somarPorProduto = (rows: Array<{ produto_id: string; quantidade: number }> | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.produto_id, (m.get(r.produto_id) ?? 0) + Number(r.quantidade));
    return m;
  };
  const entradas = somarPorProduto(entRes.data as Array<{ produto_id: string; quantidade: number }> | null);
  const perdas = somarPorProduto(perdaRes.data as Array<{ produto_id: string; quantidade: number }> | null);
  const vendasAvulsas = somarPorProduto(vendaRes.data as Array<{ produto_id: string; quantidade: number }> | null);
  const estoqueInicio = new Map(estoqueInicioArr.map((p) => [p.id, p.estoque]));
  const estoqueFim = new Map(estoqueFimArr.map((p) => [p.id, p.estoque]));
  const modo = new Map(
    ((prodRes.data ?? []) as Array<{ id: string; modo_apuracao: string }>).map((p) => [p.id, p.modo_apuracao]),
  );

  const saidas = new Map<string, number>();
  for (const p of estoqueFimArr) {
    if (modo.get(p.id) === 'individual') {
      saidas.set(p.id, vendasAvulsas.get(p.id) ?? 0);
    } else {
      const vendido =
        (estoqueInicio.get(p.id) ?? 0) +
        (entradas.get(p.id) ?? 0) -
        (perdas.get(p.id) ?? 0) -
        (estoqueFim.get(p.id) ?? 0);
      saidas.set(p.id, vendido > 0 ? vendido : 0);
    }
  }
  return saidas;
}

/** Total de entradas de mercadoria por produto numa DATA (para a coluna do dia). */
export async function entradasMercadoriaDoDia(data: string): Promise<Map<string, number>> {
  const { data: rows, error } = await supabase
    .from('entrada_mercadoria')
    .select('produto_id, quantidade')
    .eq('data', data);
  if (error) throw error;
  const m = new Map<string, number>();
  for (const r of (rows ?? []) as Array<{ produto_id: string; quantidade: number }>) {
    m.set(r.produto_id, (m.get(r.produto_id) ?? 0) + Number(r.quantidade));
  }
  return m;
}

// =====================================================================
// Combustível e tanques (§3.2, §5.6) — cadastro, entradas, medições,
// preço e custo. Preço/custo são por COMBUSTÍVEL (não por tanque).
// =====================================================================

export interface Combustivel {
  id: string;
  nome: string;
}

export async function listarCombustiveis(): Promise<Combustivel[]> {
  const { data, error } = await supabase.from('combustivel').select('id,nome').order('nome');
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; nome: string }>).map((c) => ({ id: c.id, nome: c.nome }));
}

export async function salvarCombustivel(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from('combustivel').upsert({ id, nome });
  if (error) throw error;
}

export interface TanqueConfig {
  id: string;
  nome: string;
  combustivelId: string;
  combustivelNome: string;
  capacidade: Mililitros;
  nivelAlerta: Mililitros;
  nivel: Mililitros;
  precoVenda: Centavos | null;
  custo: Centavos | null;
  ativo: boolean;
  bombas: string[];
}

/** Tanques para a tela de gestão: config + nível derivado + preço/custo vigentes. */
export async function listarTanquesConfig(dataSelecionada?: string): Promise<TanqueConfig[]> {
  const [
    { data: tanques, error: e1 },
    { data: precos, error: e2 },
    { data: custos, error: e3 },
    { data: bombas, error: e4 },
    niveis,
  ] = await Promise.all([
    supabase
      .from('tanque')
      .select('id,nome,combustivel_id,capacidade_litros,nivel_alerta_litros,ativo,combustivel(nome)')
      .order('nome'),
    supabase.from('preco_combustivel').select('combustivel_id,valor_centavos,valido_a_partir_de'),
    supabase.from('custo_combustivel').select('combustivel_id,valor_centavos,valido_a_partir_de'),
    supabase.from('bomba').select('tanque_id,nome,ativo'),
    calcularNiveisDerivados(dataSelecionada),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;

  const histPreco = new Map<string, RegistroVigencia[]>();
  for (const p of (precos ?? []) as Array<{ combustivel_id: string; valor_centavos: number; valido_a_partir_de: string }>) {
    const lista = histPreco.get(p.combustivel_id) ?? [];
    lista.push({ valorCentavos: paraCentavos(p.valor_centavos), validoApartirDe: p.valido_a_partir_de });
    histPreco.set(p.combustivel_id, lista);
  }
  const histCusto = new Map<string, RegistroVigencia[]>();
  for (const c of (custos ?? []) as Array<{ combustivel_id: string; valor_centavos: number; valido_a_partir_de: string }>) {
    const lista = histCusto.get(c.combustivel_id) ?? [];
    lista.push({ valorCentavos: paraCentavos(c.valor_centavos), validoApartirDe: c.valido_a_partir_de });
    histCusto.set(c.combustivel_id, lista);
  }

  const bombasPorTanque = new Map<string, string[]>();
  for (const b of (bombas ?? []) as Array<{ tanque_id: string; nome: string; ativo: boolean }>) {
    if (b.ativo) {
      const lista = bombasPorTanque.get(b.tanque_id) ?? [];
      lista.push(b.nome);
      bombasPorTanque.set(b.tanque_id, lista);
    }
  }

  const hoje = dataSelecionada ?? hojeManaus();
  const agora = dataSelecionada ? `${dataSelecionada}T23:59:59-04:00` : new Date().toISOString();
  return ((tanques ?? []) as Array<{
    id: string; nome: string; combustivel_id: string;
    capacidade_litros: number; nivel_alerta_litros: number; ativo: boolean;
    combustivel: { nome: string } | { nome: string }[] | null;
  }>).map((t) => {
    const comb = Array.isArray(t.combustivel) ? t.combustivel[0] : t.combustivel;
    return {
      id: t.id,
      nome: t.nome,
      combustivelId: t.combustivel_id,
      combustivelNome: comb?.nome ?? '',
      capacidade: litrosParaMililitros(t.capacidade_litros),
      nivelAlerta: litrosParaMililitros(t.nivel_alerta_litros),
      nivel: niveis.get(t.id) ?? asMililitros(0n),
      precoVenda: precoVigenteEm(histPreco.get(t.combustivel_id) ?? [], hoje) ?? null,
      custo: custoVigenteEm(histCusto.get(t.combustivel_id) ?? [], agora) ?? null,
      ativo: t.ativo,
      bombas: bombasPorTanque.get(t.id) ?? [],
    };
  });
}

export interface TanqueGravavel {
  id: string;
  nome: string;
  combustivelId: string;
  capacidadeLitros: number;
  nivelAlertaLitros: number;
  ativo: boolean;
}

export async function salvarTanque(t: TanqueGravavel): Promise<void> {
  const { error } = await supabase.from('tanque').upsert({
    id: t.id,
    nome: t.nome,
    combustivel_id: t.combustivelId,
    capacidade_litros: t.capacidadeLitros,
    nivel_alerta_litros: t.nivelAlertaLitros,
    ativo: t.ativo,
  });
  if (error) throw error;
}

export interface BombaConfig {
  id: string;
  tanqueId: string;
  nome: string;
  ativo: boolean;
}

export async function listarBombasTanque(tanqueId: string): Promise<BombaConfig[]> {
  const { data, error } = await supabase
    .from('bomba')
    .select('id,tanque_id,nome,ativo')
    .eq('tanque_id', tanqueId)
    .order('nome');
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; tanque_id: string; nome: string; ativo: boolean }>).map(
    (b) => ({ id: b.id, tanqueId: b.tanque_id, nome: b.nome, ativo: b.ativo }),
  );
}

export async function salvarBomba(b: BombaConfig): Promise<void> {
  const { error } = await supabase.from('bomba').upsert({
    id: b.id,
    tanque_id: b.tanqueId,
    nome: b.nome,
    ativo: b.ativo,
  });
  if (error) throw error;
}

export interface EntradaCombustivel {
  id: string;
  tanqueId: string;
  litros: number;
  custoLitroCentavos: Centavos;
  data: string;
  criadoEm: string;
}

export async function listarEntradasCombustivel(tanqueId: string): Promise<EntradaCombustivel[]> {
  const { data, error } = await supabase
    .from('entrada_combustivel')
    .select('id,tanque_id,litros,custo_litro_centavos,data,criado_em')
    .eq('tanque_id', tanqueId)
    .order('data', { ascending: false })
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string; tanque_id: string; litros: number; custo_litro_centavos: number; data: string; criado_em: string;
  }>).map((e) => ({
    id: e.id,
    tanqueId: e.tanque_id,
    litros: Number(e.litros),
    custoLitroCentavos: paraCentavos(e.custo_litro_centavos),
    data: e.data,
    criadoEm: e.criado_em,
  }));
}

export async function adicionarEntradaCombustivel(
  id: string,
  tanqueId: string,
  litros: number,
  custoLitroCentavos: Centavos,
  data: string,
  notaId?: string | null,
): Promise<void> {
  const { error } = await supabase.from('entrada_combustivel').insert({
    id,
    tanque_id: tanqueId,
    litros,
    custo_litro_centavos: centavosParaNumero(custoLitroCentavos),
    data,
    nota_id: notaId ?? null,
  });
  if (error) throw error;
}

/** Atualiza uma entrada de combustível existente (edição). RLS: editar_entrada_comb. */
export async function atualizarEntradaCombustivel(
  id: string,
  campos: { litros: number; custoLitroCentavos: Centavos; data: string }
): Promise<void> {
  const { error } = await supabase
    .from('entrada_combustivel')
    .update({
      litros: campos.litros,
      custo_litro_centavos: centavosParaNumero(campos.custoLitroCentavos),
      data: campos.data,
    })
    .eq('id', id);
  if (error) throw error;
}

/** Custo/litro da entrada de carga mais recente do tanque (para pré-preencher). */
export async function ultimoCustoCombustivel(tanqueId: string): Promise<Centavos | null> {
  const { data, error } = await supabase
    .from('entrada_combustivel')
    .select('custo_litro_centavos')
    .eq('tanque_id', tanqueId)
    .order('data', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? paraCentavos(data.custo_litro_centavos) : null;
}

/**
 * Registra uma entrada de carga e, opcionalmente, atualiza o PREÇO DE VENDA do
 * combustível (vigência em `preco_combustivel` na data da nota). O preço é por
 * COMBUSTÍVEL (não por tanque), então só grava se vier `combustivelId` + `precoVenda`
 * diferente do vigente. Combustível NÃO afeta o caixa (sem cascata).
 */
export async function registrarEntradaCombustivelComPreco(args: {
  tanqueId: string;
  litros: number;
  custo: Centavos;
  data: string;
  notaId?: string | null;
  combustivelId?: string | null;
  precoVenda?: Centavos | null;
  precoVendaVigente?: Centavos | null;
}): Promise<void> {
  await adicionarEntradaCombustivel(uuidv7(), args.tanqueId, args.litros, args.custo, args.data, args.notaId ?? null);
  if (
    args.combustivelId &&
    args.precoVenda != null &&
    args.precoVenda > 0n &&
    args.precoVenda !== (args.precoVendaVigente ?? null)
  ) {
    await adicionarPrecoCombustivel(uuidv7(), args.combustivelId, args.precoVenda, args.data);
  }
}

/** Notas de entrada de combustível (agrupadas por nota_id), mais recentes primeiro. */
export async function listarNotasCombustivel(): Promise<NotaResumo[]> {
  const { data, error } = await supabase
    .from('entrada_combustivel')
    .select('nota_id, litros, custo_litro_centavos, data')
    .not('nota_id', 'is', null)
    .order('data', { ascending: false });
  if (error) throw error;
  const linhas = (data ?? []) as Array<{ nota_id: string; litros: number; custo_litro_centavos: number; data: string }>;
  const mapa = new Map<string, NotaResumo>();
  for (const l of linhas) {
    const atual = mapa.get(l.nota_id) ?? { notaId: l.nota_id, data: l.data, itens: 0, totalCentavos: asCentavos(0n) };
    atual.itens += 1;
    atual.totalCentavos = asCentavos(
      (atual.totalCentavos as bigint) + BigInt(Math.round(Number(l.litros) * l.custo_litro_centavos)),
    );
    mapa.set(l.nota_id, atual);
  }
  return [...mapa.values()];
}

export interface ItemNotaCombustivel {
  entradaId: string;
  tanqueId: string;
  nome: string;
  litros: number;
  custoLitroCentavos: Centavos;
}

/** Itens de uma nota de combustível, para carregar no editor da notinha. */
export async function listarItensNotaCombustivel(notaId: string): Promise<{ data: string; itens: ItemNotaCombustivel[] }> {
  const { data, error } = await supabase
    .from('entrada_combustivel')
    .select('id, tanque_id, litros, custo_litro_centavos, data, tanque:tanque_id(nome)')
    .eq('nota_id', notaId)
    .order('criado_em', { ascending: true });
  if (error) throw error;
  const linhas = (data ?? []) as unknown as Array<{
    id: string; tanque_id: string; litros: number; custo_litro_centavos: number; data: string;
    tanque: { nome: string } | { nome: string }[] | null;
  }>;
  const itens: ItemNotaCombustivel[] = linhas.map((l) => ({
    entradaId: l.id,
    tanqueId: l.tanque_id,
    nome: nomeRel(l.tanque) ?? '—',
    litros: Number(l.litros),
    custoLitroCentavos: paraCentavos(l.custo_litro_centavos),
  }));
  return { data: linhas[0]?.data ?? hojeManaus(), itens };
}

export interface MedicaoTanque {
  id: string;
  tanqueId: string;
  litrosMedidos: number;
  dataHora: string;
  observacao: string | null;
}

export async function listarMedicoesTanque(tanqueId: string): Promise<MedicaoTanque[]> {
  const { data, error } = await supabase
    .from('medicao_tanque')
    .select('id,tanque_id,litros_medidos,data_hora,observacao')
    .eq('tanque_id', tanqueId)
    .order('data_hora', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string; tanque_id: string; litros_medidos: number; data_hora: string; observacao: string | null;
  }>).map((m) => ({
    id: m.id,
    tanqueId: m.tanque_id,
    litrosMedidos: Number(m.litros_medidos),
    dataHora: m.data_hora,
    observacao: m.observacao,
  }));
}

export async function adicionarMedicaoTanque(
  id: string,
  tanqueId: string,
  litrosMedidos: number,
  dataHora: string,
  observacao: string | null,
): Promise<void> {
  const { error } = await supabase.from('medicao_tanque').insert({
    id,
    tanque_id: tanqueId,
    litros_medidos: litrosMedidos,
    data_hora: dataHora,
    observacao: observacao && observacao.trim() ? observacao.trim() : null,
  });
  if (error) throw error;
}

export interface VigenciaCombustivel {
  id: string;
  combustivelId: string;
  valorCentavos: Centavos;
  validoAPartirDe: string;
}

export async function listarPrecosCombustivel(combustivelId: string): Promise<VigenciaCombustivel[]> {
  const { data, error } = await supabase
    .from('preco_combustivel')
    .select('id,combustivel_id,valor_centavos,valido_a_partir_de')
    .eq('combustivel_id', combustivelId)
    .order('valido_a_partir_de', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string; combustivel_id: string; valor_centavos: number; valido_a_partir_de: string;
  }>).map((p) => ({
    id: p.id,
    combustivelId: p.combustivel_id,
    valorCentavos: paraCentavos(p.valor_centavos),
    validoAPartirDe: p.valido_a_partir_de,
  }));
}

export async function adicionarPrecoCombustivel(
  id: string,
  combustivelId: string,
  valorCentavos: Centavos,
  validoAPartirDe: string,
): Promise<void> {
  const { error } = await supabase.from('preco_combustivel').insert({
    id,
    combustivel_id: combustivelId,
    valor_centavos: centavosParaNumero(valorCentavos),
    valido_a_partir_de: validoAPartirDe,
  });
  if (error) throw error;
}

export async function listarCustosCombustivel(combustivelId: string): Promise<VigenciaCombustivel[]> {
  const { data, error } = await supabase
    .from('custo_combustivel')
    .select('id,combustivel_id,valor_centavos,valido_a_partir_de')
    .eq('combustivel_id', combustivelId)
    .order('valido_a_partir_de', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<{
    id: string; combustivel_id: string; valor_centavos: number; valido_a_partir_de: string;
  }>).map((c) => ({
    id: c.id,
    combustivelId: c.combustivel_id,
    valorCentavos: paraCentavos(c.valor_centavos),
    validoAPartirDe: c.valido_a_partir_de,
  }));
}

export async function adicionarCustoCombustivel(
  id: string,
  combustivelId: string,
  valorCentavos: Centavos,
  validoAPartirDe: string,
): Promise<void> {
  const { error } = await supabase.from('custo_combustivel').insert({
    id,
    combustivel_id: combustivelId,
    valor_centavos: centavosParaNumero(valorCentavos),
    valido_a_partir_de: validoAPartirDe,
  });
  if (error) throw error;
}

export interface ProdutoNaData {
  id: string;
  nome: string;
  categoriaId: string;
  categoriaNome: string;
  ordem: number;
  modoApuracao: string;
  ativo: boolean;
  precoVenda: Centavos | null;
  custo: Centavos | null;
  estoque: number;
  alertaBaixo: number | null;
  alertaMuitoBaixo: number | null;
}

export async function obterDadosProdutosNaData(dataSelecionada: string): Promise<ProdutoNaData[]> {
  // 1. Obter produtos e categorias
  const [
    { data: produtosRaw, error: errProd },
    { data: categoriasRaw, error: errCat },
    { data: precosRaw, error: errPrecos },
    { data: custosRaw, error: errCustos },
  ] = await Promise.all([
    supabase.from('produto').select('*').order('ordem'),
    supabase.from('categoria').select('*'),
    supabase.from('preco_produto').select('*'),
    supabase.from('custo_produto').select('*'),
  ]);

  if (errProd) throw errProd;
  if (errCat) throw errCat;
  if (errPrecos) throw errPrecos;
  if (errCustos) throw errCustos;

  const categorias = (categoriasRaw ?? []) as Categoria[];
  const produtos = (produtosRaw ?? []) as Array<{
    id: string; nome: string; categoria_id: string; unidade: string;
    ordem: number; modo_apuracao: string; alerta_baixo: number | null;
    alerta_muito_baixo: number | null; ativo: boolean;
  }>;

  // 2. Encontrar o último fechamento confirmado/travado na data ou antes
  const { data: fechamentos, error: errFech } = await supabase
    .from('fechamento')
    .select('id, data, status')
    .lte('data', dataSelecionada)
    .in('status', ['confirmado', 'travado'])
    .order('data', { ascending: false });

  if (errFech) throw errFech;

  const ultimoFechamento = fechamentos && fechamentos.length > 0 ? fechamentos[0] : null;

  // Buscar contagens desse último fechamento
  let contagensRef: Record<string, number> = {};
  if (ultimoFechamento) {
    const { data: contagens, error: errCont } = await supabase
      .from('contagem_produto')
      .select('produto_id, quantidade')
      .eq('fechamento_id', ultimoFechamento.id);
    if (errCont) throw errCont;
    contagensRef = Object.fromEntries((contagens ?? []).map(c => [c.produto_id, Number(c.quantidade)]));
  }

  // 3. Buscar todas as entradas de mercadoria desde a data do último fechamento
  let queryEntradas = supabase.from('entrada_mercadoria').select('produto_id, quantidade, data');
  if (ultimoFechamento) {
    queryEntradas = queryEntradas.gt('data', ultimoFechamento.data).lte('data', dataSelecionada);
  } else {
    queryEntradas = queryEntradas.lte('data', dataSelecionada);
  }
  const { data: entradas, error: errEnt } = await queryEntradas;
  if (errEnt) throw errEnt;

  const entradasPorProduto: Record<string, number> = {};
  for (const e of (entradas ?? [])) {
    entradasPorProduto[e.produto_id] = (entradasPorProduto[e.produto_id] ?? 0) + Number(e.quantidade);
  }

  // 4. Buscar todas as perdas desde a data do último fechamento
  let queryPerdas = supabase.from('perda').select('produto_id, quantidade, data');
  if (ultimoFechamento) {
    queryPerdas = queryPerdas.gt('data', ultimoFechamento.data).lte('data', dataSelecionada);
  } else {
    queryPerdas = queryPerdas.lte('data', dataSelecionada);
  }
  const { data: perdas, error: errPerd } = await queryPerdas;
  if (errPerd) throw errPerd;

  const perdasPorProduto: Record<string, number> = {};
  for (const p of (perdas ?? [])) {
    perdasPorProduto[p.produto_id] = (perdasPorProduto[p.produto_id] ?? 0) + Number(p.quantidade);
  }

  // 5. Buscar vendas avulsas para produtos com apuração individual desde o último fechamento
  let queryVendas = supabase.from('venda_avulsa').select('produto_id, quantidade, data_hora');
  const dataHoraMin = ultimoFechamento ? `${ultimoFechamento.data}T23:59:59-04:00` : null;
  if (dataHoraMin) {
    queryVendas = queryVendas.gt('data_hora', dataHoraMin).lte('data_hora', `${dataSelecionada}T23:59:59-04:00`);
  } else {
    queryVendas = queryVendas.lte('data_hora', `${dataSelecionada}T23:59:59-04:00`);
  }
  const { data: vendas, error: errVend } = await queryVendas;
  if (errVend) throw errVend;

  const vendasPorProduto: Record<string, number> = {};
  for (const v of (vendas ?? [])) {
    vendasPorProduto[v.produto_id] = (vendasPorProduto[v.produto_id] ?? 0) + Number(v.quantidade);
  }

  // Históricos de preço e custo agrupados
  const precosHistorico = new Map<string, RegistroVigencia[]>();
  for (const p of (precosRaw ?? [])) {
    const list = precosHistorico.get(p.produto_id) ?? [];
    list.push({
      valorCentavos: paraCentavos(p.valor_centavos),
      validoApartirDe: p.valido_a_partir_de,
    });
    precosHistorico.set(p.produto_id, list);
  }

  const custosHistorico = new Map<string, RegistroVigencia[]>();
  for (const c of (custosRaw ?? [])) {
    const list = custosHistorico.get(c.produto_id) ?? [];
    list.push({
      valorCentavos: paraCentavos(c.valor_centavos),
      validoApartirDe: c.valido_a_partir_de,
    });
    custosHistorico.set(c.produto_id, list);
  }

  return produtos.map((p) => {
    const cat = categorias.find((c) => c.id === p.categoria_id);
    const preco = precoVigenteEm(precosHistorico.get(p.id) ?? [], dataSelecionada);
    const custo = custoVigenteEm(custosHistorico.get(p.id) ?? [], `${dataSelecionada}T23:59:59-04:00`);

    let estoque = 0;
    if (ultimoFechamento && ultimoFechamento.data === dataSelecionada) {
      estoque = contagensRef[p.id] ?? 0;
    } else {
      const inicial = contagensRef[p.id] ?? 0;
      const entradasQtd = entradasPorProduto[p.id] ?? 0;
      const perdasQtd = perdasPorProduto[p.id] ?? 0;
      const vendasQtd = p.modo_apuracao === 'individual' ? (vendasPorProduto[p.id] ?? 0) : 0;
      estoque = inicial + entradasQtd - perdasQtd - vendasQtd;
    }

    return {
      id: p.id,
      nome: p.nome,
      categoriaId: p.categoria_id,
      categoriaNome: cat?.nome ?? '—',
      ordem: p.ordem,
      modoApuracao: p.modo_apuracao,
      ativo: p.ativo,
      precoVenda: preco ?? null,
      custo: custo ?? null,
      estoque,
      alertaBaixo: p.alerta_baixo != null ? Number(p.alerta_baixo) : null,
      alertaMuitoBaixo: p.alerta_muito_baixo != null ? Number(p.alerta_muito_baixo) : null,
    };
  });
}


// ---- Fase 6: Livro Financeiro -------------------------------------------------

export interface Socio {
  id: string;
  nome: string;
  contato: string | null;
}

export async function listarSocios(): Promise<Socio[]> {
  const { data, error } = await supabase.from('socio').select('id,nome,contato').order('nome');
  if (error) throw error;
  return (data ?? []) as Socio[];
}

export async function salvarSocio(socio: Socio): Promise<void> {
  const { error } = await supabase.from('socio').upsert({
    id: socio.id,
    nome: socio.nome,
    contato: socio.contato,
  });
  if (error) throw error;
}

export async function lancarTransferencia(
  idOrigem: string,
  idDestino: string,
  contaOrigemId: string,
  contaDestinoId: string,
  valorCentavos: Centavos,
  dataHora: string,
  descricao: string,
  criadoPor: string,
  ehDeposito: boolean
): Promise<void> {
  const tipo = ehDeposito ? 'deposito' : 'transferencia';
  const valor = centavosParaNumero(valorCentavos);
  
  const { error } = await supabase.from('movimento').insert([
    {
      id: idOrigem,
      tipo,
      conta_id: contaOrigemId,
      valor_centavos: -valor,
      data_hora: dataHora,
      contraparte_conta_id: contaDestinoId,
      descricao,
      criado_por: criadoPor
    },
    {
      id: idDestino,
      tipo,
      conta_id: contaDestinoId,
      valor_centavos: valor,
      data_hora: dataHora,
      contraparte_conta_id: contaOrigemId,
      descricao,
      criado_por: criadoPor
    }
  ]);
  if (error) throw error;
  await registrarAuditoria({
    entidade: ehDeposito ? 'deposito' : 'transferencia',
    entidadeId: idOrigem,
    acao: 'criar',
    usuarioId: criadoPor,
    depois: { valor_centavos: valor, conta_origem: contaOrigemId, conta_destino: contaDestinoId, descricao },
  });
}

/** Categoria especial fixa das tarifas de PIX automáticas (ver migration). */
const CAT_TARIFA_PIX_ID = 'f1a2b3c4-d5e6-4f00-8a00-000000000001';

/**
 * Gera (ou regenera) a despesa AUTOMÁTICA de tarifa de PIX presa a um pagamento.
 *
 * Regra (Pilar 1 — derivado): só quando o pagamento é por PIX, sai de uma conta de
 * BANCO e a conta tem tarifa de PIX vigente na data. Apaga a tarifa anterior do
 * mesmo pagamento (se houver) e cria a nova pela regra vigente. A tarifa fica presa
 * ao pagamento por `origem_movimento_id` (cascade apaga junto). Tarifa zero não
 * gera linha. Nunca é chamada para a própria tarifa, então não há recursão.
 */
async function sincronizarTarifaPixDespesa(
  s: SupabaseClient,
  args: {
    pagamentoId: string;
    contaId: string;
    valor: Centavos;
    formaPagamento: string | null;
    dataHora: string;
    descricaoPagamento: string;
    criadoPor: string;
  },
): Promise<void> {
  // Limpa qualquer tarifa anterior deste pagamento (caso de edição).
  await s.from('movimento').delete().eq('origem_movimento_id', args.pagamentoId);

  if (args.formaPagamento !== 'pix') return;

  const { data: conta, error: eConta } = await s
    .from('conta')
    .select('tipo, nome')
    .eq('id', args.contaId)
    .maybeSingle();
  if (eConta) throw eConta;
  if (!conta || conta.tipo !== 'banco') return;

  const dia = args.dataHora.slice(0, 10);
  const { data: rows, error: eTaxa } = await s
    .from('taxa_pix_conta')
    .select('percentual_bp, minimo_centavos, maximo_centavos, valido_a_partir_de')
    .eq('conta_id', args.contaId);
  if (eTaxa) throw eTaxa;

  const historico: RegistroTaxaPix[] = ((rows ?? []) as TaxaPixContaRow[]).map((t) => ({
    percentualBp: BigInt(t.percentual_bp),
    minimo: asCentavos(BigInt(t.minimo_centavos)),
    maximo: asCentavos(BigInt(t.maximo_centavos)),
    validoApartirDe: t.valido_a_partir_de,
  }));
  const regra = taxaPixVigenteEm(historico, dia);
  const tarifa = tarifaPix({
    valor: args.valor,
    percentualBp: regra.percentualBp,
    minimo: regra.minimo,
    maximo: regra.maximo,
  });
  if (tarifa <= 0n) return;

  const pct = (Number(regra.percentualBp) / 100).toFixed(2).replace('.', ',');
  const descricao =
    `Tarifa de PIX (${pct}%) — pagamento de ${formatReais(args.valor)}` +
    `${args.descricaoPagamento ? ` (${args.descricaoPagamento})` : ''} em ${dia.split('-').reverse().join('/')}`;

  const { error } = await s.from('movimento').insert({
    id: uuidv7(),
    tipo: 'despesa',
    conta_id: args.contaId,
    valor_centavos: -centavosParaNumero(tarifa),
    data_hora: args.dataHora,
    categoria_despesa_id: CAT_TARIFA_PIX_ID,
    forma_pagamento: null,
    descricao,
    tags: [],
    origem_movimento_id: args.pagamentoId,
    criado_por: args.criadoPor,
  });
  if (error) throw error;
}

export async function lancarDespesa(
  id: string,
  contaOrigemId: string,
  categoriaId: string,
  valorCentavos: Centavos,
  dataHora: string,
  formaPagamento: string | null,
  descricao: string,
  tags: string[],
  criadoPor: string,
  clientOverride?: SupabaseClient
): Promise<void> {
  const s = clientOverride || supabase;
  const { error } = await s.from('movimento').insert({
    id,
    tipo: 'despesa',
    conta_id: contaOrigemId,
    valor_centavos: -centavosParaNumero(valorCentavos),
    data_hora: dataHora,
    categoria_despesa_id: categoriaId,
    forma_pagamento: formaPagamento,
    descricao,
    tags,
    criado_por: criadoPor
  });
  if (error) throw error;
  await sincronizarTarifaPixDespesa(s, {
    pagamentoId: id,
    contaId: contaOrigemId,
    valor: valorCentavos,
    formaPagamento,
    dataHora,
    descricaoPagamento: descricao,
    criadoPor,
  });
  await registrarAuditoria({
    entidade: 'despesa',
    entidadeId: id,
    acao: 'criar',
    usuarioId: criadoPor,
    depois: { valor_centavos: -centavosParaNumero(valorCentavos), descricao, forma_pagamento: formaPagamento },
  }, clientOverride);
}

/** Uma despesa do dia (movimento tipo='despesa'), com magnitude positiva. */
export interface DespesaDoDia {
  id: string;
  valor: Centavos; // magnitude positiva (o movimento guarda com sinal negativo)
  descricao: string | null;
  categoriaNome: string | null;
  contaId: string | null;
  contaNome: string | null;
  contaTipo: string | null;
  formaPagamento: string | null;
  fechamentoId: string | null;
  dataHora: string;
}

/**
 * Despesas lançadas num dia de Manaus (independentemente de já estarem ligadas a
 * um fechamento). É a fonte única das "despesas do dia" que o Fechamento mostra:
 * o que sai em dinheiro reduz o esperado da gaveta (§3.3). Filtra por `data_hora`
 * no intervalo do dia, então uma despesa lançada na janela Despesas ou dentro do
 * próprio fechamento aparece nos dois lugares.
 */
export async function listarDespesasDoDia(data: string): Promise<DespesaDoDia[]> {
  const { inicio, fim } = limitesDoDiaManaus(data);
  const { data: rows, error } = await supabase
    .from('movimento')
    .select(
      'id,tipo,valor_centavos,data_hora,descricao,forma_pagamento,fechamento_id,' +
        'conta:conta_id(id,nome,tipo),categoria:categoria_despesa_id(nome),funcionario:funcionario_id(nome)',
    )
    .in('tipo', ['despesa', 'vale', 'prolabore'])
    .gte('data_hora', inicio)
    .lt('data_hora', fim)
    .order('data_hora', { ascending: true });
  if (error) throw error;

  const linhas = (rows ?? []) as unknown as Array<{
    id: string;
    tipo: string;
    valor_centavos: number;
    data_hora: string;
    descricao: string | null;
    forma_pagamento: string | null;
    fechamento_id: string | null;
    conta: { id: string; nome: string; tipo: string } | { id: string; nome: string; tipo: string }[] | null;
    categoria: RelNome;
    funcionario: RelNome;
  }>;

  return linhas.map((m) => {
    const conta = Array.isArray(m.conta) ? m.conta[0] : m.conta;
    const bruto = BigInt(m.valor_centavos);
    
    let catNome = nomeRel(m.categoria);
    if (!catNome) {
      if (m.tipo === 'vale') catNome = 'Vales';
      else if (m.tipo === 'prolabore') catNome = 'Retirada Sócio';
    }

    let desc = m.descricao;
    const funcNome = nomeRel(m.funcionario);
    if (m.tipo === 'vale' && funcNome) {
      desc = desc ? `${desc} (${funcNome})` : `Vale — ${funcNome}`;
    }

    return {
      id: m.id,
      valor: asCentavos(bruto < 0n ? -bruto : bruto),
      descricao: desc,
      categoriaNome: catNome,
      contaId: conta?.id ?? null,
      contaNome: conta?.nome ?? null,
      contaTipo: conta?.tipo ?? null,
      formaPagamento: m.forma_pagamento,
      fechamentoId: m.fechamento_id,
      dataHora: m.data_hora,
    };
  });
}

/** Liga despesas avulsas ao fechamento do dia (para auditoria e recálculo em cascata). */
export async function vincularDespesasAoFechamento(fechamentoId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('movimento')
    .update({ fechamento_id: fechamentoId })
    .in('id', ids);
  if (error) throw error;
}

/** Remove uma despesa ou vale (e reverte status de fechamento_folha se aplicável). */
export async function removerDespesa(id: string, usuarioId: string, clientOverride?: SupabaseClient): Promise<void> {
  const s = clientOverride || supabase;
  
  const { data: mov, error: errMov } = await s
    .from('movimento')
    .select('tipo, funcionario_id, data_hora, valor_centavos, conta_id, categoria_despesa_id, forma_pagamento, descricao, tags')
    .eq('id', id)
    .maybeSingle();

  if (errMov) throw errMov;

  if (mov && mov.tipo === 'despesa' && mov.funcionario_id) {
    const { data: folha } = await s
      .from('fechamento_folha')
      .select('id')
      .eq('funcionario_id', mov.funcionario_id)
      .eq('pago_em', mov.data_hora)
      .maybeSingle();

    if (folha) {
      await s
        .from('fechamento_folha')
        .update({ status: 'aberto', pago_em: null })
        .eq('id', folha.id);
    }
  }

  const { error } = await s.from('movimento').delete().eq('id', id);
  if (error) throw error;

  if (mov) {
    await registrarAuditoria({
      entidade: 'despesa',
      entidadeId: id,
      acao: 'remover',
      usuarioId,
      antes: {
        valor_centavos: mov.valor_centavos,
        conta_id: mov.conta_id,
        categoria_despesa_id: mov.categoria_despesa_id,
        data_hora: mov.data_hora,
        forma_pagamento: mov.forma_pagamento,
        descricao: mov.descricao,
        tags: mov.tags,
      },
    });
  }
}

export async function atualizarDespesa(
  id: string,
  contaOrigemId: string,
  categoriaId: string,
  valorCentavos: Centavos,
  dataHora: string,
  formaPagamento: string | null,
  descricao: string,
  tags: string[],
  usuarioId: string,
  clientOverride?: SupabaseClient
): Promise<void> {
  const s = clientOverride || supabase;

  // Carregar dados anteriores para auditoria
  const { data: antes, error: eGet } = await s
    .from('movimento')
    .select('valor_centavos, conta_id, categoria_despesa_id, data_hora, forma_pagamento, descricao, tags')
    .eq('id', id)
    .single();
  if (eGet) throw eGet;

  const { error } = await s
    .from('movimento')
    .update({
      conta_id: contaOrigemId,
      valor_centavos: -centavosParaNumero(valorCentavos),
      data_hora: dataHora,
      categoria_despesa_id: categoriaId,
      forma_pagamento: formaPagamento,
      descricao,
      tags,
    })
    .eq('id', id);
  if (error) throw error;

  await sincronizarTarifaPixDespesa(s, {
    pagamentoId: id,
    contaId: contaOrigemId,
    valor: valorCentavos,
    formaPagamento,
    dataHora,
    descricaoPagamento: descricao,
    criadoPor: usuarioId,
  });

  await registrarAuditoria({
    entidade: 'despesa',
    entidadeId: id,
    acao: 'editar',
    usuarioId,
    antes: {
      valor_centavos: antes.valor_centavos,
      conta_id: antes.conta_id,
      categoria_despesa_id: antes.categoria_despesa_id,
      data_hora: antes.data_hora,
      forma_pagamento: antes.forma_pagamento,
      descricao: antes.descricao,
      tags: antes.tags,
    },
    depois: {
      valor_centavos: -centavosParaNumero(valorCentavos),
      conta_id: contaOrigemId,
      categoria_despesa_id: categoriaId,
      data_hora: dataHora,
      forma_pagamento: formaPagamento,
      descricao,
      tags,
    },
  });
}

export async function verificarFechamentoStatus(data: string): Promise<'aberto' | 'travado' | 'inexistente'> {
  const { data: fech, error } = await supabase
    .from('fechamento')
    .select('status')
    .eq('data', data)
    .maybeSingle();
  if (error) throw error;
  if (!fech) return 'inexistente';
  return fech.status === 'travado' || fech.status === 'confirmado' ? 'travado' : 'aberto';
}

export async function removerPrecoProduto(id: string): Promise<void> {
  const { error } = await supabase.from('preco_produto').delete().eq('id', id);
  if (error) throw error;
}

export async function removerCustoProduto(id: string): Promise<void> {
  const { error } = await supabase.from('custo_produto').delete().eq('id', id);
  if (error) throw error;
}

export async function removerEntradaMercadoria(id: string): Promise<void> {
  const { error } = await supabase.from('entrada_mercadoria').delete().eq('id', id);
  if (error) throw error;
}

export async function removerPrecoCombustivel(id: string): Promise<void> {
  const { error } = await supabase.from('preco_combustivel').delete().eq('id', id);
  if (error) throw error;
}

export async function removerCustoCombustivel(id: string): Promise<void> {
  const { error } = await supabase.from('custo_combustivel').delete().eq('id', id);
  if (error) throw error;
}

export async function removerEntradaCombustivel(id: string): Promise<void> {
  const { error } = await supabase.from('entrada_combustivel').delete().eq('id', id);
  if (error) throw error;
}

export async function lancarPerda(
  id: string,
  produtoId: string,
  quantidade: Quantidade,
  motivo: string,
  data: string
): Promise<void> {
  const { error } = await supabase.from('perda').insert({
    id,
    produto_id: produtoId,
    quantidade: quantidadeParaNumero(quantidade),
    motivo,
    data,
  });
  if (error) throw error;
}

export async function lancarOperacaoSocio(
  id: string,
  tipo: 'aporte_emprestimo' | 'aporte_aumento' | 'devolucao_emprestimo' | 'prolabore',
  socioId: string,
  contaId: string,
  valorCentavos: Centavos,
  dataHora: string,
  descricao: string,
  criadoPor: string,
  formaPagamento: string | null = null,
): Promise<void> {
  const ehEntrada = tipo === 'aporte_emprestimo' || tipo === 'aporte_aumento';
  const multiplicador = ehEntrada ? 1 : -1;
  const valor = centavosParaNumero(valorCentavos) * multiplicador;
  // Forma de pagamento só faz sentido na SAÍDA (devolução/pró-labore). Aporte é
  // dinheiro entrando: não há "valor enviado", então nunca paga tarifa de PIX.
  const forma = ehEntrada ? null : (formaPagamento || null);

  const { error } = await supabase.from('movimento').upsert({
    id,
    tipo,
    conta_id: contaId,
    valor_centavos: valor,
    data_hora: dataHora,
    socio_id: socioId,
    forma_pagamento: forma,
    descricao,
    criado_por: criadoPor
  });
  if (error) throw error;

  // Saída por PIX de conta de banco também paga a tarifa do banco. Sempre chamado
  // (mesmo em aporte, com forma null) para limpar tarifa antiga numa edição.
  await sincronizarTarifaPixDespesa(supabase, {
    pagamentoId: id,
    contaId,
    valor: valorCentavos,
    formaPagamento: forma,
    dataHora,
    descricaoPagamento: descricao || OPERACAO_SOCIO_LABEL[tipo] || 'Operação de sócio',
    criadoPor,
  });

  await registrarAuditoria({
    entidade: 'socio',
    entidadeId: id,
    acao: 'criar',
    usuarioId: criadoPor,
    depois: { tipo, socio_id: socioId, valor_centavos: valor, descricao, forma_pagamento: forma },
  });
}

const OPERACAO_SOCIO_LABEL: Record<string, string> = {
  aporte_emprestimo: 'Aporte (empréstimo)',
  aporte_aumento: 'Aporte (capital)',
  devolucao_emprestimo: 'Devolução de empréstimo',
  prolabore: 'Pró-labore',
};

export interface CategoriaDespesa {
  id: string;
  nome: string;
  ehEspecial: boolean;
}

export async function listarCategoriasDespesa(): Promise<CategoriaDespesa[]> {
  const { data, error } = await supabase.from('categoria_despesa').select('id,nome,eh_especial').order('nome');
  if (error) throw error;
  const linhas = (data ?? []) as Array<{ id: string, nome: string, eh_especial: boolean }>;
  return linhas.map(c => ({
    id: c.id,
    nome: c.nome,
    ehEspecial: c.eh_especial,
  }));
}

export async function salvarCategoriaDespesa(cat: CategoriaDespesa): Promise<void> {
  const { error } = await supabase.from('categoria_despesa').upsert({
    id: cat.id,
    nome: cat.nome,
    eh_especial: cat.ehEspecial,
  });
  if (error) throw error;
}

export interface AlertasDashboard {
  produtosBaixo: { id: string; nome: string; quantidade: number; limite: number }[];
  tanquesBaixo: { id: string; nome: string; litros: number; limite: number }[];
}

export async function obterAlertas(): Promise<AlertasDashboard> {
  const tanques = await listarTanques();
  const tanquesBaixo = tanques
    .filter((t) => Number(t.nivel) <= t.nivelAlerta)
    .map((t) => ({
      id: t.id,
      nome: t.combustivel,
      litros: Number(t.nivel),
      limite: Number(t.nivelAlerta),
    }));

  // Simplificação: apenas busca produtos com alerta baixo para estoque,
  // mas como o estoque atual precisa da última contagem, a gente aproxima:
  const { data: f } = await supabase
    .from('fechamento')
    .select('id')
    .eq('status', 'travado')
    .order('data', { ascending: false })
    .limit(1);

  let produtosBaixo: { id: string; nome: string; quantidade: number; limite: number }[] = [];
  if (f && f.length > 0) {
    const { data: contagens } = await supabase
      .from('contagem_produto')
      .select('produto_id, quantidade, produto(nome, alerta_baixo)')
      .eq('fechamento_id', f[0]?.id as string);
    
    produtosBaixo = ((contagens ?? []) as unknown as Array<{ produto_id: string; quantidade: number; produto: { nome: string; alerta_baixo: number } | null }>)
      .filter((c) => c.produto && c.quantidade <= c.produto.alerta_baixo)
      .map((c) => ({
        id: c.produto_id,
        nome: c.produto!.nome,
        quantidade: c.quantidade,
        limite: c.produto!.alerta_baixo,
      }));
  }

  return { produtosBaixo, tanquesBaixo };
}

/**
 * Valor do combustível parado nos tanques, a custo: Σ (litros atuais × custo
 * vigente do combustível). Litros = última medição de régua de cada tanque.
 */
async function valorCombustivelEmTanques(emData: string): Promise<Centavos> {
  const [{ data: tanques }, { data: medicoes }, { data: custos }] = await Promise.all([
    supabase.from('tanque').select('id, combustivel_id'),
    supabase
      .from('medicao_tanque')
      .select('tanque_id, litros_medidos, data_hora')
      .order('data_hora', { ascending: false }),
    supabase.from('custo_combustivel').select('combustivel_id, valor_centavos, valido_a_partir_de'),
  ]);

  const ultimoNivel = new Map<string, number>();
  for (const m of (medicoes ?? []) as Array<{ tanque_id: string; litros_medidos: number }>) {
    if (!ultimoNivel.has(m.tanque_id)) ultimoNivel.set(m.tanque_id, Number(m.litros_medidos));
  }

  const histCusto = new Map<string, RegistroVigencia[]>();
  for (const c of (custos ?? []) as Array<{ combustivel_id: string; valor_centavos: number; valido_a_partir_de: string }>) {
    const lista = histCusto.get(c.combustivel_id) ?? [];
    lista.push({ valorCentavos: paraCentavos(c.valor_centavos), validoApartirDe: c.valido_a_partir_de });
    histCusto.set(c.combustivel_id, lista);
  }

  const instante = `${emData}T23:59:59-04:00`;
  let total = 0n;
  for (const t of (tanques ?? []) as Array<{ id: string; combustivel_id: string }>) {
    const litros = ultimoNivel.get(t.id) ?? 0;
    if (litros <= 0) continue;
    const custoLitro = custoVigenteEm(histCusto.get(t.combustivel_id) ?? [], instante);
    if (custoLitro == null) continue;
    // litros (pode ser fracionário) × custo/L em centavos, com precisão em mL.
    total += (BigInt(Math.round(litros * 1000)) * BigInt(custoLitro)) / 1000n;
  }
  return asCentavos(total);
}

export async function obterCapitalDashboard(): Promise<{ operacional: Centavos; total: Centavos }> {
  const hoje = hojeManaus();

  const saldos = await listarSaldos();
  const saldosContas = somar(...saldos.map((s) => s.saldo));

  const { data: fiados } = await supabase.from('fiado').select('valor_centavos').eq('status', 'aberto');
  const fiadoEmAberto = somar(...(fiados ?? []).map((f) => asCentavos(BigInt(f.valor_centavos))));

  // Valor do estoque de produtos a custo: Σ (estoque atual × custo vigente).
  const produtosData = await obterDadosProdutosNaData(hoje);
  let estoqueVal = 0n;
  for (const p of produtosData) {
    if (p.custo != null && p.estoque > 0) {
      estoqueVal += (BigInt(Math.round(p.estoque * 1000)) * BigInt(p.custo)) / 1000n;
    }
  }
  const valorEstoque = asCentavos(estoqueVal);
  const valorCombustivel = await valorCombustivelEmTanques(hoje);

  const { data: movs } = await supabase.from('movimento').select('tipo,valor_centavos');
  let passivos = 0n;
  let aumentos = 0n;
  for (const m of movs ?? []) {
    if (m.tipo === 'aporte_emprestimo') passivos += BigInt(m.valor_centavos);
    if (m.tipo === 'devolucao_emprestimo') passivos -= BigInt(m.valor_centavos);
    if (m.tipo === 'aporte_aumento') aumentos += BigInt(m.valor_centavos);
  }

  const total = capitalTotal(
    { saldosContas, fiadoEmAberto, valorEstoque, valorCombustivel },
    { emprestimosSocioEmAberto: asCentavos(passivos), outrasDividas: asCentavos(0n) },
  );
  const operacional = capitalOperacional(total, asCentavos(aumentos));

  return { total, operacional };
}

export interface TanqueRelatorioInfo {
  tanqueId: string;
  nome: string;
  combustivelNome: string;
  nivelAtualMl: Mililitros;
  capacidadeMl: Mililitros;
  vendidoMesLitros: number;
}

export async function obterDadosTanquesFechamento(dataBase: string): Promise<TanqueRelatorioInfo[]> {
  const tanquesConfig = await listarTanquesConfig(dataBase);
  const inicioMes = dataBase.slice(0, 8) + '01';

  const { data: fechamentos } = await supabase
    .from('fechamento')
    .select('id, data')
    .gte('data', inicioMes)
    .lte('data', dataBase)
    .eq('status', 'travado')
    .order('data', { ascending: true });

  if (!fechamentos || fechamentos.length === 0) {
    return tanquesConfig.map((t) => ({
      tanqueId: t.id,
      nome: t.nome,
      combustivelNome: t.combustivelNome,
      nivelAtualMl: t.nivel,
      capacidadeMl: t.capacidade,
      vendidoMesLitros: 0,
    }));
  }

  const ids = fechamentos.map((f) => f.id);

  const { data: baseRaw } = await supabase
    .from('fechamento')
    .select('id, data')
    .lt('data', inicioMes)
    .eq('status', 'travado')
    .order('data', { ascending: false })
    .limit(1);

  const baseline = baseRaw && baseRaw.length > 0 ? baseRaw[0] : null;
  const idsLeitura = baseline ? [...ids, baseline.id] : ids;

  const { data: leituras } = await supabase
    .from('leitura_bomba')
    .select('fechamento_id, bomba_id, leitura')
    .in('fechamento_id', idsLeitura);

  const leiturasPorFech = new Map<string, Map<string, number>>();
  for (const l of (leituras ?? []) as Array<{ fechamento_id: string; bomba_id: string; leitura: number }>) {
    const mapa = leiturasPorFech.get(l.fechamento_id) ?? new Map<string, number>();
    mapa.set(l.bomba_id, Number(l.leitura));
    leiturasPorFech.set(l.fechamento_id, mapa);
  }

  const { data: bombasRaw } = await supabase
    .from('bomba')
    .select('id, tanque_id');

  const tanqueDaBomba = new Map<string, string>();
  for (const b of (bombasRaw ?? []) as Array<{ id: string; tanque_id: string }>) {
    tanqueDaBomba.set(b.id, b.tanque_id);
  }

  const litrosVendidosPorTanque = new Map<string, number>();
  const sequencia = baseline ? [baseline, ...fechamentos] : fechamentos;

  for (let i = 1; i < sequencia.length; i++) {
    const f = sequencia[i]!;
    const atual = leiturasPorFech.get(f.id);
    const anterior = leiturasPorFech.get(sequencia[i - 1]!.id);
    if (!atual) continue;

    for (const [bombaId, leituraAtual] of atual) {
      const leituraAnt = anterior?.get(bombaId) ?? leituraAtual;
      const diff = leituraAtual - leituraAnt;
      if (diff > 0) {
        const tanqueId = tanqueDaBomba.get(bombaId);
        if (tanqueId) {
          const atualSoma = litrosVendidosPorTanque.get(tanqueId) ?? 0;
          litrosVendidosPorTanque.set(tanqueId, atualSoma + diff);
        }
      }
    }
  }

  return tanquesConfig.map((t) => ({
    tanqueId: t.id,
    nome: t.nome,
    combustivelNome: t.combustivelNome,
    nivelAtualMl: t.nivel,
    capacidadeMl: t.capacidade,
    vendidoMesLitros: litrosVendidosPorTanque.get(t.id) ?? 0,
  }));
}

export async function obterVendasMes(dataBase: string): Promise<{
  vendaDia: Centavos;
  vendaMes: Centavos;
  litrosMes: number;
  vendasDiarias: { data: string; valor: number }[];
  litrosGasolinaMes: number;
  litrosDieselMes: number;
  vendaGasolinaMes: Centavos;
  vendaDieselMes: Centavos;
}> {
  // Filtra movimentos do mês atual (em ordem cronológica para os litros)
  const inicioMes = dataBase.slice(0, 8) + '01';
  const { data: fechamentos } = await supabase
    .from('fechamento')
    .select('id, data')
    .gte('data', inicioMes)
    .lte('data', dataBase)
    .eq('status', 'travado')
    .order('data', { ascending: true });

  if (!fechamentos || fechamentos.length === 0) {
    return {
      vendaDia: asCentavos(0n),
      vendaMes: asCentavos(0n),
      litrosMes: 0,
      vendasDiarias: [],
      litrosGasolinaMes: 0,
      litrosDieselMes: 0,
      vendaGasolinaMes: asCentavos(0n),
      vendaDieselMes: asCentavos(0n),
    };
  }

  const ids = fechamentos.map((f) => f.id);

  // Baseline: último fechamento travado ANTES do mês — serve de leitura anterior
  // para os litros do primeiro dia do mês.
  const { data: baseRaw } = await supabase
    .from('fechamento')
    .select('id, data')
    .lt('data', inicioMes)
    .eq('status', 'travado')
    .order('data', { ascending: false })
    .limit(1);
  const baseline = baseRaw && baseRaw.length > 0 ? baseRaw[0] : null;
  const idsLeitura = baseline ? [...ids, baseline.id] : ids;

  const { data: movs } = await supabase
    .from('movimento')
    .select('fechamento_id, tipo, valor_centavos')
    .in('fechamento_id', ids)
    .in('tipo', ['recebimento_venda']);

  const { data: fiados } = await supabase
    .from('fiado')
    .select('fechamento_id, valor_centavos')
    .in('fechamento_id', ids);

  const { data: leituras } = await supabase
    .from('leitura_bomba')
    .select('fechamento_id, bomba_id, leitura')
    .in('fechamento_id', idsLeitura);

  let vendaDia = 0n;
  let vendaMes = 0n;
  const vendasDiariasMap = new Map<string, bigint>();

  // A venda do dia pode ser calculada como recebimento + fiados
  for (const f of fechamentos) {
    let valorDia = 0n;
    const movsDoDia = (movs ?? []).filter((m) => m.fechamento_id === f.id);
    const fiadosDoDia = (fiados ?? []).filter((fi) => fi.fechamento_id === f.id);
    
    for (const m of movsDoDia) valorDia += BigInt(m.valor_centavos);
    for (const fi of fiadosDoDia) valorDia += BigInt(fi.valor_centavos);
    
    vendasDiariasMap.set(f.data, valorDia);
    vendaMes += valorDia;
    if (f.data === dataBase) {
      vendaDia = valorDia;
    }
  }

  // Litros vendidos no mês = Σ diferença de encerrante entre fechamentos
  // consecutivos (cronológico). Encerrante é cumulativo: venda = leitura − anterior.
  const leiturasPorFech = new Map<string, Map<string, number>>();
  for (const l of (leituras ?? []) as Array<{ fechamento_id: string; bomba_id: string; leitura: number }>) {
    const mapa = leiturasPorFech.get(l.fechamento_id) ?? new Map<string, number>();
    mapa.set(l.bomba_id, Number(l.leitura));
    leiturasPorFech.set(l.fechamento_id, mapa);
  }

  // Busca detalhes das bombas e preços históricos
  const [
    { data: bombasRaw },
    { data: precosRaw }
  ] = await Promise.all([
    supabase.from('bomba').select('id, nome, tanque(id, combustivel(id, nome))'),
    supabase.from('preco_combustivel').select('combustivel_id, valor_centavos, valido_a_partir_de')
  ]);

  const combPorBomba = new Map<string, { id: string; nome: string }>();
  for (const b of (bombasRaw ?? []) as any[]) {
    const comb = Array.isArray(b.tanque?.combustivel) ? b.tanque.combustivel[0] : b.tanque?.combustivel;
    if (comb) {
      combPorBomba.set(b.id, { id: comb.id, nome: comb.nome });
    }
  }

  const precosPorComb = new Map<string, Array<{ valor: bigint; data: string }>>();
  for (const p of (precosRaw ?? []) as any[]) {
    const list = precosPorComb.get(p.combustivel_id) ?? [];
    list.push({ valor: BigInt(p.valor_centavos), data: p.valido_a_partir_de });
    precosPorComb.set(p.combustivel_id, list);
  }
  for (const [_, list] of precosPorComb) {
    list.sort((a, b) => b.data.localeCompare(a.data));
  }

  const obterPrecoNaData = (combId: string, dataStr: string): bigint => {
    const list = precosPorComb.get(combId) ?? [];
    const match = list.find((p) => p.data <= dataStr);
    return match ? match.valor : 0n;
  };

  const sequencia = baseline ? [baseline, ...fechamentos] : fechamentos;
  let litrosMes = 0;
  let litrosGasolinaMes = 0;
  let litrosDieselMes = 0;
  let vendaGasolinaMes = 0n;
  let vendaDieselMes = 0n;

  for (let i = 1; i < sequencia.length; i++) {
    const f = sequencia[i]!;
    const atual = leiturasPorFech.get(f.id);
    const anterior = leiturasPorFech.get(sequencia[i - 1]!.id);
    if (!atual) continue;
    for (const [bombaId, leituraAtual] of atual) {
      // Sem leitura anterior conhecida para a bomba → não dá pra inferir venda (0).
      const leituraAnt = anterior?.get(bombaId) ?? leituraAtual;
      const diff = leituraAtual - leituraAnt;
      if (diff > 0) {
        litrosMes += diff;
        const comb = combPorBomba.get(bombaId);
        if (comb) {
          const volumeML = BigInt(Math.round(diff * 1000));
          const valorVenda = (volumeML * obterPrecoNaData(comb.id, f.data)) / 1000n;
          if (comb.nome.toLowerCase().includes('gasolina')) {
            litrosGasolinaMes += diff;
            vendaGasolinaMes += valorVenda;
          } else if (comb.nome.toLowerCase().includes('diesel')) {
            litrosDieselMes += diff;
            vendaDieselMes += valorVenda;
          }
        }
      }
    }
  }

  const vendasDiarias = Array.from(vendasDiariasMap.entries())
    .map(([data, valor]) => ({
      data: data.slice(-2), // Pega só o dia "DD"
      valor: Number(valor) / 100, // em Reais para o gráfico
    }))
    .sort((a, b) => a.data.localeCompare(b.data));

  return {
    vendaDia: asCentavos(vendaDia),
    vendaMes: asCentavos(vendaMes),
    litrosMes,
    vendasDiarias,
    litrosGasolinaMes,
    litrosDieselMes,
    vendaGasolinaMes: asCentavos(vendaGasolinaMes),
    vendaDieselMes: asCentavos(vendaDieselMes),
  };
}

export interface AuditoriaLog {
  id: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  usuarioNome: string | null;
  usuarioFoto: string | null;
  dadosAntes: unknown;
  dadosDepois: unknown;
  criadoEm: string;
}

export async function listarAuditoria(): Promise<AuditoriaLog[]> {
  const { data, error } = await supabase
    .from('auditoria')
    .select(
      'id, entidade, entidade_id, acao, dados_antes, dados_depois, criado_em, usuario(nome,foto_url)',
    )
    .order('criado_em', { ascending: false });
  if (error) throw error;

  const linhas = (data ?? []) as Array<{
    id: string;
    entidade: string;
    entidade_id: string;
    acao: string;
    dados_antes: unknown;
    dados_depois: unknown;
    criado_em: string;
    usuario:
      | { nome: string; foto_url: string | null }
      | { nome: string; foto_url: string | null }[]
      | null;
  }>;

  return linhas.map((l) => {
    const usr = Array.isArray(l.usuario) ? l.usuario[0] : l.usuario;
    return {
      id: l.id,
      entidade: l.entidade,
      entidadeId: l.entidade_id,
      acao: l.acao,
      usuarioNome: usr?.nome ?? 'Sistema / Desconhecido',
      usuarioFoto: usr?.foto_url ?? null,
      dadosAntes: l.dados_antes,
      dadosDepois: l.dados_depois,
      criadoEm: l.criado_em,
    };
  });
}

/**
 * Grava um registro de auditoria (§5.12). Espelha o insert de `data/fechamento.ts`.
 * Falha de auditoria não derruba a operação principal — loga e segue (rastro
 * secundário, não a transação).
 */
export async function registrarAuditoria(params: {
  entidade: string;
  entidadeId: string;
  acao: 'criar' | 'editar' | 'remover' | 'reabrir' | 'ajustar';
  usuarioId: string;
  antes?: unknown;
  depois?: unknown;
}, clientOverride?: SupabaseClient): Promise<void> {
  const s = clientOverride || supabase;
  const { error } = await s.from('auditoria').insert({
    id: uuidv7(),
    entidade: params.entidade,
    entidade_id: params.entidadeId,
    acao: params.acao,
    usuario_id: params.usuarioId,
    dados_antes: params.antes ?? null,
    dados_depois: params.depois ?? null,
  });
  if (error) console.error('Falha ao registrar auditoria:', error);
}

export interface FechamentoRecente {
  id: string;
  data: string;
  status: string;
  responsavelNome: string | null;
}

export async function listarFechamentosRecentes(): Promise<FechamentoRecente[]> {
  const { data, error } = await supabase
    .from('fechamento')
    .select('id, data, status, usuario:responsavel_id(nome)')
    .order('data', { ascending: false })
    .limit(30);
  if (error) throw error;

  const linhas = (data ?? []) as Array<{
    id: string;
    data: string;
    status: string;
    usuario: { nome: string } | { nome: string }[] | null;
  }>;

  return linhas.map((l) => {
    const usr = Array.isArray(l.usuario) ? l.usuario[0] : l.usuario;
    return {
      id: l.id,
      data: l.data,
      status: l.status,
      responsavelNome: usr?.nome ?? 'Desconhecido',
    };
  });
}

export interface MovimentoLista {
  id: string;
  tipo: string;
  dataHora: string;
  valorCentavos: Centavos; // sinal preservado (saída negativa, entrada positiva)
  descricao: string | null;
  formaPagamento: string | null;
  tags: string[];
  contaId: string | null;
  contaNome: string | null;
  contraparteNome: string | null;
  categoriaDespesaId: string | null;
  categoriaNome: string | null;
  socioId: string | null;
  socioNome: string | null;
  usuarioNome: string | null;
  funcionarioId: string | null;
  funcionarioNome: string | null;
  fechamentoId: string | null;
  fechamentoStatus: 'aberto' | 'travado' | null;
  fechamentoData: string | null;
  /** Quando preenchido, é um lançamento DERIVADO de outro (ex.: tarifa de PIX). */
  origemMovimentoId: string | null;
}

type RelNome = { nome: string } | { nome: string }[] | null;
function nomeRel(r: RelNome): string | null {
  if (Array.isArray(r)) return r[0]?.nome ?? null;
  return r?.nome ?? null;
}

/**
 * Lista movimentos do livro-caixa já com os nomes resolvidos (conta, contraparte,
 * categoria, sócio, autor). `tipos` filtra pelo campo `movimento.tipo`; a filtragem
 * fina (período, busca) é feita na tela. Joins desambiguados pela coluna FK porque
 * `conta_id` e `contraparte_conta_id` apontam para a mesma tabela `conta`.
 */
export async function listarMovimentos(tipos?: string[], limite = 500): Promise<MovimentoLista[]> {
  let consulta = supabase
    .from('movimento')
    .select(
      'id,tipo,valor_centavos,data_hora,descricao,forma_pagamento,tags,conta_id,categoria_despesa_id,fechamento_id,origem_movimento_id,' +
        'conta:conta_id(nome),contraparte:contraparte_conta_id(nome),' +
        'categoria:categoria_despesa_id(nome),socio:socio_id(id,nome),usuario:criado_por(nome),' +
        'funcionario:funcionario_id(id,nome),' +
        'fechamento:fechamento_id(id,status,data)'
    )
    .order('data_hora', { ascending: false })
    .limit(limite);

  if (tipos && tipos.length > 0) consulta = consulta.in('tipo', tipos);

  const { data, error } = await consulta;
  if (error) throw error;

  const linhas = (data ?? []) as unknown as Array<{
    id: string;
    tipo: string;
    valor_centavos: number;
    data_hora: string;
    descricao: string | null;
    forma_pagamento: string | null;
    tags: string[] | null;
    conta_id: string | null;
    categoria_despesa_id: string | null;
    fechamento_id: string | null;
    origem_movimento_id: string | null;
    conta: RelNome;
    contraparte: RelNome;
    categoria: RelNome;
    socio: { id: string; nome: string } | { id: string; nome: string }[] | null;
    usuario: RelNome;
    funcionario: { id: string; nome: string } | { id: string; nome: string }[] | null;
    fechamento: { id: string; status: string; data: string } | { id: string; status: string; data: string }[] | null;
  }>;

  return linhas.map((m) => {
    const fech = Array.isArray(m.fechamento) ? m.fechamento[0] : m.fechamento;
    return {
      id: m.id,
      tipo: m.tipo,
      dataHora: m.data_hora,
      valorCentavos: asCentavos(BigInt(m.valor_centavos)),
      descricao: m.descricao,
      formaPagamento: m.forma_pagamento,
      tags: m.tags ?? [],
      contaId: m.conta_id,
      contaNome: nomeRel(m.conta),
      contraparteNome: nomeRel(m.contraparte),
      categoriaDespesaId: m.categoria_despesa_id,
      categoriaNome: nomeRel(m.categoria),
      socioId: m.socio ? (Array.isArray(m.socio) ? m.socio[0]?.id : m.socio.id) ?? null : null,
      socioNome: nomeRel(m.socio),
      usuarioNome: nomeRel(m.usuario),
      funcionarioId: m.funcionario ? (Array.isArray(m.funcionario) ? m.funcionario[0]?.id : m.funcionario.id) ?? null : null,
      funcionarioNome: nomeRel(m.funcionario),
      fechamentoId: m.fechamento_id,
      fechamentoStatus: fech ? (fech.status === 'travado' || fech.status === 'confirmado' ? 'travado' : 'aberto') : null,
      fechamentoData: fech?.data ?? null,
      origemMovimentoId: m.origem_movimento_id,
    };
  });
}

export interface FechamentoResumo {
  id: string;
  data: string;
  status: string;
  responsavelNome: string | null;
  vendaRegistrada: Centavos; // soma de recebimento_venda (líquido) do dia
  diferenca: Centavos; // soma de diferenca_caixa do dia
}

/**
 * Histórico de fechamentos com um resumo financeiro por dia (recebido em venda
 * e diferença de caixa), agregados a partir dos movimentos. Para a tela de
 * Fechamento navegar entre dias com filtros.
 */
export async function listarFechamentos(limite = 120): Promise<FechamentoResumo[]> {
  const { data, error } = await supabase
    .from('fechamento')
    .select('id, data, status, usuario:responsavel_id(nome)')
    .order('data', { ascending: false })
    .limit(limite);
  if (error) throw error;

  const linhas = (data ?? []) as Array<{
    id: string;
    data: string;
    status: string;
    usuario: { nome: string } | { nome: string }[] | null;
  }>;
  const ids = linhas.map((l) => l.id);

  const difPorFech = new Map<string, bigint>();
  const vendaPorFech = new Map<string, bigint>();
  if (ids.length > 0) {
    const { data: movs, error: eM } = await supabase
      .from('movimento')
      .select('fechamento_id, tipo, valor_centavos')
      .in('fechamento_id', ids)
      .in('tipo', ['recebimento_venda', 'diferenca_caixa']);
    if (eM) throw eM;
    for (const m of (movs ?? []) as Array<{ fechamento_id: string | null; tipo: string; valor_centavos: number }>) {
      if (!m.fechamento_id) continue;
      const mapa = m.tipo === 'diferenca_caixa' ? difPorFech : vendaPorFech;
      mapa.set(m.fechamento_id, (mapa.get(m.fechamento_id) ?? 0n) + BigInt(m.valor_centavos));
    }
  }

  return linhas.map((l) => {
    const usr = Array.isArray(l.usuario) ? l.usuario[0] : l.usuario;
    return {
      id: l.id,
      data: l.data,
      status: l.status,
      responsavelNome: usr?.nome ?? null,
      vendaRegistrada: asCentavos(vendaPorFech.get(l.id) ?? 0n),
      diferenca: asCentavos(difPorFech.get(l.id) ?? 0n),
    };
  });
}

// ---- Fase 7: Fiado (§5.8) e Folha (§5.9) --------------------------------------

export interface ClienteFiado {
  id: string;
  nome: string;
  contato: string | null;
}

export async function listarClientesFiado(): Promise<ClienteFiado[]> {
  const { data, error } = await supabase.from('cliente_fiado').select('id,nome,contato').order('nome');
  if (error) throw error;
  return (data ?? []) as ClienteFiado[];
}

export async function salvarClienteFiado(c: ClienteFiado): Promise<void> {
  const { error } = await supabase
    .from('cliente_fiado')
    .upsert({ id: c.id, nome: c.nome, contato: c.contato });
  if (error) throw error;
}

export async function salvarFiado(f: {
  id: string;
  clienteId: string;
  valor: Centavos;
  data: string;
  vencimento: string | null;
}): Promise<void> {
  const { error } = await supabase.from('fiado').insert({
    id: f.id,
    cliente_id: f.clienteId,
    valor_centavos: centavosParaNumero(f.valor),
    data: f.data,
    vencimento: f.vencimento,
    status: 'aberto',
  });
  if (error) throw error;
}


export interface FiadoEmAberto {
  id: string;
  clienteId: string;
  clienteNome: string;
  valor: Centavos;
  data: string;
  vencimento: string | null;
}

export async function listarFiadosEmAberto(): Promise<FiadoEmAberto[]> {
  const { data, error } = await supabase
    .from('fiado')
    .select('id, cliente_id, valor_centavos, data, vencimento, cliente:cliente_id(nome)')
    .eq('status', 'aberto')
    .order('data', { ascending: true });
  if (error) throw error;
  const linhas = (data ?? []) as Array<{
    id: string;
    cliente_id: string;
    valor_centavos: number;
    data: string;
    vencimento: string | null;
    cliente: RelNome;
  }>;
  return linhas.map((l) => ({
    id: l.id,
    clienteId: l.cliente_id,
    clienteNome: nomeRel(l.cliente) ?? '—',
    valor: asCentavos(BigInt(l.valor_centavos)),
    data: l.data,
    vencimento: l.vencimento,
  }));
}

/**
 * Baixa de fiado: entra dinheiro no caixa (movimento `recebimento_fiado`, NÃO é
 * venda — §3.4) e o recebível é quitado (status → pago). Os dois passos juntos.
 */
export async function receberFiado(
  fiadoId: string,
  contaCaixaId: string,
  valor: Centavos,
  dataHora: string,
  criadoPor: string,
): Promise<void> {
  const { error: eMov } = await supabase.from('movimento').insert({
    id: uuidv7(),
    tipo: 'recebimento_fiado',
    conta_id: contaCaixaId,
    valor_centavos: centavosParaNumero(valor),
    data_hora: dataHora,
    fiado_id: fiadoId,
    forma_pagamento: 'dinheiro',
    descricao: 'Recebimento de fiado',
    criado_por: criadoPor,
  });
  if (eMov) throw eMov;
  const { error: eFi } = await supabase.from('fiado').update({ status: 'pago' }).eq('id', fiadoId);
  if (eFi) throw eFi;
}

export interface Funcionario {
  id: string;
  nome: string;
  salarioBase: Centavos;
  ativo: boolean;
}

export async function listarFuncionarios(): Promise<Funcionario[]> {
  const { data, error } = await supabase
    .from('funcionario')
    .select('id,nome,salario_base_centavos,ativo')
    .order('nome');
  if (error) throw error;
  const linhas = (data ?? []) as Array<{ id: string; nome: string; salario_base_centavos: number; ativo: boolean }>;
  return linhas.map((f) => ({
    id: f.id,
    nome: f.nome,
    salarioBase: paraCentavos(f.salario_base_centavos),
    ativo: f.ativo,
  }));
}

export async function salvarFuncionario(f: Funcionario): Promise<void> {
  const { error } = await supabase.from('funcionario').upsert({
    id: f.id,
    nome: f.nome,
    salario_base_centavos: centavosParaNumero(f.salarioBase),
    ativo: f.ativo,
  });
  if (error) throw error;
}

/** Vale = adiantamento que sai do caixa (saída) e desconta do salário no mês. */
export async function lancarVale(
  id: string,
  funcionarioId: string,
  contaId: string,
  valor: Centavos,
  dataHora: string,
  descricao: string,
  criadoPor: string,
  formaPagamento: string = 'dinheiro',
): Promise<void> {
  const { error } = await supabase.from('movimento').upsert({
    id,
    tipo: 'vale',
    conta_id: contaId,
    valor_centavos: -centavosParaNumero(valor),
    data_hora: dataHora,
    funcionario_id: funcionarioId,
    forma_pagamento: formaPagamento,
    descricao,
    criado_por: criadoPor,
  });
  if (error) throw error;

  // Vale pago via PIX de uma conta de banco também paga a tarifa do banco.
  await sincronizarTarifaPixDespesa(supabase, {
    pagamentoId: id,
    contaId,
    valor,
    formaPagamento,
    dataHora,
    descricaoPagamento: descricao,
    criadoPor,
  });
}

/** Soma dos vales de um funcionário na competência (mês de `competencia` = AAAA-MM-01). */
export async function totalValesCompetencia(funcionarioId: string, competencia: string): Promise<Centavos> {
  const inicio = competencia;
  const partes = inicio.split('-');
  const y = Number(partes[0]);
  const m = Number(partes[1]);
  const prox = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabase
    .from('movimento')
    .select('valor_centavos')
    .eq('tipo', 'vale')
    .eq('funcionario_id', funcionarioId)
    .gte('data_hora', `${inicio}T00:00:00-04:00`)
    .lt('data_hora', `${prox}T00:00:00-04:00`);
  if (error) throw error;
  let total = 0n;
  for (const v of (data ?? []) as Array<{ valor_centavos: number }>) {
    total += BigInt(Math.abs(Number(v.valor_centavos)));
  }
  return asCentavos(total);
}

export interface FechamentoFolha {
  id: string;
  funcionarioId: string;
  funcionarioNome: string | null;
  competencia: string;
  salarioBase: Centavos;
  totalVales: Centavos;
  aReceber: Centavos;
  status: string;
  pagoEm?: string | null;
}

export async function listarFechamentosFolha(): Promise<FechamentoFolha[]> {
  const { data, error } = await supabase
    .from('fechamento_folha')
    .select(
      'id, funcionario_id, competencia, salario_base_centavos, total_vales_centavos, a_receber_centavos, status, pago_em, funcionario:funcionario_id(nome)',
    )
    .order('competencia', { ascending: false });
  if (error) throw error;
  const linhas = (data ?? []) as Array<{
    id: string;
    funcionario_id: string;
    competencia: string;
    salario_base_centavos: number;
    total_vales_centavos: number;
    a_receber_centavos: number;
    status: string;
    pago_em: string | null;
    funcionario: RelNome;
  }>;
  return linhas.map((l) => ({
    id: l.id,
    funcionarioId: l.funcionario_id,
    funcionarioNome: nomeRel(l.funcionario),
    competencia: l.competencia,
    salarioBase: paraCentavos(l.salario_base_centavos),
    totalVales: paraCentavos(l.total_vales_centavos),
    aReceber: paraCentavos(l.a_receber_centavos),
    status: l.status,
    pagoEm: l.pago_em,
  }));
}

export async function gerarFechamentoFolha(
  funcionarioId: string,
  competencia: string,
  salarioBase: Centavos,
  totalVales: Centavos,
  aReceber: Centavos,
): Promise<void> {
  const { error } = await supabase.from('fechamento_folha').insert({
    id: uuidv7(),
    funcionario_id: funcionarioId,
    competencia,
    salario_base_centavos: centavosParaNumero(salarioBase),
    total_vales_centavos: centavosParaNumero(totalVales),
    a_receber_centavos: centavosParaNumero(aReceber),
    status: 'aberto',
  });
  if (error) throw error;
}

export async function pagarFechamentoFolha(
  fechamentoId: string,
  contaId: string,
  formaPagamento: string,
  pagoEm: string,
  criadoPor: string,
): Promise<void> {
  const { data: fechamento, error: errFechamento } = await supabase
    .from('fechamento_folha')
    .select('funcionario_id, competencia, a_receber_centavos, funcionario:funcionario_id(nome)')
    .eq('id', fechamentoId)
    .single();

  if (errFechamento) throw errFechamento;
  if (!fechamento) throw new Error('Fechamento de folha não encontrado.');

  const funcId = fechamento.funcionario_id;
  const comp = fechamento.competencia;
  const aReceberCentavos = BigInt(fechamento.a_receber_centavos);
  const funcNome = nomeRel(fechamento.funcionario) ?? 'Funcionário';

  const [a, m] = comp.split('-');
  const compLabel = `${m}/${a}`;

  const { error: errUpdate } = await supabase
    .from('fechamento_folha')
    .update({
      status: 'pago',
      pago_em: pagoEm,
    })
    .eq('id', fechamentoId);

  if (errUpdate) throw errUpdate;

  const movId = uuidv7();
  const descricaoSalario = `Pagamento Salário — ${funcNome} ref. ${compLabel}`;
  const { error: errMov } = await supabase.from('movimento').insert({
    id: movId,
    tipo: 'despesa',
    conta_id: contaId,
    valor_centavos: -Number(aReceberCentavos),
    data_hora: pagoEm,
    funcionario_id: funcId,
    forma_pagamento: formaPagamento,
    descricao: descricaoSalario,
    categoria_despesa_id: '00000000-0000-7000-8000-000000000022',
    criado_por: criadoPor,
  });

  if (errMov) throw errMov;

  // Salário pago via PIX de uma conta de banco também paga a tarifa do banco.
  await sincronizarTarifaPixDespesa(supabase, {
    pagamentoId: movId,
    contaId,
    valor: asCentavos(aReceberCentavos),
    formaPagamento,
    dataHora: pagoEm,
    descricaoPagamento: descricaoSalario,
    criadoPor,
  });
}

export async function removerPagamentoFolha(fechamentoId: string, usuarioId: string): Promise<void> {
  const { data: fechamento } = await supabase
    .from('fechamento_folha')
    .select('funcionario_id, pago_em')
    .eq('id', fechamentoId)
    .maybeSingle();
  if (!fechamento || !fechamento.pago_em) return;

  const { data: mov } = await supabase
    .from('movimento')
    .select('id')
    .eq('funcionario_id', fechamento.funcionario_id)
    .eq('data_hora', fechamento.pago_em)
    .eq('tipo', 'despesa')
    .maybeSingle();

  if (mov) {
    await removerDespesa(mov.id, usuarioId);
  }
}

/** Obtém a soma dos vales de todos os funcionários em uma competência, agrupada por funcionário ID. */
export async function obterValesFuncionariosMes(competencia: string): Promise<Record<string, Centavos>> {
  const inicio = competencia; // YYYY-MM-01
  const partes = inicio.split('-');
  const y = Number(partes[0]);
  const m = Number(partes[1]);
  const prox = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('movimento')
    .select('funcionario_id, valor_centavos')
    .eq('tipo', 'vale')
    .gte('data_hora', `${inicio}T00:00:00-04:00`)
    .lt('data_hora', `${prox}T00:00:00-04:00`);

  if (error) throw error;

  const mapa: Record<string, Centavos> = {};
  for (const v of (data ?? []) as Array<{ funcionario_id: string; valor_centavos: number }>) {
    const fid = v.funcionario_id;
    if (!fid) continue;
    const valor = BigInt(Math.abs(v.valor_centavos));
    mapa[fid] = asCentavos((mapa[fid] ?? 0n) + valor);
  }
  return mapa;
}

export interface ResumoFechamentoCompleto {
  id: string;
  data: string;
  responsavelNome: string | null;
  vendaFisica: Centavos;
  pix: Centavos;
  debito: Centavos;
  credito: Centavos;
  dinheiro: Centavos;
  despesa: Centavos; // despesas em dinheiro
  esperado: Centavos;
  contado: Centavos;
  diferenca: Centavos;
  aDepositar: Centavos;
  fiadoConcedido: Centavos;
  fiadoRecebido: Centavos;
  observacao?: string | null;
  responsavelFotoUrl?: string | null;
}

export async function obterDadosUltimoFechamento(): Promise<ResumoFechamentoCompleto | null> {
  const { data: fechRaw, error: e1 } = await supabase
    .from('fechamento')
    .select('id, data, responsavel:responsavel_id(nome, foto_url), status, observacao')
    .eq('status', 'travado')
    .order('data', { ascending: false })
    .limit(1);

  if (e1 || !fechRaw || fechRaw.length === 0) return null;
  const ultimo = fechRaw[0];
  if (!ultimo) return null;
  const fechId = ultimo.id;

  const [
    { data: movs, error: e2 },
    { data: fiados, error: e3 },
    { data: configRaw, error: eCfg },
    { data: contasRaw, error: eContas }
  ] = await Promise.all([
    supabase.from('movimento').select('tipo, valor_centavos, forma_pagamento, conta_id').eq('fechamento_id', fechId),
    supabase.from('fiado').select('valor_centavos').eq('fechamento_id', fechId),
    supabase.from('config').select('chave, valor_json'),
    supabase.from('conta').select('id, tipo, eh_destino_padrao_venda')
  ]);

  if (e2 || e3 || eCfg || eContas || !movs) return null;

  // Só as despesas em dinheiro que saem da conta gaveta reduzem o esperado (§3.3);
  // saídas de outras contas em dinheiro não pesam na contagem da gaveta.
  const contasGaveta = (contasRaw ?? []) as Array<{ id: string; tipo: string; eh_destino_padrao_venda: boolean }>;
  const idGaveta =
    contasGaveta.find((c) => c.tipo === 'dinheiro' && c.eh_destino_padrao_venda)?.id ??
    contasGaveta.find((c) => c.tipo === 'dinheiro')?.id ??
    null;

  const config = new Map(
    ((configRaw ?? []) as Array<{ chave: string; valor_json: unknown }>).map((c) => [
      c.chave,
      c.valor_json,
    ]),
  );
  const trocoFixo = paraCentavos(Number(config.get('troco_fixo_centavos') ?? 0));

  let cashSales = 0n;
  let pix = 0n;
  let debitoNet = 0n;
  let debitoTaxa = 0n;
  let creditoNet = 0n;
  let creditoTaxa = 0n;
  let fiadoRecebido = 0n;
  let diferenca = 0n;
  let despesaDinheiro = 0n;
  
  for (const m of movs) {
    const val = BigInt(m.valor_centavos);
    const absVal = val < 0n ? -val : val;

    if (m.tipo === 'recebimento_venda') {
      if (m.forma_pagamento === 'dinheiro') cashSales = val;
      else if (m.forma_pagamento === 'pix') pix = val;
      else if (m.forma_pagamento === 'debito') debitoNet = val;
      else if (m.forma_pagamento === 'credito') creditoNet = val;
    } else if (m.tipo === 'taxa_cartao') {
      if (m.forma_pagamento === 'debito') debitoTaxa = absVal;
      else if (m.forma_pagamento === 'credito') creditoTaxa = absVal;
    } else if (m.tipo === 'recebimento_fiado') {
      fiadoRecebido += val;
    } else if (m.tipo === 'diferenca_caixa') {
      diferenca = val;
    } else if (['despesa', 'prolabore', 'vale'].includes(m.tipo)) {
      if (m.forma_pagamento === 'dinheiro' && m.conta_id === idGaveta) {
        despesaDinheiro += absVal;
      }
    }
  }

  let fiadoConcedido = 0n;
  for (const f of fiados ?? []) {
    fiadoConcedido += BigInt(f.valor_centavos);
  }

  const debitoGross = debitoNet + debitoTaxa;
  const creditoGross = creditoNet + creditoTaxa;
  const vendaFisica = cashSales + pix + debitoGross + creditoGross + fiadoConcedido;

  const esperado = cashSales - despesaDinheiro + fiadoRecebido + trocoFixo;
  const contado = esperado + diferenca;
  
  const aDepositarBruto = contado - trocoFixo;
  const aDepositar = aDepositarBruto < 0n ? 0n : aDepositarBruto;

  const resp = Array.isArray(ultimo.responsavel) ? ultimo.responsavel[0] : ultimo.responsavel;

  return {
    id: fechId,
    data: ultimo.data,
    responsavelNome: resp?.nome ?? null,
    vendaFisica: asCentavos(vendaFisica),
    pix: asCentavos(pix),
    debito: asCentavos(debitoGross),
    credito: asCentavos(creditoGross),
    dinheiro: asCentavos(cashSales),
    despesa: asCentavos(despesaDinheiro),
    esperado: asCentavos(esperado),
    contado: asCentavos(contado),
    diferenca: asCentavos(diferenca),
    aDepositar: asCentavos(aDepositar),
    fiadoConcedido: asCentavos(fiadoConcedido),
    fiadoRecebido: asCentavos(fiadoRecebido),
    observacao: ultimo.observacao ?? null,
    responsavelFotoUrl: resp?.foto_url ?? null,
  };
}

export interface DespesaCategoriaResumo {
  categoriaNome: string;
  valor: number; // em Reais para recharts
}

export async function obterDespesasPorCategoriaMes(dataBase: string): Promise<DespesaCategoriaResumo[]> {
  const inicioMes = dataBase.slice(0, 8) + '01';
  
  const { data, error } = await supabase
    .from('movimento')
    .select('tipo, valor_centavos, categoria:categoria_despesa_id(nome)')
    .in('tipo', ['despesa', 'vale', 'prolabore'])
    .gte('data_hora', `${inicioMes}T00:00:00-04:00`)
    .lte('data_hora', `${dataBase}T23:59:59-04:00`);
    
  if (error || !data) return [];
  
  const soma = new Map<string, bigint>();
  for (const m of data as any[]) {
    let catNome = m.categoria?.nome;
    if (!catNome) {
      if (m.tipo === 'vale') catNome = 'Vales';
      else if (m.tipo === 'prolabore') catNome = 'Retirada Sócio';
      else catNome = 'Geral';
    }
    const val = BigInt(m.valor_centavos);
    const absVal = val < 0n ? -val : val;
    soma.set(catNome, (soma.get(catNome) ?? 0n) + absVal);
  }
  
  return Array.from(soma.entries()).map(([categoriaNome, valor]) => ({
    categoriaNome,
    valor: Number(valor) / 100,
  }));
}

export async function obterVendasHistorico(hoje: string, dias = 90): Promise<{ data: string; valor: number }[]> {
  const dataLimite = new Date(hoje);
  dataLimite.setDate(dataLimite.getDate() - dias);
  const dataLimiteStr = dataLimite.toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });

  const { data: fechamentos } = await supabase
    .from('fechamento')
    .select('id, data')
    .gte('data', dataLimiteStr)
    .lte('data', hoje)
    .eq('status', 'travado')
    .order('data', { ascending: true });

  if (!fechamentos || fechamentos.length === 0) return [];

  const ids = fechamentos.map((f) => f.id);

  const [
    { data: movs },
    { data: fiados }
  ] = await Promise.all([
    supabase
      .from('movimento')
      .select('fechamento_id, valor_centavos')
      .in('fechamento_id', ids)
      .eq('tipo', 'recebimento_venda'),
    supabase
      .from('fiado')
      .select('fechamento_id, valor_centavos')
      .in('fechamento_id', ids)
  ]);

  const vendasDiariasMap = new Map<string, bigint>();
  for (const f of fechamentos) {
    let valorDia = 0n;
    const movsDoDia = (movs ?? []).filter((m) => m.fechamento_id === f.id);
    const fiadosDoDia = (fiados ?? []).filter((fi) => fi.fechamento_id === f.id);
    
    for (const m of movsDoDia) valorDia += BigInt(m.valor_centavos);
    for (const fi of fiadosDoDia) valorDia += BigInt(fi.valor_centavos);
    
    vendasDiariasMap.set(f.data, valorDia);
  }

  return Array.from(vendasDiariasMap.entries())
    .map(([data, valor]) => ({
      data,
      valor: Number(valor) / 100,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

function agruparVigencia(rows: any[], key: string): Map<string, RegistroVigencia[]> {
  const mapa = new Map<string, RegistroVigencia[]>();
  for (const r of rows) {
    const id = r[key];
    const lista = mapa.get(id) ?? [];
    lista.push({
      valorCentavos: asCentavos(BigInt(r.valor_centavos)),
      validoApartirDe: r.valido_a_partir_de,
    });
    mapa.set(id, lista);
  }
  return mapa;
}

export interface LucroDia {
  data: string;
  faturamento: number;
  custo: number;
  despesas: number;
  diferenca: number;
  lucroBruto: number;
  lucroLiquido: number;
}

export async function obterLucroHistorico(hoje: string, dias = 90): Promise<LucroDia[]> {
  const dataLimite = new Date(hoje);
  dataLimite.setDate(dataLimite.getDate() - dias);
  const dataLimiteStr = dataLimite.toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });

  const { data: fechamentos } = await supabase
    .from('fechamento')
    .select('id, data')
    .gte('data', dataLimiteStr)
    .lte('data', hoje)
    .eq('status', 'travado')
    .order('data', { ascending: true });

  if (!fechamentos || fechamentos.length === 0) return [];

  const ids = fechamentos.map((f) => f.id);

  const { data: anteriorRaw } = await supabase
    .from('fechamento')
    .select('id, data')
    .lt('data', fechamentos[0]!.data)
    .eq('status', 'travado')
    .order('data', { ascending: false })
    .limit(1);
  const baseline = anteriorRaw && anteriorRaw.length > 0 ? anteriorRaw[0] : null;
  const idsComBaseline = baseline ? [...ids, baseline.id] : ids;

  const [
    { data: contagensRaw },
    { data: leiturasRaw },
    { data: entradasRaw },
    { data: perdasRaw },
    { data: vendasAvulsasRaw },
    { data: movimentosRaw },
    { data: produtosRaw },
    { data: bombasRaw },
    { data: custosProdRaw },
    { data: custosCombRaw },
    { data: precosProdRaw },
    { data: precosCombRaw },
    { data: categoriasRaw }
  ] = await Promise.all([
    supabase.from('contagem_produto').select('fechamento_id, produto_id, quantidade').in('fechamento_id', idsComBaseline),
    supabase.from('leitura_bomba').select('fechamento_id, bomba_id, leitura').in('fechamento_id', idsComBaseline),
    supabase.from('entrada_mercadoria').select('fechamento_id, produto_id, quantidade').in('fechamento_id', ids),
    supabase.from('perda').select('fechamento_id, produto_id, quantidade').in('fechamento_id', ids),
    supabase.from('venda_avulsa').select('fechamento_id, produto_id, quantidade, valor_centavos').in('fechamento_id', ids),
    supabase.from('movimento').select('fechamento_id, tipo, valor_centavos, categoria_despesa_id').in('fechamento_id', ids),
    supabase.from('produto').select('id, modo_apuracao'),
    supabase.from('bomba').select('id, tanque:tanque_id(combustivel_id)'),
    supabase.from('custo_produto').select('produto_id, valor_centavos, valido_a_partir_de'),
    supabase.from('custo_combustivel').select('combustivel_id, valor_centavos, valido_a_partir_de'),
    supabase.from('preco_produto').select('produto_id, valor_centavos, valido_a_partir_de'),
    supabase.from('preco_combustivel').select('combustivel_id, valor_centavos, valido_a_partir_de'),
    supabase.from('categoria_despesa').select('id, nome')
  ]);

  const histPrecoProd = agruparVigencia(precosProdRaw ?? [], 'produto_id');
  const histCustoProd = agruparVigencia(custosProdRaw ?? [], 'produto_id');
  const histPrecoComb = agruparVigencia(precosCombRaw ?? [], 'combustivel_id');
  const histCustoComb = agruparVigencia(custosCombRaw ?? [], 'combustivel_id');

  const categoriasFornecedores = new Set(
    (categoriasRaw ?? [])
      .filter((c: any) => c.nome.toLowerCase().includes('fornecedor'))
      .map((c: any) => c.id)
  );

  const combustivelPorBomba = new Map<string, string>();
  for (const b of (bombasRaw ?? []) as any[]) {
    const tanque = Array.isArray(b.tanque) ? b.tanque[0] : b.tanque;
    if (tanque?.combustivel_id) {
      combustivelPorBomba.set(b.id, tanque.combustivel_id);
    }
  }

  const contagensPorFech = new Map<string, Map<string, number>>();
  for (const c of (contagensRaw ?? []) as any[]) {
    const mapa = contagensPorFech.get(c.fechamento_id) ?? new Map<string, number>();
    mapa.set(c.produto_id, Number(c.quantidade));
    contagensPorFech.set(c.fechamento_id, mapa);
  }

  const leiturasPorFech = new Map<string, Map<string, number>>();
  for (const l of (leiturasRaw ?? []) as any[]) {
    const mapa = leiturasPorFech.get(l.fechamento_id) ?? new Map<string, number>();
    mapa.set(l.bomba_id, Number(l.leitura));
    leiturasPorFech.set(l.fechamento_id, mapa);
  }

  const lucrosDiarios: LucroDia[] = [];

  for (let idx = 0; idx < fechamentos.length; idx++) {
    const f = fechamentos[idx];
    if (!f) continue;
    const dataRef = f.data;
    const instRef = `${dataRef}T23:59:59-04:00`;

    const anteriorId = idx === 0 ? baseline?.id : fechamentos[idx - 1]?.id;
    const contagensAnt = anteriorId ? contagensPorFech.get(anteriorId) : null;
    const leiturasAnt = anteriorId ? leiturasPorFech.get(anteriorId) : null;

    const contagensAtuais = contagensPorFech.get(f.id) ?? new Map<string, number>();
    const leiturasAtuais = leiturasPorFech.get(f.id) ?? new Map<string, number>();

    let receitaTotal = 0n;
    let custoTotal = 0n;

    // A) COMBUSTÍVEL
    for (const [bombaId, leituraAtual] of leiturasAtuais.entries()) {
      const leituraAnt = leiturasAnt?.get(bombaId) ?? leituraAtual;
      const litros = leituraAtual - leituraAnt;
      if (litros <= 0) continue;

      const combId = combustivelPorBomba.get(bombaId);
      if (!combId) continue;

      const precoLitro = precoVigenteEm(histPrecoComb.get(combId) ?? [], dataRef) ?? asCentavos(0n);
      const custoLitro = custoVigenteEm(histCustoComb.get(combId) ?? [], instRef) ?? asCentavos(0n);

      const receitaComb = BigInt(Math.round(litros * Number(precoLitro)));
      const custoComb = BigInt(Math.round(litros * Number(custoLitro)));

      receitaTotal += receitaComb;
      custoTotal += custoComb;
    }

    // B) PRODUTOS
    const entradasDoDia = (entradasRaw ?? []).filter((e: any) => e.fechamento_id === f.id);
    const perdasDoDia = (perdasRaw ?? []).filter((p: any) => p.fechamento_id === f.id);
    const avulsasDoDia = (vendasAvulsasRaw ?? []).filter((v: any) => v.fechamento_id === f.id);

    const entPorProd = new Map<string, number>();
    for (const e of entradasDoDia) entPorProd.set(e.produto_id, (entPorProd.get(e.produto_id) ?? 0) + Number(e.quantidade));

    const perdPorProd = new Map<string, number>();
    for (const p of perdasDoDia) perdPorProd.set(p.produto_id, (perdPorProd.get(p.produto_id) ?? 0) + Number(p.quantidade));

    for (const p of (produtosRaw ?? []) as any[]) {
      const prodId = p.id;
      const modo = p.modo_apuracao;

      const precoProd = precoVigenteEm(histPrecoProd.get(prodId) ?? [], dataRef) ?? asCentavos(0n);
      const custoProd = custoVigenteEm(histCustoProd.get(prodId) ?? [], instRef) ?? asCentavos(0n);

      if (modo === 'contagem') {
        const estoqueAnt = contagensAnt?.get(prodId) ?? 0;
        const estoqueAtual = contagensAtuais.get(prodId) ?? estoqueAnt;
        const entradas = entPorProd.get(prodId) ?? 0;
        const perdas = perdPorProd.get(prodId) ?? 0;

        const vendido = estoqueAnt + entradas - estoqueAtual - perdas;
        if (vendido <= 0) continue;

        receitaTotal += BigInt(Math.round(vendido * Number(precoProd)));
        custoTotal += BigInt(Math.round(vendido * Number(custoProd)));
      } else {
        const avulsas = avulsasDoDia.filter((v: any) => v.produto_id === prodId);
        for (const av of avulsas) {
          receitaTotal += BigInt(av.valor_centavos);
          custoTotal += BigInt(Math.round(Number(av.quantidade) * Number(custoProd)));
        }
      }
    }

    // C) DESPESAS E TAXAS DO DIA
    const movsDoDia = (movimentosRaw ?? []).filter((m: any) => m.fechamento_id === f.id);
    let despesasDia = 0n;
    let diferencaCaixaDia = 0n;

    for (const m of movsDoDia) {
      if (m.tipo === 'despesa') {
        if (m.categoria_despesa_id && categoriasFornecedores.has(m.categoria_despesa_id)) {
          continue;
        }
        despesasDia += BigInt(Math.abs(m.valor_centavos));
      } else if (m.tipo === 'taxa_cartao') {
        despesasDia += BigInt(Math.abs(m.valor_centavos));
      } else if (m.tipo === 'diferenca_caixa') {
        diferencaCaixaDia += BigInt(m.valor_centavos);
      }
    }

    const lucroBruto = receitaTotal - custoTotal;
    const lucroLiquido = lucroBruto - despesasDia + diferencaCaixaDia;

    lucrosDiarios.push({
      data: dataRef,
      faturamento: Number(receitaTotal) / 100,
      custo: Number(custoTotal) / 100,
      despesas: Number(despesasDia) / 100,
      diferenca: Number(diferencaCaixaDia) / 100,
      lucroBruto: Number(lucroBruto) / 100,
      lucroLiquido: Number(lucroLiquido) / 100,
    });
  }

  return lucrosDiarios;
}

export interface CapitalHistorico {
  data: string;
  operacional: number;
  total: number;
}

export async function obterHistoricoCapital(
  hoje: string,
  capitalAtual: { operacional: Centavos; total: Centavos },
  limite = 15
): Promise<CapitalHistorico[]> {
  const { data: fechamentos } = await supabase
    .from('fechamento')
    .select('id, data')
    .eq('status', 'travado')
    .order('data', { ascending: false })
    .limit(limite);

  const formatDataLabel = (dataStr: string) => {
    const partes = dataStr.split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}` : dataStr;
  };

  if (!fechamentos || fechamentos.length === 0) {
    return [{
      data: formatDataLabel(hoje),
      operacional: Number(capitalAtual.operacional) / 100,
      total: Number(capitalAtual.total) / 100,
    }];
  }

  const ids = fechamentos.map((f) => f.id);

  const [
    { data: movs },
    { data: fiados }
  ] = await Promise.all([
    supabase
      .from('movimento')
      .select('fechamento_id, tipo, valor_centavos, forma_pagamento')
      .in('fechamento_id', ids),
    supabase
      .from('fiado')
      .select('fechamento_id, valor_centavos')
      .in('fechamento_id', ids)
  ]);

  const netChanges = new Map<string, { operacional: bigint; total: bigint }>();

  for (const f of fechamentos) {
    const movsDoDia = (movs ?? []).filter((m) => m.fechamento_id === f.id);
    const fiadosDoDia = (fiados ?? []).filter((fi) => fi.fechamento_id === f.id);

    let cashSales = 0n;
    let pix = 0n;
    let debitoNet = 0n;
    let debitoTaxa = 0n;
    let creditoNet = 0n;
    let creditoTaxa = 0n;
    let fiadoConcedido = 0n;
    let despesasDinheiro = 0n;
    let diferenca = 0n;
    let aportesAumento = 0n;

    for (const m of movsDoDia) {
      const val = BigInt(m.valor_centavos);
      const absVal = val < 0n ? -val : val;

      if (m.tipo === 'recebimento_venda') {
        if (m.forma_pagamento === 'dinheiro') cashSales = val;
        else if (m.forma_pagamento === 'pix') pix = val;
        else if (m.forma_pagamento === 'debito') debitoNet = val;
        else if (m.forma_pagamento === 'credito') creditoNet = val;
      } else if (m.tipo === 'taxa_cartao') {
        if (m.forma_pagamento === 'debito') debitoTaxa = absVal;
        else if (m.forma_pagamento === 'credito') creditoTaxa = absVal;
      } else if (m.tipo === 'diferenca_caixa') {
        diferenca = val;
      } else if (['despesa', 'prolabore', 'vale'].includes(m.tipo)) {
        if (m.forma_pagamento === 'dinheiro') {
          despesasDinheiro += absVal;
        }
      } else if (m.tipo === 'aporte_aumento') {
        aportesAumento += val;
      }
    }

    for (const fi of fiadosDoDia) {
      fiadoConcedido += BigInt(fi.valor_centavos);
    }

    const debitoGross = debitoNet + debitoTaxa;
    const creditoGross = creditoNet + creditoTaxa;
    const vendaFisica = cashSales + pix + debitoGross + creditoGross + fiadoConcedido;

    const netChangeTotal = vendaFisica - despesasDinheiro + diferenca;
    const netChangeOperacional = netChangeTotal - aportesAumento;

    netChanges.set(f.data, { operacional: netChangeOperacional, total: netChangeTotal });
  }

  const historico: CapitalHistorico[] = [];
  let capOp = BigInt(capitalAtual.operacional);
  let capTot = BigInt(capitalAtual.total);

  historico.push({
    data: formatDataLabel(hoje),
    operacional: Number(capOp) / 100,
    total: Number(capTot) / 100,
  });

  for (const f of fechamentos) {
    const change = netChanges.get(f.data) ?? { operacional: 0n, total: 0n };
    capOp -= change.operacional;
    capTot -= change.total;

    historico.push({
      data: formatDataLabel(f.data),
      operacional: Number(capOp) / 100,
      total: Number(capTot) / 100,
    });
  }

  return historico.reverse();
}

export interface MovimentoDetalhado {
  tipo: string;
  valor: Centavos;
  descricao: string | null;
  formaPagamento: string;
}

export interface FiadoDetalhado {
  clienteNome: string;
  valor: Centavos;
}

export async function obterMovimentosFechamento(fechamentoId: string): Promise<MovimentoDetalhado[]> {
  const { data, error } = await supabase
    .from('movimento')
    .select('tipo, valor_centavos, descricao, forma_pagamento')
    .eq('fechamento_id', fechamentoId);
  if (error || !data) return [];
  return data.map((m) => ({
    tipo: m.tipo,
    valor: asCentavos(BigInt(m.valor_centavos)),
    descricao: m.descricao,
    formaPagamento: m.forma_pagamento,
  }));
}

export async function obterFiadosFechamento(fechamentoId: string): Promise<FiadoDetalhado[]> {
  const { data, error } = await supabase
    .from('fiado')
    .select('valor_centavos, cliente:cliente_id(nome)')
    .eq('fechamento_id', fechamentoId);
  if (error || !data) return [];
  return (data as any[]).map((f) => ({
    clienteNome: f.cliente?.nome ?? 'Desconhecido',
    valor: asCentavos(BigInt(f.valor_centavos)),
  }));
}

// =====================================================================
// Exclusão de cadastros NUNCA usados (migration 20260625140000).
//
// Regra: só apaga de verdade quem nunca apareceu em nenhum evento; caso
// contrário fica no histórico (a UI cai para "inativar"). A guarda final é
// a policy de DELETE no banco — estas funções dão a checagem antecipada (para
// a UI habilitar/desabilitar o botão) e o delete propriamente dito.
// =====================================================================

/** Conta linhas de `tabela` onde `coluna = valor` (sem trazer dados). */
async function contarRefs(tabela: string, coluna: string, valor: string): Promise<number> {
  const { count, error } = await supabase
    .from(tabela)
    .select('*', { count: 'exact', head: true })
    .eq(coluna, valor);
  if (error) throw error;
  return count ?? 0;
}

/** Soma as referências de várias tabelas/colunas ao mesmo id. */
async function totalRefs(id: string, alvos: Array<[string, string]>): Promise<number> {
  const contagens = await Promise.all(alvos.map(([t, c]) => contarRefs(t, c, id)));
  return contagens.reduce((s, n) => s + n, 0);
}

/**
 * Apaga uma linha por id e CONFIRMA que algo foi removido. Se a policy de DELETE
 * barrar (cadastro já usado) ou a linha não existir, `count` volta 0 e lançamos
 * um erro tratável para a UI mostrar a mensagem amigável.
 */
async function apagarLinha(tabela: string, id: string): Promise<void> {
  const { count, error } = await supabase.from(tabela).delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if ((count ?? 0) === 0) {
    throw new Error('NAO_EXCLUIDO');
  }
}

// ---- Produto ----
export async function podeExcluirProduto(id: string): Promise<boolean> {
  return (
    (await totalRefs(id, [
      ['contagem_produto', 'produto_id'],
      ['entrada_mercadoria', 'produto_id'],
      ['perda', 'produto_id'],
      ['venda_avulsa', 'produto_id'],
    ])) === 0
  );
}
export async function removerProduto(id: string): Promise<void> {
  // Cascade leva preco_produto e custo_produto (config).
  await apagarLinha('produto', id);
}

// ---- Combustível ----
export async function podeExcluirCombustivel(id: string): Promise<boolean> {
  return (await contarRefs('tanque', 'combustivel_id', id)) === 0;
}
export async function removerCombustivel(id: string): Promise<void> {
  // Cascade leva preco_combustivel e custo_combustivel (config).
  await apagarLinha('combustivel', id);
}

// ---- Tanque ----
export async function podeExcluirTanque(id: string): Promise<boolean> {
  const refsDiretas = await totalRefs(id, [
    ['entrada_combustivel', 'tanque_id'],
    ['medicao_tanque', 'tanque_id'],
  ]);
  if (refsDiretas > 0) return false;
  // Leituras de encerrante via qualquer bico do tanque.
  const { data: bombas, error } = await supabase.from('bomba').select('id').eq('tanque_id', id);
  if (error) throw error;
  const ids = (bombas ?? []).map((b: { id: string }) => b.id);
  if (ids.length === 0) return true;
  const { count, error: e2 } = await supabase
    .from('leitura_bomba')
    .select('*', { count: 'exact', head: true })
    .in('bomba_id', ids);
  if (e2) throw e2;
  return (count ?? 0) === 0;
}
export async function removerTanque(id: string): Promise<void> {
  // Cascade leva as bombas (sem leitura, garantido pela guarda da policy).
  await apagarLinha('tanque', id);
}

// ---- Bomba/bico ----
export async function podeExcluirBomba(id: string): Promise<boolean> {
  return (await contarRefs('leitura_bomba', 'bomba_id', id)) === 0;
}
export async function removerBomba(id: string): Promise<void> {
  await apagarLinha('bomba', id);
}

// ---- Funcionário ----
export async function podeExcluirFuncionario(id: string): Promise<boolean> {
  return (
    (await totalRefs(id, [
      ['movimento', 'funcionario_id'],
      ['fechamento_folha', 'funcionario_id'],
    ])) === 0
  );
}
export async function removerFuncionario(id: string): Promise<void> {
  await apagarLinha('funcionario', id);
}

// ---- Sócio ----
export async function podeExcluirSocio(id: string): Promise<boolean> {
  return (await contarRefs('movimento', 'socio_id', id)) === 0;
}
export async function removerSocio(id: string): Promise<void> {
  await apagarLinha('socio', id);
}

// ---- Categoria de produto ----
export async function podeExcluirCategoria(id: string): Promise<boolean> {
  return (await contarRefs('produto', 'categoria_id', id)) === 0;
}
export async function removerCategoria(id: string): Promise<void> {
  await apagarLinha('categoria', id);
}

// ---- Categoria de despesa ----
export async function podeExcluirCategoriaDespesa(id: string): Promise<boolean> {
  return (await contarRefs('movimento', 'categoria_despesa_id', id)) === 0;
}
export async function removerCategoriaDespesa(id: string): Promise<void> {
  await apagarLinha('categoria_despesa', id);
}

// ---- Conta ----
export async function podeExcluirConta(id: string): Promise<boolean> {
  return (
    (await totalRefs(id, [
      ['movimento', 'conta_id'],
      ['movimento', 'contraparte_conta_id'],
    ])) === 0
  );
}
export async function removerConta(id: string): Promise<void> {
  // Cascade leva a ACL (usuario_conta).
  await apagarLinha('conta', id);
}

// ---- Cliente de fiado ----
export async function podeExcluirClienteFiado(id: string): Promise<boolean> {
  return (await contarRefs('fiado', 'cliente_id', id)) === 0;
}
export async function removerClienteFiado(id: string): Promise<void> {
  await apagarLinha('cliente_fiado', id);
}

// ===================== DIA ZERO (§3.8) CONFIGURAÇÃO INLINE =====================
export const DATA_DIA_ZERO = '2026-06-01';

export async function temFechamentoOperacional(): Promise<boolean> {
  const { data: diaZero } = await supabase
    .from('fechamento')
    .select('data')
    .eq('status', 'travado')
    .order('data', { ascending: true })
    .limit(1)
    .maybeSingle();
  const dataRef = diaZero?.data ?? DATA_DIA_ZERO;

  const { count, error } = await supabase
    .from('fechamento')
    .select('id', { count: 'exact', head: true })
    .gt('data', dataRef)
    .eq('status', 'travado');
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function verificarSistemaInicializado(): Promise<boolean> {
  const { count, error } = await supabase
    .from('fechamento')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'travado');
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function obterFechamentoDiaZeroId(): Promise<string | null> {
  const { data } = await supabase
    .from('fechamento')
    .select('id')
    .eq('status', 'travado')
    .order('data', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data) return data.id;

  // Fallback se não inicializado ainda
  const { data: exist } = await supabase
    .from('fechamento')
    .select('id')
    .eq('data', DATA_DIA_ZERO)
    .maybeSingle();
  return exist?.id ?? null;
}

export async function obterOuCriarFechamentoDiaZero(): Promise<string> {
  const res = await obterOuCriarFechamentoDiaZeroComData();
  return res.id;
}

export async function obterOuCriarFechamentoDiaZeroComData(): Promise<{ id: string; data: string }> {
  const { data: diaZero, error: eDiaZero } = await supabase
    .from('fechamento')
    .select('id, data')
    .eq('status', 'travado')
    .order('data', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (eDiaZero) throw eDiaZero;
  if (diaZero) return { id: diaZero.id, data: diaZero.data };

  // Fallback se não inicializado ainda (usando DATA_DIA_ZERO)
  const { data: exist, error: eExist } = await supabase
    .from('fechamento')
    .select('id, data')
    .eq('data', DATA_DIA_ZERO)
    .maybeSingle();
  if (eExist) throw eExist;

  if (exist) {
    return { id: exist.id, data: exist.data };
  }

  const id = uuidv7();
  const { error: eInsert } = await supabase.from('fechamento').insert({
    id,
    data: DATA_DIA_ZERO,
    status: 'aberto',
    troco_fixo_centavos: 0,
    observacao: 'Rascunho de abertura (Dia Zero).'
  });
  if (eInsert) throw eInsert;
  return { id, data: DATA_DIA_ZERO };
}

export async function definirEstoqueInicialProduto(produtoId: string, quantidade: number): Promise<void> {
  const fechamentoId = await obterOuCriarFechamentoDiaZero();
  const { error } = await supabase.from('contagem_produto').upsert({
    id: uuidv7(),
    fechamento_id: fechamentoId,
    produto_id: produtoId,
    quantidade,
  }, { onConflict: 'fechamento_id,produto_id' });
  if (error) throw error;
}

export async function definirLeituraInicialBomba(bombaId: string, leitura: number): Promise<void> {
  const fechamentoId = await obterOuCriarFechamentoDiaZero();
  const { error } = await supabase.from('leitura_bomba').upsert({
    id: uuidv7(),
    fechamento_id: fechamentoId,
    bomba_id: bombaId,
    leitura,
  }, { onConflict: 'fechamento_id,bomba_id' });
  if (error) throw error;
}

export async function definirSaldoInicialConta(contaId: string, valorCentavos: Centavos, usuarioId: string | null): Promise<void> {
  const { id: fechamentoId, data: dataRef } = await obterOuCriarFechamentoDiaZeroComData();
  
  const { data: exist, error: eExist } = await supabase
    .from('movimento')
    .select('id')
    .eq('fechamento_id', fechamentoId)
    .eq('conta_id', contaId)
    .eq('tipo', 'ajuste')
    .maybeSingle();
  if (eExist) throw eExist;

  if (exist) {
    const { error: eUpdate } = await supabase
      .from('movimento')
      .update({
        valor_centavos: centavosParaNumero(valorCentavos),
        data_hora: new Date(dataRef + 'T12:00:00-04:00').toISOString(),
      })
      .eq('id', exist.id);
    if (eUpdate) throw eUpdate;
  } else {
    const { error: eInsert } = await supabase.from('movimento').insert({
      id: uuidv7(),
      tipo: 'ajuste',
      conta_id: contaId,
      valor_centavos: centavosParaNumero(valorCentavos),
      data_hora: new Date(dataRef + 'T12:00:00-04:00').toISOString(),
      fechamento_id: fechamentoId,
      descricao: 'Saldo inicial (dia zero).',
      criado_por: usuarioId,
    });
    if (eInsert) throw eInsert;
  }
}

export async function buscarEstoqueInicialProduto(produtoId: string): Promise<number | null> {
  const fechId = await obterFechamentoDiaZeroId();
  if (!fechId) return null;

  const { data, error } = await supabase
    .from('contagem_produto')
    .select('quantidade')
    .eq('fechamento_id', fechId)
    .eq('produto_id', produtoId)
    .maybeSingle();
  if (error) return null;
  return data ? Number(data.quantidade) : null;
}

export async function buscarLeituraInicialBomba(bombaId: string): Promise<number | null> {
  const fechId = await obterFechamentoDiaZeroId();
  if (!fechId) return null;

  const { data, error } = await supabase
    .from('leitura_bomba')
    .select('leitura')
    .eq('fechamento_id', fechId)
    .eq('bomba_id', bombaId)
    .maybeSingle();
  if (error) return null;
  return data ? Number(data.leitura) : null;
}

export async function buscarSaldoInicialConta(contaId: string): Promise<Centavos | null> {
  const fechId = await obterFechamentoDiaZeroId();
  if (!fechId) return null;

  const { data, error } = await supabase
    .from('movimento')
    .select('valor_centavos')
    .eq('fechamento_id', fechId)
    .eq('conta_id', contaId)
    .eq('tipo', 'ajuste')
    .maybeSingle();
  if (error) return null;
  return data ? asCentavos(BigInt(data.valor_centavos)) : null;
}

// ---- DIA ZERO SETUP WIZARD TYPES & FUNCTION ----

export interface DadosSetupCombustivel {
  nome: string;
  precoVenda: Centavos;
  precoCusto: Centavos;
  tanque: {
    nome: string;
    capacidade: number;
    nivelAlerta: number;
    nivelInicial: number;
  };
  bicos: Array<{
    nome: string;
    encerranteInicial: number;
  }>;
}

export interface DadosSetupProduto {
  nome: string;
  categoriaId: string;
  modoApuracao: 'contagem' | 'individual';
  ordem: number;
  precoVenda: Centavos;
  precoCusto: Centavos;
  estoqueInicial: number;
  alertaBaixo: number | null;
  alertaMuitoBaixo: number | null;
}

export interface DadosSetupConta {
  nome: string;
  tipo: 'dinheiro' | 'banco';
  ehDestinoPadraoVenda: boolean;
  saldoInicial: Centavos;
}

export interface DadosSetupInicial {
  dataDiaZero: string;
  trocoFixoCentavos: number;
  combustiveis: DadosSetupCombustivel[];
  produtos: DadosSetupProduto[];
  contas: DadosSetupConta[];
  usuarioId: string | null;
}

export async function inicializarSistemaLote(dados: DadosSetupInicial): Promise<void> {
  const { dataDiaZero, trocoFixoCentavos, combustiveis, produtos, contas, usuarioId } = dados;

  // 1) Insere o fechamento do Dia Zero
  const fechamentoId = uuidv7();
  const { error: eFech } = await supabase.from('fechamento').insert({
    id: fechamentoId,
    data: dataDiaZero,
    status: 'travado',
    troco_fixo_centavos: trocoFixoCentavos,
    observacao: 'Abertura do sistema (Dia Zero).',
    confirmado_em: new Date().toISOString(),
    travado_em: new Date().toISOString(),
  });
  if (eFech) throw eFech;

  const criados: { tabela: string; id: string }[] = [];

  try {
    // 2) Insere combustíveis, tanques e bicos
    for (const c of combustiveis) {
      const combustivelId = uuidv7();
      const { error: eComb } = await supabase.from('combustivel').insert({
        id: combustivelId,
        nome: c.nome,
      });
      if (eComb) throw eComb;
      criados.push({ tabela: 'combustivel', id: combustivelId });

      const { error: ePreco } = await supabase.from('preco_combustivel').insert({
        id: uuidv7(),
        combustivel_id: combustivelId,
        valor_centavos: centavosParaNumero(c.precoVenda),
        valido_a_partir_de: dataDiaZero + 'T00:00:00-04:00',
      });
      if (ePreco) throw ePreco;

      const { error: eCusto } = await supabase.from('custo_combustivel').insert({
        id: uuidv7(),
        combustivel_id: combustivelId,
        valor_centavos: centavosParaNumero(c.precoCusto),
        valido_a_partir_de: dataDiaZero + 'T00:00:00-04:00',
      });
      if (eCusto) throw eCusto;

      const tanqueId = uuidv7();
      const { error: eTanque } = await supabase.from('tanque').insert({
        id: tanqueId,
        combustivel_id: combustivelId,
        nome: c.tanque.nome,
        capacidade_litros: c.tanque.capacidade,
        nivel_alerta_litros: c.tanque.nivelAlerta,
        ativo: true,
      });
      if (eTanque) throw eTanque;
      criados.push({ tabela: 'tanque', id: tanqueId });

      // Insere a medição de tanque inicial correspondente ao Dia Zero
      const { error: eMedicao } = await supabase.from('medicao_tanque').insert({
        id: uuidv7(),
        tanque_id: tanqueId,
        litros_medidos: c.tanque.nivelInicial,
        data_hora: dataDiaZero + 'T12:00:00-04:00', // Meio-dia do Dia Zero
        observacao: 'Medição inicial (Dia Zero).',
      });
      if (eMedicao) throw eMedicao;

      for (const b of c.bicos) {
        const bicoId = uuidv7();
        const { error: eBomba } = await supabase.from('bomba').insert({
          id: bicoId,
          tanque_id: tanqueId,
          nome: b.nome,
          ativo: true,
        });
        if (eBomba) throw eBomba;
        criados.push({ tabela: 'bomba', id: bicoId });

        const { error: eLeitura } = await supabase.from('leitura_bomba').insert({
          id: uuidv7(),
          fechamento_id: fechamentoId,
          bomba_id: bicoId,
          leitura: b.encerranteInicial,
        });
        if (eLeitura) throw eLeitura;
      }
    }

    // 3) Insere produtos, preços, custos e estoques
    for (const p of produtos) {
      const produtoId = uuidv7();
      const { error: eProd } = await supabase.from('produto').insert({
        id: produtoId,
        nome: p.nome,
        categoria_id: p.categoriaId,
        unidade: 'unidade',
        ordem: p.ordem,
        modo_apuracao: p.modoApuracao,
        alerta_baixo: p.alertaBaixo,
        alerta_muito_baixo: p.alertaMuitoBaixo,
        ativo: true,
      });
      if (eProd) throw eProd;
      criados.push({ tabela: 'produto', id: produtoId });

      const { error: ePreco } = await supabase.from('preco_produto').insert({
        id: uuidv7(),
        produto_id: produtoId,
        valor_centavos: centavosParaNumero(p.precoVenda),
        valido_a_partir_de: dataDiaZero + 'T00:00:00-04:00',
      });
      if (ePreco) throw ePreco;

      const { error: eCusto } = await supabase.from('custo_produto').insert({
        id: uuidv7(),
        produto_id: produtoId,
        valor_centavos: centavosParaNumero(p.precoCusto),
        valido_a_partir_de: dataDiaZero + 'T00:00:00-04:00',
      });
      if (eCusto) throw eCusto;

      if (p.modoApuracao === 'contagem' && p.estoqueInicial > 0) {
        const { error: eCont } = await supabase.from('contagem_produto').insert({
          id: uuidv7(),
          fechamento_id: fechamentoId,
          produto_id: produtoId,
          quantidade: p.estoqueInicial,
        });
        if (eCont) throw eCont;
      }
    }

    // 4) Insere contas e saldos de partida
    for (const c of contas) {
      const contaId = uuidv7();
      const { error: eConta } = await supabase.from('conta').insert({
        id: contaId,
        nome: c.nome,
        tipo: c.tipo,
        eh_destino_padrao_venda: c.ehDestinoPadraoVenda,
        ativo: true,
      });
      if (eConta) throw eConta;
      criados.push({ tabela: 'conta', id: contaId });

      if (c.saldoInicial > 0n) {
        const { error: eMov } = await supabase.from('movimento').insert({
          id: uuidv7(),
          tipo: 'ajuste',
          conta_id: contaId,
          valor_centavos: centavosParaNumero(c.saldoInicial),
          data_hora: dataDiaZero + 'T12:00:00-04:00',
          fechamento_id: fechamentoId,
          descricao: 'Saldo inicial (dia zero).',
          criado_por: usuarioId,
        });
        if (eMov) throw eMov;
      }
    }
  } catch (err) {
    // Rollback manual deletando o fechamento e as entidades independentes criadas
    await supabase.from('fechamento').delete().eq('id', fechamentoId);
    
    // Apaga as outras entidades para não deixar lixo
    for (const item of criados.reverse()) {
      await supabase.from(item.tabela).delete().eq('id', item.id);
    }
    
    throw err;
  }
}
