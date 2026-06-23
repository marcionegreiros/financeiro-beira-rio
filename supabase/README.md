# `supabase/` — banco central

Schema **escrito e validado offline** contra Postgres 16 (via Docker). Ainda
**não provisionado** na nuvem — isso precisa das suas credenciais (Fase 1).

```
supabase/
├── config.toml                 # config mínima do Supabase CLI
├── migrations/                 # schema Postgres versionado (§6) + RLS
│   ├── …_identidade_catalogo.sql
│   ├── …_eventos_fisico.sql
│   ├── …_livro_financeiro.sql
│   ├── …_auditoria_views.sql
│   ├── …_rls.sql               # RLS esqueleto + helper tem_permissao
│   └── …_catalogo_permissoes.sql
├── seed/dia_zero.sql           # dia zero (§3.8) + catálogo do Pontão
└── powersync/sync-rules.yaml   # sync rules (esqueleto)
```

## Estado

- ✅ Migrations cobrindo todas as entidades do [modelo de dados](../docs/modelo-de-dados.md)
  (§6): identidade/permissões, catálogo, eventos do livro físico, livro
  financeiro (razão), fiado, folha, auditoria, e views derivadas triviais
  (`vw_saldo_conta`, `vw_fiado_em_aberto`, `vw_saldo_devedor_socio`).
- ✅ **RLS** esqueleto (§4, §7.3): habilitado em todas as tabelas, leitura-base
  para o operacional, sensível (sócios/folha/auditoria) gated por permissão.
- ✅ **Seed do dia zero** — saldos derivados conferem (`vw_saldo_conta` mostra
  Caixa R$500,00 e Bradesco R$15.000,00 calculados dos movimentos).
- ✅ **Sync rules** PowerSync (esqueleto): bucket global do operacional.
- ⏳ **Provisionamento** (precisa de credenciais), **wiring do cliente**
  (PowerSync + connector em `apps/web/src/data/`) e **tipos TS** do schema.

## Como aplicar (Fase 1, quando for provisionar)

```bash
# 1. Validar localmente sem nuvem (precisa de Docker):
docker run -d --name pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pontao postgres:16
for f in supabase/migrations/*.sql; do docker exec -i pg psql -U postgres -d pontao -v ON_ERROR_STOP=1 < "$f"; done
docker exec -i pg psql -U postgres -d pontao -v ON_ERROR_STOP=1 < supabase/seed/dia_zero.sql
#   (em Postgres puro, crie antes `schema auth` + `auth.uid()` e os roles
#    anon/authenticated/service_role, que o Supabase já fornece.)

# 2. Na nuvem, com Supabase CLI:
supabase link --project-ref <ref>
supabase db push                      # aplica migrations
psql "$DATABASE_URL" -f supabase/seed/dia_zero.sql

# 3. PowerSync: criar instância, apontar para o Postgres do Supabase e subir
#    powersync/sync-rules.yaml.
```

## Princípios que o schema respeita (Pilar 1)

Saldos/estoques/vendas são **views/queries** (§6.8), nunca colunas mutáveis.
Eventos são **insert-only**; correção é novo evento ou reabertura logada.
Dinheiro em `bigint` (centavos); volume em `numeric(14,3)`; IDs UUIDv7.
