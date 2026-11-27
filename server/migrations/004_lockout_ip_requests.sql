-- 004 — Bloqueio progressivo de login por IP e IPs aguardando autorização.
CREATE TABLE login_locks (
  ip            TEXT PRIMARY KEY,
  fails         INTEGER NOT NULL DEFAULT 0,   -- falhas desde o último bloqueio
  locks         INTEGER NOT NULL DEFAULT 0,   -- bloqueios seguidos (cada um triplica o tempo)
  locked_until  INTEGER NOT NULL DEFAULT 0    -- epoch em ms
);
CREATE TABLE ip_requests (
  ip          TEXT PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | dismissed
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  user_agent  TEXT NOT NULL DEFAULT ''
);
