# Plano de Implementação — Ajustes no Fechamento de Caixa

Este plano propõe uma série de melhorias e ajustes no fluxo de fechamento de caixa (§5.2 e §8.4 do `AGENTS.md`), incluindo formatação de encerrantes, remoção de colunas, lógica de contagem de segurança, parametrização de produtos avulsos, UX de inputs, colapso de fiados, reorganização visual dos totais de caixa, auto-salvamento (rascunho) e novos botões de ação.

## Alterações Propostas

### 1. Banco de Dados / Supabase

#### [Nova Migração] `supabase/migrations/20260625060000_rascunho_e_politica_fechamento.sql`
Criaremos uma nova migração para:
- Adicionar a coluna `rascunho` (JSONB) na tabela `fechamento`. Ela armazenará o estado de rascunho de forma compacta e segura sem poluir as tabelas de movimentos financeiros.
- Criar a política de `UPDATE` na tabela `fechamento` para permitir que usuários com permissão `fechar_caixa` ou `reabrir_fechamento` atualizem registros (necessário para auto-salvamento e para finalizar o caixa).

---

### 2. Camada de Dados (Backend / Frontend)

#### [Modificar] `apps/web/src/data/fechamento.ts`
- Atualizar a interface `ContextoFechamento` para incluir `mostrarProdutosAvulsos: boolean`.
- Modificar `carregarContexto`:
  - Carregar a chave `fechamento_mostrar_avulsos` da tabela `config` e atribuir a `mostrarProdutosAvulsos`.
  - Se o fechamento do dia existir e possuir a coluna `rascunho` preenchida, carregar os dados diretamente dela como `valoresSalvos`. Caso contrário, manter o fallback de carregamento das tabelas físicas.
- Adicionar a função `salvarRascunhoFechamento(data: string, rascunho: any, usuarioId: string): Promise<void>` para salvar o rascunho diretamente na tabela `fechamento` (usando upsert com `status: 'aberto'`).
- Modificar `confirmarFechamento` para limpar a coluna `rascunho` (definir como `null`) quando o fechamento for confirmado/travado.

---

### 3. Tela de Fechamento (UI)

#### [Modificar] `apps/web/src/features/fechamento/Fechamento.tsx`
- **Leitura anterior formatada**: criar a função helper `formatarLeituraAnterior(valor: Mililitros): string` para exibir os encerrantes anteriores como números inteiros de litros com ponto separador de milhar (ex.: `1.234.567` em vez de `1234567,000 L`).
- **Remover coluna de Entradas**: na tabela de contagem de produtos, remover a coluna "Entradas". O cálculo da venda física continuará considerando as entradas do dia carregadas do banco (`entradasEstoque`), mas a coluna não será editável no fechamento.
- **Lógica de segurança de contagem**:
  - Ajustar o cálculo do estoque atual (`atual`) na listagem de produtos. Se o input estiver vazio, assume-se que nada foi vendido (`atual = estoqueAnterior + ent`), resultando em `vendido = 0`. Se o usuário digitar `0`, assume-se que vendeu tudo.
  - Modificar a finalização (`confirmar`) para salvar a contagem de todos os produtos (`calc.produtos.map(...)`), garantindo que o estoque remanescente seja transportado corretamente para o dia seguinte, mesmo para itens não digitados.
- **Habilitação de produtos avulsos**: renderizar a seção de "Produtos (Avulsos / Serviços)" somente se `ctx.mostrarProdutosAvulsos` estiver ativo.
- **Limpeza automática de zero**:
  - Adicionar o manipulador `onFocus` nos inputs de leituras, contagens e vendas avulsas para que, se o valor for `'0'`, ele seja limpo (`''`), restando apenas o cursor.
  - Adicionar a mesma lógica de limpeza no componente `CampoMoeda` para valores `'0'` ou `'0,00'`.
- **Seção de Fiados reduzida e relocalizada**:
  - Mover a seção de fiados para logo abaixo das "Despesas do dia".
  - Por padrão (se `mostrarFiados` for falso), mostrar apenas um botão discreto alinhado à direita: `Registrar fiados (vendas/recebimentos)`. Ao clicar, expande o formulário completo.
- **Reorganização dos Totais do Caixa**:
  - Mover o input "Dinheiro contado na gaveta" para a esquerda, tornando-o maior e mais evidente.
  - Colocar a "Diferença" no centro, com tamanho normal e menos chamativa.
  - Colocar o valor "A depositar" por último, na extrema direita, em destaque (cor amarela/amber e fonte grande).
- **Auto-salvamento e novos botões**:
  - Implementar hook `useEffect` com debounce (1.5 segundos) que dispara o salvamento do rascunho sempre que houver alteração nos inputs.
  - Adicionar botão "Salvar" (estilo suave, menos evidente) ao lado de um botão "Finalizar" (estilo primário, grande e em destaque).

---

### 4. Tela de Configurações

#### [Modificar] `apps/web/src/features/catalogo/Configuracoes.tsx`
- Adicionar o parâmetro `fechamento_mostrar_avulsos` (Mostrar produtos avulsos no fechamento) como um checkbox/toggle na seção "Caixa".
- Carregar e persistir a configuração através de `lerConfig` e `salvarConfig`.

---

## Plano de Verificação

### Testes Manuais
1. **Configuração**: Acessar as Configurações, ativar/desativar "Mostrar produtos avulsos no fechamento" e validar que o fechamento oculta/exibe a respectiva seção.
2. **Leitura Anterior**: Validar que a leitura anterior da gasolina/diesel exibe separador de milhar com ponto (ex: `1.500.000`) e sem casas decimais.
3. **Remoção de Colunas**: Verificar que a coluna "Entradas" não é mais visível na tabela de contagem do fechamento.
4. **Contagem**:
   - Deixar um campo de contagem em branco e verificar que o valor "Vendido" correspondente é `0`.
   - Digitar `0` no campo e verificar que o valor "Vendido" calcula o total disponível (`estoque anterior + entradas`).
5. **Comportamento do Focus**: Clicar em um campo com valor `0` (ou `0,00`) e validar que o zero desaparece, deixando o campo limpo para digitação.
6. **Fiado**: Validar que a seção de fiados agora fica abaixo das Despesas do dia e inicia em estado recolhido (apenas com o botão discreto à direita).
7. **Reorganização Visual**: Validar o novo layout da barra de totais (Dinheiro Contado grande à esquerda, Diferença no meio, A Depositar destacado na direita).
8. **Auto-salvamento**: Alterar qualquer valor no fechamento, aguardar 2 segundos, recarregar a página e validar que o estado foi restaurado idêntico.
9. **Finalização**: Clicar em Finalizar e validar que o fechamento é travado com sucesso no banco e as movimentações financeiras oficiais são geradas.
