# API do QUEST RINNE

Base: `/api`. Respostas JSON, exceto os downloads.

**Cadeia aplicada a toda rota** (exceto `/api/internal`):
1. allowlist de IP;
2. sessão (cookie `rinne_sid`);
3. CSRF (métodos de escrita exigem `X-Requested-With: rinne` e `Origin` igual ao host);
4. permissão da rota.

Erros: `400` dados inválidos (`details: [{campo, erro}]`) · `401` sem sessão (`code: UNAUTHENTICATED`) · `403` sem permissão, troca de senha pendente (`code: PASSWORD_CHANGE_REQUIRED`) ou CSRF · `404` · `409` conflito de estado · `413` corpo grande demais · `415` tipo de mídia · `429` limite · `500` erro interno (sem detalhes).

**Filtros globais** (query): `start`, `end` (AAAA-MM-DD, padrão o mês atual em America/Sao_Paulo), `compare=1`, `client`, `group`, `project`, `department`, `employee`, `service`, `status`. O escopo de departamento do usuário é imposto pelo servidor.

## Autenticação — `/api/auth`

| método e rota | descrição |
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
| `GET /indicators/:id` | do indicador | definição + resultado + período de comparação |
| `GET /indicators/:id/records?page&pageSize` | do indicador | registros de origem |
| `GET /tables/:id?page&pageSize&sort&dir` | da tabela | paginação no servidor; `sort` validado contra as colunas permitidas; colunas sem permissão são removidas |
| `GET /dimensions/:dim` | conforme a dimensão | opções de filtro |
| `GET /metadata/coverage` | `config.view` ou `qualidade.view` | inventário de core/ingest/audit |

## Relatórios — `/api/reports`

| rota | permissão | descrição |
|---|---|---|
| `GET /` | `relatorios.view` | relatórios permitidos |
| `GET /:id?format=json&conclusions=1` | `relatorios.view` + permissões do relatório | relatório (JSON). `conclusions=1` pede ao n8n **somente** se houver dados reais |
| `GET /:id?format=csv\|xlsx\|md` | + `relatorios.export` | download (CSV `;` + BOM; XLSX nativo; Markdown) |

Relatórios: executivo, financeiro, rentabilidade, producao, clientes, contratos, departamentos, eficiencia, capacidade, qualidade, reunioes. O PDF é gerado pela impressão do navegador em `/relatorios/:id/imprimir`.

## RINNE — `/api/rinne` {#rinne}

| rota | permissão | descrição |
|---|---|---|
| `GET /status` | sessão | `{available, reason, browserTts}` |
| `POST /ask` `{question}` | `rinne_ia.use` | resposta determinística (compatibilidade) |
| `GET /sessions?mode=CHAT\|VOICE` | do modo | conversas do usuário |
| `POST /sessions` `{mode, title?}` | do modo | nova conversa |
| `PATCH /sessions/:id` `{title}` · `DELETE /sessions/:id` | dono | renomear / excluir |
| `GET /sessions/:id/messages` | dono | mensagens (até 500) |
| `POST /sessions/:id/messages` `{message, operation?}` | dono | envia ao n8n; aceita `Idempotency-Key` |
| `POST /sessions/:id/audio` (binário) | dono, conversa VOICE | `Content-Type: audio/*`, `X-Audio-Duration-Ms` ≤ 60000, ≤ 2 MB |
| `GET /sessions/:id/export` | dono | Markdown |

## Modo reunião — `/api/rinne/meetings` (permissão `reuniao.use`, somente reuniões próprias)

| rota | descrição |
|---|---|
| `GET /` · `POST /` `{title?}` | lista / inicia (vai para CONSENT) |
| `GET /:id` | estado, pergunta, `allowedEvents`, departamentos, itens, segmentos, relatório |
| `POST /:id/events` | `{event: CONSENT, microphone, recording}` · `{event: SELECT_DEPARTMENT, department}` · `{event: SELECT_PERIOD, period \| start+end}` · `{event: RECORD_ITEM, kind, text, responsible?, dueDate?}` · `{event: ASK, message}` · `{event: COMPLETE_DEPARTMENT \| NEXT_DEPARTMENT \| COMPLETE_MEETING \| PAUSE \| RESUME \| CANCEL \| RECOVER}` |
| `POST /:id/command` `{text}` | comando em linguagem natural → evento (regra) |
| `POST /:id/audio` (binário) | `X-Segment-Seq`, `X-Audio-Duration-Ms`; idempotente por número de segmento |
| `GET /:id/report?format=json\|md` | relatório (sempre disponível) |
| `DELETE /:id` | só reuniões encerradas ou canceladas |

## Administração — `/api/admin`

| rota | permissão |
|---|---|
| `GET/POST /users` · `PATCH /users/:id` · `POST /users/:id/reset-password` | `usuarios.manage` |
| `GET/POST /roles` · `PUT/DELETE /roles/:id` | `perfis.manage` (`GET /roles/options`: `usuarios.manage`) |
| `GET /sessions` · `DELETE /sessions/:id` · `DELETE /users/:id/sessions` | `sessoes.manage` |
| `GET /audit?page&pageSize&event&outcome&actor` | `auditoria.view` |
| `GET /settings` / `PUT /settings` | `config.view` / `config.manage` |
| `GET /integrations/n8n` | `config.view` — status, histórico de rastreamento (sem URL nem segredo) |
| `POST /integrations/n8n/test` | `config.manage` — PING (sem custo) |
| `GET/PUT /api/access` | `ip.manage` — allowlist de IPs |

## Interno (n8n) — `/api/internal` (bloqueado no nginx; rede privada)

`GET /tools` · `POST /tools/:nome` · `POST /callback`. Ver [CONTRATOS_WEBHOOKS.md](CONTRATOS_WEBHOOKS.md).
