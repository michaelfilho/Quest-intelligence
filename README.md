# QUEST RINNE 1.0

Plataforma de inteligência econômica, financeira e operacional da Quest Comunicação. Lê o PostgreSQL `quest_rinne` (schemas `core`, `ingest`, `audit`) **somente para leitura** e apresenta indicadores rastreáveis, calculados de forma determinística.

> **Estado:** a aplicação roda por completo localmente **sem o banco**. Os indicadores aparecem como "Sem conexão com o banco" ou "Aguardando mapeamento", nunca como zero nem com valores simulados. Os cálculos SQL dependem da inspeção do schema real na etapa de deploy ([docs/INTEGRACAO_POSTGRESQL.md](docs/INTEGRACAO_POSTGRESQL.md)).

**Módulos:** Visão geral · Clientes · Projetos / Jobs · Rentabilidade · Financeiro · Timesheet · Departamentos · Colaboradores · Produtividade · Produção · Contratos · Capacidade operacional · Eficiência · Contratado × executado · Qualidade dos dados · Relatórios (PDF, CSV, XLSX, Markdown) · Configurações (usuários, perfis, IP, sessões, auditoria, segurança).

**Fora do escopo da 1.0** (evolução futura): IA, voz e Modo reunião. O código ficou arquivado na branch `archive/ia-voz-reuniao`.

## Executar localmente

```bash
npm run setup                                              # instala as dependências
npm --prefix server run user:admin -- <usuario> "Nome"     # cria o administrador (senha temporária exibida uma vez)
npm run dev:api                                            # terminal 1 → http://127.0.0.1:3333
npm run dev:web                                            # terminal 2 → http://localhost:5173
```

Verificações: `npm run typecheck` · `npm test` · `npm run build` · `npm run homologacao` (homologação visual).

## Arquitetura

React + TypeScript (frontend) · Node + Express + TypeScript (backend) · PostgreSQL (dados analíticos, somente leitura) · SQLite (usuários, perfis, sessões, auditoria, configurações) · n8n (sincronização do iClips com o PostgreSQL, fora desta aplicação).

```
shared/   catálogo de módulos/indicadores, contratos e permissões (fonte única)
server/   API: rotas, autenticação, permissões, relatórios, PostgreSQL RO, SQLite (+ migrations e testes)
web/      interface (Vite, Tailwind, TanStack Query, Recharts) + nginx
e2e/      homologação visual (Playwright + Edge)
deploy/   exemplos de configuração e backup · docker-compose*.yml · sql/ (role somente leitura)
docs/     documentação
```

## Documentação

[Instalação local](docs/INSTALACAO_LOCAL.md) · [Arquitetura](docs/ARQUITETURA.md) · [Segurança](docs/SEGURANCA.md) · [API](docs/API.md) · [Integração PostgreSQL](docs/INTEGRACAO_POSTGRESQL.md) · [Dicionário de indicadores](docs/DICIONARIO_INDICADORES.md) · [Testes](docs/TESTES.md) · [Homologação local](docs/HOMOLOGACAO_LOCAL.md) · [Deploy na VPS](docs/DEPLOY_VPS.md) · [Backup e rollback](docs/BACKUP_ROLLBACK.md) · [Pendências de produção](docs/PENDENCIAS_PRODUCAO.md)
