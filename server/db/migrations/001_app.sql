-- Persistência da aplicação: usuários, perfis, sessões, auditoria, configurações e controle de acesso.
CREATE SCHEMA app;
COMMENT ON SCHEMA app IS 'Dados da própria aplicação. Acesso somente pela role qi_app.';

CREATE TABLE app.roles (
  id          text PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
  system      boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE app.roles IS 'Perfis de acesso e suas permissões.';

CREATE TABLE app.users (
  id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username             text NOT NULL CHECK (username ~ '^[A-Za-z0-9._-]{3,64}$'),
  name                 text NOT NULL,
  email                text,
  password_hash        text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  role_id              text REFERENCES app.roles(id) ON DELETE SET NULL,
  grants               jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(grants) = 'array'),
  denies               jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(denies) = 'array'),
  scope_department     text,
  active               boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  password_changed_at  timestamptz,
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_unique ON app.users (lower(username));
COMMENT ON TABLE app.users IS 'Contas individuais. A senha só existe como hash Argon2id.';
COMMENT ON COLUMN app.users.scope_department IS 'Restringe os dados a um departamento (core.departments.id); sem FK porque o cadastro vem da integração.';

CREATE TABLE app.sessions (
  id           text PRIMARY KEY CHECK (length(id) = 64),
  user_id      integer NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL,
  ip           text,
  user_agent   text
);
CREATE INDEX sessions_user ON app.sessions (user_id);
CREATE INDEX sessions_expires ON app.sessions (expires_at);
COMMENT ON TABLE app.sessions IS 'Sessões ativas; id é o SHA-256 do token, que só existe no cookie.';

CREATE TABLE app.audit_log (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at       timestamptz NOT NULL DEFAULT now(),
  event    text NOT NULL,
  outcome  text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','failure','denied')),
  actor_id integer,
  actor    text,
  ip       text,
  target   text,
  details  jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_log_at ON app.audit_log (at);
CREATE INDEX audit_log_event ON app.audit_log (event);
COMMENT ON TABLE app.audit_log IS 'Auditoria de acessos e alterações, sem segredos.';

CREATE TABLE app.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
COMMENT ON TABLE app.app_settings IS 'Configurações alteradas pela interface.';

CREATE TABLE app.login_locks (
  ip           text PRIMARY KEY,
  fails        integer NOT NULL DEFAULT 0 CHECK (fails >= 0),
  locks        integer NOT NULL DEFAULT 0 CHECK (locks >= 0),
  locked_until timestamptz NOT NULL DEFAULT 'epoch'
);
COMMENT ON TABLE app.login_locks IS 'Bloqueio progressivo de login por IP (3 erros; cada bloqueio triplica).';

CREATE TABLE app.access_state (
  singleton  boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz,
  updated_by text
);
INSERT INTO app.access_state DEFAULT VALUES;
COMMENT ON TABLE app.access_state IS 'Liga/desliga o controle de acesso por IP (linha única).';

CREATE TABLE app.ip_allowlist (
  cidr     text PRIMARY KEY,
  label    text NOT NULL DEFAULT '',
  added_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE app.ip_allowlist IS 'IPs e redes autorizados.';

CREATE TABLE app.ip_requests (
  ip         text PRIMARY KEY,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dismissed')),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  user_agent text NOT NULL DEFAULT ''
);
CREATE INDEX ip_requests_pending ON app.ip_requests (status, last_seen);
COMMENT ON TABLE app.ip_requests IS 'IPs recusados aguardando autorização ou excluídos.';
