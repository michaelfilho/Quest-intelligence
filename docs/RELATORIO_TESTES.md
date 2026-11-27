# Relatório de testes, riscos e pendências

Instalação limpa do QUEST INTELLIGENCE. Ambiente: Windows, Node 24, **PostgreSQL 18** local temporário, Microsoft Edge. Nada foi executado na VPS.

## Executados de verdade (código real, PostgreSQL real ou embutido)

| comando | o que cobre | resultado |
|---|---|---|
| `npm run typecheck`, `npm run lint`, `npm run build` | tipos, lint, build na raiz e em `/core/` | sem erros |
| `npm test` (servidor) | autenticação, sessões, bloqueios, permissões e escopo, controle de IP, relatórios, consultas, release, reconciliação; migrations reais em PostgreSQL embutido com a role `qi_app`; **todos os indicadores, gráficos, tabelas e filtros sobre o schema vazio**; bloqueio de gravação sem tarefa de coleta; idempotência | 138/138 |
| `npm test` (frontend) | menu por perfil, formatação, URL, nginx, ausência de dados demonstrativos | 28/28 |
| `npm run test:install` | PostgreSQL real a partir de banco vazio com `ALLOW_CONNECTIONS false`: roles, credencial antiga recusada, migrations e reexecução, privilégios, primeiro administrador, login/logout, troca de senha, cookie `/core/`, sessão após reinício, revogação, perfil e departamento, 17 módulos vazios, 112 indicadores, 38 gráficos e 55 tabelas pela API, bloqueio de tentativas concorrentes, `pg_dump` | 16/16 etapas |
| `npm run homologacao` | navegador sobre banco **vazio**, raiz e `/core/`: todas as telas, filtros, relatórios, configurações, perfil restrito, celular | 45/45 em cada |
| `HOMOLOG_ANALYTICS_FIXTURE=1 npm run homologacao` | navegador com **dados sintéticos** gravados no schema novo | 13/13 |
| passos dos Dockerfiles em pasta limpa | só os arquivos copiados e dependências de produção; migrations, API em `NODE_ENV=production`, build da interface | ok |
| `npm audit` (server, frontend, e2e) | dependências | 0 vulnerabilidades |

Defeito encontrado por esses testes e corrigido: três gráficos de receita falhavam no PostgreSQL (erro 42803, agrupamento com subconsulta correlacionada).

## Simulados

| comando | o que é real | o que é falso |
|---|---|---|
| `npm run test:deploy` (7 cenários) | `install.sh` e `update.sh` inteiros; SQL de bootstrap, verificações e isolamento; migrations; reconciliação e renderização do override | Docker, Docker Compose, git, flock; formato do backup da VPS; resultado da validação final |

## Pendentes na VPS (não testados)

- Build e execução em Docker; nginx (404 por IP, CSP, `/core/`); Traefik e Tailscale.
- Leitura do backup real de configuração: o instalador procura a saída de `docker inspect` em arquivos JSON. Se o backup tiver outro formato, ele para sem alterar nada e pede os caminhos por variável. Rode `--check` primeiro.
- Versão do PostgreSQL do `quest-rinne-db-1` (testado em 18; embutido em 17). `pg_terminate_backend`, `pg_dump` e `psql` dentro do container.
- `update.sh` com `prepare-release.sh` sobre containers reais.

## Riscos remanescentes

- Superusuário do PostgreSQL continua podendo conectar. Remover credenciais antigas do n8n.
- Nenhum dado real passou pelo sistema: formatos e volumes da coleta futura podem exigir ajustes de índices ou mapeamentos.
- Migrations não têm volta; o rollback troca apenas as imagens.
- Variáveis antigas nos arquivos de ambiente da VPS (políticas financeiras, status etc.) continuam valendo; revisar, pois descreviam o banco anterior.
- Uma instância da API (contadores em memória).
- Os arquivos antigos de `deploy/data` não são usados nem removidos.

## Pendências funcionais

- Workflows n8n (não desenvolvidos).
- Assistente de IA e Diagnósticos: apenas a estrutura visual.
- Marcas, contratos, versões, fees, metas e rateios: somente consulta; sem cadastro pela interface.
- Rankings do Dashboard e títulos a pagar/receber: consultas nunca implementadas.
- Simulações interativas do protótipo e composição idêntica das telas de detalhe.
- Critérios gerenciais ainda sem aprovação (status de projeto, capacidade, entregas).
