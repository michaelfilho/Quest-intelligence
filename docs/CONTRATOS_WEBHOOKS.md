# Contratos dos webhooks RINNE ⇄ n8n (versão 1.0)

> Contrato **proposto**. Os workflows do n8n ainda não existem; os nomes de modo, operação e ferramenta são a especificação que eles devem implementar.
> Fonte da verdade no código: [shared/rinne.ts](../shared/rinne.ts), [server/src/integrations/n8n.ts](../server/src/integrations/n8n.ts) e [server/src/integrations/internal.ts](../server/src/integrations/internal.ts).

## 1. Direções

| direção | quem chama | rota | autenticação |
|---|---|---|---|
| Solicitação | backend → n8n | `RINNE_N8N_WEBHOOK_URL` (POST) | HMAC (assinatura abaixo) |
| Resultado assíncrono | n8n → backend | `POST /api/internal/callback` | HMAC + nonce único |
| Ferramentas | n8n → backend | `POST /api/internal/tools/{nome}` | HMAC + nonce único + `X-Rinne-Execution` (contexto de execução) |
| Catálogo de ferramentas | n8n → backend | `GET /api/internal/tools` | HMAC + nonce único |

`/api/internal/*` **não é acessível pela internet**: o nginx devolve `deny all`. O n8n chama a API diretamente pela rede privada do Docker (ver [DEPLOY_VPS.md](DEPLOY_VPS.md)).

## 2. Assinatura (as duas direções)

Cabeçalhos:

| cabeçalho | valor |
|---|---|
| `X-Rinne-Timestamp` | segundos Unix (10 dígitos); aceito em ±300 s |
| `X-Rinne-Nonce` | 16–128 caracteres `[A-Za-z0-9_-]`; **uso único** (replay é recusado) |
| `X-Rinne-Signature` | `sha256=` + HEX( HMAC_SHA256( segredo, `${timestamp}.${nonce}.${sha256hex(corpo)}.${sha256hex(envelope)}` ) ) |
| `X-Rinne-Envelope` | só em envios de áudio: o envelope JSON em base64url (o corpo é o binário do áudio). Nos demais casos é vazio e `sha256hex("")` entra na assinatura |
| `X-Rinne-Request-Id`, `X-Rinne-Correlation-Id`, `X-Rinne-Operation` | rastreamento (backend → n8n) |

- `segredo` = `RINNE_N8N_WEBHOOK_SECRET`, com no mínimo 32 caracteres e configurado igual nos dois lados.
- A comparação é feita em tempo constante.

Verificação sugerida no n8n (nó Code):

```js
const crypto = require("crypto");
const h = $input.first().json.headers;
const body = $input.first().binary?.data ? Buffer.from($input.first().binary.data.data, "base64") : Buffer.from(JSON.stringify($input.first().json.body));
const env = h["x-rinne-envelope"] ?? "";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const expected = "sha256=" + crypto.createHmac("sha256", $env.RINNE_WEBHOOK_SECRET).update(`${h["x-rinne-timestamp"]}.${h["x-rinne-nonce"]}.${sha(body)}.${sha(env)}`).digest("hex");
if (expected !== h["x-rinne-signature"] || Math.abs(Date.now() / 1000 - Number(h["x-rinne-timestamp"])) > 300) throw new Error("assinatura inválida");
```

> No n8n, prefira usar o **corpo bruto** (opção *Raw Body* do Webhook). Se o JSON for re-serializado, a assinatura pode não bater.

## 3. Solicitação (backend → n8n)

```json
{
  "version": "1.0",
  "requestId": "6f1c0c1e-4a1d-4c55-9d0b-2a7f7d1e9b10",
  "correlationId": "0b6d0d6e-1b2c-4c3d-8e9f-001122334455",
  "sessionId": "a7b0c2f4-...",
  "mode": "CHAT",
  "operation": "ASK",
  "userId": "12",
  "message": "Quanto recebemos neste mês?",
  "context": {
    "departmentId": null,
    "period": { "from": "2026-11-01", "to": "2026-11-25" },
    "meetingId": null,
    "allowedTools": ["consultar_resumo_executivo", "consultar_receitas", "detalhar_indicador", "comparar_periodos"],
    "executionToken": "Vd1…(43 caracteres)",
    "toolsBaseUrl": "http://api:3333/api/internal/tools",
    "data": null
  },
  "locale": "pt-BR",
  "timezone": "America/Sao_Paulo"
}
```

- `userId`, `departmentId` e `allowedTools` vêm **da sessão autenticada no backend**, nunca do navegador.
- `departmentId` é imposto quando o usuário tem escopo de departamento.
- `executionToken` vale 10 min, até 50 chamadas (`RINNE_TOOL_MAX_CALLS`).
- O PING não recebe `executionToken`.

Modos: `CHAT` · `VOICE` · `MEETING`.

Operações:

| operação | uso | enviada por |
|---|---|---|
| `ASK` | pergunta em conversa | RINNE IA / Voz (texto) |
| `ANALYZE` | conclusões de relatório (somente com dados reais, sob demanda) | Relatórios |
| `SUMMARIZE` | resumo | RINNE IA (reservado) |
| `TRANSCRIBE` | transcrição de áudio (corpo binário) | RINNE Voz, Modo reunião |
| `SYNTHESIZE` | síntese de voz (reservado: a resposta pode trazer `audio`) | — |
| `MEETING_START` | aviso de início de reunião | Modo reunião |
| `DEPARTMENT_ANALYSIS` | pergunta durante a análise de um departamento | Modo reunião |
| `DEPARTMENT_SUMMARY` | consolidação ao finalizar um departamento (`context.data` = itens e indicadores) | Modo reunião |
| `MEETING_REPORT` | relatório final (`context.data` = departamentos, itens e consolidações) | Modo reunião |
| `PING` | teste de conectividade: o workflow **deve responder sem acionar modelos** | Configurações |

### Áudio

- O corpo é o **binário** do segmento, com `Content-Type` `audio/webm`, `audio/ogg`, `audio/wav`, `audio/mp4` ou `audio/mpeg`.
- Limites: até 2 MB e até 60 s por segmento.
- `X-Rinne-Audio-Duration-Ms` informa a duração.
- O envelope vai em `X-Rinne-Envelope`. O áudio não é armazenado pelo backend.

## 4. Resposta (n8n → backend)

### Síncrona (HTTP 200)

```json
{
  "version": "1.0",
  "success": true,
  "requestId": "6f1c0c1e-4a1d-4c55-9d0b-2a7f7d1e9b10",
  "correlationId": "0b6d0d6e-1b2c-4c3d-8e9f-001122334455",
  "sessionId": "a7b0c2f4-...",
  "response": {
    "text": "No período, a receita recebida está indisponível porque ...",
    "summary": null,
    "sources": [{ "type": "indicator", "id": "receita_recebida", "label": "Receita recebida" }],
    "indicators": [{ "id": "receita_recebida" }],
    "warnings": [],
    "suggestions": ["Revisar contratos com margem abaixo da meta"],
    "tables": [],
    "charts": [],
    "audio": null,
    "transcript": null
  },
  "error": null
}
```

Regras de validação no backend (Zod). Uma resposta fora delas vira **erro controlado**, e nada inválido chega ao navegador:

- `requestId` deve ser **igual** ao enviado; `success` deve ser `true` e `response` não pode ser nulo.
- Limites de tamanho:
  - `text` até 20.000 caracteres;
  - até 50 fontes, 30 indicadores, 20 avisos e 20 sugestões;
  - até 5 tabelas (20 colunas × 200 linhas) e 5 gráficos (6 séries × 120 pontos).
- `indicators`: só os **ids** são usados. Ids desconhecidos são descartados, e os valores são **recalculados pelo backend** com as permissões do usuário (a IA não injeta números).
- `audio`: `{ "mimeType": "audio/mpeg|audio/ogg|audio/wav|audio/webm|audio/mp4", "data": "<base64>" }`, até cerca de 3 MB. O navegador reproduz via `blob:`.
- Texto é exibido como **texto puro**; nenhum HTML é interpretado.
- Respostas não executam ações administrativas: não há caminho no código para isso.

### Assíncrona

1. O n8n responde **HTTP 202** (corpo ignorado). A mensagem fica `pending`.
2. Ao terminar, o n8n faz `POST /api/internal/callback` com o **mesmo formato da resposta síncrona** e cabeçalhos assinados.
3. Respostas do callback: `200` concluído · `401` assinatura/janela/nonce inválidos · `404` requestId desconhecido · `409` já concluído (idempotente).

### Falha

```json
{ "version": "1.0", "success": false, "requestId": "…", "response": null, "error": { "code": "PROVIDER_UNAVAILABLE", "message": "Modelo indisponível" } }
```

## 5. Ferramentas (n8n → backend)

```http
POST /api/internal/tools/consultar_receitas
X-Rinne-Timestamp: 1764068400
X-Rinne-Nonce: 5bq0Jx2…
X-Rinne-Signature: sha256=…
X-Rinne-Execution: <context.executionToken recebido na solicitação>
Content-Type: application/json

{ "input": { "period": { "from": "2026-11-01", "to": "2026-11-25" }, "compare": true, "limit": 20 } }
```

Resposta `200`:

```json
{
  "success": true,
  "requestId": "6f1c0c1e-…",
  "data": {
    "tool": "consultar_receitas",
    "period": { "from": "2026-11-01", "to": "2026-11-25" },
    "filters": { "start": "2026-11-01", "end": "2026-11-25", "compare": true },
    "database": "DATABASE_UNAVAILABLE",
    "reliability": "PARCIAL_OU_INDISPONIVEL",
    "items": [{ "id": "receita_recebida", "label": "Receita recebida", "status": "DATABASE_UNAVAILABLE", "value": null, "reliability": "INDISPONIVEL", "basis": "recebimento", "sources": ["core.financial_entries"] }],
    "tables": [],
    "limitations": ["Banco de dados indisponível: nenhum valor foi calculado.", "Ausência de informação não equivale a zero."]
  },
  "error": null
}
```

Erros:

| HTTP | código | situação |
|---|---|---|
| 400 | `INVALID_INPUT` | entrada fora do contrato (campos extras como `sql` são recusados) |
| 401 | `INVALID_SIGNATURE` / `INVALID_EXECUTION_CONTEXT` | assinatura, janela, nonce ou token inválidos/expirados |
| 403 | `FORBIDDEN` / `USER_INACTIVE` / `FORBIDDEN_ORIGIN` | o **usuário da sessão original** não tem a permissão; usuário desativado; IP fora de `RINNE_N8N_ALLOWED_IPS` |
| 404 | — | ferramenta inexistente |
| 429 | `TOOL_LIMIT` | limite de chamadas do contexto atingido |

Entrada aceita (todas opcionais, conforme a ferramenta):

```ts
{
  period?: { from: "AAAA-MM-DD", to: "AAAA-MM-DD" },
  compare?: boolean,
  department?: string,
  clientId?: string,
  projectId?: string,
  indicatorId?: string,
  limit?: 1..50   // padrão 20
}
```

Lista e permissões de cada ferramenta: [FERRAMENTAS_RINNE.md](FERRAMENTAS_RINNE.md).

## 6. Idempotência, timeout e concorrência

- **Sem reenvio automático.** Timeout ou falha viram erro visível, e o usuário decide se tenta de novo.
- **`Idempotency-Key`** (cabeçalho do navegador, UUID): a mesma chave devolve o resultado gravado sem novo processamento. Segmentos de reunião são idempotentes por (reunião, número do segmento).
- **Timeout:** `RINNE_N8N_TIMEOUT_MS`, padrão 60 s. O cancelamento pelo usuário aborta a chamada.
- **Concorrência:** no máximo `RINNE_N8N_MAX_CONCURRENCY` chamadas simultâneas (padrão 4) e uma por conversa. O excedente recebe `busy`, sem fila oculta.
- **Rastreamento:** cada chamada fica em `n8n_requests` (requestId, correlationId, operação, situação, latência, erro), visível em Configurações → Inteligência RINNE. Conteúdo de mensagens não vai para os logs.
