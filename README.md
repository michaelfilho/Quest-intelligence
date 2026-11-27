# QUEST INTELLIGENCE — protótipo atual

Implementação do prompt e referências enviados em 26/11/2026, com dados exclusivamente fictícios e API REST local.

**Acesso protegido por IP e senha.** Antes do primeiro uso, crie o administrador com `npm run user -- admin` (a senha é exibida uma única vez). [Segurança e publicação](docs/SEGURANCA-INTELLIGENCE.md).

```powershell
npm run setup
npm run dev
```

Interface: **http://127.0.0.1:5175** · API: **http://127.0.0.1:4310/api/v1**.

- `backend/`: Express + TypeScript, dados fictícios e cálculos centralizados.
- `frontend/`: React + TypeScript + Vite + Tailwind, componentes no padrão shadcn/ui, Recharts e React Router.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:prototype`: validação do protótipo.

[Escopo, API e decisões do protótipo](docs/QUEST-INTELLIGENCE.md). Todos os módulos do menu possuem telas com dados fictícios e navegação funcional. Financeiro, capacidade, retrabalho, inteligência e administração também estão disponíveis para visualização; não restam páginas “Em desenvolvimento”. Assistente, projeções, metas, rateios, perfis e auditoria são demonstrações explícitas, sem conexão externa ou gravação persistente.

## Sistema anterior preservado — QUEST RINNE 1.0

**Todo o conteúdo abaixo documenta o sistema anterior em `server/` e `web/`.** Para executá-lo, use os comandos `legacy:setup`, `legacy:dev:api`, `legacy:dev:web`, `legacy:build`, `legacy:test` e `legacy:homologacao`. Docker e scripts de produção existentes continuam associados ao sistema anterior; não publicam o novo protótipo.

Plataforma de inteligência econômica, financeira e operacional da Quest Comunicação. Lê o PostgreSQL `quest_rinne` (schemas `core`, `ingest`, `audit`) **somente para leitura** e apresenta indicadores rastreáveis, calculados de forma determinística.

> **Integração:** o backend usa a conexão existente e descobre colunas, tipos e constraints em tempo de execução. Há 85 indicadores com SQL, 28 gráficos e 31 tabelas mapeados, condicionados à introspecção. Resultados permanecem parciais ou em reconciliação até a validação real. Outros 22 indicadores têm motivos explícitos de indisponibilidade. Não há cópia do banco analítico nem zeros ou dados simulados para preencher ausências. [Integração e limitações](docs/INTEGRACAO_POSTGRESQL.md). [Fase 2: integração e critérios](docs/FASE_2_INTEGRACAO.md).

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

[Experiência gerencial: páginas, abas, navegações e pendências](docs/EXPERIENCIA_GERENCIAL.md)

[Performance da fase 3](docs/PERFORMANCE.md) · [Benchmarks sintéticos e limites da validação](docs/BENCHMARKS.md)

[Diagnóstico desta integração](docs/DIAGNOSTICO_INTEGRACAO.md): inventário, consultas implementadas, testes, limitações e roteiro de atualização da instalação existente.

[Instalação local](docs/INSTALACAO_LOCAL.md) · [Arquitetura](docs/ARQUITETURA.md) · [Segurança](docs/SEGURANCA.md) · [API](docs/API.md) · [Integração PostgreSQL](docs/INTEGRACAO_POSTGRESQL.md) · [Dicionário de indicadores](docs/DICIONARIO_INDICADORES.md) · [Testes](docs/TESTES.md) · [Homologação local](docs/HOMOLOGACAO_LOCAL.md) · [Deploy na VPS](docs/DEPLOY_VPS.md) · [Backup e rollback](docs/BACKUP_ROLLBACK.md) · [Pendências de produção](docs/PENDENCIAS_PRODUCAO.md)
