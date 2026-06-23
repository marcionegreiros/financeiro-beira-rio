# Glossário / Linguagem ubíqua

Vocabulário **oficial** do domínio (§2 da spec). Usar exatamente assim em código,
telas e conversa com os agentes. Espelha os termos canônicos de
[`../AGENTS.md`](../AGENTS.md) §2 — em caso de divergência, vale o AGENTS.md.

| Termo                          | Definição curta                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Encerrante**                 | Leitura cumulativa e crescente da bomba. Venda de combustível = diferença entre leituras.                                               |
| **Bomba (bico)**               | Ponto de saída de combustível. Vários bicos por tanque são suportados.                                                                  |
| **Tanque**                     | Reservatório físico. Tem nível, capacidade e alerta de nível baixo.                                                                     |
| **Medição de tanque**          | Aferição física (régua). Reconcilia contra o nível calculado.                                                                           |
| **Fechamento**                 | Evento diário que lê o físico (contagens + encerrantes) e gera venda + recebimento. O cruzamento dos dois livros.                       |
| **Contagem**                   | Quantidade de um produto contada num fechamento. Venda deriva da diferença entre contagens.                                             |
| **Modo de apuração**           | Por produto: **contagem** (diferença de estoque = venda) ou **individual** (venda manual = venda). Combustível é sempre por encerrante. |
| **Venda avulsa**               | Venda registrada manualmente no dia. Em _contagem_ é só conferência; em _individual_ é a venda oficial.                                 |
| **Conta**                      | Onde o dinheiro fica: **dinheiro** (gaveta) ou **banco**. Saldo = soma dos movimentos.                                                  |
| **Movimento**                  | Lançamento no livro financeiro (recebimento, despesa, transferência, etc.).                                                             |
| **Depósito**                   | Transferência de conta dinheiro → conta banco.                                                                                          |
| **Fiado**                      | Venda concedida sem receber na hora. Sai do estoque hoje; dinheiro entra no pagamento futuro.                                           |
| **Diferença de caixa**         | `dinheiro_contado − dinheiro_esperado`. Sobra ou falta. Categoria própria.                                                              |
| **Aporte de sócio**            | Injeção de dinheiro: **empréstimo** (gera dívida) ou **aumento de capital** (vira patrimônio).                                          |
| **Pró-labore / retirada**      | Saída de dinheiro para uso/remuneração. Reduz capital. **Não** amortiza empréstimo.                                                     |
| **Vale**                       | Adiantamento de salário ao funcionário. Desconta do salário no fechamento mensal.                                                       |
| **Perda**                      | Baixa de estoque sem venda. Reduz estoque (e capital via estoque), mas **não** debita conta.                                            |
| **Capital total (patrimônio)** | Ativos − Passivos. Inclui aumentos de capital.                                                                                          |
| **Capital operacional**        | Capital total menos os aumentos de capital líquidos: o que o negócio gerou sozinho.                                                     |
| **Dia zero**                   | Cadastro inicial de saldos, contagens, encerrantes, níveis e fiados em aberto.                                                          |
