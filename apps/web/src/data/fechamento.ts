/**
 * Camada de dados do Fechamento (§5.2). Carrega o contexto (abertura = estado do
 * fechamento anterior + catálogo + preços + config) e PERSISTE o fechamento
 * confirmado como eventos imutáveis (Pilar 1): fechamento travado + contagens +
 * leituras + movimentos do livro financeiro.
 */
import { supabase } from './supabase';
import {
  paraCentavos,
  paraQuantidade,
  litrosParaMililitros,
  centavosParaNumero,
  mililitrosParaLitros,
  quantidadeParaNumero,
} from './conversao';
import { precoVigenteEm, custoVigenteEm, type RegistroVigencia } from '../domain/precos';
import { hojeManaus, agoraManausISO, limitesDoDiaManaus } from '../lib/datas';
import { uuidv7 } from '../lib/uuidv7';
import { asCentavos, type Centavos, parseReais, somar } from '../lib/money';
import { asMililitros, asQuantidade, type Mililitros, type Quantidade } from '../domain/tipos';
import { listarDespesasDoDia, type DespesaDoDia, listarFiadosEmAberto, type FiadoEmAberto } from './repositorios';

export interface BombaCtx {
  id: string;
  nome: string;
  combustivel: string;
  precoLitro: Centavos | undefined;
  leituraAnterior: Mililitros;
}

export interface ProdutoCtx {
  id: string;
  nome: string;
  ordem: number;
  preco: Centavos | undefined;
  estoqueAnterior: Quantidade;
  modoApuracao: 'contagem' | 'individual';
}

export interface ContextoFechamento {
  data: string;
  jaExisteHoje: boolean;
  status: 'aberto' | 'travado' | null;
  fechamentoId: string | null;
  bombas: BombaCtx[];
  produtos: ProdutoCtx[]; // Apenas contagem
  produtosIndividuais: ProdutoCtx[]; // Apenas individual
  clientesFiado: { id: string; nome: string }[];
  fiadosEmAberto: FiadoEmAberto[];
  trocoFixo: Centavos;
  taxaDebito: { percentualBp: bigint; fixa: Centavos };
  taxaCredito: { percentualBp: bigint; fixa: Centavos };
  contaCaixaId: string | null;
  contaBancoId: string | null;
  /** Despesas lançadas no dia (janela Despesas ou aqui); as em dinheiro reduzem o esperado. */
  despesasDoDia: DespesaDoDia[];
  /** Entradas de mercadoria do dia, somadas por produto (de qualquer origem). */
  entradasDoDia: Record<string, string>;
  valoresSalvos?: {
    leituras: Record<string, string>;
    contagens: Record<string, string>;
    vendasIndividuais: Record<string, string>;
    pix: string;
    debito: string;
    credito: string;
    fiadosConcedidos: { id?: string; clienteId: string; valor: string; vencimento: string | null }[];
    fiadosRecebidos: { id?: string; clienteId: string; valor: string; fiadoId: string | null }[];
    contado: string;
    observacao: string;
  } | undefined;
  mostrarProdutosAvulsos: boolean;
}

interface ConfigCartao {
  percentual_bp?: number;
  fixa_centavos?: number;
}

function centavosParaString(valor: number | bigint): string {
  const v = BigInt(valor);
  const negativo = v < 0n;
  const abs = negativo ? -v : v;
  const centavosStr = (abs % 100n).toString().padStart(2, '0');
  const inteirosStr = (abs / 100n).toString();
  return `${negativo ? '-' : ''}${inteirosStr},${centavosStr}`;
}

export async function carregarContexto(dataOpcional?: string): Promise<ContextoFechamento> {
  const data = dataOpcional ?? hojeManaus();

  const [
    { data: existeHoje },
    { data: bombasRaw, error: eB },
    { data: precosComb, error: ePC },
    { data: produtosRaw, error: eP },
    { data: precosProd, error: ePP },
    { data: configRaw, error: eCfg },
    { data: contasRaw, error: eC },
    { data: clientesRaw, error: eCli },
    { data: anteriorRaw },
    fiadosEmAberto,
  ] = await Promise.all([
    supabase.from('fechamento').select('id, status, rascunho').eq('data', data).maybeSingle(),
    supabase
      .from('bomba')
      .select('id,nome,tanque!inner(combustivel_id,ativo,combustivel(nome))')
      .eq('ativo', true)
      .eq('tanque.ativo', true),
    supabase.from('preco_combustivel').select('combustivel_id,valor_centavos,valido_a_partir_de'),
    supabase
      .from('produto')
      .select('id,nome,ordem,modo_apuracao,ativo')
      .order('ordem'),
    supabase.from('preco_produto').select('produto_id,valor_centavos,valido_a_partir_de'),
    supabase.from('config').select('chave,valor_json'),
    supabase.from('conta').select('id,tipo,eh_destino_padrao_venda,ativo').eq('ativo', true),
    supabase.from('cliente_fiado').select('id,nome').order('nome'),
    supabase
      .from('fechamento')
      .select('id')
      .lt('data', data)
      .eq('status', 'travado')
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle(),
    listarFiadosEmAberto(),
  ]);
  for (const e of [eB, ePC, eP, ePP, eCfg, eC, eCli]) if (e) throw e;

  const fechExistente = existeHoje as { id: string; status: 'aberto' | 'travado'; rascunho: any } | null;
  const jaExisteHoje = Boolean(fechExistente && fechExistente.status === 'travado');
  const status = fechExistente?.status ?? null;
  const fechamentoId = fechExistente?.id ?? null;

  // Contagens/leituras do fechamento anterior (estado de abertura de hoje).
  const anteriorId = (anteriorRaw as { id: string } | null)?.id ?? null;
  let contagensAnt: Array<{ produto_id: string; quantidade: number }> = [];
  let leiturasAnt: Array<{ bomba_id: string; leitura: number }> = [];
  if (anteriorId) {
    const [{ data: cAnt }, { data: lAnt }] = await Promise.all([
      supabase
        .from('contagem_produto')
        .select('produto_id,quantidade')
        .eq('fechamento_id', anteriorId),
      supabase.from('leitura_bomba').select('bomba_id,leitura').eq('fechamento_id', anteriorId),
    ]);
    contagensAnt = (cAnt ?? []) as typeof contagensAnt;
    leiturasAnt = (lAnt ?? []) as typeof leiturasAnt;
  }
  const qtdAnterior = new Map(contagensAnt.map((c) => [c.produto_id, c.quantidade]));
  const leituraAnterior = new Map(leiturasAnt.map((l) => [l.bomba_id, l.leitura]));

  // Históricos de preço por combustível / produto.
  const histComb = agruparPrecos((precosComb ?? []) as PrecoRaw[], 'combustivel_id');
  const histProd = agruparPrecos((precosProd ?? []) as PrecoRaw[], 'produto_id');

  const bombas: BombaCtx[] = ((bombasRaw ?? []) as BombaRaw[]).map((b) => {
    const tanque = Array.isArray(b.tanque) ? b.tanque[0] : b.tanque;
    const comb = tanque
      ? Array.isArray(tanque.combustivel)
        ? tanque.combustivel[0]
        : tanque.combustivel
      : null;
    const combId = tanque?.combustivel_id ?? '';
    return {
      id: b.id,
      nome: b.nome,
      combustivel: comb?.nome ?? '',
      precoLitro: precoVigenteEm(histComb.get(combId) ?? [], data),
      leituraAnterior: litrosParaMililitros(leituraAnterior.get(b.id) ?? 0),
    };
  });



  const clientesFiado = ((clientesRaw ?? []) as Array<{ id: string; nome: string }>).map((c) => ({
    id: c.id,
    nome: c.nome,
  }));

  const config = new Map(
    ((configRaw ?? []) as Array<{ chave: string; valor_json: unknown }>).map((c) => [
      c.chave,
      c.valor_json,
    ]),
  );
  const trocoFixo = paraCentavos(Number(config.get('troco_fixo_centavos') ?? 0));
  const mostrarProdutosAvulsos = Boolean(config.get('fechamento_mostrar_avulsos') ?? false);
  const taxaDebito = lerTaxa(config.get('taxa_cartao_debito') as ConfigCartao | undefined);
  const taxaCredito = lerTaxa(config.get('taxa_cartao_credito') as ConfigCartao | undefined);

  const contas = (contasRaw ?? []) as Array<{
    id: string;
    tipo: string;
    eh_destino_padrao_venda: boolean;
  }>;
  const contaCaixaId = contas.find((c) => c.tipo === 'dinheiro')?.id ?? null;
  const contaBancoId =
    contas.find((c) => c.eh_destino_padrao_venda)?.id ??
    contas.find((c) => c.tipo === 'banco')?.id ??
    null;

  // Despesas e entradas do dia são fonte por DATA (independem de já haver
  // fechamento), então o que foi lançado na janela Despesas / Produtos aparece aqui.
  const [{ data: entradasDiaRaw }, despesasDoDia] = await Promise.all([
    supabase.from('entrada_mercadoria').select('produto_id, quantidade').eq('data', data),
    listarDespesasDoDia(data),
  ]);
  const entradasDoDia: Record<string, string> = {};
  {
    const soma = new Map<string, number>();
    for (const e of (entradasDiaRaw ?? []) as Array<{ produto_id: string; quantidade: number }>) {
      soma.set(e.produto_id, (soma.get(e.produto_id) ?? 0) + Number(e.quantidade));
    }
    for (const [pid, q] of soma) entradasDoDia[pid] = String(q).replace('.', ',');
  }

  const despesasDinheiroDia = despesasDoDia
    .filter((d) => d.formaPagamento === 'dinheiro')
    .reduce((acc, d) => acc + d.valor, 0n);

  const { inicio: inicioDia, fim: fimDia } = limitesDoDiaManaus(data);

  let valoresSalvos: ContextoFechamento['valoresSalvos'] = undefined;

  const contagens: Record<string, string> = {};
  const leituras: Record<string, string> = {};
  const vendasIndividuais: Record<string, string> = {};
  let pix = '';
  let debito = '';
  let credito = '';
  let contado = '';
  let observacao = '';

  let cSalvas: any[] = [];
  let lSalvas: any[] = [];
  let vSalvas: any[] = [];
  let fSalvos: any[] = [];
  let mSalvos: any[] = [];
  let fechInfo: any = null;

  if (fechExistente) {
    const [
      rC, rL, rV, rF, rM, rInfo
    ] = await Promise.all([
      supabase.from('contagem_produto').select('produto_id, quantidade').eq('fechamento_id', fechExistente.id),
      supabase.from('leitura_bomba').select('bomba_id, leitura').eq('fechamento_id', fechExistente.id),
      supabase.from('venda_avulsa').select('produto_id, quantidade, valor_centavos').eq('fechamento_id', fechExistente.id),
      supabase.from('fiado')
        .select('id, cliente_id, valor_centavos, status, vencimento')
        .or(`fechamento_id.eq.${fechExistente.id},and(data.eq.${data},fechamento_id.is.null)`),
      supabase.from('movimento')
        .select('*, fiado:fiado_id(cliente_id)')
        .or(`fechamento_id.eq.${fechExistente.id},and(tipo.eq.recebimento_fiado,data_hora.gte.${inicioDia},data_hora.lt.${fimDia})`),
      supabase.from('fechamento').select('observacao').eq('id', fechExistente.id).maybeSingle()
    ]);
    cSalvas = rC.data ?? [];
    lSalvas = rL.data ?? [];
    vSalvas = rV.data ?? [];
    fSalvos = rF.data ?? [];
    mSalvos = rM.data ?? [];
    fechInfo = rInfo.data;
  } else {
    const [rF, rM] = await Promise.all([
      supabase.from('fiado')
        .select('id, cliente_id, valor_centavos, status, vencimento')
        .eq('data', data)
        .is('fechamento_id', null),
      supabase.from('movimento')
        .select('*, fiado:fiado_id(cliente_id)')
        .eq('tipo', 'recebimento_fiado')
        .gte('data_hora', inicioDia)
        .lt('data_hora', fimDia)
    ]);
    fSalvos = rF.data ?? [];
    mSalvos = rM.data ?? [];
  }

  for (const c of cSalvas) contagens[c.produto_id] = String(c.quantidade).replace('.', ',');
  for (const l of lSalvas) leituras[l.bomba_id] = String(l.leitura).replace('.', ',');
  for (const v of vSalvas) vendasIndividuais[v.produto_id] = String(v.quantidade).replace('.', ',');

  let debitoTaxa = 0n;
  let creditoTaxa = 0n;
  let oldCashSales = 0n;
  let oldDiferenca = 0n;
  let recebimentosFiadoDinheiro = 0n;

  for (const m of mSalvos) {
    if (m.tipo === 'recebimento_venda') {
      if (m.forma_pagamento === 'pix') pix = centavosParaString(m.valor_centavos);
      if (m.forma_pagamento === 'debito') debito = centavosParaString(m.valor_centavos);
      if (m.forma_pagamento === 'credito') credito = centavosParaString(m.valor_centavos);
      if (m.forma_pagamento === 'dinheiro') oldCashSales = BigInt(m.valor_centavos);
    } else if (m.tipo === 'taxa_cartao') {
      if (m.descricao?.includes('débito')) debitoTaxa = -BigInt(m.valor_centavos);
      if (m.descricao?.includes('crédito')) creditoTaxa = -BigInt(m.valor_centavos);
    } else if (m.tipo === 'recebimento_fiado') {
      recebimentosFiadoDinheiro += BigInt(m.valor_centavos);
    } else if (m.tipo === 'diferenca_caixa') {
      oldDiferenca = BigInt(m.valor_centavos);
    }
  }

  // Reconstruct card gross
  if (debito) debito = centavosParaString(Number(parseReais(debito) + debitoTaxa));
  if (credito) credito = centavosParaString(Number(parseReais(credito) + creditoTaxa));

  const fiadosConcedidos = fSalvos.map((f) => ({
    id: f.id,
    clienteId: f.cliente_id,
    valor: centavosParaString(f.valor_centavos),
    vencimento: f.vencimento,
  }));

  const fiadosRecebidos = mSalvos
    .filter((m) => m.tipo === 'recebimento_fiado')
    .map((m) => {
      const fInfo = m.fiado as { cliente_id: string } | null;
      return {
        id: m.id,
        clienteId: fInfo?.cliente_id ?? '',
        valor: centavosParaString(m.valor_centavos),
        fiadoId: m.fiado_id || null,
      };
    });

  if (fechExistente) {
    const esperado = oldCashSales - despesasDinheiroDia + recebimentosFiadoDinheiro + trocoFixo;
    const contadoVal = esperado + oldDiferenca;
    contado = centavosParaString(contadoVal);
    observacao = fechInfo?.observacao ?? '';
  }

  if (fechExistente?.rascunho) {
    valoresSalvos = fechExistente.rascunho;
  } else if (fechExistente || fiadosConcedidos.length > 0 || fiadosRecebidos.length > 0) {
    valoresSalvos = {
      leituras,
      contagens,
      vendasIndividuais,
      pix,
      debito,
      credito,
      fiadosConcedidos,
      fiadosRecebidos,
      contado,
      observacao,
    };
  }

  const todosProdutos: ProdutoCtx[] = (
    (produtosRaw ?? []) as Array<{ id: string; nome: string; ordem: number; modo_apuracao: 'contagem' | 'individual'; ativo: boolean }>
  )
    .filter((p) => {
      if (p.ativo) return true;
      if (contagens[p.id] !== undefined) return true;
      if (vendasIndividuais[p.id] !== undefined) return true;
      if (entradasDoDia[p.id] !== undefined) return true;
      if (valoresSalvos?.contagens?.[p.id] !== undefined) return true;
      if (valoresSalvos?.vendasIndividuais?.[p.id] !== undefined) return true;
      if (qtdAnterior.has(p.id)) return true;
      return false;
    })
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      ordem: p.ordem,
      preco: precoVigenteEm(histProd.get(p.id) ?? [], data),
      estoqueAnterior: paraQuantidade(qtdAnterior.get(p.id) ?? 0),
      modoApuracao: p.modo_apuracao as 'contagem' | 'individual',
    }));

  const produtos = todosProdutos.filter((p) => p.modoApuracao === 'contagem');
  const produtosIndividuais = todosProdutos.filter((p) => p.modoApuracao === 'individual');

  return {
    data,
    jaExisteHoje,
    status,
    fechamentoId,
    bombas,
    produtos,
    produtosIndividuais,
    clientesFiado,
    fiadosEmAberto,
    trocoFixo,
    taxaDebito,
    taxaCredito,
    contaCaixaId,
    contaBancoId,
    despesasDoDia,
    entradasDoDia,
    valoresSalvos,
    mostrarProdutosAvulsos,
  };
}

interface PrecoRaw {
  combustivel_id?: string;
  produto_id?: string;
  valor_centavos: number;
  valido_a_partir_de: string;
}
interface BombaRaw {
  id: string;
  nome: string;
  tanque:
    | { combustivel_id: string; combustivel: { nome: string } | { nome: string }[] | null }
    | { combustivel_id: string; combustivel: { nome: string } | { nome: string }[] | null }[]
    | null;
}

function agruparPrecos(
  linhas: PrecoRaw[],
  chave: 'combustivel_id' | 'produto_id',
): Map<string, RegistroVigencia[]> {
  const mapa = new Map<string, RegistroVigencia[]>();
  for (const l of linhas) {
    const id = l[chave];
    if (!id) continue;
    const lista = mapa.get(id) ?? [];
    lista.push({
      valorCentavos: paraCentavos(l.valor_centavos),
      validoApartirDe: l.valido_a_partir_de,
    });
    mapa.set(id, lista);
  }
  return mapa;
}

function lerTaxa(cfg: ConfigCartao | undefined): { percentualBp: bigint; fixa: Centavos } {
  return {
    percentualBp: BigInt(Math.round(cfg?.percentual_bp ?? 0)),
    fixa: paraCentavos(cfg?.fixa_centavos ?? 0),
  };
}

// ---- Persistência -------------------------------------------------------------

export interface ResumoConfirmacao {
  data: string;
  observacao: string | null;
  trocoFixo: Centavos;
  usuarioId: string | null;
  contaCaixaId: string;
  contaBancoId: string | null;
  leituras: { bombaId: string; leitura: Mililitros }[];
  contagens: { produtoId: string; quantidade: Quantidade }[];
  entradas: { produtoId: string; quantidade: Quantidade }[];
  vendasIndividuais: { produtoId: string; quantidade: Quantidade; valor: Centavos }[];
  fiadosConcedidos: { clienteId: string; valor: Centavos }[];
  fiadosRecebidos: { clienteId: string; valor: Centavos }[];
  cashSales: Centavos;
  pix: Centavos;
  debitoNet: Centavos;
  debitoTaxa: Centavos;
  creditoNet: Centavos;
  creditoTaxa: Centavos;
  /** IDs das despesas do dia a ligar a este fechamento (auditoria + cascata). */
  despesaIds: string[];
  diferenca: Centavos;
}

interface MovimentoInsert {
  id: string;
  tipo: string;
  conta_id: string;
  valor_centavos: number;
  data_hora: string;
  fechamento_id: string;
  forma_pagamento?: string;
  contraparte_conta_id?: string;
  descricao?: string;
  criado_por?: string | null;
}

export async function salvarRascunhoFechamento(
  data: string,
  rascunho: any,
  usuarioId: string
): Promise<void> {
  const { data: exist } = await supabase
    .from('fechamento')
    .select('id')
    .eq('data', data)
    .maybeSingle();

  const fechamentoId = exist?.id ?? uuidv7();

  const { error } = await supabase.from('fechamento').upsert({
    id: fechamentoId,
    data,
    status: 'aberto',
    responsavel_id: usuarioId || null,
    rascunho,
  });

  if (error) throw error;
}

export async function confirmarFechamento(r: ResumoConfirmacao): Promise<string> {
  const agora = agoraManausISO();

  // First, check if fechamento already exists for this date
  const { data: exist } = await supabase
    .from('fechamento')
    .select('id')
    .eq('data', r.data)
    .maybeSingle();

  const fechamentoId = exist?.id ?? uuidv7();

  if (exist) {
    // Update existing
    const { error: eFech } = await supabase
      .from('fechamento')
      .update({
        status: 'travado',
        troco_fixo_centavos: centavosParaNumero(r.trocoFixo),
        responsavel_id: r.usuarioId,
        observacao: r.observacao,
        confirmado_em: agora,
        travado_em: agora,
        rascunho: null,
      })
      .eq('id', fechamentoId);
    if (eFech) throw eFech;

    // Delete existing child records before re-inserting. As despesas do dia são
    // eventos próprios (lançados na janela Despesas ou aqui) — NÃO as apagamos;
    // só removemos os movimentos que o motor do fechamento gera (venda, taxa,
    // diferença, recebimento de fiado).
    const [{ error: eDelC }, { error: eDelL }, { error: eDelM }, { error: eDelVI }, { error: eDelEnt }, { error: eDelFia }] = await Promise.all([
      supabase.from('contagem_produto').delete().eq('fechamento_id', fechamentoId),
      supabase.from('leitura_bomba').delete().eq('fechamento_id', fechamentoId),
      supabase.from('venda_avulsa').delete().eq('fechamento_id', fechamentoId),
      supabase.from('entrada_mercadoria').delete().eq('fechamento_id', fechamentoId),
      supabase.from('fiado').delete().or(`fechamento_id.eq.${fechamentoId},and(data.eq.${r.data},fechamento_id.is.null)`),
      supabase.from('movimento').delete().eq('fechamento_id', fechamentoId).neq('tipo', 'despesa'),
    ]);
    if (eDelC) throw eDelC;
    if (eDelL) throw eDelL;
    if (eDelM) throw eDelM;
    if (eDelVI) throw eDelVI;
    if (eDelEnt) throw eDelEnt;
    if (eDelFia) throw eDelFia;
  } else {
    // Insert new
    const { error: eFech } = await supabase.from('fechamento').insert({
      id: fechamentoId,
      data: r.data,
      status: 'travado',
      troco_fixo_centavos: centavosParaNumero(r.trocoFixo),
      responsavel_id: r.usuarioId,
      observacao: r.observacao,
      confirmado_em: agora,
      travado_em: agora,
      rascunho: null,
    });
    if (eFech) throw eFech;

    // Delete pre-existing fiados created without fechamento_id for this day
    const { error: eDelFia } = await supabase
      .from('fiado')
      .delete()
      .eq('data', r.data)
      .is('fechamento_id', null);
    if (eDelFia) throw eDelFia;
  }

  const contagens = r.contagens.map((c) => ({
    id: uuidv7(),
    fechamento_id: fechamentoId,
    produto_id: c.produtoId,
    quantidade: quantidadeParaNumero(c.quantidade),
  }));
  const leituras = r.leituras.map((l) => ({
    id: uuidv7(),
    fechamento_id: fechamentoId,
    bomba_id: l.bombaId,
    leitura: mililitrosParaLitros(l.leitura),
  }));

  const vendasIndividuais = r.vendasIndividuais.map((v) => ({
    id: uuidv7(),
    produto_id: v.produtoId,
    quantidade: quantidadeParaNumero(v.quantidade),
    valor_centavos: centavosParaNumero(v.valor),
    data_hora: agora,
    vendedor_id: r.usuarioId,
    fechamento_id: fechamentoId,
  }));
  // Entradas de mercadoria são contadas por DATA (de qualquer origem). O input do
  // fechamento representa o TOTAL do dia, então gravamos só o delta acima do que
  // já foi lançado na janela Produtos (fechamento_id NULL) — evita dupla contagem
  // e preserva o custo das entradas lançadas lá.
  const { data: entDateOnly } = await supabase
    .from('entrada_mercadoria')
    .select('produto_id, quantidade')
    .eq('data', r.data)
    .is('fechamento_id', null);
  const externaPorProduto = new Map<string, number>();
  for (const e of (entDateOnly ?? []) as Array<{ produto_id: string; quantidade: number }>) {
    externaPorProduto.set(e.produto_id, (externaPorProduto.get(e.produto_id) ?? 0) + Number(e.quantidade));
  }

  // Custo unitário vigente por produto na data, para valorar a entrada de mercadoria
  // (antes gravado como 0). Alimenta o custo médio / o capital por estoque (§3.5).
  const produtoIdsEntrada = [...new Set(r.entradas.map((e) => e.produtoId))];
  const custoPorProduto = new Map<string, Centavos>();
  if (produtoIdsEntrada.length > 0) {
    const { data: custosRaw } = await supabase
      .from('custo_produto')
      .select('produto_id, valor_centavos, valido_a_partir_de')
      .in('produto_id', produtoIdsEntrada);
    const histCusto = new Map<string, RegistroVigencia[]>();
    for (const c of (custosRaw ?? []) as Array<{ produto_id: string; valor_centavos: number; valido_a_partir_de: string }>) {
      const lista = histCusto.get(c.produto_id) ?? [];
      lista.push({ valorCentavos: paraCentavos(c.valor_centavos), validoApartirDe: c.valido_a_partir_de });
      histCusto.set(c.produto_id, lista);
    }
    for (const pid of produtoIdsEntrada) {
      custoPorProduto.set(pid, custoVigenteEm(histCusto.get(pid) ?? [], `${r.data}T23:59:59-04:00`) ?? asCentavos(0n));
    }
  }

  const entradas = r.entradas
    .map((e) => {
      const total = quantidadeParaNumero(e.quantidade);
      const delta = total - (externaPorProduto.get(e.produtoId) ?? 0);
      return { produtoId: e.produtoId, delta };
    })
    .filter((e) => e.delta > 0)
    .map((e) => ({
      id: uuidv7(),
      produto_id: e.produtoId,
      quantidade: e.delta,
      custo_unitario_centavos: centavosParaNumero(custoPorProduto.get(e.produtoId) ?? asCentavos(0n)),
      data: r.data,
      fechamento_id: fechamentoId,
    }));
  const fiados = r.fiadosConcedidos.map((f) => ({
    id: uuidv7(),
    cliente_id: f.clienteId,
    fechamento_id: fechamentoId,
    valor_centavos: centavosParaNumero(f.valor),
    data: r.data,
    status: 'aberto',
  }));

  const banco = r.contaBancoId;
  const movs: MovimentoInsert[] = [];
  const add = (m: Omit<MovimentoInsert, 'id' | 'data_hora' | 'fechamento_id'>) =>
    movs.push({
      id: uuidv7(),
      data_hora: agora,
      fechamento_id: fechamentoId,
      criado_por: r.usuarioId,
      ...m,
    });

  if (r.cashSales !== 0n)
    add({
      tipo: 'recebimento_venda',
      conta_id: r.contaCaixaId,
      valor_centavos: centavosParaNumero(r.cashSales),
      forma_pagamento: 'dinheiro',
    });
  if (r.pix !== 0n && banco)
    add({
      tipo: 'recebimento_venda',
      conta_id: banco,
      valor_centavos: centavosParaNumero(r.pix),
      forma_pagamento: 'pix',
    });
  if (r.debitoNet !== 0n && banco)
    add({
      tipo: 'recebimento_venda',
      conta_id: banco,
      valor_centavos: centavosParaNumero(r.debitoNet),
      forma_pagamento: 'debito',
    });
  if (r.debitoTaxa !== 0n && banco)
    add({
      tipo: 'taxa_cartao',
      conta_id: banco,
      valor_centavos: -centavosParaNumero(r.debitoTaxa),
      descricao: 'Taxa de cartão (débito)',
    });
  if (r.creditoNet !== 0n && banco)
    add({
      tipo: 'recebimento_venda',
      conta_id: banco,
      valor_centavos: centavosParaNumero(r.creditoNet),
      forma_pagamento: 'credito',
    });
  if (r.creditoTaxa !== 0n && banco)
    add({
      tipo: 'taxa_cartao',
      conta_id: banco,
      valor_centavos: -centavosParaNumero(r.creditoTaxa),
      descricao: 'Taxa de cartão (crédito)',
    });
  // Despesas NÃO são geradas aqui: já existem como eventos do dia (lançadas na
  // janela Despesas ou no fechamento). Abaixo apenas as ligamos a este fechamento.
  if (r.diferenca !== 0n)
    add({
      tipo: 'diferenca_caixa',
      conta_id: r.contaCaixaId,
      valor_centavos: centavosParaNumero(r.diferenca),
      descricao: 'Diferença de caixa',
    });
  // Process received fiados (payments)
  const fiadosRecebidosUpdates: Promise<any>[] = [];
  for (const f of r.fiadosRecebidos) {
    if (f.valor > 0n) {
      let fiadoId = (f as any).fiadoId;

      // If no specific fiadoId is selected, try to find the oldest open fiado for this client
      if (!fiadoId) {
        const { data: openF } = await supabase
          .from('fiado')
          .select('id')
          .eq('cliente_id', f.clienteId)
          .eq('status', 'aberto')
          .order('data', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (openF) {
          fiadoId = openF.id;
        }
      }

      // Add movement linked to the fiado_id
      add({
        tipo: 'recebimento_fiado',
        conta_id: r.contaCaixaId,
        valor_centavos: centavosParaNumero(f.valor),
        forma_pagamento: 'dinheiro',
        descricao: 'Recebimento de fiado',
        fiado_id: fiadoId || undefined,
      } as any);

      // Update the fiado status to 'pago'
      if (fiadoId) {
        fiadosRecebidosUpdates.push(
          (async () => {
            const { error } = await supabase
              .from('fiado')
              .update({ status: 'pago' })
              .eq('id', fiadoId);
            if (error) throw error;
          })()
        );
      }
    }
  }

  const [{ error: eC }, { error: eL }, { error: eM }, { error: eVI }, { error: eEnt }, { error: eFia }] = await Promise.all([
    contagens.length
      ? supabase.from('contagem_produto').insert(contagens)
      : Promise.resolve({ error: null }),
    leituras.length
      ? supabase.from('leitura_bomba').insert(leituras)
      : Promise.resolve({ error: null }),
    movs.length ? supabase.from('movimento').insert(movs) : Promise.resolve({ error: null }),
    vendasIndividuais.length
      ? supabase.from('venda_avulsa').insert(vendasIndividuais)
      : Promise.resolve({ error: null }),
    entradas.length
      ? supabase.from('entrada_mercadoria').insert(entradas)
      : Promise.resolve({ error: null }),
    fiados.length
      ? supabase.from('fiado').insert(fiados)
      : Promise.resolve({ error: null }),
  ]);
  if (eC) throw eC;
  if (eL) throw eL;
  if (eM) throw eM;
  if (eVI) throw eVI;
  if (eEnt) throw eEnt;
  if (eFia) throw eFia;

  if (fiadosRecebidosUpdates.length > 0) {
    await Promise.all(fiadosRecebidosUpdates);
  }

  // Liga as despesas do dia a este fechamento (auditoria + recálculo em cascata).
  if (r.despesaIds.length > 0) {
    const { error: eVinc } = await supabase
      .from('movimento')
      .update({ fechamento_id: fechamentoId })
      .in('id', r.despesaIds);
    if (eVinc) throw eVinc;
  }

  // Trigger cascade recalculation for any subsequent days
  void recalcularCascata(r.data).catch((err) => {
    console.error('Falha no recálculo em cascata:', err);
  });

  return fechamentoId;
}

export async function reabrirFechamento(
  fechamentoId: string,
  usuarioId: string,
  motivo: string
): Promise<void> {
  const { data: fech, error: eF } = await supabase
    .from('fechamento')
    .select('*')
    .eq('id', fechamentoId)
    .single();
  if (eF || !fech) throw new Error('Fechamento não encontrado.');

  // Set status back to 'aberto' so it can be edited
  const { error: eUp } = await supabase
    .from('fechamento')
    .update({ status: 'aberto', travado_em: null })
    .eq('id', fechamentoId);
  if (eUp) throw eUp;

  // We DO NOT delete the other inputs like contagem_produto, leitura_bomba, and venda_avulsa
  // because we want to preserve them for the manager to edit.
  // However, we do delete the financial movements generated by the locking of this day:
  const { data: movsRec } = await supabase
    .from('movimento')
    .select('fiado_id')
    .eq('fechamento_id', fechamentoId)
    .eq('tipo', 'recebimento_fiado')
    .not('fiado_id', 'is', null);

  if (movsRec && movsRec.length > 0) {
    const fiadoIds = movsRec.map((m) => m.fiado_id);
    const { error: eRestore } = await supabase
      .from('fiado')
      .update({ status: 'aberto' })
      .in('id', fiadoIds);
    if (eRestore) throw eRestore;
  }

  const { error: eM } = await supabase.from('movimento').delete().eq('fechamento_id', fechamentoId);
  if (eM) throw eM;

  const { error: eFi } = await supabase.from('fiado').delete().eq('fechamento_id', fechamentoId);
  if (eFi) throw eFi;

  // Log in auditoria table
  const auditId = uuidv7();
  const { error: eAudit } = await supabase.from('auditoria').insert({
    id: auditId,
    entidade: 'fechamento',
    entidade_id: fechamentoId,
    acao: 'reabrir',
    usuario_id: usuarioId,
    dados_antes: { status: fech.status, observacao: fech.observacao },
    dados_depois: { status: 'aberto', motivo_reabertura: motivo },
  });
  if (eAudit) throw eAudit;
}

export async function recalcularCascata(dataInicial: string): Promise<void> {
  const { data: fechamentos, error: eFechs } = await supabase
    .from('fechamento')
    .select('id, data, troco_fixo_centavos, responsavel_id, observacao')
    .gt('data', dataInicial)
    .eq('status', 'travado')
    .order('data', { ascending: true });
  if (eFechs) throw eFechs;
  if (!fechamentos || fechamentos.length === 0) return;

  for (const f of fechamentos) {
    const dataFech = f.data;
    
    const { data: anteriorRaw } = await supabase
      .from('fechamento')
      .select('id')
      .lt('data', dataFech)
      .eq('status', 'travado')
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle();
    const anteriorId = anteriorRaw?.id ?? null;

    let contagensAnt: Array<{ produto_id: string; quantidade: number }> = [];
    let leiturasAnt: Array<{ bomba_id: string; leitura: number }> = [];
    if (anteriorId) {
      const [{ data: cAnt }, { data: lAnt }] = await Promise.all([
        supabase.from('contagem_produto').select('produto_id,quantidade').eq('fechamento_id', anteriorId),
        supabase.from('leitura_bomba').select('bomba_id,leitura').eq('fechamento_id', anteriorId),
      ]);
      contagensAnt = (cAnt ?? []) as typeof contagensAnt;
      leiturasAnt = (lAnt ?? []) as typeof leiturasAnt;
    }
    const qtdAnterior = new Map(contagensAnt.map((c) => [c.produto_id, c.quantidade]));
    const leituraAnterior = new Map(leiturasAnt.map((l) => [l.bomba_id, l.leitura]));

    const [
      { data: cHoje },
      { data: lHoje },
      { data: mHoje },
      { data: fHoje },
      { data: precosComb },
      { data: precosProd },
      { data: contasRaw },
    ] = await Promise.all([
      supabase.from('contagem_produto').select('produto_id, quantidade').eq('fechamento_id', f.id),
      supabase.from('leitura_bomba').select('bomba_id, leitura').eq('fechamento_id', f.id),
      supabase.from('movimento').select('*').eq('fechamento_id', f.id),
      supabase.from('fiado').select('cliente_id, valor_centavos').eq('fechamento_id', f.id).eq('status', 'aberto'),
      supabase.from('preco_combustivel').select('combustivel_id,valor_centavos,valido_a_partir_de'),
      supabase.from('preco_produto').select('produto_id,valor_centavos,valido_a_partir_de'),
      supabase.from('conta').select('id,tipo,eh_destino_padrao_venda,ativo').eq('ativo', true),
    ]);

    const histComb = agruparPrecos((precosComb ?? []) as PrecoRaw[], 'combustivel_id');
    const histProd = agruparPrecos((precosProd ?? []) as PrecoRaw[], 'produto_id');

    const [
      { data: bombasRaw },
      { data: produtosRaw }
    ] = await Promise.all([
      supabase.from('bomba').select('id,tanque!inner(combustivel_id,ativo)').eq('ativo', true).eq('tanque.ativo', true),
      supabase.from('produto').select('id,modo_apuracao').eq('ativo', true),
    ]);

    let totalCombustivelVal = 0n;
    for (const b of (lHoje ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bInfo = (bombasRaw ?? []).find((br: any) => br.id === b.bomba_id);
      const tanque = bInfo ? (Array.isArray(bInfo.tanque) ? bInfo.tanque[0] : bInfo.tanque) : null;
      const combId = tanque?.combustivel_id ?? '';
      const precoLitro = precoVigenteEm(histComb.get(combId) ?? [], dataFech) ?? 0n;
      const antLeitura = leituraAnterior.get(b.bomba_id) ?? 0;
      const hojeLeitura = b.leitura;
      if (hojeLeitura >= antLeitura) {
        const litrosMl = (hojeLeitura - antLeitura) * 1000; // convert to mL for precision
        totalCombustivelVal += (BigInt(Math.round(litrosMl)) * BigInt(precoLitro)) / 1000n;
      }
    }

    let totalProdutosVal = 0n;
    for (const p of (cHoje ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pInfo = (produtosRaw ?? []).find((pr: any) => pr.id === p.produto_id);
      if (pInfo && pInfo.modo_apuracao === 'contagem') {
        const preco = precoVigenteEm(histProd.get(p.produto_id) ?? [], dataFech) ?? 0n;
        const antEstoque = qtdAnterior.get(p.produto_id) ?? 0;
        const hojeEstoque = p.quantidade;
        
        const { data: entRaw } = await supabase
          .from('entrada_mercadoria')
          .select('quantidade')
          .eq('data', dataFech)
          .eq('produto_id', p.produto_id);
        const entries = (entRaw ?? []).reduce((acc, curr) => acc + curr.quantidade, 0);
        
        const vendido = antEstoque + entries - hojeEstoque;
        if (vendido > 0) {
          totalProdutosVal += BigInt(vendido) * preco;
        }
      }
    }

    const { data: vAvulsas } = await supabase
      .from('venda_avulsa')
      .select('valor_centavos')
      .eq('fechamento_id', f.id);
    const totalIndividuaisVal = somar(...(vAvulsas ?? []).map((v) => asCentavos(BigInt(v.valor_centavos))));

    const vendaFisica = totalCombustivelVal + totalProdutosVal + totalIndividuaisVal;

    let pix = 0n;
    let debitoBruto = 0n;
    let creditoBruto = 0n;
    let despesasDinheiro = 0n;
    let recebimentosFiadoDinheiro = 0n;
    let oldCashSales = 0n;
    let oldDiferenca = 0n;

    for (const m of (mHoje ?? [])) {
      if (m.tipo === 'recebimento_venda') {
        if (m.forma_pagamento === 'pix') pix += BigInt(m.valor_centavos);
        if (m.forma_pagamento === 'debito') debitoBruto += BigInt(m.valor_centavos);
        if (m.forma_pagamento === 'credito') creditoBruto += BigInt(m.valor_centavos);
        if (m.forma_pagamento === 'dinheiro') oldCashSales += BigInt(m.valor_centavos);
      } else if (m.tipo === 'taxa_cartao') {
        if (m.descricao?.includes('débito')) debitoBruto += -BigInt(m.valor_centavos);
        if (m.descricao?.includes('crédito')) creditoBruto += -BigInt(m.valor_centavos);
      } else if (m.tipo === 'despesa' && m.forma_pagamento === 'dinheiro') {
        despesasDinheiro += -BigInt(m.valor_centavos);
      } else if (m.tipo === 'recebimento_fiado' && m.forma_pagamento === 'dinheiro') {
        recebimentosFiadoDinheiro += BigInt(m.valor_centavos);
      } else if (m.tipo === 'diferenca_caixa') {
        oldDiferenca += BigInt(m.valor_centavos);
      }
    }

    const fiadoConcedido = somar(...(fHoje ?? []).map((fi) => asCentavos(BigInt(fi.valor_centavos))));
    const trocoFixo = BigInt(f.troco_fixo_centavos);

    const C = oldCashSales - despesasDinheiro + recebimentosFiadoDinheiro + trocoFixo + oldDiferenca;
    const cashSales = vendaFisica - pix - debitoBruto - creditoBruto - fiadoConcedido;
    const esperado = cashSales - despesasDinheiro + recebimentosFiadoDinheiro + trocoFixo;
    const diferenca = C - esperado;

    const idsToDelete = (mHoje ?? [])
      .filter((m) => (m.tipo === 'recebimento_venda' && m.forma_pagamento === 'dinheiro') || m.tipo === 'diferenca_caixa')
      .map((m) => m.id);

    if (idsToDelete.length > 0) {
      const { error: eDel } = await supabase.from('movimento').delete().in('id', idsToDelete);
      if (eDel) throw eDel;
    }

    const movsToInsert: MovimentoInsert[] = [];
    const contaCaixaId = (contasRaw ?? []).find((c) => c.tipo === 'dinheiro')?.id;
    const responsavelId = f.responsavel_id;

    if (cashSales !== 0n && contaCaixaId) {
      movsToInsert.push({
        id: uuidv7(),
        tipo: 'recebimento_venda',
        conta_id: contaCaixaId,
        valor_centavos: Number(cashSales),
        data_hora: agoraManausISO(),
        fechamento_id: f.id,
        forma_pagamento: 'dinheiro',
        criado_por: responsavelId,
      });
    }

    if (diferenca !== 0n && contaCaixaId) {
      movsToInsert.push({
        id: uuidv7(),
        tipo: 'diferenca_caixa',
        conta_id: contaCaixaId,
        valor_centavos: Number(diferenca),
        data_hora: agoraManausISO(),
        fechamento_id: f.id,
        descricao: 'Diferença de caixa (recalculado em cascata)',
        criado_por: responsavelId,
      });
    }

    if (movsToInsert.length > 0) {
      const { error: eIns } = await supabase.from('movimento').insert(movsToInsert);
      if (eIns) throw eIns;
    }

    const auditId = uuidv7();
    await supabase.from('auditoria').insert({
      id: auditId,
      entidade: 'fechamento',
      entidade_id: f.id,
      acao: 'ajustar',
      usuario_id: responsavelId,
      dados_antes: { cashSales: Number(oldCashSales), diferenca: Number(oldDiferenca) },
      dados_depois: { cashSales: Number(cashSales), diferenca: Number(diferenca), recalculado_em_cascata: true },
    });
  }
}

// Reexport util para o componente montar tipos do domínio a partir do form.
export { asCentavos, asMililitros, asQuantidade };
