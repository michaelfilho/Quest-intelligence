# Arquitetura do QUEST RINNE 1.0

## Integração em tempo de execução

`schema.ts` consulta o catálogo PostgreSQL pela conexão já existente, com cache de estrutura em memória de cinco minutos. O CLI `introspect` usa a mesma descoberta. `mappings.ts` registra consultas de `analytics.ts`, `cash.ts`, `quality.ts` e `registry-counts.ts`; colunas e tipos precisam corresponder a perfis explícitos. Não existe reconhecimento de fórmulas por heurística nem cópia dos registros para outro banco.

São 53 indicadores com SQL condicional, 21 gráficos e 17 tabelas; os demais 25 indicadores têm limitações explícitas. Nenhum foi certificado com dados reais nesta execução. Resultados parciais e em reconciliação carregam período, campo temporal, cobertura, exclusões e limitações. Fotografias de cadastro/monitoramento não fabricam comparação histórica.

A interface atualiza consultas a cada 60 segundos enquanto ativa. O n8n continua somente alimentando o PostgreSQL existente. O backend permanece intermediário obrigatório, aplicando permissões e escopo antes da consulta.

Build público configurável: `VITE_BASE_PATH`, basename do Router e URLs da API compartilham a mesma base. Na VPS, `/core/` no navegador é removido pelo Traefik antes do nginx; o backend recebe `/api`. O backend é o único responsável por `Path` do cookie, via `APP_BASE_PATH`; não há transformação adicional no nginx. Localmente a base permanece `/`.

```
Navegador (React) ──► nginx (web) ──► API (Express/TS) ──► PostgreSQL quest_rinne  (core/ingest/audit, SOMENTE LEITURA)
telas · filtros · gráficos   allowlist IP · CSP      sessão · permissões · cálculos   └► SQLite app.db (usuários, perfis, sessões,
relatórios (PDF = impressão) rate limit · real_ip    relatórios · auditoria                 auditoria, configurações)
n8n (fora do RINNE): iClips → PostgreSQL. O RINNE só lê o resultado e monitora as sincronizações.
```

| camada | faz | não faz |
|---|---|---|
| **Frontend** (React 18, TS, Vite, Tailwind, TanStack Query, Recharts) | telas, filtros na URL, gráficos, tabelas ordenáveis, relatórios e impressão | acessar banco, decidir permissões |
| **Backend** (Node 24, Express 5, TS, Zod, `pg`, `node:sqlite`) | autenticação, autorização (módulo, item, coluna, escopo), consultas, cálculos, relatórios (CSV/XLSX/MD), auditoria | escrita no banco analítico, SQL livre |
| **PostgreSQL** | fonte oficial dos dados | — (a aplicação só lê) |
| **SQLite** (migrations versionadas) | usuários, perfis, sessões, configurações, auditoria | dados analíticos |
| **n8n** | integração e sincronização do iClips (workflows existentes na VPS, **não alterados**) | — |

Todos os cálculos, filtros, indicadores e relatórios são **determinísticos**. Não há IA nesta versão.

## Catálogo e rastreabilidade

[shared/catalog.ts](../shared/catalog.ts) é a fonte única de módulos, indicadores, gráficos e tabelas. Cada indicador traz nome, unidade, base temporal (faturamento, caixa e competência nunca são somadas), fórmula de negócio, fontes candidatas e requisito na fonte. Cada resultado traz status, confiabilidade (`VALIDADO`, `PARCIAL`, `DESATUALIZADO`, `PENDENTE`, `EM_RECONCILIACAO`, `INDISPONIVEL`), registros considerados e excluídos, e última atualização. A gaveta de rastreabilidade leva aos registros de origem, respeitando permissões.

| condição | status |
|---|---|
| sem permissão | `FORBIDDEN` (sem consulta) |
| sem banco | `DATABASE_UNAVAILABLE` |
| sem mapeamento | `NOT_IMPLEMENTED` |
| fonte insuficiente | `INSUFFICIENT_DATA` |
| calculado | `OK` |

Ausência de informação nunca vira zero. Os mapeamentos SQL ficam isolados em [server/src/mappings.ts](../server/src/mappings.ts).

## Estrutura

```
shared/      catalog.ts · contracts.ts · permissions.ts
server/src/  app.ts · auth.ts / authz.ts / admin.ts · access.ts (IP) · store.ts (SQLite) · db.ts (PostgreSQL RO)
             services.ts · mappings.ts · reports.ts · xlsx.ts · filters.ts · introspect.ts · cli.ts
server/migrations/  001_auth.sql · 002_rinne_n8n_meetings.sql (histórica) · 003_remove_ai_voice_meetings.sql
web/src/     main.tsx (rotas sob demanda) · lib.ts · nav.ts · components/ · pages/
```

## Performance

Rotas carregadas sob demanda (bundle inicial de 334 kB); paginação e ordenação no servidor; cache de 60 s no cliente; agregações no PostgreSQL; pool de 10 conexões; `statement_timeout` de 15 s; até 200 linhas por página e 10.000 por relatório.

## Evolução futura (fora da 1.0)

IA, voz e Modo reunião foram implementados e depois retirados do escopo. O trabalho completo está na branch `archive/ia-voz-reuniao` (commit `781299a`), sem credenciais, e pode servir de base. Nenhuma dessas funcionalidades existe na versão ativa.
