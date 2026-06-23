# Documentação — Pontão Beira Rio

A **fonte única de verdade** é [`../AGENTS.md`](../AGENTS.md) (a especificação
mestre). Os documentos abaixo são a documentação **viva** de evolução: regras de
trabalho, decisões, e o estado do projeto. Quando uma regra mudar, **atualize o
documento antes do código**.

## Índice

| Documento                                          | Para quê                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| [working-agreement.md](./working-agreement.md)     | Como trabalhamos (regras inegociáveis para humanos e agentes de IA). |
| [glossario.md](./glossario.md)                     | Linguagem ubíqua — vocabulário oficial do domínio.                   |
| [arquitetura.md](./arquitetura.md)                 | Stack, camadas e fluxo de dados offline-first.                       |
| [modelo-de-dados.md](./modelo-de-dados.md)         | Entidades, eventos e views derivadas.                                |
| [roadmap.md](./roadmap.md)                         | Fases de desenvolvimento e estado atual.                             |
| [criterios-de-aceite.md](./criterios-de-aceite.md) | Cenários obrigatórios ↔ testes.                                      |
| [adr/](./adr/)                                     | Architecture Decision Records (decisões com justificativa).          |

## Mapa rápido do código

- ⭐ [`apps/web/src/domain/`](../apps/web/src/domain/) — núcleo de cálculo puro (testado).
- [`apps/web/src/lib/`](../apps/web/src/lib/) — `money` (centavos), `datas` (Manaus), `uuidv7`.
- [`apps/web/src/{data,features,components}/`](../apps/web/src/) — placeholders das próximas fases.
- [`supabase/`](../supabase/) — banco central (Fase 1).
