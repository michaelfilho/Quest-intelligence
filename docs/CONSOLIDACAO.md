# Telas e mapeamento

Aplicação única: `frontend/` + `server/` + `shared/`. O protótipo original está no histórico (`a5e72b0`).

## Composição das telas

- **Dashboard Executivo:** composição do protótipo (10 cartões em 5 colunas, alertas, receitas × despesas, horas por departamento, dois rankings e bloco comercial), com indicadores reais. Os rankings aparecem como "Integração pendente": essas duas consultas nunca foram implementadas.
- **Demais telas:** formato comum do design (filtros, abas, cartões, gráficos, tabelas). Sem dados, os componentes permanecem e mostram o estado vazio; tabelas mantêm o cabeçalho.
- **Marcas, Fees, contratos e versões, metas, regras de rateio:** estruturas no banco e nas telas, somente consulta.
- **Diagnósticos e Assistente de IA:** estrutura visual "Aguardando integração".
- **Não recriadas:** simulações interativas de rateio e de metas e a pesquisa de assistente, que calculavam sobre dados inventados e exigem regras ainda não aprovadas. A composição interna de projetos, clientes e demais detalhes não é idêntica à do protótipo.

## Mapeamento das telas

Números: indicadores / gráficos / tabelas. As tabelas são do schema `core` (as de `ingest` e `audit` aparecem em Integrações e Qualidade) e são **candidatas** do catálogo: o backend confirma colunas e relacionamentos em tempo de execução, e o que não puder ser calculado aparece com o motivo.

| menu | rota | origem | indicadores / gráficos / tabelas | tabelas candidatas |
|---|---|---|---|---|
| Visão Geral | / | módulo executivo | 14 / 8 / 3 | clients, departments, employees, financial_categories, financial_entries, financial_entry_cost_centers, invoices, job_tasks, jobs, time_entries |
| Indicadores Estratégicos | /indicadores-estrategicos | seleção de executivo | 8 / 2 / 0 | financial_categories, financial_entries, invoices, jobs, time_entries |
| Rentabilidade Consolidada | /rentabilidade-consolidada | seleção de rentabilidade | 4 / 3 / 2 | clients, financial_categories, financial_entries, financial_entry_cost_centers, jobs, time_entries |
| Alertas Gerenciais | /alertas | banco da aplicação / relatórios | — | — |
| Clientes | /clientes | módulo clientes | 7 / 5 / 3 | client_groups, clients, financial_categories, financial_entries, invoices, jobs, time_entries |
| Marcas | /marcas | estrutura nova (aguarda coleta) | 2 / 0 / 1 | brands, clients |
| Contratos | /contratos | módulo contratos | 5 / 1 / 1 | job_pieces, job_tasks, time_entries, workflow_steps |
| Categorias de Serviços | /categorias-servicos | seleção de rentabilidade | 0 / 1 / 1 | financial_entries, financial_entry_cost_centers, job_pieces |
| Fees e Jobs Extras | /fees-jobs-extras | estrutura nova (aguarda coleta) | 2 / 0 / 1 | fees, contracts, jobs |
| Rentabilidade Comercial | /rentabilidade-comercial | seleção de rentabilidade | 4 / 2 / 1 | clients, financial_categories, financial_entries, financial_entry_cost_centers, invoices, time_entries |
| Integrações | /integracoes | seleção de qualidade | 6 / 1 / 3 | audit.* (a mapear), audit.publication_conflicts, audit.publication_state, ingest.pages, ingest.tasks |
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
| Qualidade dos Dados | /qualidade | módulo qualidade | 19 / 1 / 5 | audit.* (a mapear), audit.publication_conflicts, audit.publication_state, financial_entries, ingest.pages, ingest.tasks |
| Configurações | /configuracoes | banco da aplicação / relatórios | — | — |
| Controle de Acesso | /controle-acesso | banco da aplicação / relatórios | — | — |
| Regras de Rateio | /regras-rateio | seleção de financeiro | 3 / 1 / 1 | financial_entries, financial_entry_cost_centers |
| Plano de Contas | /plano-contas | seleção de financeiro | 0 / 0 / 2 | financial_accounts, financial_categories, financial_entries |
| Metas e Parâmetros | /metas-parametros | estrutura nova (cadastro aprovado) | 1 / 0 / 1 | goals |
| Permissões | /permissoes | banco da aplicação / relatórios | — | — |
| Auditoria | /auditoria | banco da aplicação / relatórios | — | — |

O schema `analytics` não é usado. `app` guarda os dados da própria aplicação.
