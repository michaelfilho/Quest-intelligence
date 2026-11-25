# Integração com o n8n

## Regra de arquitetura

**Toda inteligência artificial do QUEST RINNE é orquestrada no n8n.** A aplicação não contém SDKs de provedores (OpenAI, Anthropic, Gemini etc.), chaves de API de IA, configuração de modelos, prompts, controle de tokens nem agentes.

| responsabilidade | onde |
|---|---|
| Agentes, provedores, modelos, prompts de sistema, memória, tokens, custos, fallback entre modelos | **n8n** |
| Interpretação de perguntas, análises, conclusões, resumos, transcrição e síntese de voz | **n8n** |
| Autenticação, permissões, escopo departamental, sessões, auditoria | **backend** |
| Cálculos, agregações e regras financeiras (determinísticos) | **backend** |
| Máquina de estados do Modo reunião | **backend** |
| Persistência de conversas, reuniões e itens | **backend (SQLite da aplicação)** |
| Interface, áudio no navegador, exibição validada das respostas | **frontend** |

O n8n **não** controla permissões nem executa regras financeiras. Quando precisa de dados, usa as **ferramentas** do backend, que reaplicam as permissões do usuário que originou a solicitação.

## Fluxo

```
Navegador ──(sessão + CSRF)──► Backend ──(HMAC, envelope)──► n8n (agente/modelos)
                                  ▲                             │
                                  │   POST /api/internal/tools/{nome}  (HMAC + X-Rinne-Execution)
                                  └─────────────────────────────┘
                                  ▲
                                  └─ 200 síncrono  ou  202 + POST /api/internal/callback
```

1. O usuário pergunta. O backend grava a mensagem, monta o envelope com o contexto **da sessão** (usuário, escopo, ferramentas permitidas, token de execução), assina e envia.
2. O agente no n8n interpreta e, se precisar de números, chama as ferramentas com o token de execução.
3. O backend valida a resposta: descarta indicadores desconhecidos, **recalcula** os valores dos indicadores citados com as permissões do usuário e grava a mensagem.
4. Sem n8n configurado ou disponível, a resposta é marcada como **indisponível**, e o sistema mostra apenas os indicadores relacionados calculados de forma determinística. Não há resposta fictícia.

## Configuração (somente backend)

| variável | padrão | descrição |
|---|---|---|
| `RINNE_N8N_ENABLED` | `false` | liga a integração |
| `RINNE_N8N_WEBHOOK_URL` | — | webhook do workflow (HTTPS, ou `http://servico:porta` em rede privada; credenciais na URL são recusadas) |
| `RINNE_N8N_WEBHOOK_SECRET` | — | segredo HMAC, mínimo 32 caracteres |
| `RINNE_N8N_TIMEOUT_MS` | `60000` | timeout (1 s – 10 min) |
| `RINNE_N8N_MAX_CONCURRENCY` | `4` | chamadas simultâneas |
| `RINNE_TOOLS_BASE_URL` | — | URL que o agente usa para as ferramentas (ex.: `http://api:3333/api/internal/tools`) |
| `RINNE_N8N_ALLOWED_IPS` | — | restringe a origem das chamadas internas (CIDRs) |
| `RINNE_TOOL_MAX_CALLS` | `50` | chamadas de ferramenta por solicitação |

URL e segredo **nunca** são enviados ao navegador. Configurações → Inteligência RINNE mostra apenas o estado, o transporte (HTTPS ou rede privada), a última comunicação, a última falha, a latência média e o histórico de identificadores.

## Persistência

| tabela (SQLite da aplicação) | conteúdo |
|---|---|
| `rinne_sessions` / `rinne_messages` | conversas (CHAT, VOICE, MEETING), mensagens e resposta validada |
| `n8n_requests` | rastreamento de cada chamada (sem conteúdo integral das mensagens nos logs) |
| `webhook_nonces` | nonces vistos (anti-replay), limpos após 1 dia |
| `rinne_exec_contexts` | hash dos tokens de execução, validade e contador de chamadas |
| `meetings`, `meeting_departments`, `meeting_items`, `meeting_segments` | Modo reunião (estado, departamentos, registros, segmentos/checkpoints) |

## Tratamento de erros

| situação | estado da mensagem | o usuário vê |
|---|---|---|
| integração desligada/não configurada | `unavailable` | "análise inteligente indisponível" + indicadores calculados pelo sistema |
| timeout | `error` | "não respondeu a tempo; nada foi reenviado" |
| resposta fora do contrato / `success:false` / HTTP ≠ 2xx | `error` | "não conseguiu concluir" |
| outra solicitação em andamento na mesma conversa | `error` (busy) | aguardar a anterior |
| usuário cancelou | `cancelled` | "solicitação cancelada" |
| 202 | `pending` | "processando…" (a tela consulta com intervalo crescente de 3 s até 15 s) |

## O que precisa ser construído no n8n (produção)

1. Webhook que valida a assinatura (exemplo em [CONTRATOS_WEBHOOKS.md](CONTRATOS_WEBHOOKS.md)).
2. Roteamento por `operation`. `PING` deve responder sem acionar modelos.
3. Agente(s) com as ferramentas HTTP de [FERRAMENTAS_RINNE.md](FERRAMENTAS_RINNE.md), enviando `X-Rinne-Execution` e assinatura.
4. Transcrição e síntese de voz (motores a escolher no n8n) para `TRANSCRIBE` e `audio` na resposta.
5. Resposta no contrato 1.0 (síncrona ou 202 + callback).

Nada disso foi criado ou alterado nesta etapa. Os testes usam apenas um **mock local** ([server/test/n8nmock.ts](../server/test/n8nmock.ts)).
