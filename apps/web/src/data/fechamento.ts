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
import { precoVigenteEm, type RegistroVigencia } from '../domain/precos';
import { hojeManaus, agoraManausISO } from '../lib/datas';
import { uuidv7 } from '../lib/uuidv7';
import { asCentavos, type Centavos } from '../lib/money';
import { asMililitros, asQuantidade, type Mililitros, type Quantidade } from '../domain/tipos';

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
}

export interface ContextoFechamento {
  data: string;
  jaExisteHoje: boolean;
  bombas: BombaCtx[];
  produtos: ProdutoCtx[];
  trocoFixo: Centavos;
  taxaDebito: { percentualBp: bigint; fixa: Centavos };
  taxaCredito: { percentualBp: bigint; fixa: Centavos };
  contaCaixaId: string | null;
  contaBancoId: string | null;
}

interface ConfigCartao {
  percentual_bp?: number;
  fixa_centavos?: number;
}

export async function carregarContexto(): Promise<ContextoFechamento> {
  const data = hojeManaus();

  const [
    { data: existeHoje },
    { data: bombasRaw, error: eB },
    { data: precosComb, error: ePC },
    { data: produtosRaw, error: eP },
    { data: precosProd, error: ePP },
    { data: configRaw, error: eCfg },
    { data: contasRaw, error: eC },
    { data: anteriorRaw },
  ] = await Promise.all([
    supabase.from('fechamento').select('id').eq('data', data).maybeSingle(),
    supabase
      .from('bomba')
      .select('id,nome,tanque(combustivel_id,combustivel(nome))')
      .eq('ativo', true),
    supabase.from('preco_combustivel').select('combustivel_id,valor_centavos,valido_a_partir_de'),
    supabase
      .from('produto')
      .select('id,nome,ordem')
      .eq('ativo', true)
      .eq('modo_apuracao', 'contagem')
      .order('ordem'),
    supabase.from('preco_produto').select('produto_id,valor_centavos,valido_a_partir_de'),
    supabase.from('config').select('chave,valor_json'),
    supabase.from('conta').select('id,tipo,eh_destino_padrao_venda,ativo').eq('ativo', true),
    supabase
      .from('fechamento')
      .select('id')
      .lt('data', data)
      .eq('status', 'travado')
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  for (const e of [eB, ePC, eP, ePP, eCfg, eC]) if (e) throw e;

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

  const produtos: ProdutoCtx[] = (
    (produtosRaw ?? []) as Array<{ id: string; nome: string; ordem: number }>
  ).map((p) => ({
    id: p.id,
    nome: p.nome,
    ordem: p.ordem,
    preco: precoVigenteEm(histProd.get(p.id) ?? [], data),
    estoqueAnterior: paraQuantidade(qtdAnterior.get(p.id) ?? 0),
  }));

  const config = new Map(
    ((configRaw ?? []) as Array<{ chave: string; valor_json: unknown }>).map((c) => [
      c.chave,
      c.valor_json,
    ]),
  );
  const trocoFixo = paraCentavos(Number(config.get('troco_fixo_centavos') ?? 0));
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

  return {
    data,
    jaExisteHoje: Boolean(existeHoje),
    bombas,
    produtos,
    trocoFixo,
    taxaDebito,
    taxaCredito,
    contaCaixaId,
    contaBancoId,
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
  cashSales: Centavos;
  pix: Centavos;
  debitoNet: Centavos;
  debitoTaxa: Centavos;
  creditoNet: Centavos;
  creditoTaxa: Centavos;
  despesa: { valor: Centavos; descricao: string } | null;
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

export async function confirmarFechamento(r: ResumoConfirmacao): Promise<string> {
  const fechamentoId = uuidv7();
  const agora = agoraManausISO();

  const { error: eFech } = await supabase.from('fechamento').insert({
    id: fechamentoId,
    data: r.data,
    status: 'travado',
    troco_fixo_centavos: centavosParaNumero(r.trocoFixo),
    responsavel_id: r.usuarioId,
    observacao: r.observacao,
    confirmado_em: agora,
    travado_em: agora,
  });
  if (eFech) throw eFech;

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
  if (r.despesa && r.despesa.valor !== 0n)
    add({
      tipo: 'despesa',
      conta_id: r.contaCaixaId,
      valor_centavos: -centavosParaNumero(r.despesa.valor),
      forma_pagamento: 'dinheiro',
      descricao: r.despesa.descricao || 'Despesa do dia',
    });
  if (r.diferenca !== 0n)
    add({
      tipo: 'diferenca_caixa',
      conta_id: r.contaCaixaId,
      valor_centavos: centavosParaNumero(r.diferenca),
      descricao: 'Diferença de caixa',
    });

  const [{ error: eC }, { error: eL }, { error: eM }] = await Promise.all([
    contagens.length
      ? supabase.from('contagem_produto').insert(contagens)
      : Promise.resolve({ error: null }),
    leituras.length
      ? supabase.from('leitura_bomba').insert(leituras)
      : Promise.resolve({ error: null }),
    movs.length ? supabase.from('movimento').insert(movs) : Promise.resolve({ error: null }),
  ]);
  if (eC) throw eC;
  if (eL) throw eL;
  if (eM) throw eM;

  return fechamentoId;
}

// Reexport util para o componente montar tipos do domínio a partir do form.
export { asCentavos, asMililitros, asQuantidade };
