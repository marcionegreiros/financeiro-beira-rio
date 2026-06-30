import { useMemo } from 'react';
import { formatReais, type Centavos, somar, asCentavos } from '../../lib/money';
import { asMililitros, formatLitros, type Quantidade } from '../../domain/tipos';

import { formatarDataBR, formatarHoraBR } from '../../lib/datas';
import type { DespesaDoDia } from '../../data/repositorios';

export interface RelatorioDados {
  data: string;
  fechadoEm?: string | null;
  usuarioNome?: string;
  usuarioFotoUrl?: string | null;
  bombas: { nome: string; litrosMl: bigint; valor: Centavos }[];
  produtos: { nome: string; categoriaNome: string; estoqueAtual: Quantidade; entradas: Quantidade; vendido: Quantidade; preco: Centavos; valor: Centavos }[];
  vendaFisica: Centavos;
  pix: Centavos;
  debito: Centavos;
  credito: Centavos;
  despesa: Centavos;
  esperado: Centavos;
  contado: Centavos;
  diferenca: Centavos;
  aDepositar: Centavos;
  observacao: string;
  fiadoConcedido: Centavos;
  fiadoRecebido: Centavos;
  despesasDetalhes: DespesaDoDia[];
  taxasCartao: {
    pixNet: Centavos; pixTaxa: Centavos;
    debitoNet: Centavos; debitoTaxa: Centavos;
    creditoNet: Centavos; creditoTaxa: Centavos;
  };
  destinoBancarioNome?: string;
  destinoBancarioFotoUrl?: string | null;
  transferencia?: {
    destinoNome: string;
    destinoFotoUrl?: string | null;
    valor: Centavos;
    saldoDestino?: Centavos | undefined;
    ehBanco?: boolean;
    permaneuNoCaixa?: boolean;
  };
  produtosFaltando: { nome: string; estoqueAtual: Quantidade }[];
  contasDinheiro?: {
    id: string;
    nome: string;
    fotoUrl?: string | null | undefined;
    saldo: Centavos;
  }[];
}

export function Relatorio({
  dados,
  aoFechar,
  podeReabrir,
  aoReabrir,
}: {
  dados: RelatorioDados;
  aoFechar: () => void;
  podeReabrir?: boolean;
  aoReabrir?: () => void;
}) {
  const despesasAgrupadas = useMemo(() => {
    const mapa = new Map<string, DespesaDoDia[]>();
    for (const d of dados.despesasDetalhes) {
      const cat = d.categoriaNome || 'Outros';
      const lista = mapa.get(cat) ?? [];
      lista.push(d);
      mapa.set(cat, lista);
    }
    return Array.from(mapa.entries());
  }, [dados.despesasDetalhes]);

  const totalCombustiveis = somar(...dados.bombas.map(b => b.valor));
  const totalProdutos = somar(...dados.produtos.map(p => p.valor));

  const totaisCategorias = useMemo(() => {
    const mapa = new Map<string, Centavos>();
    for (const p of dados.produtos) {
      if (p.vendido !== 0n) {
        const cat = p.categoriaNome || 'Outros';
        const atual = mapa.get(cat) ?? asCentavos(0n);
        mapa.set(cat, asCentavos(atual + p.valor));
      }
    }
    return Array.from(mapa.entries());
  }, [dados.produtos]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-4 print:max-w-none print:w-full print:px-8 print:py-8 print:gap-2">

      {/* CABEÇALHO DE IMPRESSÃO (INVISÍVEL NA TELA, VISÍVEL NO PDF) */}
      <style type="text/css">
        {`
          @media print { 
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } 
            @page { margin: 0; }
            body, html { background-color: var(--color-petroleo) !important; margin: 0 !important; padding: 0 !important; height: 100% !important; }
          }
        `}
      </style>
      <div className="hidden print:flex flex-col border-b border-claro/20 pb-4 mb-2 text-claro">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-claro">Pontão Beira Rio</h1>
            <div className="flex items-center gap-4 mt-1">
              <h2 className="text-lg font-bold text-claro/80">Fechamento de Caixa</h2>
              <div className="h-5 w-px bg-claro/20"></div>
              <p className="text-sm"><span className="font-semibold text-claro/60 uppercase tracking-widest text-[10px] mr-1">Data</span> <span className="font-bold text-claro text-lg">{formatarDataBR(dados.data)}</span></p>
              {dados.fechadoEm && (
                <>
                  <div className="h-5 w-px bg-claro/20"></div>
                  <p className="text-sm"><span className="font-semibold text-claro/60 uppercase tracking-widest text-[10px] mr-1">Horário</span> <span className="font-medium text-claro">{formatarHoraBR(dados.fechadoEm)}</span></p>
                </>
              )}
            </div>
          </div>
          {dados.usuarioNome && (
            <div className="flex items-center gap-3 text-right">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-claro/50">Fechado por</span>
                <span className="font-medium text-sm text-claro">{dados.usuarioNome}</span>
              </div>
              {dados.usuarioFotoUrl ? (
                <img src={dados.usuarioFotoUrl} alt={dados.usuarioNome} className="w-10 h-10 rounded-full object-cover border border-claro/20" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-claro/10 flex items-center justify-center border border-claro/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-claro/70"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* BLOCO VENDAS E ESTOQUE */}
      <section className="flex flex-col gap-4 mt-2 print:gap-2 print:mt-1">
        {/* COMBUSTÍVEIS */}
        <div className="overflow-hidden rounded-2xl border border-claro/10 bg-ardosia shadow-lg ">
          <div className="bg-petroleo/30 px-5 py-3 print:px-5 print:py-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-claro/80 print:text-xs">Combustíveis</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm print:text-[10px]">
              <thead className="bg-claro/5 text-claro/60 ">
                <tr>
                  <th className="px-5 py-3 print:py-1.5 text-left font-medium">Bomba</th>
                  <th className="px-5 py-3 print:py-1.5 text-right font-medium">Saída</th>
                  <th className="px-5 py-3 print:py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-claro/10 print:divide-black/10">
                {dados.bombas.map((b, i) => (
                  <tr key={`b${i}`} className="hover:bg-claro/5 transition-colors">
                    <td className="px-5 py-3 print:py-1.5 text-claro ">{b.nome}</td>
                    <td className="numeros px-5 py-3 print:py-1.5 text-right text-claro/80 ">{formatLitros(asMililitros(b.litrosMl))}</td>
                    <td className="numeros px-5 py-3 print:py-1.5 text-right text-claro font-medium ">{formatReais(b.valor)}</td>
                  </tr>
                ))}
                <tr className="bg-claro/5 ">
                  <td colSpan={2} className="px-5 py-3 print:py-1.5 text-right text-sm font-semibold text-claro/70 uppercase tracking-widest ">Subtotal Combustíveis</td>
                  <td className="numeros px-5 py-3 print:py-1.5 text-right font-bold text-claro ">{formatReais(totalCombustiveis)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* PRODUTOS E LUBRIFICANTES */}
        <div className="overflow-hidden rounded-2xl border border-claro/10 bg-ardosia shadow-lg print:mt-1">
          <div className="bg-petroleo/30 px-5 py-3 print:px-5 print:py-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-claro/80 print:text-xs">Produtos & Outros</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm print:text-[10px]">
              <thead className="bg-claro/5 text-claro/60 ">
                <tr>
                  <th className="px-5 py-3 print:py-1.5 text-left font-medium">Produto</th>
                  <th className="px-5 py-3 print:py-1.5 text-right font-medium">Entrada</th>
                  <th className="px-5 py-3 print:py-1.5 text-right font-medium">Estoque</th>
                  <th className="px-5 py-3 print:py-1.5 text-right font-medium">Saída</th>
                  <th className="px-5 py-3 print:py-1.5 text-right font-medium">Preço Un.</th>
                  <th className="px-5 py-3 print:py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-claro/10 print:divide-black/10">
                {dados.produtos.map((p, i) => {
                  const hasVenda = p.vendido !== 0n;
                  const isNegativo = p.vendido < 0n;
                  if (!hasVenda) return null;

                  return (
                    <tr key={`p${i}`} className="hover:bg-claro/5 transition-colors">
                      <td className="px-5 py-3 print:py-1.5 text-claro ">{p.nome}</td>
                      <td className="numeros px-5 py-3 print:py-1.5 text-right text-claro/60 ">{p.entradas > 0n ? `+${String(p.entradas)}` : '-'}</td>
                      <td className="numeros px-5 py-3 print:py-1.5 text-right text-claro/80 ">{String(p.estoqueAtual)} un</td>
                      <td className={`numeros px-5 py-3 print:py-1.5 text-right font-medium ${isNegativo ? 'text-negativo ' : 'text-claro '}`}>
                        {String(p.vendido)} un
                      </td>
                      <td className="numeros px-5 py-3 print:py-1.5 text-right text-claro/60 ">{formatReais(p.preco)}</td>
                      <td className={`numeros px-5 py-3 print:py-1.5 text-right font-medium ${isNegativo ? 'text-negativo ' : 'text-claro '}`}>
                        {formatReais(p.valor)}
                      </td>
                    </tr>
                  )
                })}
                {totaisCategorias.map(([cat, totalCat]) => (
                  <tr key={`cat-total-${cat}`} className="bg-claro/[0.01] border-t border-claro/5 text-xs text-claro/50 ">
                    <td colSpan={5} className="px-5 py-2 print:py-1 text-right uppercase tracking-wider font-semibold">Total {cat}</td>
                    <td className="numeros px-5 py-2 print:py-1 text-right font-semibold text-claro/80 ">{formatReais(totalCat)}</td>
                  </tr>
                ))}
                <tr className="bg-claro/5 ">
                  <td colSpan={5} className="px-5 py-3 print:py-1.5 text-right text-sm font-semibold text-claro/70 uppercase tracking-widest ">Subtotal Produtos</td>
                  <td className="numeros px-5 py-3 print:py-1.5 text-right font-bold text-claro ">{formatReais(totalProdutos)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* TOTAL GERAL DE VENDAS */}
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-gradient-to-r from-ambar/15 via-ambar/5 to-transparent p-5 border border-ambar/20 shadow-md hover:shadow-lg transition-shadow print:mt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ambar/10 flex items-center justify-center text-ambar border border-ambar/20 print:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-ambar print:text-sm">Venda Física Total</h3>
              <p className="text-[10px] text-suave uppercase tracking-wider print:text-[8px]">Soma de combustíveis e produtos</p>
            </div>
          </div>
          <div className="text-right">
            <span className="numeros text-3xl font-extrabold text-ambar print:text-lg">{formatReais(dados.vendaFisica)}</span>
          </div>
        </div>
      </section>

      {/* BLOCO DETALHAMENTO DE SAÍDAS (Movido para ANTES do Saldo) */}
      <section className="mt-2 flex flex-col gap-6 print:gap-2 print:mt-1">
        {/* DETALHAMENTO DE SAÍDAS */}
        <div className="cartao p-6 group hover:shadow-md transition-shadow ">
          <div className="print:pb-1 print:mb-2">
            <h3 className="font-display text-lg font-semibold text-claro mb-4 print:text-xs print:mb-0">Detalhamento de Saídas</h3>
          </div>
          {despesasAgrupadas.length === 0 ? (
            <p className="text-sm text-claro/50 italic ">Nenhuma saída registrada.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {despesasAgrupadas.map(([cat, despesas]) => (
                <div key={cat}>
                  <h4 className="text-xs uppercase tracking-widest text-claro/50 mb-2 ">{cat}</h4>
                  <div className="flex flex-col gap-2">
                    {despesas.map(d => (
                      <div key={d.id} className="flex justify-between items-center text-sm bg-claro/5 rounded-lg p-2.5 ">
                        <span className="text-claro/90 ">{d.descricao}</span>
                        <span className="numeros font-medium text-atencao ">{formatReais(d.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-claro/10 flex justify-between items-center ">
            <span className="font-semibold text-claro ">Total Saídas</span>
            <span className="numeros text-lg font-bold text-atencao ">{formatReais(dados.despesa)}</span>
          </div>
        </div>

        {/* FIADO */}
        {(dados.fiadoConcedido > 0n || dados.fiadoRecebido > 0n) && (
          <div className="cartao border-petroleo/30 bg-petroleo/10 p-6 group hover:shadow-md transition-shadow ">
            <h3 className="font-display text-lg font-semibold text-petroleo-claro mb-3 ">Movimentação de Fiado</h3>
            <div className="flex flex-col gap-3">
              {dados.fiadoConcedido > 0n && (
                <div className="flex justify-between text-sm">
                  <span className="text-claro/80 ">Fiado Concedido (Venda sem recebimento)</span>
                  <span className="numeros font-medium text-atencao ">{formatReais(dados.fiadoConcedido)}</span>
                </div>
              )}
              {dados.fiadoRecebido > 0n && (
                <div className="flex justify-between text-sm">
                  <span className="text-claro/80 ">Pagamento de Fiado Recebido</span>
                  <span className="numeros font-medium text-positivo ">{formatReais(dados.fiadoRecebido)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* BLOCO SALDO OPERACIONAL (DESTAQUE MÁXIMO - LOGO ACIMA DE RECEBIMENTOS) */}
      <section className="mt-4 print:mt-1">
        <div className="cartao border-ambar/20 bg-ambar/[0.02] p-4 relative overflow-hidden group hover:shadow-md transition-shadow ">
          <div className="flex items-center justify-between w-full">
            <div className="flex flex-col flex-1 items-start justify-center px-2">
              <span className="text-[10px] uppercase tracking-widest font-bold text-suave/80 mb-1">Entrada</span>
              <span className="numeros font-bold text-positivo text-lg sm:text-xl">
                {formatReais(asCentavos(dados.vendaFisica + dados.fiadoRecebido))}
              </span>
            </div>
            
            <div className="w-px h-10 bg-claro/10 mx-2"></div>
            
            <div className="flex flex-col flex-1 items-start justify-center px-2">
              <span className="text-[10px] uppercase tracking-widest font-bold text-suave/80 mb-1">Saída</span>
              <span className="numeros font-bold text-atencao text-lg sm:text-xl">
                {formatReais(asCentavos(dados.despesa + dados.fiadoConcedido))}
              </span>
            </div>

            <div className="w-px h-10 bg-claro/10 mx-2"></div>

            <div className="flex flex-col flex-[1.5] items-end justify-center px-2 text-right">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-4 h-4 rounded bg-ambar/10 flex items-center justify-center text-ambar print:hidden">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <span className="text-xs uppercase tracking-widest font-bold text-suave">Saldo Líquido</span>
              </div>
              <span className={`numeros text-2xl sm:text-3xl font-black ${(dados.vendaFisica + dados.fiadoRecebido - dados.despesa - dados.fiadoConcedido) >= 0n ? 'text-positivo ' : 'text-negativo '}`}>
                {formatReais(asCentavos(dados.vendaFisica + dados.fiadoRecebido - dados.despesa - dados.fiadoConcedido))}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* RECEBIMENTOS E DINHEIRO FÍSICO */}
      <section className="mt-4 flex flex-col gap-6 print:gap-2 print:mt-1">

        {/* COMBINADO: RECEBIMENTOS DIGITAIS E FÍSICO */}
        <div className="cartao p-0 group hover:shadow-md transition-shadow relative overflow-hidden flex flex-col sm:flex-row">
          
          {/* Lado Esquerdo: Digitais */}
          <div className="flex-[1.2] p-4 border-b sm:border-b-0 sm:border-r border-claro/10">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-suave" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                <h3 className="text-xs uppercase tracking-widest font-bold text-suave ">Recebimentos Digitais</h3>
              </div>
              {dados.destinoBancarioNome && (
                <div className="flex items-center gap-2 text-[10px] text-claro/50 bg-claro/5 px-2.5 py-1 rounded-full border border-claro/10">
                  <span className="uppercase tracking-wider opacity-70 hidden xl:inline">Automático:</span>
                  <div className="flex items-center gap-1.5 text-claro font-semibold">
                    {dados.destinoBancarioFotoUrl ? (
                      <img src={dados.destinoBancarioFotoUrl} alt="Banco" className="w-3.5 h-3.5 rounded-full object-cover bg-white" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                    )}
                    <span className="truncate max-w-[80px]">{dados.destinoBancarioNome}</span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center justify-between bg-claro/5 p-3 rounded-lg border border-claro/5 hover:border-claro/10 transition-colors ">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-7 h-7 rounded-md bg-petroleo flex items-center justify-center text-claro shrink-0 border border-claro/10 print:hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-xs font-bold text-claro ">PIX</span>
                    {dados.taxasCartao.pixTaxa > 0n && (
                      <span className="text-[9px] text-suave/60 ">Taxa: {formatReais(dados.taxasCartao.pixTaxa)}</span>
                    )}
                  </div>
                </div>
                <span className="numeros text-sm font-bold text-claro ml-2 shrink-0">{formatReais(dados.taxasCartao.pixNet)}</span>
              </div>
              
              <div className="flex items-center justify-between bg-claro/5 p-3 rounded-lg border border-claro/5 hover:border-claro/10 transition-colors ">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-7 h-7 rounded-md bg-claro/10 flex items-center justify-center text-claro shrink-0 border border-claro/20 print:hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-xs font-bold text-claro ">Débito</span>
                    {dados.taxasCartao.debitoTaxa > 0n && (
                      <span className="text-[9px] text-suave/60 ">Taxa: {formatReais(dados.taxasCartao.debitoTaxa)}</span>
                    )}
                  </div>
                </div>
                <span className="numeros text-sm font-bold text-claro ml-2 shrink-0">{formatReais(dados.taxasCartao.debitoNet)}</span>
              </div>
              
              <div className="flex items-center justify-between bg-claro/5 p-3 rounded-lg border border-claro/5 hover:border-claro/10 transition-colors ">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-7 h-7 rounded-md bg-claro/10 flex items-center justify-center text-claro shrink-0 border border-claro/20 print:hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-xs font-bold text-claro ">Crédito</span>
                    {dados.taxasCartao.creditoTaxa > 0n && (
                      <span className="text-[9px] text-suave/60 ">Taxa: {formatReais(dados.taxasCartao.creditoTaxa)}</span>
                    )}
                  </div>
                </div>
                <span className="numeros text-sm font-bold text-claro ml-2 shrink-0">{formatReais(dados.taxasCartao.creditoNet)}</span>
              </div>
            </div>
          </div>

          {/* Lado Direito: Dinheiro Físico */}
          <div className="flex-1 p-4 bg-positivo/[0.02]">
            <div className="flex flex-col gap-3 h-full justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-positivo/10 flex items-center justify-center text-positivo shrink-0 border border-positivo/20 print:hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                  </div>
                  <span className="text-xs uppercase tracking-wider font-bold text-positivo ">Dinheiro Físico / Depósito</span>
                </div>
                
                <div className="flex flex-col gap-2 text-sm mb-4 bg-claro/5 p-3 rounded-lg border border-claro/5">
                  <div className="flex justify-between items-center">
                    <span className="text-suave/80 text-xs">Esperado:</span>
                    <span className="numeros font-bold text-claro/90 text-xs">{formatReais(dados.esperado)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-claro/5 pt-2">
                    <span className="text-suave/80 text-xs">Diferença:</span>
                    <span className={`numeros font-bold text-xs ${dados.diferenca < 0n ? 'text-negativo ' : dados.diferenca > 0n ? 'text-positivo ' : 'text-suave/80 '}`}>
                      {dados.diferenca > 0n ? '+' : ''}{formatReais(dados.diferenca)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase tracking-widest text-suave font-bold block mb-1">Total Contado</span>
                <span className="numeros text-3xl font-black text-positivo drop-shadow-sm">{formatReais(dados.contado)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* DESTINO DA TRANSFERÊNCIA E SALDOS FÍSICOS COMBINADOS */}
        { (dados.transferencia?.destinoNome || (dados.contasDinheiro && dados.contasDinheiro.length > 0)) && (
          <div className="cartao p-0 group hover:shadow-md transition-shadow flex flex-col overflow-hidden">
            
            {/* Parte de Cima: Destino da Transferência */}
            {dados.transferencia?.destinoNome && (
              <div className="p-4 border-b border-claro/10 bg-ambar/5">
                <div className="flex items-center gap-2 mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-ambar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 8 4 4-4 4M2 12h20"/></svg>
                  <span className="text-xs uppercase tracking-widest font-bold text-ambar">Destino do Dinheiro</span>
                </div>
                
                {dados.transferencia.permaneuNoCaixa ? (
                  <div className="flex items-center justify-between gap-4 bg-ardosia/40 p-3 rounded-lg border border-claro/10 shadow-sm w-full">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-positivo/10 flex items-center justify-center text-positivo shrink-0 border border-positivo/20 print:hidden">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-suave">Ação</span>
                        <span className="text-sm font-bold text-claro ">Permaneceu no {dados.transferencia.destinoNome}</span>
                      </div>
                    </div>
                    {dados.transferencia.saldoDestino !== undefined && (
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] uppercase tracking-wider text-suave">Saldo Acumulado</span>
                        <span className="text-sm font-bold text-positivo ">{formatReais(dados.transferencia.saldoDestino)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-ardosia/40 p-3 rounded-lg border border-claro/10 shadow-sm w-full">
                    {/* DE ONDE */}
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div className="w-8 h-8 rounded-full bg-claro/10 flex items-center justify-center text-claro shrink-0 border border-claro/20 print:hidden">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-suave" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-suave ">Origem</span>
                        <span className="text-sm font-bold text-claro ">Caixa Gaveta</span>
                      </div>
                    </div>

                    {/* VALOR TRANSFERIDO */}
                    <div className="flex flex-col items-center justify-center flex-1 px-4 py-1.5 bg-ambar/10 border border-ambar/20 rounded-lg text-center md:mx-4 my-1 md:my-0 shadow-sm shadow-ambar/5 ">
                      <span className="text-[9px] uppercase tracking-wider text-ambar/70 font-bold mb-0.5 ">Valor Transferido</span>
                      <span className="numeros text-base font-black text-ambar ">{formatReais(dados.transferencia.valor)}</span>
                      <div className="flex items-center gap-1 mt-0.5 text-[8px] text-suave print:hidden">
                        <span>origem</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        <span>destino</span>
                      </div>
                    </div>

                    {/* PARA ONDE */}
                    <div className="flex items-center gap-3 min-w-[200px] truncate">
                      {dados.transferencia.destinoFotoUrl ? (
                        <div className="w-8 h-8 rounded-full bg-ambar/10 flex items-center justify-center shrink-0 border border-ambar/20 overflow-hidden print:hidden">
                          <img src={dados.transferencia.destinoFotoUrl} alt={dados.transferencia.destinoNome} className="w-full h-full object-cover bg-white" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-ambar/10 flex items-center justify-center text-ambar shrink-0 border border-ambar/20 print:hidden">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11m16-11v11M8 14v3m4-3v3m4-3v3"/></svg>
                        </div>
                      )}
                      <div className="flex flex-col truncate">
                        <span className="text-[10px] uppercase tracking-wider text-ambar/70 ">
                          {dados.transferencia.ehBanco ? 'Depósito Bancário' : 'Destino'}
                        </span>
                        <span className="text-sm font-bold text-ambar truncate">{dados.transferencia.destinoNome}</span>
                        {!dados.transferencia.ehBanco && dados.transferencia.saldoDestino !== undefined && (
                          <span className="text-[10px] text-positivo font-semibold mt-0.5">
                            Saldo Acumulado: {formatReais(dados.transferencia.saldoDestino)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Parte de Baixo: Saldos Físicos */}
            {dados.contasDinheiro && dados.contasDinheiro.length > 0 && (
              <div className="p-4 bg-ardosia/20">
                <div className="flex items-center gap-2 mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-suave" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                  <span className="text-[10px] uppercase tracking-widest text-claro/50 font-bold block">Saldos de Contas Físicas (Caixas)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {dados.contasDinheiro.map(cd => (
                    <div key={cd.id} className="flex items-center justify-between bg-claro/5 rounded-lg p-2.5 border border-claro/5 hover:border-claro/10 transition-colors">
                      <div className="flex items-center gap-2 truncate">
                        {cd.fotoUrl ? (
                          <img src={cd.fotoUrl} alt={cd.nome} className="w-6 h-6 rounded-full object-cover shrink-0 bg-white" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-suave/25 flex items-center justify-center text-suave shrink-0 text-[10px] font-bold">
                            $
                          </div>
                        )}
                        <span className="text-xs text-claro/80 font-medium truncate">{cd.nome}</span>
                      </div>
                      <span className="numeros text-sm font-bold text-claro ml-2 shrink-0">{formatReais(cd.saldo)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </section>

      {/* RODAPÉ E OBSERVAÇÕES */}
      <section className="flex flex-col sm:flex-row gap-6 mt-4 print:mt-1 print:gap-2">
        {dados.produtosFaltando.length > 0 && (
          <div className="flex-1 rounded-xl bg-atencao/10 border border-atencao/20 p-4 ">
            <h4 className="text-sm font-semibold text-atencao uppercase tracking-widest mb-2 flex items-center gap-2 ">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Alerta de Estoque
            </h4>
            <p className="text-xs text-atencao/80 mb-2 ">Os seguintes produtos estão esgotados ou negativos:</p>
            <div className="flex flex-wrap gap-2">
              {dados.produtosFaltando.map(pf => (
                <span key={pf.nome} className="inline-block rounded-md bg-atencao/20 px-2 py-1 text-xs font-medium text-atencao print:border ">
                  {pf.nome} ({String(pf.estoqueAtual)})
                </span>
              ))}
            </div>
          </div>
        )}

        {dados.observacao && (
          <div className="flex-1 rounded-xl border border-claro/10 bg-ardosia p-4 text-sm text-claro/80 ">
            <span className="block text-xs uppercase tracking-widest text-claro/50 mb-1 ">Observação do Fechamento</span>
            <p className="italic">"{dados.observacao}"</p>
          </div>
        )}
      </section>

      {/* AÇÕES (NÃO IMPRIMIR) */}
      <div className="mt-8 flex flex-wrap justify-between gap-4 pt-6 border-t border-claro/10 print:hidden">
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-claro/10 px-5 py-2.5 text-sm font-medium text-claro hover:bg-claro/20 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimir PDF
          </button>
          
          {podeReabrir && aoReabrir && (
            <button
              onClick={aoReabrir}
              className="flex items-center gap-2 rounded-xl bg-negativo/10 px-5 py-2.5 text-sm font-medium text-negativo hover:bg-negativo/20 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Reabrir Fechamento
            </button>
          )}
        </div>
        
        <button
          onClick={aoFechar}
          className="rounded-xl bg-gradient-to-r from-ambar to-ambar-claro px-8 py-2.5 text-sm font-bold text-petroleo shadow-lg shadow-ambar/20 hover:shadow-ambar/40 transition-all hover:-translate-y-0.5"
        >
          Concluir e Voltar
        </button>
      </div>

      {/* AUDITORIA / DATA DE FECHAMENTO (FINAL DO RELATÓRIO) */}
      <div className="text-center text-xs text-suave/40 mt-8 border-t border-claro/5 pt-4 flex flex-col items-center justify-center gap-1 print:mt-2 print:pt-1">
        <span>
          Finalizado em {formatarDataBR(dados.data)}
          {dados.fechadoEm ? ` às ${formatarHoraBR(dados.fechadoEm)}` : ''}
        </span>
        <span className="text-[10px] opacity-75 print:hidden">Pontão Beira Rio • Auditoria de Caixa</span>
      </div>
    </div>
  );
}

