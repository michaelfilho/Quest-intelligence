-- 002 — Inteligência RINNE via n8n: conversas, rastreamento de requisições, segurança dos webhooks,
-- contexto de execução das ferramentas e Modo Reunião (máquina de estados, itens, segmentos/checkpoints).
-- Nenhuma credencial é armazenada aqui. Configuração do n8n vem SÓ de variáveis de ambiente do backend.

-- Configurações de IA direta foram removidas da arquitetura (toda IA é orquestrada no n8n).
DELETE FROM app_settings WHERE key IN ('ai.enabled', 'ai.model', 'voice.enabled', 'voice.retain_audio');

-- Conversas da RINNE (uma inteligência; o modo diferencia o contexto).
CREATE TABLE rinne_sessions (
  id          TEXT PRIMARY KEY,                        -- uuid (sessionId do contrato)
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL CHECK (mode IN ('CHAT', 'VOICE', 'MEETING')),
  title       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX rinne_sessions_user ON rinne_sessions(user_id, updated_at);

CREATE TABLE rinne_messages (
  id          TEXT PRIMARY KEY,                        -- uuid
  session_id  TEXT NOT NULL REFERENCES rinne_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  status      TEXT NOT NULL DEFAULT 'done',            -- done | pending | error | unavailable | cancelled
  content     TEXT NOT NULL DEFAULT '',                -- texto exibido (sempre tratado como texto puro)
  payload     TEXT NOT NULL DEFAULT '{}',              -- JSON validado (fontes, indicadores, tabelas, avisos...)
  request_id  TEXT,                                    -- vínculo com n8n_requests
  created_at  TEXT NOT NULL
);
CREATE INDEX rinne_messages_session ON rinne_messages(session_id, created_at);

-- Rastreabilidade de toda comunicação com o n8n (sem payloads sensíveis completos).
CREATE TABLE n8n_requests (
  request_id      TEXT PRIMARY KEY,                    -- uuid; também chave de idempotência
  idempotency_key TEXT UNIQUE,                         -- enviado pelo cliente (Idempotency-Key), opcional
  correlation_id  TEXT NOT NULL,
  session_id      TEXT,
  user_id         INTEGER,
  mode            TEXT NOT NULL,
  operation       TEXT NOT NULL,
  status          TEXT NOT NULL,                       -- pending | success | error | timeout | unavailable | accepted | cancelled
  http_status     INTEGER,
  latency_ms      INTEGER,
  error           TEXT,
  response        TEXT,                                -- resposta validada (JSON) para idempotência
  created_at      TEXT NOT NULL,
  completed_at    TEXT
);
CREATE INDEX n8n_requests_created ON n8n_requests(created_at);

-- Anti-replay: nonces já vistos em chamadas assinadas recebidas do n8n.
CREATE TABLE webhook_nonces (
  nonce       TEXT PRIMARY KEY,
  seen_at     TEXT NOT NULL
);

-- Contexto de execução de curta duração para as ferramentas chamadas pelos agentes do n8n.
-- O token só existe no payload enviado ao n8n; aqui fica o SHA-256. Permissões são recalculadas do banco a cada uso.
CREATE TABLE rinne_exec_contexts (
  id          TEXT PRIMARY KEY,                        -- SHA-256 do token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  TEXT,
  request_id  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  max_calls   INTEGER NOT NULL,
  calls       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

-- Modo Reunião
CREATE TABLE meetings (
  id              TEXT PRIMARY KEY,                    -- uuid
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rinne_session_id TEXT REFERENCES rinne_sessions(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  state           TEXT NOT NULL,                       -- máquina de estados (server/src/meetings/state.ts)
  paused_from     TEXT,                                -- estado anterior à pausa/erro
  consent_microphone INTEGER NOT NULL DEFAULT 0,
  consent_recording  INTEGER NOT NULL DEFAULT 0,
  current_department_id TEXT,
  error           TEXT,
  report          TEXT,                                -- relatório consolidado (JSON)
  started_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  completed_at    TEXT
);
CREATE INDEX meetings_user ON meetings(user_id, updated_at);

CREATE TABLE meeting_departments (
  id            TEXT PRIMARY KEY,
  meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  department    TEXT NOT NULL,
  period_label  TEXT,
  period_start  TEXT,
  period_end    TEXT,
  status        TEXT NOT NULL DEFAULT 'active',        -- active | completed
  indicators    TEXT NOT NULL DEFAULT '[]',            -- snapshot determinístico (JSON) dos indicadores analisados
  summary       TEXT,                                  -- consolidação (JSON): determinística + IA (se houver)
  started_at    TEXT NOT NULL,
  completed_at  TEXT
);
CREATE INDEX meeting_departments_meeting ON meeting_departments(meeting_id, seq);

CREATE TABLE meeting_items (
  id             TEXT PRIMARY KEY,
  meeting_id     TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  department_id  TEXT REFERENCES meeting_departments(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('observation', 'decision', 'problem', 'opportunity', 'action')),
  text           TEXT NOT NULL,
  responsible    TEXT,                                 -- só quando informado
  due_date       TEXT,                                 -- só quando informado
  source         TEXT NOT NULL DEFAULT 'user',         -- user | rinne
  created_at     TEXT NOT NULL
);
CREATE INDEX meeting_items_meeting ON meeting_items(meeting_id);

-- Segmentos (áudio/transcrição) com checkpoint para reuniões longas. Áudio bruto NÃO é armazenado.
CREATE TABLE meeting_segments (
  id            TEXT PRIMARY KEY,
  meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  department_id TEXT REFERENCES meeting_departments(id) ON DELETE SET NULL,
  seq           INTEGER NOT NULL,
  duration_ms   INTEGER NOT NULL,
  bytes         INTEGER NOT NULL,
  status        TEXT NOT NULL,                          -- received | transcribed | unavailable | error
  transcript    TEXT,
  request_id    TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (meeting_id, seq)
);
