# `data/` — camada de dados (placeholder)

Entra na **Fase 1** (ver [docs/roadmap.md](../../../../docs/roadmap.md)).

Responsável por:

- **Schema PowerSync** e o **SQLite local** (offline-first, §7.3 da spec).
- **Queries / repositórios** que leem do SQLite local e escrevem na fila de upload.
- As **views derivadas** (§6.8): `saldo_conta`, `estoque_atual`, `nivel_tanque`,
  `capital_total`, etc. — sempre calculadas a partir dos eventos, nunca
  armazenadas como saldo mutável (Pilar 1).

> Regra: nada aqui pode contradizer o núcleo de domínio em [`../domain`](../domain).
> O domínio calcula; a camada de dados só persiste e busca eventos.
