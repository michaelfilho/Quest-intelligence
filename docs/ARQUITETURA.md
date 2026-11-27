# Arquitetura

```
n8n (futuro) ──qi_ingest──► PostgreSQL quest_rinne ◄──qi_reader (somente leitura)── API (Express/TS) ◄── nginx ◄── Traefik/Tailscale
                            core · ingest · audit                                     │                  (React)
                            app  ◄──────────────qi_app──────────────────────────────┘
```

| camada | faz | não faz |
|---|---|---|
| **frontend/** (React, Vite, Tailwind, TanStack Query, Recharts) | telas, filtros na URL, gráficos, tabelas, relatórios e impressão | acessar o banco, decidir permissões |
| **server/** (Node 24, Express 5, Zod, `pg`) | autenticação, autorização, consultas, cálculos, relatórios, auditoria | gravar dados empresariais, SQL livre |
| **PostgreSQL** | única persistência ([MODELAGEM_POSTGRESQL.md](MODELAGEM_POSTGRESQL.md)) | — |
| **n8n** | integração ([CONTRATOS_N8N.md](CONTRATOS_N8N.md)) | cálculos, acesso a `app` |

Duas conexões separadas: `store.ts` (schema `app`, leitura e escrita) e `db.ts` (dados, somente leitura, `default_transaction_read_only`).

## Catálogo e rastreabilidade

[shared/catalog.ts](../shared/catalog.ts) é a fonte única de módulos, indicadores, gráficos e tabelas. Cada resultado traz status (`OK`, `INSUFFICIENT_DATA`, `NOT_IMPLEMENTED`, `DATABASE_UNAVAILABLE`, `FORBIDDEN`, `ERROR`), confiabilidade, período e limitações. Ausência de informação nunca vira zero: com o banco vazio, valores aparecem como "Sem registros" e contagens de cadastro como zero.

`schema.ts` consulta o catálogo do PostgreSQL (cache de cinco minutos) e os mapeamentos em `mappings.ts` só executam com colunas e relacionamentos comprovados.

## Estrutura

```
shared/      catalog.ts · contracts.ts · permissions.ts · management.ts
server/db/   bootstrap.sql · migrations/
server/src/  app.ts · auth.ts · authz.ts · admin.ts · access.ts · store.ts · db.ts · migrate.ts
             services.ts · mappings.ts · reports.ts · management-registries.ts · cli.ts
frontend/src/ main.tsx · nav.ts · lib.ts · pages/ · components/
deploy/      install.sh · update.sh · prepare-release.sh · check-release.sh · render-release.cjs · reconcile.cjs · backup.sh
```
