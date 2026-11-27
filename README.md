# QUEST INTELLIGENCE

Plataforma de inteligência econômica, financeira e operacional da Quest Comunicação.

```
shared/    catálogo de módulos/indicadores, contratos e permissões (fonte única)
server/    API Express: autenticação, permissões, relatórios, consultas; db/ com bootstrap e migrations
frontend/  interface React + nginx
deploy/    instalação, atualização, backup e verificações da VPS
scripts/   PostgreSQL temporário, testes de instalação/deploy, homologação e dicionário
e2e/       navegação no navegador (Playwright + Edge)
```

PostgreSQL `quest_rinne` é a única persistência: `app` (aplicação), `core` (dados), `ingest` e `audit` (integração). A instalação nasce sem dados empresariais; a coleta será feita por workflows n8n ainda não desenvolvidos.

## VPS

```bash
# primeira instalação (acrescente  | bash -s -- --check  para apenas validar)
cd /opt/apps/quest-rinne-web && git fetch origin && git show origin/main:deploy/install.sh | bash

# atualizações futuras
cd /opt/apps/quest-rinne-web && git fetch origin && git show origin/main:deploy/update.sh | bash

# primeiro administrador
docker exec -it quest-rinne-web-api-1 npm run user:admin -- <usuario> "Nome Completo"
```

Leia [Instalação na VPS](docs/INSTALACAO_VPS.md) antes de executar.

## Desenvolvimento

Node 24.7+ e, para os testes de instalação e navegador, os binários do PostgreSQL (`PG_BIN`).

```bash
npm run setup
npm run typecheck && npm run lint && npm test && npm run build
npm run test:install     # instalação limpa em PostgreSQL real temporário
npm run test:deploy      # install.sh e update.sh com Docker simulado
npm run homologacao      # navegador sobre banco vazio (HOMOLOG_ANALYTICS_FIXTURE=1: dados sintéticos)
```

Execução local: [docs/INSTALACAO_LOCAL.md](docs/INSTALACAO_LOCAL.md).

## Documentação

- [Modelagem PostgreSQL](docs/MODELAGEM_POSTGRESQL.md) · [Dicionário de dados](docs/DICIONARIO_BANCO.md) · [Dicionário de indicadores](docs/DICIONARIO_INDICADORES.md)
- [API](docs/API.md) · [Contratos para o n8n](docs/CONTRATOS_N8N.md)
- [Instalação na VPS](docs/INSTALACAO_VPS.md) · [Segurança](docs/SEGURANCA.md) · [Arquitetura](docs/ARQUITETURA.md)
- [Relatório de testes, riscos e pendências](docs/RELATORIO_TESTES.md)
- [Telas e mapeamento](docs/CONSOLIDACAO.md) · [Experiência gerencial](docs/EXPERIENCIA_GERENCIAL.md) · [Relacionamentos](docs/CORRECOES_RELACIONAMENTOS.md) · [Performance](docs/PERFORMANCE.md) · [Benchmarks](docs/BENCHMARKS.md)

Documentos da arquitetura anterior (SQLite e workflows antigos) foram removidos; estão no histórico do Git até `1728bfa`.
