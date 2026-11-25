# API do QUEST RINNE

Base: `/api`. Respostas JSON, exceto os downloads.

**Cadeia aplicada a toda rota:** (1) allowlist de IP → (2) sessão (cookie `rinne_sid`) → (3) CSRF (métodos de escrita exigem `X-Requested-With: rinne` e `Origin` igual ao host) → (4) permissão da rota.

Erros: `400` dados inválidos (`details: [{campo, erro}]`) · `401` sem sessão (`code: UNAUTHENTICATED`) · `403` sem permissão, troca de senha pendente (`PASSWORD_CHANGE_REQUIRED`) ou CSRF · `404` · `409` conflito · `413` corpo grande · `429` limite · `500` erro interno (sem detalhes).

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
