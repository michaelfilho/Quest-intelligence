# QUEST RINNE 1.0

Plataforma de inteligência econômica e operacional da Quest Comunicação.
Lê o PostgreSQL `quest_rinne` (schemas `core`, `ingest`, `audit`) **somente para leitura** e apresenta indicadores rastreáveis.

> Estado atual: aplicação completa rodando localmente **sem banco**. Todos os indicadores aparecem como
> `DATABASE_UNAVAILABLE` ou "aguardando mapeamento". Nenhum valor é simulado. Veja [docs/DEPLOY.md](docs/DEPLOY_VPS.md) para conectar ao banco real.

## Requisitos

- Node.js 22.12+ (testado com 24.19)
- Docker é opcional (só para o empacotamento)

## Instalação

```bash
npm run setup                 # instala server/ e web/
cp .env.example .env          # opcional; sem .env a API sobe como "banco não configurado"
```

> O `.env` do projeto prevalece sobre as variáveis da máquina. Nesta máquina existe uma `DATABASE_URL` em nível de usuário
> que pertence a outro projeto. A API a recusa, porque só aceita `postgres://…/quest_rinne` e não aceita o usuário `postgres`.

## Executar localmente

Use dois terminais:

```bash
npm run dev:api               # API   → http://127.0.0.1:3333/api/health
npm run dev:web               # Web   → http://localhost:5173
```

Abra **http://localhost:5173**. O Vite encaminha `/api` para a API.

**Primeiro acesso:** crie o administrador (a senha temporária aparece uma única vez no terminal e a troca é obrigatória no primeiro login):

```bash
npm --prefix server run user:admin -- <usuario> "Nome Completo"
```

Os demais usuários são criados na tela **Configurações → Usuários**. Os dados de login, perfis, sessões, auditoria e configurações ficam em `server/data/app.db`, isolado do PostgreSQL analítico.

Com Docker (simula a produção: nginx + API):

```bash
docker compose up --build     # → http://localhost:8080
```

## Build e testes

```bash
npm run typecheck             # TypeScript (server + web)
npm test                      # node:test (API) + vitest (web)
npm run build                 # typecheck da API + build de produção do web (web/dist)
```

## Estrutura

```
shared/        contratos de dados e catálogo de módulos/indicadores (fonte única, usada pela API e pelo web)
server/src/    API Express: app.ts (rotas) · auth.ts/authz.ts/admin.ts (login, permissões, administração) · access.ts (IP) · store.ts (app.db) · db.ts (PostgreSQL RO) · services.ts · mappings.ts (SQL real, a preencher) · rinne.ts
server/migrations/  migrations do banco da aplicação (SQLite)
server/test/   testes da API sem banco
web/src/       React + Vite + Tailwind + TanStack Query + Recharts
sql/           scripts manuais (role somente leitura) — nunca executados automaticamente
deploy/        exemplo de configuração de produção
docs/          diagnóstico, arquitetura, deploy, dicionários
```

Documentação: [segurança e deploy seguro](docs/SEGURANCA.md) · [arquitetura e APIs](docs/ARQUITETURA.md) · [deploy na VPS](docs/DEPLOY_VPS.md) · [dicionário de indicadores](docs/DICIONARIO_INDICADORES.md) · [diagnóstico da fase 1](docs/DIAGNOSTICO_FASE1.md)
