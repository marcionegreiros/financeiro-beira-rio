/**
 * Repositórios — leitura do banco já convertida para tipos do domínio.
 *
 * As telas chamam estas funções e NÃO falam com o Supabase direto. Quando o
 * PowerSync entrar, só a implementação aqui muda (a fonte vira o SQLite local);
 * as telas continuam iguais.
 */
import { supabase } from './supabase';
import { paraCentavos, litrosParaMililitros, centavosParaNumero, quantidadeParaNumero } from './conversao';
import { precoVigenteEm, custoVigenteEm, type RegistroVigencia } from '../domain/precos';
import { capitalTotal, capitalOperacional } from '../domain/capital';
import { hojeManaus, limitesDoDiaManaus } from '../lib/datas';
import { uuidv7 } from '../lib/uuidv7';
import { somar, asCentavos, type Centavos } from '../lib/money';
import type { Mililitros, Quantidade } from '../domain/tipos';

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
}

export async function listarContasCompletas(): Promise<ContaCompleta[]> {
  const { data, error } = await supabase.from('conta').select('id,nome,tipo,eh_destino_padrao_venda,ativo').order('nome');
  if (error) throw error;
  const linhas = (data ?? []) as Array<{ id: string, nome: string, tipo: string, eh_destino_padrao_venda: boolean, ativo: boolean }>;
  return linhas.map(r => ({
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    ehDestinoPadraoVenda: r.eh_destino_padrao_venda,
    ativo: r.ativo,
  }));
}

export async function salvarConta(conta: ContaCompleta): Promise<void> {
  const { error } = await supabase.from('conta').upsert({
    id: conta.id,
    nome: conta.nome,
    tipo: conta.tipo,
    eh_destino_padrao_venda: conta.ehDestinoPadraoVenda,
    ativo: conta.ativo,
  });
  if (error) throw error;
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
  data: string
): Promise<void> {
  const { error } = await supabase.from('entrada_mercadoria').insert({
    id,
    produto_id: produtoId,
    quantidade,
    custo_unitario_centavos: centavosParaNumero(custoUnitarioCentavos),
    data,
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
  criadoPor: string
): Promise<void> {
  const { error } = await supabase.from('movimento').insert({
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
}

/** Uma despesa do dia (movimento tipo='despesa'), com magnitude positiva. */
export interface DespesaDoDia {
  id: string;
  valor: Centavos; // magnitude positiva (o movimento guarda com sinal negativo)
  descricao: string | null;
  categoriaNome: string | null;
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
      'id,valor_centavos,data_hora,descricao,forma_pagamento,fechamento_id,' +
        'conta:conta_id(nome,tipo),categoria:categoria_despesa_id(nome)',
    )
    .eq('tipo', 'despesa')
    .gte('data_hora', inicio)
    .lt('data_hora', fim)
    .order('data_hora', { ascending: true });
  if (error) throw error;

  const linhas = (rows ?? []) as unknown as Array<{
    id: string;
    valor_centavos: number;
    data_hora: string;
    descricao: string | null;
    forma_pagamento: string | null;
    fechamento_id: string | null;
    conta: { nome: string; tipo: string } | { nome: string; tipo: string }[] | null;
    categoria: RelNome;
  }>;

  return linhas.map((m) => {
    const conta = Array.isArray(m.conta) ? m.conta[0] : m.conta;
    const bruto = BigInt(m.valor_centavos);
    return {
      id: m.id,
      valor: asCentavos(bruto < 0n ? -bruto : bruto),
      descricao: m.descricao,
      categoriaNome: nomeRel(m.categoria),
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

/** Remove uma despesa do dia (correção antes de travar o fechamento). */
export async function removerDespesa(id: string): Promise<void> {
  const { error } = await supabase.from('movimento').delete().eq('id', id);
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
  criadoPor: string
): Promise<void> {
  const multiplicador = (tipo === 'aporte_emprestimo' || tipo === 'aporte_aumento') ? 1 : -1;
  const valor = centavosParaNumero(valorCentavos) * multiplicador;

  const { error } = await supabase.from('movimento').insert({
    id,
    tipo,
    conta_id: contaId,
    valor_centavos: valor,
    data_hora: dataHora,
    socio_id: socioId,
    descricao,
    criado_por: criadoPor
  });
  if (error) throw error;
}

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

export async function obterVendasMes(dataBase: string): Promise<{
  vendaDia: Centavos;
  vendaMes: Centavos;
  litrosMes: number;
  vendasDiarias: { data: string; valor: number }[];
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
    return { vendaDia: asCentavos(0n), vendaMes: asCentavos(0n), litrosMes: 0, vendasDiarias: [] };
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
  const sequencia = baseline ? [baseline, ...fechamentos] : fechamentos;
  let litrosMes = 0;
  for (let i = 1; i < sequencia.length; i++) {
    const atual = leiturasPorFech.get(sequencia[i]!.id);
    const anterior = leiturasPorFech.get(sequencia[i - 1]!.id);
    if (!atual) continue;
    for (const [bombaId, leituraAtual] of atual) {
      // Sem leitura anterior conhecida para a bomba → não dá pra inferir venda (0).
      const leituraAnt = anterior?.get(bombaId) ?? leituraAtual;
      const diff = leituraAtual - leituraAnt;
      if (diff > 0) litrosMes += diff;
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
  };
}

export interface AuditoriaLog {
  id: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  usuarioNome: string | null;
  dadosAntes: unknown;
  dadosDepois: unknown;
  criadoEm: string;
}

export async function listarAuditoria(): Promise<AuditoriaLog[]> {
  const { data, error } = await supabase
    .from('auditoria')
    .select('id, entidade, entidade_id, acao, dados_antes, dados_depois, criado_em, usuario(nome)')
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
    usuario: { nome: string } | { nome: string }[] | null;
  }>;

  return linhas.map((l) => {
    const usr = Array.isArray(l.usuario) ? l.usuario[0] : l.usuario;
    return {
      id: l.id,
      entidade: l.entidade,
      entidadeId: l.entidade_id,
      acao: l.acao,
      usuarioNome: usr?.nome ?? 'Sistema / Desconhecido',
      dadosAntes: l.dados_antes,
      dadosDepois: l.dados_depois,
      criadoEm: l.criado_em,
    };
  });
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
  contaNome: string | null;
  contraparteNome: string | null;
  categoriaNome: string | null;
  socioNome: string | null;
  usuarioNome: string | null;
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
      'id,tipo,valor_centavos,data_hora,descricao,forma_pagamento,tags,' +
        'conta:conta_id(nome),contraparte:contraparte_conta_id(nome),' +
        'categoria:categoria_despesa_id(nome),socio:socio_id(nome),usuario:criado_por(nome)',
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
    conta: RelNome;
    contraparte: RelNome;
    categoria: RelNome;
    socio: RelNome;
    usuario: RelNome;
  }>;

  return linhas.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    dataHora: m.data_hora,
    valorCentavos: asCentavos(BigInt(m.valor_centavos)),
    descricao: m.descricao,
    formaPagamento: m.forma_pagamento,
    tags: m.tags ?? [],
    contaNome: nomeRel(m.conta),
    contraparteNome: nomeRel(m.contraparte),
    categoriaNome: nomeRel(m.categoria),
    socioNome: nomeRel(m.socio),
    usuarioNome: nomeRel(m.usuario),
  }));
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
  funcionarioId: string,
  contaId: string,
  valor: Centavos,
  dataHora: string,
  descricao: string,
  criadoPor: string,
): Promise<void> {
  const { error } = await supabase.from('movimento').insert({
    id: uuidv7(),
    tipo: 'vale',
    conta_id: contaId,
    valor_centavos: -centavosParaNumero(valor),
    data_hora: dataHora,
    funcionario_id: funcionarioId,
    forma_pagamento: 'dinheiro',
    descricao,
    criado_por: criadoPor,
  });
  if (error) throw error;
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
}

export async function listarFechamentosFolha(): Promise<FechamentoFolha[]> {
  const { data, error } = await supabase
    .from('fechamento_folha')
    .select(
      'id, funcionario_id, competencia, salario_base_centavos, total_vales_centavos, a_receber_centavos, status, funcionario:funcionario_id(nome)',
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

