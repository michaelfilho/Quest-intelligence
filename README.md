# QUEST RINNE 1.0

Plataforma de inteligência econômica, financeira e operacional da Quest Comunicação. Lê o PostgreSQL `quest_rinne` (schemas `core`, `ingest`, `audit`) **somente para leitura** e apresenta indicadores rastreáveis, calculados de forma determinística.

> **Integração:** o backend usa a conexão existente e descobre colunas, tipos e constraints em tempo de execução. Há 53 indicadores com SQL, 21 gráficos e 17 tabelas mapeados, condicionados à introspecção. Resultados permanecem parciais ou em reconciliação até a validação real. Outros 25 indicadores têm motivos explícitos de indisponibilidade. Não há cópia do banco analítico nem zeros ou dados simulados para preencher ausências. [Integração e limitações](docs/INTEGRACAO_POSTGRESQL.md). [Correções, perfis e fontes pendentes](docs/CORRECOES_RELACIONAMENTOS.md).

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

[Diagnóstico desta integração](docs/DIAGNOSTICO_INTEGRACAO.md): inventário, consultas implementadas, testes, limitações e roteiro de atualização da instalação existente.

[Instalação local](docs/INSTALACAO_LOCAL.md) · [Arquitetura](docs/ARQUITETURA.md) · [Segurança](docs/SEGURANCA.md) · [API](docs/API.md) · [Integração PostgreSQL](docs/INTEGRACAO_POSTGRESQL.md) · [Dicionário de indicadores](docs/DICIONARIO_INDICADORES.md) · [Testes](docs/TESTES.md) · [Homologação local](docs/HOMOLOGACAO_LOCAL.md) · [Deploy na VPS](docs/DEPLOY_VPS.md) · [Backup e rollback](docs/BACKUP_ROLLBACK.md) · [Pendências de produção](docs/PENDENCIAS_PRODUCAO.md)
