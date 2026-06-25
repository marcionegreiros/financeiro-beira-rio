# Pontão Beira Rio — Especificação Mestre de Desenvolvimento

> **Sistema web de controle financeiro de posto/porto fluvial de combustível.**
> Documento canônico que orienta todo o desenvolvimento assistido por IA (Claude Code + Antigravity).
> Versão 1.0 · Junho/2026 · Idioma de domínio: Português (BR)

---

## Sumário

0. [Como usar este documento](#0-como-usar-este-documento)
1. [Visão do produto (PRD resumido)](#1-visão-do-produto-prd-resumido)
2. [Glossário / Linguagem ubíqua](#2-glossário--linguagem-ubíqua)
3. [Regras de negócio — o coração do sistema](#3-regras-de-negócio--o-coração-do-sistema)
4. [Personas e modelo de permissões](#4-personas-e-modelo-de-permissões)
5. [Requisitos funcionais por módulo (os "setores")](#5-requisitos-funcionais-por-módulo)
6. [Modelo de dados](#6-modelo-de-dados)
7. [Arquitetura e stack tecnológica](#7-arquitetura-e-stack-tecnológica)
8. [Design / UI / UX](#8-design--ui--ux)
9. [Roadmap de desenvolvimento (passo a passo)](#9-roadmap-de-desenvolvimento-passo-a-passo)
10. [Trabalhando com Claude Code + Antigravity](#10-trabalhando-com-claude-code--antigravity)
11. [Critérios de aceite e cenários de teste](#11-critérios-de-aceite-e-cenários-de-teste)
12. [Apêndice: checklist de arranque](#12-apêndice-checklist-de-arranque)

---

## 0. Como usar este documento

Este arquivo é a **fonte única de verdade** do projeto. Ele deve ser salvo na raiz do repositório como `AGENTS.md` (e ter um `CLAUDE.md` apontando para ele), para que tanto o Claude Code quanto o Antigravity carreguem o mesmo contexto em toda sessão. Nenhuma decisão de implementação deve contradizer este documento; se algo aqui estiver errado ou incompleto, **corrija o documento primeiro, depois o código**.

### Princípios invioláveis (os dois pilares)

Toda a arquitetura repousa sobre duas decisões. Se uma delas for violada, o sistema mente sobre dinheiro — que é o pior defeito possível aqui.

**Pilar 1 — Nada de saldo editável. Tudo é derivado de eventos.**
O sistema **não guarda** "saldo da conta", "estoque atual" ou "venda do dia" como campos que se atualizam. Ele guarda **eventos imutáveis** (contagens, leituras de bomba, movimentos de dinheiro) e **calcula** todos os números a partir deles. Isso dá auditoria total, correção retroativa e elimina inconsistências. (Bônus crítico: eventos imutáveis tornam a sincronização offline praticamente livre de conflitos — ver §7.)

**Pilar 2 — Caixa, capital e dívida são três livros separados.**
Um mesmo movimento pode afetar o caixa, o capital, a dívida, vários deles, ou nenhum. A tabela em [§3.4](#34-tabela-mestra--o-que-cada-movimento-afeta) é a alma do sistema. Toda função financeira deve consultar essa tabela conceitual.

### Convenções de código

| Aspecto | Convenção |
|---|---|
| **Idioma dos conceitos de domínio** | Português. Entidades, campos e termos de negócio em PT (`fechamento`, `encerrante`, `movimento`, `socio`). Mantém alinhamento com a linguagem ubíqua e reduz erro de tradução pelos agentes. |
| **Idioma técnico/framework** | Inglês padrão (`useState`, `async`, `repository`, `service`). |
| **Dinheiro** | **NUNCA usar float.** Armazenar sempre em **centavos** como inteiro (`bigint`). Toda formatação para Real (R$) acontece só na borda de exibição. |
| **Litros / volume** | Numérico com precisão fixa de 3 casas (mililitros). Armazenar como `numeric(14,3)` ou inteiro em mL. |
| **Encerrante (leitura de bomba)** | `numeric(14,3)`. É cumulativo e sempre crescente. |
| **Datas / fuso** | Fuso fixo **America/Manaus (UTC−4, sem horário de verão)**. "Data do fechamento" é uma `date` (não timestamp). Movimentos têm `timestamptz`. |
| **IDs** | **UUIDv7** (ordenável por tempo), gerado no cliente. Essencial para sincronização offline determinística. |
| **Status financeiro** | Toda operação que mexe em dinheiro registra `criado_por`, `criado_em` e (quando aplicável) `fechamento_id`. |

---

## 1. Visão do produto (PRD resumido)

### Problema
O controle financeiro do Pontão Beira Rio é feito hoje numa planilha Excel manual. O fechamento diário do caixa, o acompanhamento de nível dos tanques, a distribuição do dinheiro entre espécie/PIX/cartão e a visão de capital são frágeis, propensos a erro e não auditáveis. Há ainda a complicação de operar à beira-rio no Amazonas, onde **a internet cai com frequência**.

### Usuários
- **Gerente/Dono (Márcio)** — visão total: capital, contas, transferências, configurações, permissões.
- **Vendedor(es)** — operam o dia a dia: fecham o caixa, registram vendas avulsas, veem o nível do tanque. **Não** veem capital nem retiradas de sócios, e só movimentam o dinheiro do dia.
- **Gerentes adicionais** — permissões configuráveis item a item (alguns só leitura).

### Objetivo
Substituir a planilha por um aplicativo web **offline-first**, abrível em notebook e celular, que torne o fechamento de caixa **rápido e intuitivo**, mantenha o controle exato de combustível, dinheiro e capital, e ofereça auditoria completa.

### Escopo (v1)
Fechamento diário por contagem; controle de combustível por encerrante + medição física; múltiplas contas e transferências; despesas categorizadas; fiado; folha/vales; aportes de sócio; painel com KPIs e gráficos; alertas de estoque e de tanque; permissões granulares; modo offline.

### Fora de escopo (v1)
Emissão fiscal (NF-e/NFC-e/SAT); integração com bombas/automação de pista; integração bancária automática (open finance); multi-loja (mas o modelo deve permitir evolução); custo médio com rateio de frete/impostos por nota.

### Métricas de sucesso
- Fechar o caixa de um dia em **≤ 3 minutos** de digitação contínua.
- **Zero** divergências contábeis não explicadas (toda diferença é rastreável).
- App **100% funcional offline** para a operação do dia, sincronizando ao recuperar sinal.

---

## 2. Glossário / Linguagem ubíqua

Estes termos são **vocabulário oficial** — usar exatamente assim em código, telas e conversa com os agentes.

| Termo | Definição |
|---|---|
| **Encerrante (série)** | Leitura cumulativa e crescente da bomba. A **venda de combustível** é a diferença entre a leitura de hoje e a do fechamento anterior. |
| **Bomba (bico)** | Ponto de saída de combustível. Hoje há 1 bico por combustível, mas o modelo suporta vários bicos por tanque. |
| **Tanque** | Reservatório físico (1 de gasolina, 1 de diesel). Tem nível, capacidade e alerta de nível baixo. |
| **Medição de tanque** | Aferição física do nível (régua). Pode haver várias por dia, com observação. Serve para reconciliar contra o nível calculado. |
| **Fechamento** | Evento diário que lê o físico (contagens + encerrantes) e gera a venda + o recebimento. É a peça que liga os dois livros. |
| **Contagem** | Quantidade de um produto contada num fechamento. A venda de produto deriva da diferença entre contagens. |
| **Modo de apuração** | Por produto: **contagem** (a diferença de estoque é a venda oficial) ou **individual** (a venda registrada manualmente é a oficial). Combustível é sempre por encerrante. |
| **Venda avulsa / individual** | Registro manual de uma venda de produto durante o dia. Para itens em modo *contagem*, é só conferência (não entra no fechamento). Para itens em modo *individual*, é a venda oficial. |
| **Conta** | Lugar onde o dinheiro fica: **dinheiro** (espécie/gaveta) ou **banco** (Bradesco e outras). Saldo = soma dos movimentos. |
| **Movimento** | Lançamento no livro financeiro: recebimento, despesa, transferência, depósito, aporte, devolução, etc. |
| **Depósito** | Transferência específica de uma conta de dinheiro → conta de banco. |
| **Fiado** | Venda concedida sem receber na hora. O item sai do estoque hoje (já está na venda), mas o dinheiro só entra no pagamento futuro. |
| **Diferença de caixa** | `dinheiro_contado − dinheiro_esperado`. Sobra ou falta. Categoria própria, nunca diluída em despesa. |
| **Aporte de sócio** | Injeção de dinheiro por um sócio. Tipo **empréstimo** (gera dívida a devolver) ou **aumento de capital** (vira patrimônio). |
| **Pró-labore / retirada** | Saída de dinheiro do negócio para uso/remuneração de gerente/sócio. Reduz o capital. Não amortiza empréstimo. |
| **Vale** | Adiantamento de salário ao funcionário. Desconta do salário no fechamento mensal. |
| **Perda** | Baixa de estoque sem venda (vencimento, quebra). Reduz estoque (e capital via estoque), mas **não** debita conta nenhuma. |
| **Capital total (patrimônio)** | Ativos − Passivos. Inclui aportes de aumento de capital. |
| **Capital operacional** | Capital total menos os aumentos de capital líquidos: mostra o que o negócio gerou sozinho. |
| **Dia zero** | Cadastro inicial de saldos, contagens, encerrantes, níveis e fiados em aberto para começar a usar o sistema. |

---

## 3. Regras de negócio — o coração do sistema

> Esta seção é a parte mais importante do documento. Os agentes devem implementar a **camada de domínio (cálculo) primeiro e com testes**, antes de qualquer tela (ver [§9, Fase 2](#fase-2--núcleo-de-domínio-o-motor-de-cálculo)).

### 3.1 Os dois livros e o cruzamento

Existem dois "livros" separados que se cruzam num ponto:

1. **Livro físico** — contagens de estoque e leituras de encerrante. Estados e entradas de mercadoria/combustível.
2. **Livro financeiro** — movimentos de dinheiro entre contas. Um razão; o saldo de cada conta é sempre derivado.

O **fechamento é o cruzamento**: lê o livro físico (gera a venda) e alimenta o livro financeiro (gera o recebimento). O número que esse cruzamento valida é a **diferença de caixa**.

### 3.2 Assimetria combustível × produto

Os dois calculam venda de formas diferentes. Isso **tem** que estar explícito no modelo.

**Combustível** (sempre por encerrante):
```
litros_vendidos = leitura_atual − leitura_anterior        (somado sobre os bicos do tanque)
venda_combustivel_R$ = litros_vendidos × preço_do_dia
```
- A **entrada de combustível NÃO entra na conta da venda** (a venda já é a diferença do encerrante).
- O **nível do tanque** é uma reconciliação paralela:
```
nivel_calculado = nivel_anterior + entradas_litros − litros_vendidos
divergencia_tanque = nivel_medido (régua) − nivel_calculado
```
A divergência é o sinal de vazamento/evaporação/furto/erro de bomba. Calculado e medido **convivem**; um nunca sobrescreve o outro.

**Produto** (modo *contagem*):
```
vendido = estoque_anterior + entradas_do_dia − estoque_atual − perdas
venda_produto_R$ = vendido × preço_do_dia
```
- A **entrada de mercadoria ENTRA na conta** (senão a venda fica errada nos dias de recebimento).
- A **perda ENTRA** na fórmula como baixa (senão vira "venda fantasma" e estoura a diferença).

**Produto** (modo *individual*): a soma das vendas avulsas registradas **é** a venda oficial; não depende de contagem.

> **Consequência (cascata):** como a venda de produto em modo contagem é a diferença entre duas contagens, **todo fechamento depende do anterior**. Corrigir uma contagem antiga recalcula os dias seguintes. Por isso guardamos contagens (estados) e derivamos venda (deltas) — nunca a venda pronta. Ver travamento em [§3.7](#37-travamento-e-correção).

### 3.3 A equação do caixa

A receita real do dia é uma só:
```
venda_fisica = venda_combustivel + venda_produtos(contagem) + venda_produtos(individual)
```

O que o sistema **espera** encontrar em dinheiro quando o vendedor conta a gaveta:
```
dinheiro_esperado =  venda_fisica
                   − fiado_concedido
                   − pix
                   − cartao_debito − cartao_credito
                   − despesas_em_dinheiro
                   − prolabore_em_dinheiro
                   − vales_em_dinheiro
                   + recebimentos_de_fiado_em_dinheiro
                   + troco_fixo

diferenca = dinheiro_contado − dinheiro_esperado
```

**Regra geral de caixa:** *qualquer dinheiro que sai da gaveta durante o dia* (despesa, pró-labore, vale, retirada) entra como saída no esperado, **independente** de como afeta o capital. Efeito-caixa e efeito-capital são contas separadas.

> **Validação contra a planilha real (imagem enviada):** com fiado = 0 e sem recebimento de fiado → `2.204,90 − 50,00 (despesa) = 2.154,90` esperado. Contado: `1.772,00 (dinheiro) + 383,00 (PIX) = 2.155,00`. **Diferença = +0,10** — exatamente o valor que a planilha mostra. Esta é a primeira asserção de teste obrigatória ([§11](#11-critérios-de-aceite-e-cenários-de-teste)).

### 3.4 Tabela mestra — o que cada movimento afeta

| Movimento | Caixa | Capital operacional | Saldo devedor ao sócio | Observação |
|---|:---:|:---:|:---:|---|
| Venda | + | + | — | Receita real. Fiado e venda avulsa já estão aqui. |
| Despesa operacional | − | − | — | Referencia a conta de origem. |
| Perda de estoque | — | − (via estoque) | — | Baixa estoque; **não** debita conta. |
| Pró-labore / retirada | − | − | **não toca** | Não amortiza empréstimo. |
| Depósito / transferência | move entre contas | não muda | — | Dinheiro continua do Pontão. |
| Fiado concedido | — | já contado na venda | — | Vira "a receber". |
| Recebimento de fiado | + | não (já era a receber) | — | **Não é venda.** Quita o recebível. |
| Aporte — empréstimo | + | não muda | **+** | Nasce dívida igual; capital líquido inalterado. |
| Aporte — aumento de capital | + | não muda (entra no total) | não | Vira patrimônio. |
| Devolução de empréstimo | − | não muda | **−** | Troca caixa por baixa de dívida. |
| Taxa de cartão | − | − | — | Despesa automática por recebimento de cartão. |
| Diferença de caixa | ajusta | + ou − | — | Categoria própria. |

### 3.5 Capital: definição e valorização

```
Ativos   = saldos_de_todas_as_contas
         + fiado_em_aberto (a receber)
         + valor_do_estoque_de_produtos (a custo)
         + valor_do_combustivel_nos_tanques (a custo)

Passivos = emprestimos_de_socio_em_aberto
         + outras_dívidas

Capital_total       = Ativos − Passivos
Capital_operacional = Capital_total − aumentos_de_capital_líquidos
```

O **painel mostra por padrão o capital operacional** (o que o negócio gerou sozinho), com um **toggle** que revela o capital total (com aportes somados). É o filtro "com e sem essa entrada" que o gerente pediu.

**Valorização do estoque (decisão técnica):** **custo médio ponderado**, recalculado a cada entrada de mercadoria/combustível. Cada entrada carrega o custo daquela compra (editável no recebimento; default = último custo). Isso move o capital de forma suave e reflete o que foi realmente pago pelo que está parado.

**Custo para lucro (separado):** o **lucro do dia** usa o **custo vigente** que o gerente fixou (controlado por data/hora). São dois usos do custo, e tudo bem divergirem: um valoriza o estoque parado, outro mede a margem da venda.

> **Limite honesto sobre custo intradiário:** a venda do dia é a diferença entre duas contagens e **não tem hora**. Se o custo mudar no meio do dia, o sistema não sabe quantas unidades saíram antes/depois. Como o custo "geralmente não altera no decorrer do dia", a valorização do estoque parado é exata (usa custo atual) e o custo dos vendidos usa o vigente no fechamento; dias com troca de custo no meio ficam aproximados, salvo divisão manual da contagem.

### 3.6 Casos especiais (resumo das regras já decididas)

- **Fiado:** sai do estoque hoje (entra na venda), vira "a receber". O **pagamento** futuro é um movimento `recebimento_fiado` (entrada de dinheiro), **não** uma venda — caso contrário infla a venda do dia do pagamento.
- **Venda avulsa vs contagem:** chave **por produto** (`modo_apuracao`). Em *contagem*, a avulsa é log não-autoritativo (serve para o vendedor acompanhar e para cruzamento de sanidade). Em *individual*, a avulsa é a venda oficial. Combustível nunca é individual.
- **Perda:** categoria especial de despesa **para relatório**, mas que **não debita conta**. Capital cai uma vez só, pela baixa de estoque.
- **Taxa de cartão:** débito e crédito, cada um com **taxa fixa + percentual**, descontando do banco no recebimento:
  ```
  liquido_no_banco = bruto − (bruto × percentual) − taxa_fixa
  ```
  A **venda** registra o bruto; a **conta** recebe o líquido; a diferença vira despesa automática "Taxa de cartão".
- **Aporte / empréstimo / devolução:** ver tabela §3.4. O sistema **acompanha o saldo devedor por sócio**: sobe no empréstimo, desce só na devolução explícita. Pró-labore corre por fora.
- **Pró-labore e vale saindo do dinheiro:** entram no `dinheiro_esperado` como saída (regra geral de caixa). Vale também acompanha o salário a receber.
- **Multi-conta de banco:** suportar várias contas de banco; uma marcada como **destino padrão da venda**.

### 3.7 Travamento e correção

- Fechamento confirmado fica **travado** (`status = travado`).
- Correção tem **duas vias**, ambas sob permissão de gerente, ambas no log de auditoria:
  - **(a) Ajuste por cima:** lança um movimento de ajuste, deixa o fechamento errado como histórico. Rastro total.
  - **(b) Reabrir e recalcular:** reabre, edita, trava de novo; recalcula a cascata dos dias seguintes. Mais prático para erro de digitação.
- Toda reabertura/ajuste registra quem, quando e o quê.

### 3.8 Dia zero

Modo de abertura do sistema. Num dia D, cadastrar: saldo de cada conta, contagem inicial de cada produto, leitura atual de cada encerrante, nível de cada tanque, fiados em aberto e custos iniciais. Sem isso o primeiro fechamento não tem com o que comparar. Boa parte desses números já existe na planilha atual.

---

## 4. Personas e modelo de permissões

**Modelo: permissões por item (não por papel fixo).** Cada pessoa recebe um conjunto de permissões ligadas/desligadas individualmente. Existem **modelos prontos** (atalhos para preencher rápido), mas o que vale é o conjunto por pessoa. Pode haver **vários** vendedores e **vários** gerentes.

**Catálogo de permissões** (chaves):

| Chave | Permite |
|---|---|
| `fechar_caixa` | Criar e confirmar fechamento diário. |
| `registrar_venda_avulsa` | Lançar vendas individuais durante o dia. |
| `ver_painel_operacional` | Ver venda do dia/mês, nível de tanque, alertas. |
| `ver_capital` | Ver capital, gráficos de evolução. |
| `lancar_despesa` | Registrar despesas. |
| `transferir_entre_contas` | Transferências e depósitos. |
| `gerenciar_contas` | Criar/editar/desativar contas. |
| `ver_retiradas_socios` | Ver pró-labore, aportes, devoluções, saldo devedor. |
| `gerenciar_socios` | Registrar aportes/devoluções. |
| `gerenciar_fiado` | Conceder e baixar fiado. |
| `gerenciar_funcionarios` | Folha, vales, salários. |
| `cadastrar_produto` | Criar/editar/ativar/desativar produtos. |
| `definir_preco_custo` | Alterar preços e custos (com data/hora). |
| `gerenciar_combustivel` | Entradas e medições de tanque, config de tanque. |
| `reabrir_fechamento` | Reabrir/ajustar fechamento travado. |
| `editar_lancamentos_retroativos` | Editar/excluir despesas, entradas e lançamentos de **dias anteriores**. |
| `gerenciar_permissoes` | Criar usuários e atribuir permissões. |
| `ver_auditoria` | Ver log de auditoria. |
| `editar_configuracoes` | Troco, taxas de cartão, alertas, modo de apuração, etc. |

> **Acesso por conta (ACL fina, §6.1 `usuario_conta`):** além das permissões globais
> acima, cada usuário pode receber acesso **por conta** — `ver` ou `movimentar`.
> Sem linha em `usuario_conta`, valem as permissões globais (`transferir_entre_contas`,
> `gerenciar_contas`) como atalho. Com linha, restringe/concede conta a conta.
> Enforce: helpers `private.pode_ver_conta` / `private.pode_movimentar_conta` no RLS.

> **Foto e cargo (§6.1):** cada `usuario` tem `foto_url` (bucket `avatares`) e um
> `cargo` nomeado (Dono/Gerente/Vendedor…). O cargo aplica um **modelo** de
> permissões como ponto de partida; o que vale continua sendo o conjunto por
> pessoa. O gerente (`gerenciar_permissoes`) troca foto de todos; cada pessoa
> troca a própria. A criação de **login** (auth.users) passa pela Edge Function
> `admin-usuarios` (service_role no servidor — nunca no cliente).

**Modelos prontos sugeridos:**
- **Vendedor:** `fechar_caixa`, `registrar_venda_avulsa`, `ver_painel_operacional`, `lancar_despesa` (só conta dinheiro do dia), `gerenciar_fiado`. **Sem** capital, transferências, sócios, permissões.
- **Gerente (leitura):** todos os `ver_*`. Nada que escreve.
- **Gerente (completo):** tudo (o dono).

> Importante na UI: o que o vendedor **não pode ver** (capital, sócios) não deve nem aparecer no menu. Permissão controla **visibilidade**, não só ação. A barreira final é o **RLS no banco** (ver §7) — a UI esconde, o banco proíbe.

---

## 5. Requisitos funcionais por módulo

Cada módulo é uma seção na **sidebar**. Para cada um: objetivo, regras-chave e critérios de aceite.

### 5.1 Painel (Dashboard)
**Objetivo:** visão imediata do estado do negócio ao abrir o app.
Mostra: **venda do dia**, **venda do mês**, **litros vendidos no mês** (por combustível), **nível atual de cada tanque** (destaque visual — ver §8), **capital atual** (toggle operacional/total), **alertas** (estoque baixo, tanque baixo, fiados vencendo), e **gráfico de evolução do capital**. Gráficos onde agregam valor (capital no tempo, venda diária do mês). Respeita permissões: vendedor vê só o painel operacional.

### 5.2 Fechamento de caixa ⭐ (módulo central)
**Objetivo:** fechar o dia de forma **rápida e intuitiva**. Detalhe de UX em [§8.4](#84-o-fluxo-de-fechamento-rápido-detalhado).
Fluxo: (1) entrada rápida das contagens e leituras na **ordem fixa** (combustível → óleos → demais, agrupado por classe); (2) lançamento de entradas de mercadoria do dia (se houve); (3) o sistema calcula a venda física ao vivo; (4) lançamento de fiado/despesas em dinheiro do dia; (5) informe de PIX, cartão débito, cartão crédito; (6) **contagem do dinheiro** com o **valor a depositar em destaque**; (7) o sistema mostra a **diferença**, que é registrada como entrada/saída; (8) confirmação → fechamento travado e relatório gerado.
**Critérios:** Enter (ou botão grande no mobile) avança campos sempre na mesma ordem; teclado numérico no mobile; venda calculada em tempo real; impossível confirmar sem contar o dinheiro; ao confirmar, trava.

### 5.3 Relatório do caixa
**Objetivo:** o "espelho" do dia, como o da planilha.
Contém: **quantidade e valor de cada item vendido**; entradas de mercadoria do dia (se houve); despesas; venda fiado (se houve); total em PIX, dinheiro e cartão; **campo de dinheiro em destaque** para o depósito; diferença do dia; observações. Exportável (PDF/compartilhar).

### 5.4 Contas e transferências
**Objetivo:** saber onde está o dinheiro.
Lista de contas (dinheiro / banco) com **saldo derivado**. O saldo da conta **Caixa Físico** *é* o "dinheiro não depositado". Permite criar contas, transferir entre elas, e **depositar** (transferência dinheiro→banco). Multi-conta de banco; uma marcada como destino padrão da venda. Transferência é registrada em **partida dobrada** (debita origem, credita destino).

### 5.5 Despesas
**Objetivo:** registrar saídas categorizadas.
Categorias: **fornecedores, despesas, descontos, vales, perda, taxa de cartão, diferença de caixa** + tags livres para filtros. Toda despesa **referencia a conta de origem**. Perda e diferença de caixa são categorias especiais (perda não debita conta; ver §3.6). Filtro por categoria, tag, conta, período.

### 5.6 Produtos, preços e custos
**Objetivo:** catálogo e valores.
Cadastro de produto: nome, **categoria/classe**, unidade (fixa em "unidade" na v1, campo preparado para fração futura), **ordem** (define a sequência da contagem no fechamento), **modo de apuração** (contagem/individual), **limites de alerta** (baixo/muito baixo), **ativo/inativo** (inativo some das contagens e telas, mantém histórico).
**Preço:** histórico por data — `valido_a_partir_de`. **Alterar preço não muda fechamentos passados**; vale para o futuro a partir da data. **Custo:** histórico por data/hora — controlado manualmente pelo gerente.

### 5.7 Combustível e tanques
**Objetivo:** acompanhamento bem visível do nível.
Cadastro de tanque (combustível, capacidade, **nível de alerta**) e de bicos (vínculo ao tanque). **Entrada de combustível** (litros + custo/litro + data) — afeta o nível, não a venda. **Medição de tanque** (régua): várias por dia, com observação; mostra **divergência calculado × medido**. Nível em **destaque no painel** (visível também ao vendedor) com **alerta de nível baixo**.

### 5.8 Fiado (contas a receber)
**Objetivo:** controlar vendas concedidas (raro, mas existe).
Cadastro de cliente; concessão de fiado (vinculada ao fechamento); baixa por **recebimento** (entrada de dinheiro que quita, não é venda). Lista de fiados em aberto, total a receber, alertas de vencimento.

### 5.9 Funcionários e folha
**Objetivo:** salário e vales.
Cadastro de funcionário e **salário base**. **Vale** = adiantamento que **desconta do salário**. Setor mostra: quanto cada funcionário **já retirou em vales no mês**, e **quanto do salário ainda tem a receber** (`a_receber = salario_base − soma_vales_do_periodo`). Ciclo mensal com **data de corte editável** (prazo até dia 5 do mês seguinte; default pagar tudo no último dia). No fim, funcionário recebe `total_vales + restante_do_salário`. **Vendedores não veem retiradas de gerentes/sócios.**

### 5.10 Sócios e aportes
**Objetivo:** dinheiro injetado/retirado pelos sócios.
Registro de **aporte** (empréstimo ou aumento de capital, com conta de destino) e de **devolução** (amortiza o empréstimo). **Saldo devedor por sócio** acompanhado pelo sistema. Filtro do capital "com/sem aportes". Visível só a quem tem `ver_retiradas_socios`.

### 5.11 Configurações
**Objetivo:** parametrização pelo gerente.
- **Troco fixo** diário (editável).
- **Taxas de cartão** (débito/crédito: fixa + percentual).
- **Modo de apuração** padrão e por produto.
- **Alertas de estoque**: por produto, em quantidade, com criticidade **baixo / muito baixo / zerado**.
- **Alerta de nível** por tanque (em litros).
- **Data de corte da folha**.
- **Conta destino padrão da venda**.
- Ativar/desativar produtos.

### 5.12 Auditoria
**Objetivo:** rastro de tudo que mexe em dinheiro/estoque.
Log imutável: quem, quando, o quê, valores antes/depois. Inclui reaberturas e ajustes de fechamento.

---

## 6. Modelo de dados

Modelagem **orientada a eventos** (Pilar 1). Saldos, estoques e vendas são **views/consultas**, nunca colunas. Notação: tabelas em PT; tipos lógicos. Dinheiro em **centavos (bigint)**; volume em `numeric(14,3)`; IDs **UUIDv7**.

### 6.1 Identidade e permissões
```
usuario        (id, nome, email, auth_uid, ativo, criado_em,
                foto_url, cargo)                         -- foto (bucket avatares) e cargo (rótulo)
permissao      (chave, descricao)                        -- catálogo fixo (enum)
usuario_permissao (usuario_id → usuario, permissao_chave → permissao)
                  -- a concessão por item; PK composta
modelo_permissao (id, nome)                              -- atalhos (modelos prontos)
modelo_permissao_item (modelo_id, permissao_chave)
usuario_conta  (usuario_id → usuario, conta_id → conta,
                nivel ∈ {ver, movimentar})               -- ACL fina por conta; PK composta
```
> Criação de login via Edge Function `admin-usuarios` (service_role). Foto no
> Storage bucket `avatares` (`{usuario_id}/avatar.<ext>`, leitura pública).

### 6.2 Catálogo e configuração
```
categoria      (id, nome, ordem)                         -- combustível, óleos, bebidas, estivas...
produto        (id, nome, categoria_id → categoria, unidade='unidade',
                ordem, modo_apuracao ∈ {contagem, individual},
                alerta_baixo, alerta_muito_baixo, ativo, criado_em)
preco_produto  (id, produto_id → produto, valor_centavos, valido_a_partir_de DATE)
custo_produto  (id, produto_id → produto, valor_centavos, valido_a_partir_de TIMESTAMPTZ)

combustivel    (id, nome)                                -- gasolina, diesel
tanque         (id, combustivel_id → combustivel, nome, capacidade_litros,
                nivel_alerta_litros, ativo)
bomba          (id, tanque_id → tanque, nome, ativo)     -- bico
preco_combustivel (id, combustivel_id, valor_centavos, valido_a_partir_de DATE)
custo_combustivel (id, combustivel_id, valor_centavos, valido_a_partir_de TIMESTAMPTZ)

conta          (id, nome, tipo ∈ {dinheiro, banco},
                eh_destino_padrao_venda BOOL, ativo, criado_em)
socio          (id, nome, contato)
funcionario    (id, nome, salario_base_centavos, ativo)
cliente_fiado  (id, nome, contato)
categoria_despesa (id, nome, eh_especial BOOL)           -- especial: perda, taxa cartão, diferença
config         (chave, valor_json)                       -- troco fixo, taxas cartão, corte folha...
```

### 6.3 Eventos do livro físico
```
fechamento     (id, data DATE UNIQUE, status ∈ {aberto, confirmado, travado},
                troco_fixo_centavos, responsavel_id → usuario,
                observacao, confirmado_em, travado_em, criado_em)

contagem_produto (id, fechamento_id → fechamento, produto_id → produto,
                  quantidade NUMERIC)                    -- estado contado no dia
leitura_bomba    (id, fechamento_id → fechamento, bomba_id → bomba,
                  leitura NUMERIC(14,3))                  -- encerrante do dia

entrada_mercadoria (id, produto_id → produto, quantidade NUMERIC,
                    custo_unitario_centavos, data DATE,
                    fechamento_id → fechamento NULL, criado_em)
entrada_combustivel (id, tanque_id → tanque, litros NUMERIC(14,3),
                     custo_litro_centavos, data DATE, criado_em)
medicao_tanque   (id, tanque_id → tanque, litros_medidos NUMERIC(14,3),
                  data_hora TIMESTAMPTZ, observacao, criado_em)
perda            (id, produto_id → produto, quantidade NUMERIC,
                  motivo, data DATE, fechamento_id NULL, criado_em)
venda_avulsa     (id, produto_id → produto, quantidade NUMERIC,
                  valor_centavos, data_hora TIMESTAMPTZ, vendedor_id → usuario)
                  -- autoritativa só se produto.modo_apuracao = individual
```

### 6.4 Livro financeiro (razão)
```
movimento (id,
           tipo ∈ {recebimento_venda, despesa, transferencia, deposito,
                   prolabore, aporte_emprestimo, aporte_aumento,
                   devolucao_emprestimo, recebimento_fiado,
                   taxa_cartao, diferenca_caixa, vale, ajuste},
           conta_id → conta,                 -- conta afetada (debita/credita por sinal)
           valor_centavos BIGINT,            -- com sinal: + entra, − sai
           data_hora TIMESTAMPTZ,
           fechamento_id → fechamento NULL,
           categoria_despesa_id → categoria_despesa NULL,
           contraparte_conta_id → conta NULL,   -- transferência/depósito (perna oposta)
           socio_id → socio NULL,               -- aportes/devolução
           funcionario_id → funcionario NULL,   -- vale
           fiado_id → fiado NULL,               -- recebimento de fiado
           forma_pagamento ∈ {dinheiro, pix, debito, credito} NULL,
           descricao, tags TEXT[], criado_por → usuario, criado_em)
```
> **Transferência/depósito = partida dobrada:** dois `movimento` (saída na origem, entrada no destino), ligados por `contraparte_conta_id`. Garante que transferência **não cria nem destrói** dinheiro.

### 6.5 Fiado e sócios
```
fiado     (id, cliente_id → cliente_fiado, fechamento_id → fechamento,
           valor_centavos, data DATE, status ∈ {aberto, pago}, vencimento DATE NULL)
           -- baixa via movimento.tipo = recebimento_fiado, fiado_id = este

-- aportes/devoluções são movimentos (tipos aporte_* / devolucao_emprestimo, socio_id)
-- saldo devedor do sócio = Σ aporte_emprestimo − Σ devolucao_emprestimo (por socio)
```

### 6.6 Folha
```
-- vales são movimentos (tipo = vale, funcionario_id, forma_pagamento)
fechamento_folha (id, funcionario_id → funcionario, competencia DATE,
                  salario_base_centavos, total_vales_centavos,
                  a_receber_centavos, status ∈ {aberto, pago}, pago_em)
```

### 6.7 Auditoria
```
auditoria (id, entidade, entidade_id, acao ∈ {criar, editar, remover, reabrir, ajustar},
           usuario_id → usuario, dados_antes JSONB, dados_depois JSONB, criado_em)
```

### 6.8 Views derivadas (exemplos — a serem implementadas como queries/views)
```
saldo_conta(conta_id)        = Σ movimento.valor_centavos WHERE conta_id
estoque_atual(produto_id)    = Σ entradas − Σ vendido − Σ perdas (acumulado)
nivel_tanque(tanque_id)      = nivel_inicial + Σ entradas_litros − Σ litros_vendidos
fiado_em_aberto              = Σ fiado.valor WHERE status = aberto
saldo_devedor_socio(socio_id)= Σ aporte_emprestimo − Σ devolucao_emprestimo
custo_medio_produto(produto) = média ponderada das entradas (FIFO de custo por lote)
capital_total                = ativos − passivos (ver §3.5)
```

> **Nota de implementação:** vistas pesadas (capital no tempo, custo médio) podem ser materializadas/cacheadas por dia para performance, **desde que sempre reconstrutíveis** a partir dos eventos. Cache nunca é fonte de verdade.

---

## 7. Arquitetura e stack tecnológica

### 7.1 Decisão central: offline-first com Postgres + sync engine

A restrição que define a arquitetura é: **o vendedor precisa fechar o caixa mesmo sem internet** (estação à beira-rio) e sincronizar quando o sinal voltar. Isso exige um banco **local** no dispositivo, espelhado num banco central.

**Stack recomendada:**

| Camada | Escolha | Por quê |
|---|---|---|
| **Frontend** | **React + TypeScript + Vite**, como **PWA instalável** | Abre em notebook e celular, instala como app, funciona offline. Uma base de código para os dois alvos. |
| **Estilo** | **Tailwind CSS** | Rápido, consistente, ótimo para responsivo. |
| **Banco central** | **Supabase (PostgreSQL + Auth + RLS + Realtime)** | Postgres gerenciado, autenticação pronta, **Row Level Security** para as permissões, e você já conhece Supabase. |
| **Sync offline** | **PowerSync** | Dos engines de sync para Supabase, é o único com **suporte offline de primeira classe**: mantém um **SQLite local** no app, fila de upload, e sincroniza ao reconectar. Plano gratuito; **não exige mudança de schema** no Supabase. |
| **Migrations/schema** | **Supabase CLI** (ou Prisma para modelar) | Versionamento do schema Postgres. |

**Alternativas consideradas:** *ElectricSQL* (open-source, também Postgres↔SQLite, ótimo, mas o suporte offline e o tratamento de conflito do PowerSync são mais maduros para um requisito de negócio); *Zero* (excelente DX web, mas offline mais limitado); *RxDB/Dexie* (mais leve, porém sync artesanal). Para um app **financeiro** onde offline é requisito de negócio, **PowerSync vence**.

### 7.2 Por que o nosso modelo torna o sync quase livre de conflito

Sync offline normalmente sofre com conflitos (dois dispositivos editam o mesmo saldo). **No nosso desenho isso quase não existe**, porque:
- Os eventos são **imutáveis** e só são **inseridos** (append-only). Não há "editar saldo".
- Saldos/estoques são **derivados** — recalculados, não sobrescritos.
- O fechamento é **diário e único** (`data UNIQUE`), e tipicamente há **um** dispositivo fechando o caixa por vez.

Resultado: sincronizar é basicamente **unir dois conjuntos de eventos e re-derivar**. Onde houver concorrência rara, **last-write-wins** do PowerSync é suficiente; a regra `fechamento.data UNIQUE` previne dois fechamentos do mesmo dia.

### 7.3 Fluxo de dados (leitura e escrita)
- **Leitura:** o app lê do **SQLite local** (instantâneo, funciona offline). PowerSync mantém esse SQLite sincronizado com o Postgres via *sync rules* (define qual subconjunto vai para qual usuário).
- **Escrita:** o app escreve no SQLite local → PowerSync coloca na **fila de upload** → envia ao Supabase assim que houver conexão (via PostgREST/Edge Function).
- **Permissões:** *sync rules* controlam o que **desce** para cada usuário; **RLS** no Postgres é a **última linha de defesa** no que **sobe**. A UI esconde, o RLS proíbe.

### 7.4 Segurança e integridade
- **Autenticação:** Supabase Auth (PowerSync suporta os JWTs do Supabase nativamente).
- **Autorização:** RLS por usuário + permissões; validação de domínio em check constraints e na camada de serviço.
- **Dinheiro:** centavos inteiros; nenhuma operação financeira em float (lint/teste que barra `number` para dinheiro).
- **Imutabilidade:** eventos são insert-only; correção é novo evento ou reabertura logada.
- **Backup:** backups automáticos do Supabase + export periódico.

### 7.5 Estrutura de pastas sugerida (monorepo leve)
```
pontao-beira-rio/
├── AGENTS.md                      # este documento (fonte canônica)
├── CLAUDE.md                      # → aponta para AGENTS.md
├── apps/
│   └── web/                       # PWA React+TS+Vite
│       ├── src/
│       │   ├── domain/            # ⭐ núcleo de cálculo (puro, testável, sem UI)
│       │   │   ├── caixa.ts       # equação do caixa, diferença
│       │   │   ├── venda.ts       # combustível, produto, modos
│       │   │   ├── capital.ts     # total/operacional, custo médio
│       │   │   ├── tanque.ts      # nível calculado, divergência
│       │   │   └── __tests__/     # testes da lógica (Fase 2)
│       │   ├── data/              # PowerSync schema, queries, repositórios
│       │   ├── features/          # módulos/telas (§5)
│       │   ├── components/        # UI compartilhada (medidor de tanque, etc.)
│       │   └── lib/               # money, datas (Manaus), uuidv7
│       └── ...
├── supabase/
│   ├── migrations/                # schema Postgres versionado
│   └── seed/                      # dia zero + dados de teste (validação R$0,10)
└── docs/                          # specs por módulo, ADRs
```

---

## 8. Design / UI / UX

> Carregar a skill `frontend-design` antes de construir telas. As diretrizes abaixo são a direção fixa; os agentes não devem cair nos defaults genéricos de "SaaS dashboard".

### 8.1 Princípio de design
Isto **não é uma landing page** — é um **cockpit operacional** de um posto à beira-rio. As prioridades, nesta ordem: **velocidade de digitação** (fechar caixa), **legibilidade de números** (colunas alinhadas, sem ambiguidade), **destaque do que importa agora** (dinheiro a depositar, nível do tanque, diferença). Elegância aqui é precisão e clareza, não enfeite.

### 8.2 Tokens visuais (direção)
- **Paleta:** base petróleo/ardósia (remete a combustível, séria e legível) — `#0F1A24` (fundo escuro do painel), `#1C2C3A`, `#E8EDF2` (texto claro); **um** acento de ação/energia `#F4A024` (âmbar — usado com parcimônia, para o "a depositar" e CTAs); semânticos `#2FA86A` (positivo), `#D9544D` (negativo/alerta), `#E6B800` (atenção). Modo claro para telas de digitação longa (contagem) — fundo `#F7F9FB`, texto `#16242F`.
- **Tipografia:** display/títulos com uma fonte de caráter (ex.: *Space Grotesk* ou *Sora*) usada com restrição; corpo neutro e legível (*Inter*); **números com fonte de tabular numerals** (ex.: *IBM Plex Mono* ou Inter com `font-variant-numeric: tabular-nums`) — **crítico** para colunas de valores alinharem na contagem.
- **Estrutura:** rótulos por **classe de produto** (combustível, óleos, bebidas, estivas) como divisores reais — encodam a ordem da contagem, não decoração.

### 8.3 Layout responsivo (notebook + celular)
- **Notebook:** sidebar fixa à esquerda com as seções (§5); conteúdo em grade. Painel com cartões e gráficos.
- **Celular:** sidebar vira **drawer**; navegação principal em **bottom-nav** com os 4–5 itens mais usados (Painel, Fechar Caixa, Contas, Mais). Botões grandes (alvo ≥ 44px). Teclado **numérico** nos campos de valor.
- **Componente-assinatura:** o **medidor de tanque** — uma representação vertical de nível (gasolina e diesel lado a lado), preenchimento proporcional, faixa de alerta destacada, número grande de litros e % da capacidade. É o elemento memorável do painel e o que o vendedor olha primeiro.

### 8.4 O fluxo de fechamento rápido (detalhado)
Este é o fluxo mais usado e o que mais precisa ser bom.

1. **Lista ordenada e agrupada:** combustível (leituras de bomba) no topo, depois óleos, depois demais classes — **sempre na mesma ordem** (a `produto.ordem`), espelhando a sequência física da contagem.
2. **Um campo em foco por vez.** Digitou o valor → **Enter** (ou **botão "Próximo" grande**, no mobile) → foco pula para o próximo na ordem. Sem mouse, sem rolar procurando.
3. **Cálculo ao vivo:** ao lado/abaixo, a venda física vai sendo somada conforme você digita (feedback imediato; ajuda a perceber erro grosseiro na hora).
4. **Entradas do dia:** atalho para lançar entrada de mercadoria/combustível que chegou (entra no cálculo do produto; combustível só no nível).
5. **Pagamentos:** campos para PIX, cartão débito, cartão crédito, fiado concedido, despesas em dinheiro do dia.
6. **Contar o dinheiro:** campo de **dinheiro contado**, e o sistema exibe o **valor a depositar em DESTAQUE** (cartão grande, âmbar) — é o número que o vendedor leva pra máquina de depósito.
7. **Diferença:** mostrada com clareza (verde sobra / vermelho falta), registrada como entrada/saída na categoria "Diferença de caixa".
8. **Confirmar:** trava o fechamento e abre o relatório.

> Microcópia da interface: verbos diretos, voz ativa, mesmo nome do começo ao fim do fluxo ("Confirmar fechamento" → toast "Fechamento confirmado"). Estados vazios e de erro orientam a ação ("Conte o dinheiro da gaveta para continuar"), nunca culpam nem ficam vagos.

### 8.5 Acessibilidade e qualidade-base
Responsivo até o celular; foco de teclado visível (essencial — o fechamento é teclado-first); `prefers-reduced-motion` respeitado; contraste AA nos números; alvos de toque adequados.

---

## 9. Roadmap de desenvolvimento (passo a passo)

Filosofia para desenvolvimento assistido por IA: **fatias verticais pequenas**, cada uma **testável e entregável**, **schema e lógica antes de UI**, e a **lógica financeira coberta por testes antes de qualquer tela** (é onde mora o risco). Cada fase termina numa **Definição de Pronto (DoD)**.

### Fase 0 — Fundação e contexto canônico
**Objetivo:** repositório, contexto dos agentes e esqueleto rodando.
**Entregáveis:** repo + estrutura de pastas (§7.5); `AGENTS.md` (este doc) + `CLAUDE.md`; projeto Supabase criado; PWA React+TS+Vite "hello world" instalável; Tailwind + tokens (§8.2); libs de `money` (centavos), datas (Manaus) e `uuidv7`; MCPs configurados (Supabase, Gemini Docs).
**DoD:** app abre offline no celular e no notebook; agentes leem o AGENTS.md; lint barra float em dinheiro.

### Fase 1 — Modelo de dados e migrations
**Objetivo:** todas as tabelas (§6) + RLS esqueleto + dia zero/seed.
**Entregáveis:** migrations Postgres com todas as entidades; políticas RLS por permissão (esqueleto); seed do **dia zero** e o **caso de validação R$0,10**; PowerSync conectado com sync rules iniciais e SQLite local espelhando.
**DoD:** dá para inserir um fechamento no local e vê-lo sincronizar ao Supabase (e vice-versa); seed carrega sem erro.

### Fase 2 — Núcleo de domínio (o motor de cálculo)
**Objetivo:** ⭐ a parte de maior risco, construída **test-first**.
**Entregáveis:** `domain/` puro (sem UI, sem banco): `venda` (combustível por encerrante; produto por contagem com entradas e perdas; modo individual), `caixa` (equação §3.3 e diferença), `capital` (total/operacional, custo médio ponderado §3.5), `tanque` (nível calculado e divergência). **Suíte de testes** cobrindo a tabela §3.4 e cada caso especial §3.6.
**DoD:** **o teste da planilha real passa** (`esperado 2.154,90`, `contado 2.155,00`, `diferença +0,10`); todos os cenários de [§11](#11-critérios-de-aceite-e-cenários-de-teste) verdes. **Nenhuma tela ainda.**

### Fase 3 — Autenticação e permissões
**Objetivo:** login e o modelo de permissões por item.
**Entregáveis:** Supabase Auth; catálogo de permissões; atribuição por usuário + modelos prontos; RLS aplicado de fato; UI que **esconde** o que a permissão não permite.
**DoD:** um vendedor logado não vê (nem por URL, nem por sync) capital/sócios; gerente vê tudo.

### Fase 4 — Catálogo e configuração
**Objetivo:** produtos, preços, custos, contas, categorias, configurações.
**Entregáveis:** telas dos módulos 5.6, 5.4 (cadastro de contas), 5.11; histórico de preço/custo por data (sem reescrever passado); ordem da contagem; modo de apuração; alertas; troco; taxas de cartão.
**DoD:** dá para cadastrar todo o catálogo do Pontão real e configurar parâmetros.

### Fase 5 — Fechamento de caixa + relatório ⭐
**Objetivo:** o fluxo central (§5.2, §8.4) e o relatório (§5.3).
**Entregáveis:** entrada rápida teclado-first/botão; cálculo ao vivo; pagamentos; contagem de dinheiro com "a depositar" em destaque; diferença; travamento; relatório espelho exportável.
**DoD:** fechar um dia real em ≤ 3 min; relatório bate com o motor da Fase 2; fechamento trava ao confirmar.

### Fase 6 — Livro financeiro (UI)
**Objetivo:** contas, transferências, depósitos, despesas, aportes, devoluções.
**Entregáveis:** módulos 5.4 (transferências/partida dobrada), 5.5, 5.10; taxa de cartão automática; saldo derivado por conta; "dinheiro não depositado" = saldo do Caixa Físico.
**DoD:** transferência não cria/destrói dinheiro; despesa em dinheiro do dia afeta o esperado; saldo devedor de sócio correto.

### Fase 7 — Fiado e folha
**Objetivo:** contas a receber e salários/vales.
**Entregáveis:** módulos 5.8 e 5.9; recebimento de fiado como entrada (não venda); vale descontando salário; fechamento mensal com corte editável.
**DoD:** pagar um fiado não infla a venda do dia; `a_receber = salario − vales` correto.

### Fase 8 — Painel e alertas
**Objetivo:** visão executiva (§5.1) e alertas.
**Entregáveis:** KPIs (venda dia/mês, litros/mês, capital com toggle); medidor de tanque (componente-assinatura); gráfico de evolução do capital; alertas de estoque (baixo/muito baixo/zerado) e de tanque (visível ao vendedor).
**DoD:** painel reflete o estado real em tempo (quase) real; alertas disparam nos limites configurados.

### Fase 9 — Endurecimento offline (PWA + sync)
**Objetivo:** garantir o requisito de negócio offline.
**Entregáveis:** instalação PWA polida; fila de upload robusta; indicadores de "salvando/sincronizado/offline"; testes de cenário (fechar offline → reconectar → sincronizar sem perda); `fechamento.data UNIQUE` defendendo concorrência.
**DoD:** fechar o caixa em avião/sem sinal e sincronizar depois sem inconsistência; nenhum dado perdido.

### Fase 10 — Auditoria, correção e polimento
**Objetivo:** rastreabilidade e acabamento.
**Entregáveis:** log de auditoria (§5.12); reabertura/ajuste de fechamento com recálculo em cascata e log; revisão de UX/acessibilidade; export/relatórios; testes E2E.
**DoD:** toda alteração financeira é rastreável; correção retroativa recalcula corretamente e fica logada.

---

## 10. Trabalhando com Claude Code + Antigravity

> **Nota de ferramenta (junho/2026):** o Gemini CLI e as extensões do Gemini Code Assist para a camada gratuita/individual foram **substituídos pelo Antigravity CLI e Antigravity 2.0** a partir de 18/06/2026 — então o "Gemini" deste projeto é o **Antigravity** (que você já usa), rodando os modelos **Gemini 3.x** (3.1 Pro para raciocínio/coding pesado; 3.5 Flash, mais barato e forte em tarefas agênticas). O Claude Code usa **Claude Opus 4.8** (tarefas complexas) e **Sonnet 4.6** (volume). Ambos leem `AGENTS.md`, suportam MCP, skills, hooks e subagents. Confirme versões/modelos atuais na documentação oficial antes de fixar números.

### 10.1 Divisão de trabalho sugerida entre os dois
Use cada um onde ele é mais forte, ambos guiados por **este mesmo `AGENTS.md`**:

| Tarefa | Ferramenta preferida | Motivo |
|---|---|---|
| Núcleo de domínio + testes (Fase 2) | **Claude Code (Opus 4.8)** | Craftsmanship e rigor; aqui o erro custa caro. |
| Migrations, schema, RLS, sync rules | **Claude Code** ou **Antigravity** | Tarefa estrutural; revisar a saída com cuidado. |
| Geração de telas/CRUD repetitivo | **Antigravity (3.5 Flash)** | Rápido e barato em volume agêntico. |
| Exploração ampla do codebase / contexto grande | **Antigravity (3.x, 1M tokens)** | Janela de contexto enorme. |
| Revisão de PR / refino de qualidade | **Claude Code** | Saída de alta qualidade, próximo do humano. |

> A regra acima é guia, não dogma. O importante é: **specs e testes antes do código**, e **revisar** o que qualquer agente gerar — principalmente em lógica financeira.

### 10.2 Conteúdo mínimo do `AGENTS.md`
Este documento **é** o AGENTS.md. Garanta que ele contenha (já contém): os dois pilares (§0), as convenções de código (§0), o glossário (§2), as regras de negócio com fórmulas (§3), o modelo de dados (§6), a stack (§7) e o roadmap (§9). Adicione no topo do repositório uma seção curta "**Working Agreement**":
- Toda mudança em lógica financeira exige teste correspondente.
- Dinheiro só em centavos; datas só em America/Manaus; IDs só UUIDv7.
- Saldos/estoques/vendas são **derivados** — proibido criar coluna de saldo.
- Commits pequenos e descritivos; um PR por fatia vertical.
- "Definition of Done" da fase tem que estar verde antes de avançar.

### 10.3 MCPs e skills recomendados
- **Supabase MCP** — para os agentes inspecionarem/migrarem o banco com contexto real.
- **Gemini Docs MCP** (`gemini-api-docs-mcp`) — mantém o Antigravity atualizado sobre APIs Gemini, se você usar a API.
- **Skill `frontend-design`** (Claude Code) — antes de construir telas.
- Hooks/subagents: use subagents para tarefas paralelas (ex.: gerar testes enquanto outro gera a tela), mas **um agente humano-no-loop** revisa o merge.

### 10.4 Fluxo de trabalho por fatia (spec → test → code → review)
1. Escreva/atualize a **spec** da fatia em `docs/` (ou aponte para a seção deste doc).
2. Peça ao agente os **testes** primeiro (Fase 2 e qualquer lógica financeira).
3. Peça a **implementação** até os testes passarem.
4. **Revise** (você ou Claude Code) contra a DoD e as regras §3.
5. Commit pequeno; siga para a próxima fatia.

---

## 11. Critérios de aceite e cenários de teste

Estes cenários são **obrigatórios** e devem virar testes automatizados na Fase 2 (lógica) e Fases 5–10 (E2E).

### Lógica financeira (Fase 2)
1. **Validação da planilha real (âncora):** venda física `2.204,90`; despesa em dinheiro `50,00`; PIX `383,00`; dinheiro contado `1.772,00`; fiado `0`. → `esperado = 2.154,90`, `diferença = +0,10`. **Deve passar.**
2. **Combustível por encerrante:** leitura anterior `1.485.284`, atual `1.485.561`, preço `R$7,70/L` → `277 L`, `R$2.132,90`. Entrada de combustível no dia **não** altera a venda.
3. **Produto por contagem com entrada:** estoque ant. `100`, entrada `50`, estoque atual `120`, perda `0` → vendido `30`. Com perda `5` → vendido `25`.
4. **Fiado concedido:** reduz o `dinheiro_esperado` no valor do fiado; cria "a receber".
5. **Recebimento de fiado:** entra como dinheiro, **não** soma na venda do dia; quita o recebível.
6. **Taxa de cartão:** crédito bruto `R$100`, taxa `3% + R$0,10` → líquido no banco `R$96,90`; despesa "Taxa de cartão" `R$3,10`; venda registra `R$100`.
7. **Transferência (partida dobrada):** mover `R$500` Caixa→Bradesco não altera o capital; soma dos saldos constante.
8. **Aporte empréstimo:** caixa `+`, capital operacional inalterado, saldo devedor do sócio `+`. **Devolução** reverte o devedor e não mexe no capital.
9. **Aporte aumento de capital:** caixa `+`, capital **total** `+`, operacional inalterado.
10. **Pró-labore em dinheiro:** reduz caixa e capital; entra no `dinheiro_esperado` como saída; **não** toca saldo devedor.
11. **Perda:** reduz estoque e capital; **não** debita conta; aparece no relatório de despesas; **não** vira venda fantasma.
12. **Diferença de caixa:** sobra/falta registrada na categoria própria; série histórica consultável.
13. **Custo histórico:** alterar custo com `valido_a_partir_de` não muda lucro de fechamentos anteriores.
14. **Preço histórico:** alterar preço não reescreve valores de fechamentos passados.

### Fluxo / E2E (Fases 5–10)
15. Fechar um dia completo por teclado em ≤ 3 min; ao confirmar, o relatório bate com o motor.
16. Vendedor **não** acessa capital/sócios (UI e sync).
17. Fechar **offline** e sincronizar ao reconectar, sem perda nem duplicidade; dois fechamentos do mesmo dia são impedidos.
18. Reabrir um fechamento antigo recalcula os dias seguintes e registra auditoria.
19. Alerta de estoque dispara em "baixo/muito baixo/zerado"; alerta de tanque aparece para o vendedor no nível configurado.

---

## 12. Apêndice: checklist de arranque

- [ ] Criar repo e estrutura de pastas (§7.5).
- [ ] Salvar este documento como `AGENTS.md`; criar `CLAUDE.md` apontando para ele.
- [ ] Criar projeto no Supabase; configurar Auth.
- [ ] Configurar PowerSync (conta, instância, sync rules iniciais) ligado ao Supabase.
- [ ] Scaffold PWA React+TS+Vite + Tailwind + tokens (§8.2); validar instalação no celular e offline.
- [ ] Implementar libs `money` (centavos), datas (Manaus), `uuidv7`; lint barrando float em dinheiro.
- [ ] Conectar MCPs (Supabase, Gemini Docs) ao Claude Code e ao Antigravity.
- [ ] Escrever migrations de todas as tabelas (§6) + RLS esqueleto.
- [ ] Seed do **dia zero** + caso de validação **R$0,10**.
- [ ] **Fase 2 primeiro:** núcleo de domínio com testes, incluindo a âncora da planilha.
- [ ] Só então avançar para telas (Fases 3+), uma fatia vertical por vez.

---

*Fim da especificação mestre. Atualize este documento antes do código sempre que uma regra mudar — ele é a fonte de verdade que orienta os agentes.*
