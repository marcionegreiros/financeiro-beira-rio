# Working Agreement

Regras inegociáveis para qualquer pessoa **ou agente de IA** que trabalhe neste
repositório (§10.2 da spec). Derivam dos **dois pilares** (§0).

## Os dois pilares

1. **Nada de saldo editável. Tudo é derivado de eventos.** O sistema guarda
   eventos imutáveis (contagens, leituras de bomba, movimentos) e **calcula**
   saldos/estoques/vendas. **Proibido criar coluna ou variável de saldo mutável.**
2. **Caixa, capital e dívida são três livros separados.** A tabela mestra §3.4
   diz o que cada movimento afeta. Toda função financeira a consulta.

## Regras de código

- **Toda mudança em lógica financeira exige teste correspondente.** O núcleo de
  domínio é **test-first** (Fase 2).
- **Dinheiro só em centavos** (`bigint`, tipo `Centavos`). **NUNCA float.**
  Reforçado por:
  - **Tipos branded** (`Centavos`, `Mililitros`) — atribuir `number` é erro de tipo.
  - **Regra ESLint `no-float-money`** ([../eslint-rules/no-float-money.js](../eslint-rules/no-float-money.js))
    aplicada a `domain/**` e `lib/money.ts`: barra `parseFloat` e literais decimais.
- **Volume só em mililitros inteiros** (`bigint`, tipo `Mililitros`).
- **Datas só em America/Manaus** (UTC−4, sem horário de verão) — use `lib/datas`.
- **IDs só UUIDv7** gerados no cliente — use `lib/uuidv7`.
- Conceitos de **domínio em português**; termos técnicos em **inglês**.
- Formatação para R$/litros só na **borda de exibição** (`formatReais`, `formatLitros`).

## Fluxo por fatia (spec → test → code → review)

1. Atualize a **spec/doc** da fatia (ou aponte para a seção de `AGENTS.md`).
2. Peça os **testes** primeiro (lógica financeira sempre).
3. Implemente até os testes passarem.
4. **Revise** contra a Definition of Done e as regras §3.
5. Commit pequeno e descritivo; **um PR por fatia vertical**.

## Definition of Done

- A **DoD da fase** (ver [roadmap.md](./roadmap.md)) está verde antes de avançar.
- `pnpm test`, `pnpm typecheck` e `pnpm lint` passam.
- Nenhuma regra deste documento foi violada.

## Para agentes de IA (Claude Code + Antigravity)

- Leia `AGENTS.md` por inteiro antes de agir. Não contradiga a spec; se algo
  estiver errado nela, **corrija a spec primeiro**.
- Núcleo de domínio e lógica financeira: capriche (o erro custa caro aqui).
- Revisão humana no merge, principalmente em dinheiro.
