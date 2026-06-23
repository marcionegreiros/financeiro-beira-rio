# `features/` — módulos/telas (placeholder)

Cada subpasta é um módulo da sidebar (§5 da spec). Implementados das **Fases 4 a 8**:

| Módulo                              | Fase | Seção      |
| ----------------------------------- | ---- | ---------- |
| `painel/` (dashboard + alertas)     | 8    | §5.1       |
| `fechamento/` ⭐ (fluxo central)    | 5    | §5.2, §8.4 |
| `relatorio/` (espelho do dia)       | 5    | §5.3       |
| `contas/` (contas e transferências) | 4/6  | §5.4       |
| `despesas/`                         | 6    | §5.5       |
| `produtos/` (preços e custos)       | 4    | §5.6       |
| `combustivel/` (tanques e bicos)    | 4/8  | §5.7       |
| `fiado/`                            | 7    | §5.8       |
| `funcionarios/` (folha e vales)     | 7    | §5.9       |
| `socios/` (aportes)                 | 6    | §5.10      |
| `configuracoes/`                    | 4    | §5.11      |
| `auditoria/`                        | 10   | §5.12      |

> As telas consomem o núcleo de [`../domain`](../domain) e a camada de
> [`../data`](../data). A permissão controla **visibilidade** (§4): o que o
> usuário não pode ver nem aparece no menu.
