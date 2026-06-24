import re

with open('src/features/fechamento/Fechamento.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. State additions
states = '''  const [leituras, setLeituras] = useState<Record<string, string>>({});
  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [entradasEstoque, setEntradasEstoque] = useState<Record<string, string>>({});
  const [vendasIndividuais, setVendasIndividuais] = useState<Record<string, string>>({});
  const [pix, setPix] = useState('');
  const [debito, setDebito] = useState('');
  const [credito, setCredito] = useState('');
  const [despesaValor, setDespesaValor] = useState('');
  const [despesaDescricao, setDespesaDescricao] = useState('');
  const [fiadoConCliente, setFiadoConCliente] = useState('');
  const [fiadoConValor, setFiadoConValor] = useState('');
  const [fiadoRecCliente, setFiadoRecCliente] = useState('');
  const [fiadoRecValor, setFiadoRecValor] = useState('');
  const [contado, setContado] = useState('');'''

code = re.sub(r'  const \[leituras, setLeituras.*?useState\(''\);', states, code, flags=re.DOTALL)

# 2. Add asCentavos import
code = code.replace('asCentavos,', 'asCentavos,\n  arredondarDivisao,')

# 3. Update useMemo
calc_start = code.find('    const produtos = ctx.produtos.map((p) => {')
calc_end = code.find('const totalCombustivel = somar(...bombas.map((b) => b.valor));')

new_calc_produtos = '''    const produtos = ctx.produtos.map((p) => {
      const preenchido = (contagens[p.id] ?? '').trim() !== '';
      const atual = paraQuantidade(contagens[p.id] ?? '');
      const ent = paraQuantidade(entradasEstoque[p.id] ?? '');
      const r = vendaProdutoContagem({
        estoqueAnterior: p.estoqueAnterior,
        entradas: ent,
        estoqueAtual: atual,
        perdas: asQuantidade(0n),
        precoCentavos: p.preco ?? ZERO,
      });
      return { ...p, atual, ent, preenchido, vendido: r.vendido, valor: r.valorCentavos };
    });

    const ind = ctx.produtosIndividuais.map((p) => {
      const preenchido = (vendasIndividuais[p.id] ?? '').trim() !== '';
      const vendido = paraQuantidade(vendasIndividuais[p.id] ?? '');
      const valor = asCentavos(arredondarDivisao(vendido * (p.preco ?? ZERO), 1000n));
      return { ...p, vendido, preenchido, valor };
    });

    '''

code = code[:calc_start] + new_calc_produtos + code[calc_end:]

code = code.replace('const vendaFisica = somar(totalCombustivel, totalProdutos);', 'const vendaFisica = somar(totalCombustivel, totalProdutos, somar(...ind.map(p => p.valor)));')

code = code.replace('const contadoC = parseReais(contado);', '''const contadoC = parseReais(contado);
    const fiadoConC = parseReais(fiadoConValor);
    const fiadoRecC = parseReais(fiadoRecValor);''')

code = code.replace('vendaFisica,', 'vendaFisica,\n      fiadoConcedido: fiadoConC,\n      recebimentosFiadoDinheiro: fiadoRecC,')

code = code.replace('const cashSales = subtrair(subtrair(subtrair(vendaFisica, pixC), debitoC), creditoC);', 'const cashSales = subtrair(subtrair(subtrair(subtrair(vendaFisica, pixC), debitoC), creditoC), fiadoConC);')

code = code.replace('aDepositar,', 'aDepositar,\n      ind,\n      fiadoConC,\n      fiadoRecC,')

code = code.replace('calc.aDepositar,', 'calc.aDepositar,\n  ind: calc.ind,\nfiadoConC: calc.fiadoConC,\nfiadoRecC: calc.fiadoRecC,')

code = code.replace(']});', ']});')

# 4. update Confirmar payload
confirmar = '''        leituras: calc.bombas
          .filter((b) => (leituras[b.id] ?? '').trim() !== '' && !b.invalido)
          .map((b) => ({ bombaId: b.id, leitura: b.atual })),
        contagens: calc.produtos
          .filter((p) => p.preenchido)
          .map((p) => ({ produtoId: p.id, quantidade: p.atual })),
        entradas: calc.produtos
          .filter((p) => p.ent > 0n)
          .map((p) => ({ produtoId: p.id, quantidade: p.ent })),
        vendasIndividuais: calc.ind
          .filter((p) => p.preenchido)
          .map((p) => ({ produtoId: p.id, quantidade: p.vendido })),
        fiadosConcedidos:
          calc.fiadoConC > 0n && fiadoConCliente
            ? [{ clienteId: fiadoConCliente, valor: calc.fiadoConC }]
            : [],
        fiadosRecebidos:
          calc.fiadoRecC > 0n && fiadoRecCliente
            ? [{ clienteId: fiadoRecCliente, valor: calc.fiadoRecC }]
            : [],
        cashSales: calc.cashSales,'''
code = re.sub(r'leituras: calc\.bombas.*?cashSales: calc\.cashSales,', confirmar, code, flags=re.DOTALL)

# update UI

ui_contagem = '''<th className="pb-2 text-right font-medium">Estoque anterior</th>
              <th className="pb-2 text-right font-medium">Entradas</th>
              <th className="pb-2 text-right font-medium">Contagem agora</th>'''

code = code.replace('''<th className="pb-2 text-right font-medium">Estoque anterior</th>
              <th className="pb-2 text-right font-medium">Contagem agora</th>''', ui_contagem)

ui_contagem_body = '''<td className="numeros py-2 text-right text-claro/60">
                    {String(p.estoqueAnterior)}
                  </td>
                  <td className="py-2 text-right">
                    <input
                      inputMode="numeric"
                      value={entradasEstoque[p.id] ?? ''}
                      onChange={(e) => setEntradasEstoque((s) => ({ ...s, [p.id]: e.target.value }))}
                      className={inputClasse + ' !w-24'}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-2 text-right">'''

code = code.replace('''<td className="numeros py-2 text-right text-claro/60">
                    {String(p.estoqueAnterior)}
                  </td>
                  <td className="py-2 text-right">''', ui_contagem_body)

ui_ind = '''</section>

      {/* Produtos individuais (Venda Avulsa) */}
      {calc.ind.length > 0 && (
      <section className="rounded-2xl bg-ardosia p-5">
        <h2 className="mb-3 font-display font-semibold text-claro">Produtos (Avulsos / Servios)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-claro/50">
              <th className="pb-2 font-medium">Produto</th>
              <th className="pb-2 text-right font-medium">Qtd. Vendida</th>
              <th className="pb-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {calc.ind.map((p) => {
              const meu = idx++;
              return (
                <tr key={p.id} className="border-t border-claro/10">
                  <td className="py-2 text-claro">{p.nome}</td>
                  <td className="py-2 text-right">
                    <input
                      ref={(el) => {
                        refs.current[meu] = el;
                      }}
                      inputMode="numeric"
                      value={vendasIndividuais[p.id] ?? ''}
                      onChange={(e) => setVendasIndividuais((s) => ({ ...s, [p.id]: e.target.value }))}
                      onKeyDown={(e) => aoEnter(e, meu)}
                      className={inputClasse}
                      placeholder="0"
                    />
                  </td>
                  <td className="numeros py-2 text-right text-claro">{formatReais(p.valor)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      )}'''

code = code.replace('</section>\n\n      {/* Venda', ui_ind + '\n\n      {/* Venda')


ui_fiado = '''</section>

      {/* Fiados */}
      <section className="grid gap-4 rounded-2xl bg-ardosia p-5 sm:grid-cols-2">
        <h2 className="font-display font-semibold text-claro sm:col-span-2">
          Fiados do Dia
        </h2>
        
        <div className="rounded-xl border border-claro/10 p-4">
          <h3 className="mb-3 font-semibold text-claro">Fiado Concedido (Venda pendurada)</h3>
          <div className="flex flex-col gap-3">
            <select 
              value={fiadoConCliente} 
              onChange={e => setFiadoConCliente(e.target.value)}
              className="rounded-lg border border-claro/20 bg-petroleo px-3 py-2 text-claro"
            >
              <option value="">Selecione o Cliente</option>
              {ctx.clientesFiado.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <Campo rotulo="Valor" valor={fiadoConValor} aoMudar={setFiadoConValor} />
          </div>
        </div>

        <div className="rounded-xl border border-claro/10 p-4">
          <h3 className="mb-3 font-semibold text-claro">Recebimento de Fiado (Dinheiro entrando)</h3>
          <div className="flex flex-col gap-3">
            <select 
              value={fiadoRecCliente} 
              onChange={e => setFiadoRecCliente(e.target.value)}
              className="rounded-lg border border-claro/20 bg-petroleo px-3 py-2 text-claro"
            >
              <option value="">Selecione o Cliente</option>
              {ctx.clientesFiado.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <Campo rotulo="Valor" valor={fiadoRecValor} aoMudar={setFiadoRecValor} />
          </div>
        </div>

      </section>'''

code = code.replace('</section>\n\n      {/* Pagamentos', ui_fiado + '\n\n      {/* Pagamentos')

with open('src/features/fechamento/Fechamento.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

