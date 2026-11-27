# Consolidação do QUEST INTELLIGENCE

Aplicação única: **`frontend/`** (interface) + **`server/`** (API) + **`shared/`** (catálogo, contratos, permissões). `web/` e `backend/` (protótipo com dados fictícios) foram removidos e continuam no histórico do Git até `a5e72b0`.

## O que mudou

- A identidade visual, a barra lateral, os seis grupos de menu e a paleta do design novo passaram a ser a interface de produção.
- Dados, filtros, gráficos, tabelas, rastreabilidade, relatórios, impressão, login, perfis, administração e controle de IP vêm da implementação real que já existia.
- Nenhum indicador, fórmula, consulta, permissão ou migration foi alterado em `server/` (só o nome do produto nos relatórios).
- Telas do design sem fonte confiável mostram **Informação indisponível**.
- Endereços anteriores continuam válidos (`/financeiro`, `/dre`, `/capacidade`, `/eficiencia`, `/contratado`, `/qualidade` etc.).
- A tela de login continua sendo a de produção (QUEST CORE). A autenticação do protótipo foi removida.

## Diferenças em relação ao protótipo

O visual e a navegação foram preservados; **a composição interna das telas não é idêntica**. Cada tela mostra os cartões, gráficos e tabelas que têm fonte real, num formato comum. Saíram as interações que só existiam sobre dados inventados: simulação de rateio, simulação de metas, assistente de IA, versões de contrato, marcas, fees e diagnósticos automáticos. Foram acrescentados ao menu itens que a produção já tinha: Produção, Alertas e Qualidade dos Dados.

## Mapeamento das telas

Números: indicadores / gráficos / tabelas. As tabelas são do schema `core` (as de `ingest` e `audit` aparecem em Integrações e Qualidade) e são **candidatas** do catálogo: o backend confirma colunas e relacionamentos em tempo de execução, e o que não puder ser calculado aparece com o motivo.

| menu | rota | origem | indicadores / gráficos / tabelas | tabelas candidatas |
|---|---|---|---|---|
| Visão Geral | / | módulo executivo | 14 / 8 / 3 | clients, departments, employees, financial_categories, financial_entries, financial_entry_cost_centers, invoices, job_tasks, jobs, time_entries |
| Indicadores Estratégicos | /indicadores-estrategicos | seleção de executivo | 8 / 2 / 0 | financial_categories, financial_entries, invoices, jobs, time_entries |
| Rentabilidade Consolidada | /rentabilidade-consolidada | seleção de rentabilidade | 4 / 3 / 2 | clients, financial_categories, financial_entries, financial_entry_cost_centers, jobs, time_entries |
| Alertas Gerenciais | /alertas | banco da aplicação / relatórios | — | — |
| Clientes | /clientes | módulo clientes | 7 / 5 / 3 | client_groups, clients, financial_categories, financial_entries, invoices, jobs, time_entries |
| Marcas | /marcas | **indisponível**: A integração não possui cadastro de marcas. Grupos empresariais não são marcas e não são usados como substituto. | — | — |
| Contratos | /contratos | módulo contratos | 5 / 1 / 1 | job_pieces, job_tasks, time_entries, workflow_steps |
| Categorias de Serviços | /categorias-servicos | seleção de rentabilidade | 0 / 1 / 1 | financial_entries, financial_entry_cost_centers, job_pieces |
| Fees e Jobs Extras | /fees-jobs-extras | **indisponível**: Não há fonte de contratos de fee nem classificação de jobs extras na integração. | — | — |
| Rentabilidade Comercial | /rentabilidade-comercial | seleção de rentabilidade | 4 / 2 / 1 | clients, financial_categories, financial_entries, financial_entry_cost_centers, invoices, time_entries |
| Integrações | /integracoes | seleção de qualidade | 6 / 1 / 3 | audit.* (a mapear), audit.qpf11_publication_conflicts, audit.qpf11_publication_state, ingest.qpf11_pages, ingest.qpf11_tasks |
| Projetos / Jobs | /projetos | módulo projetos | 12 / 3 / 4 | financial_entries, financial_entry_cost_centers, job_tasks, jobs, time_entries, workflow_steps |
| Produção | /producao | módulo producao | 26 / 7 / 3 | clients, departments, employees, job_pieces, job_tasks, jobs, piece_catalog, time_entries, workflow_steps |
| Timesheet | /timesheet | módulo timesheet | 8 / 3 / 5 | departments, employees, job_tasks, jobs, time_entries, workflow_steps |
| Departamentos | /departamentos | módulo departamentos | 12 / 2 / 3 | departments, employees, job_pieces, job_tasks, jobs, time_entries, workflow_steps |
| Colaboradores | /colaboradores | módulo colaboradores | 6 / 2 / 3 | employees, job_tasks, time_entries, workflow_steps |
| Produtividade | /produtividade | módulo produtividade | 11 / 4 / 3 | departments, employees, job_pieces, job_tasks, jobs, time_entries, workflow_steps |
| Peças e Atividades | /pecas-atividades | seleção de producao | 4 / 1 / 2 | job_pieces, job_tasks, jobs, piece_catalog, time_entries, workflow_steps |
| Capacidade Operacional | /capacidade-operacional | seleção de capacidade | 4 / 2 / 1 | departments, employees, job_tasks, time_entries, workflow_steps |
| Refações e Alterações | /refacoes-alteracoes | seleção de eficiencia | 4 / 1 / 1 | employees, job_tasks, time_entries, workflow_steps |
| Rentabilidade | /rentabilidade | módulo rentabilidade | 13 / 7 / 7 | clients, departments, employees, financial_categories, financial_entries, financial_entry_cost_centers, invoices, job_tasks, jobs, time_entries, workflow_steps |
| Relatórios | /relatorios | banco da aplicação / relatórios | — | — |
| Dashboard Financeiro | /financeiro | módulo financeiro | 30 / 10 / 19 | clients, financial_accounts, financial_categories, financial_entries, financial_entry_cost_centers, invoices, jobs |
| DRE Gerencial | /dre | preset financeiro | 8 / 1 / 2 | financial_categories, financial_entries |
| Fluxo de Caixa | /fluxo-caixa | preset financeiro | 3 / 1 / 4 | financial_accounts, financial_categories, financial_entries |
| Receitas e Despesas | /receitas-despesas | seleção de financeiro | 3 / 1 / 1 | financial_entries |
| Custos Operacionais | /custos-operacionais | seleção de financeiro | 7 / 2 / 1 | financial_categories, financial_entries, financial_entry_cost_centers |
| Orçado vs. Realizado | /orcado-realizado | seleção de produtividade | 4 / 1 / 1 | job_tasks, time_entries, workflow_steps |
| Central de Alertas | /central-alertas | banco da aplicação / relatórios | — | — |
| Diagnósticos | /diagnosticos | **indisponível**: Os critérios de diagnóstico gerencial ainda não foram definidos e aprovados. Consulte a Central de Alertas. | — | — |
| Análises Comparativas | /analises-comparativas | seleção de executivo | 6 / 1 / 0 | financial_categories, financial_entries, invoices, jobs, time_entries |
| Assistente de IA | /assistente-ia | **indisponível**: Nenhum serviço de inteligência artificial está integrado a esta versão. | — | — |
| Qualidade dos Dados | /qualidade | módulo qualidade | 19 / 1 / 5 | audit.* (a mapear), audit.qpf11_publication_conflicts, audit.qpf11_publication_state, financial_entries, ingest.qpf11_pages, ingest.qpf11_tasks |
| Configurações | /configuracoes | banco da aplicação / relatórios | — | — |
| Controle de Acesso | /controle-acesso | banco da aplicação / relatórios | — | — |
| Regras de Rateio | /regras-rateio | seleção de financeiro | 3 / 1 / 1 | financial_entries, financial_entry_cost_centers |
| Plano de Contas | /plano-contas | seleção de financeiro | 0 / 0 / 2 | financial_accounts, financial_categories, financial_entries |
| Metas e Parâmetros | /metas-parametros | **indisponível**: Não há cadastro de metas aprovado. Os parâmetros do sistema estão em Configurações. | — | — |
| Permissões | /permissoes | banco da aplicação / relatórios | — | — |
| Auditoria | /auditoria | banco da aplicação / relatórios | — | — |

Os schemas `analytics` e `app` do PostgreSQL não são usados por esta aplicação. A conexão continua somente leitura e o pipeline de ingestão (n8n) não foi tocado.

## Testes

### Executados nesta máquina

| verificação | resultado |
|---|---|
| TypeScript (server e frontend) e ESLint do frontend | sem erros |
| Testes do servidor (unitários e integração com PGlite): autenticação, autorização, escopo, filtros, relacionamentos, indicadores, relatórios, release | 134/134 |
| Testes do frontend (menu por perfil, formatação, URL, nginx, ausência de dados demo) | 28/28 |
| Build de produção na raiz e em `/core/` | ok |
| Navegador (Edge), sem banco, raiz e `/core/` | 45/45 em cada |
| Navegador com consultas SQL reais sobre **dados sintéticos** (PGlite), `/core/` | 12/12 |
| Etapas dos dois Dockerfiles reproduzidas em pasta limpa; API sobe e recusa dados sem sessão | ok |
| `deploy/update.sh` com git e docker simulados (sucesso e rollback) e união dos arquivos Compose | ok |
| `npm audit` do frontend | 0 vulnerabilidades |

### Pendentes de homologação na VPS

- Build Docker real, nginx (incluindo o 404 por IP e o CSP) e Traefik/Tailscale. Não há Docker nem nginx nesta máquina.
- Execução real de `deploy/update.sh`.
- Qualquer consulta contra o PostgreSQL `quest_rinne`: nenhum valor real foi visto ou reconciliado. Rodar `npm run verify:analytics` no container da API.
- Login com as contas existentes e cookie `rinne_sid` com `Path=/core/`.

## Riscos remanescentes

- Conferir cada tela com dados reais antes de divulgar: volumes reais podem expor lentidão ou layout não visto com dados sintéticos.
- A atualização passa a **interromper** se um label do Traefik existir no container e não nos arquivos Compose. É intencional; reconciliar o Compose antes.
- Se a cópia runtime tiver ajustes manuais de código, a atualização avisa (diff privado) mas não os transporta.
- O rollback automático depende da verificação interna, que exige PostgreSQL conectado: banco indisponível no momento do deploy também causa rollback.
- O limite de 5 falhas por usuário permite que terceiros bloqueiem temporariamente uma conta conhecida (já existia).
- O bloqueio por IP continua desligado por padrão; sem ativá-lo não há 404.
