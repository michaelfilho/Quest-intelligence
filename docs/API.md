# API do QUEST RINNE

Base: `/api`. Respostas JSON, exceto os downloads.

Na publicação em `/core/`, o navegador usa `/core/api`; o Traefik remove `/core`, e a API continua recebendo `/api`. `APP_BASE_PATH=/core/` isola o cookie; login e logout usam o mesmo Path, mantendo Secure/HttpOnly/SameSite. Localmente a base padrão é `/`.

`GET /metadata/schema` exige `config.view` e retorna a estrutura descoberta em runtime, constraints e capacidades, sem registros individuais. A estrutura tem cache em memória de cinco minutos; dados analíticos são lidos diretamente a cada consulta.

Itens mapeados podem retornar `INSUFFICIENT_DATA` quando a introspecção não comprova campos/tipos ou o filtro não tem vínculo confiável. `PARCIAL` e `EM_RECONCILIACAO` não equivalem a números gerenciais certificados. Indicadores incluem `temporalField`, `coverage`, `reason`, registros considerados/excluídos e atualização quando disponível. Fotografias atuais não fornecem `previous` histórico.

Dimensões recebem os filtros globais e o escopo departamental imposto, retornando até 500 IDs com apontamentos válidos. Status é literal e exige `projetos.view`; nomes e serviços sem vínculo comprovado não são inferidos. Relatórios reutilizam as mesmas consultas e preservam os motivos individuais de indisponibilidade.

**Cadeia aplicada a toda rota:** (1) allowlist de IP → (2) sessão (cookie `rinne_sid`) → (3) CSRF (métodos de escrita exigem `X-Requested-With: rinne` e `Origin` igual ao host) → (4) permissão da rota.

Erros: `400` dados inválidos (`details: [{campo, erro}]`) · `401` sem sessão (`code: UNAUTHENTICATED`) · `403` sem permissão, troca de senha pendente (`PASSWORD_CHANGE_REQUIRED`) ou CSRF · `404` · `409` conflito · `413` corpo grande · `429` limite · `500` erro interno (sem detalhes).

Respostas analíticas indisponíveis podem incluir `reasonCode`: `MISSING_FIELD`, `INCOMPLETE_REGISTRY`, `INVALID_RELATIONSHIP`, `PARTIAL_COVERAGE`, `BUSINESS_POLICY_PENDING`, `SOURCE_NOT_INTEGRATED`, `NO_RECORDS` ou `QUERY_FAILURE`, além do motivo individual. Módulos de detalhe incluem `entityName`, resolvido dentro do período/escopo permitido. Campos de custo exigem `custos_pessoal.view`, inclusive em registros de indicadores e exportações. Novos perfis e consultas estão descritos em [CORRECOES_RELACIONAMENTOS.md](CORRECOES_RELACIONAMENTOS.md).

**Filtros globais** (query): `start`, `end` (AAAA-MM-DD; padrão o mês atual em America/Sao_Paulo), `compare=1`, `client`, `group`, `project`, `department`, `employee`, `service`, `status`. O escopo de departamento do usuário é imposto pelo servidor.

## Autenticação — `/api/auth`

| rota | descrição |
|---|---|
| `POST /login` `{username, password}` | cria sessão (204 + cookie HttpOnly/SameSite=Strict) |
| `POST /logout` | encerra a sessão |
| `GET /me` | usuário, perfil, permissões efetivas, escopo, `mustChangePassword` |
| `POST /password` `{current, next}` | troca a senha e encerra as outras sessões |
| `GET /sessions` · `DELETE /sessions/:id` | sessões do próprio usuário |

## Dados analíticos

| rota | permissão | descrição |
|---|---|---|
| `GET /health` | pública | `status`, `database`; detalhes só com `config.view` |
| `GET /modules` | sessão | módulos permitidos |
| `GET /modules/:id` | do módulo | indicadores e gráficos; itens sem permissão → `FORBIDDEN` |
| `GET /indicators/:id` | do indicador | definição, resultado e período de comparação |
| `GET /indicators/:id/records?page&pageSize` | do indicador | registros de origem |
| `GET /tables/:id?page&pageSize&sort&dir` | da tabela | paginação e ordenação no servidor (`sort` validado contra as colunas permitidas); colunas sem permissão são removidas |
| `GET /dimensions/:dim` | conforme a dimensão | opções de filtro |
| `GET /metadata/coverage` | `config.view` ou `qualidade.view` | inventário de core/ingest/audit |

## Relatórios — `/api/reports`

| rota | permissão | descrição |
|---|---|---|
| `GET /` | `relatorios.view` | relatórios permitidos |
| `GET /:id?format=json` | `relatorios.view` + permissões do relatório | relatório em JSON |
| `GET /:id?format=csv\|xlsx\|md` | + `relatorios.export` | download (CSV `;` + BOM; XLSX nativo; Markdown) |

Relatórios: `executivo`, `financeiro`, `rentabilidade`, `producao`, `clientes`, `contratos`, `departamentos`, `eficiencia`, `capacidade`, `qualidade`. O PDF é gerado pela impressão do navegador em `/relatorios/:id/imprimir`. Sem banco, o relatório sai marcado "DADOS INDISPONÍVEIS".

## Administração — `/api/admin`

| rota | permissão |
|---|---|
| `GET/POST /users` · `PATCH /users/:id` · `POST /users/:id/reset-password` | `usuarios.manage` |
| `GET/POST /roles` · `PUT/DELETE /roles/:id` | `perfis.manage` (`GET /roles/options`: `usuarios.manage`) |
| `GET /sessions` · `DELETE /sessions/:id` · `DELETE /users/:id/sessions` | `sessoes.manage` |
| `GET /audit?page&pageSize&event&outcome&actor` | `auditoria.view` |
| `GET /settings` / `PUT /settings` | `config.view` / `config.manage` |
| `GET/PUT /api/access` | `ip.manage` (allowlist de IPs) |
# Carregamento progressivo — fase 3

`GET /api/modules/:id?view=summary` retorna metadados do módulo sem calcular cards/gráficos. Mantém os guardas do módulo e filtros; os itens omitidos aparecem como FORBIDDEN no envelope de compatibilidade e não indicam ausência de permissão no frontend. O frontend usa somente os metadados desse resumo e solicita os itens autorizados individualmente.

`GET /api/charts/:id` retorna `ChartResult`, com os mesmos filtros e guardas de item/escopo usados no módulo. A comparação não recalcula gráficos ou tabelas de linhas atuais. Endpoints de indicadores, registros e tabelas permanecem compatíveis.

Resultados analíticos incluem `calculatedAt` e `refreshAfterMs` para preservar o ciclo de atualização ao receber cache. `updatedAt` de indicadores continua sendo atualização da fonte quando comprovada. Cache é privado em memória do backend, sem cache HTTP público. Ver [PERFORMANCE.md](PERFORMANCE.md).

## Navegações gerenciais

A curadoria de abas não amplia permissões: ACCESS_MODULES conserva os módulos que autorizavam os itens anteriores. Itens novos continuam sujeitos a módulo, item, coluna e escopo no backend.

- GET /api/tables/:id aceita search (até 100 caracteres), aplicado antes da paginação em colunas textuais explícitas. Percentuais/underscores são literais, com parâmetros SQL. Não há busca por valores financeiros ocultos.
- GET /api/tables/:id/export exporta somente a página indicada em CSV, com os mesmos filtros, pesquisa, ordem e colunas autorizadas. Exige relatorios.export, registra auditoria e não exporta dados indisponíveis.
- GET /api/activities/:kind/:parent/:child/records exige acesso às atividades e apontamentos; kind é TASK ou WORKFLOW e as chaves são parâmetros separados. Departamento do usuário é imposto e ordenação por coluna sem permissão é recusada.
- category filtra movimentações pela categoria financeira. Nas visões sem vínculo comprovado, o filtro não é ignorado: a informação fica indisponível.
- dreGroup é restrito à tabela dre_categorias e aos grupos de classificação conhecidos. A expansão respeita tipo e classificação, sem somar outros grupos.
- statusSource (projects ou invoices) identifica a origem de status. A interface marca seleções operacionais como projects e oferece remoção ao navegar para Financeiro. O backend recusa a interpretação cruzada entre status de projeto e situação de nota, com UNSUPPORTED_FILTER e valor ausente. Chamadas anteriores sem marcador mantêm a semântica específica do endpoint; o marcador não concede permissões.

Novas listagens: gestao_clientes, gestao_projetos, projetos_por_cliente, timesheet_projetos, timesheet_calendario, caixa_diario e caixa_mensal. Resultado/margem completos e estimativas não atribuíveis permanecem ausentes; nenhum valor é presumido como zero. Títulos em aberto e vencimentos ainda não comprovados continuam indisponíveis.
