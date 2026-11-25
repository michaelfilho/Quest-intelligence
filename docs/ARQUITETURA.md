# Arquitetura do QUEST RINNE

```
Navegador (React)                    nginx (web)                     API (Express/TS)                         Dados
─────────────────                    ───────────                     ────────────────                         ─────
telas · filtros · gráficos   ──►  allowlist IP (auth_request) ──►  allowlist · sessão · CSRF · permissões ──►  PostgreSQL quest_rinne
chat · áudio · reuniões             CSP · rate limit · real_ip       regras · cálculos · relatórios             (core/ingest/audit, SOMENTE LEITURA)
relatórios (PDF = impressão)        /api/internal → deny             máquina de estados das reuniões    ──►  SQLite da aplicação (app.db)
                                                                     │  ▲                                       usuários · perfis · sessões · auditoria
                                                                     │  │ ferramentas (HMAC + contexto)         conversas · reuniões · configurações
                                                                     ▼  │
                                                                     n8n — TODA a IA (agentes, modelos, prompts, memória, tokens, custos, voz)
```

## Responsabilidades

| camada | faz | não faz |
|---|---|---|
| **Frontend** (React 18, TS, Vite, Tailwind, TanStack Query, Recharts) | interfaces, navegação, filtros na URL, gráficos, tabelas ordenáveis, chat, captura e reprodução de áudio, reuniões, relatórios e impressão | acessar banco, decidir permissões, falar com provedores de IA |
| **Backend** (Node 24, Express 5, TS, Zod, `pg`, `node:sqlite`) | autenticação, autorização (módulo, item, coluna, escopo), sessões, consultas PostgreSQL, regras e cálculos, validação, relatórios (CSV/XLSX/MD), comunicação assinada com o n8n, ferramentas internas, estados das reuniões, persistência interna, auditoria | IA, SQL livre, escrita no banco analítico |
| **PostgreSQL** | fonte oficial dos dados econômicos e operacionais | — (a aplicação só lê) |
| **SQLite** (`server/data/app.db`, migrations versionadas) | usuários, perfis, permissões, sessões, configurações, conversas, reuniões, itens, segmentos, auditoria interna, rastreio das chamadas ao n8n | dados analíticos |
| **n8n** | agentes, provedores e modelos, prompts, memória, interpretação, análises, resumos, transcrição e síntese, tokens, custos, fallback | permissões de usuários, regras financeiras, substituir o backend |

## Inteligência única da RINNE

RINNE IA (`CHAT`), RINNE Voz (`VOICE`) e Modo reunião (`MEETING`) usam o **mesmo serviço** ([server/src/rinne.ts](../server/src/rinne.ts)) e a **mesma camada** de comunicação ([server/src/integrations/n8n.ts](../server/src/integrations/n8n.ts)). O contexto é diferenciado por `mode`, `operation`, `sessionId` e `meetingId`. Contratos: [CONTRATOS_WEBHOOKS.md](CONTRATOS_WEBHOOKS.md).

## Catálogo e rastreabilidade

[shared/catalog.ts](../shared/catalog.ts) é a fonte única de módulos, indicadores, gráficos e tabelas. Cada indicador traz:
- nome, unidade e base temporal (faturamento, caixa ou competência, nunca somadas);
- definição e fórmula de negócio, tabelas candidatas e requisito na fonte.

Cada resultado traz status, confiabilidade (`VALIDADO`, `PARCIAL`, `DESATUALIZADO`, `PENDENTE`, `EM_RECONCILIACAO` ou `INDISPONIVEL`), registros considerados e excluídos com motivos, e última atualização. A gaveta de rastreabilidade de cada indicador leva aos registros de origem, sempre respeitando as permissões.

Resolução de cada item ([server/src/services.ts](../server/src/services.ts)):

| condição | status |
|---|---|
| sem permissão | `FORBIDDEN` (sem consulta) |
| sem banco | `DATABASE_UNAVAILABLE` |
| sem mapeamento | `NOT_IMPLEMENTED` |
| fonte insuficiente | `INSUFFICIENT_DATA` |
| calculado | `OK` |

Ausência de informação nunca vira zero. Os mapeamentos SQL reais ficam isolados em [server/src/mappings.ts](../server/src/mappings.ts).

## Estrutura

```
shared/      catalog.ts · contracts.ts · permissions.ts · rinne.ts (contratos RINNE/n8n e períodos)
server/src/  app.ts (rotas) · auth.ts/authz.ts/admin.ts · access.ts (IP) · store.ts (SQLite) · db.ts (PostgreSQL RO)
             services.ts · mappings.ts · reports.ts · xlsx.ts · rinne.ts · tools.ts
             integrations/n8n.ts (cliente) · integrations/internal.ts (callback/ferramentas)
             meetings/state.ts (máquina de estados) · meetings/router.ts
server/migrations/  001_auth.sql · 002_rinne_n8n_meetings.sql
web/src/     main.tsx (rotas lazy) · lib.ts · audio.ts · nav.ts · components/ · pages/ (módulos, relatórios, impressão, configurações) · pages/rinne/
e2e/         homologacao.mjs (Playwright + Edge)        scripts/homologar.sh
deploy/      .env.production.example · backup.sh        docker-compose*.yml · */Dockerfile · web/nginx.conf.template
```

## Performance

- **Frontend:** rotas carregadas sob demanda (bundle inicial de 336 kB, antes 743 kB); paginação e ordenação no servidor; cache do TanStack Query (60 s); consulta repetida **só** com resposta pendente, com intervalo crescente.
- **Backend:** agregações no PostgreSQL; pool de 10 conexões; `statement_timeout` de 15 s; até 200 linhas por página e 10.000 por relatório; estado do banco em cache de 15 s.
- **n8n:** só é chamado quando há valor agregado. Nada é enviado sem dados, PING não aciona modelos e conclusões de relatório só são pedidas sob demanda. Concorrência limitada, áudio em segmentos binários e nenhum reenvio automático.

Detalhes das rotas: [API.md](API.md). Segurança: [SEGURANCA.md](SEGURANCA.md).
