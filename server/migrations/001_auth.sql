-- 001 — Autenticação, perfis, sessões, auditoria e configurações da aplicação.
-- Banco PRÓPRIO da aplicação (SQLite em server/data/app.db), isolado do PostgreSQL analítico
-- (core/ingest/audit continuam somente leitura). Aplicada automaticamente na inicialização da API.

CREATE TABLE roles (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  permissions  TEXT NOT NULL DEFAULT '[]',          -- JSON: lista de permissões
  system       INTEGER NOT NULL DEFAULT 0,          -- 1 = perfil padrão (não pode ser excluído)
  updated_at   TEXT NOT NULL
);

CREATE TABLE users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name                  TEXT NOT NULL,
  email                 TEXT,
  password_hash         TEXT NOT NULL,              -- PHC argon2id; nunca texto puro
  role_id               TEXT REFERENCES roles(id) ON DELETE SET NULL,  -- NULL = nenhuma permissão
  grants                TEXT NOT NULL DEFAULT '[]', -- permissões extras individuais
  denies                TEXT NOT NULL DEFAULT '[]', -- permissões removidas individualmente
  scope_department      TEXT,                       -- restringe dados a um departamento (gestor)
  active                INTEGER NOT NULL DEFAULT 1,
  must_change_password  INTEGER NOT NULL DEFAULT 1,
  password_changed_at   TEXT,
  last_login_at         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,                    -- SHA-256 do token (o token em si só existe no cookie)
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,                       -- expiração absoluta
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  event     TEXT NOT NULL,
  outcome   TEXT NOT NULL DEFAULT 'success',        -- success | failure | denied
  actor_id  INTEGER,
  actor     TEXT,                                   -- username no momento do evento
  ip        TEXT,
  target    TEXT,
  details   TEXT NOT NULL DEFAULT '{}'              -- JSON sem segredos
);
CREATE INDEX audit_at ON audit_log(at);
CREATE INDEX audit_event ON audit_log(event);

CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,                        -- JSON
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);
