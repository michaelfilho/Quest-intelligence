// Banco próprio da aplicação (SQLite, stdlib node:sqlite): usuários, perfis, sessões, auditoria, configurações.
// Isolado do PostgreSQL analítico. Arquivo em DATA_DIR (volume persistente em produção).
import "./env.js";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { DEFAULT_ROLES } from "../../shared/permissions.js";

export const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL("../data", import.meta.url));
const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));

export const now = () => new Date().toISOString();

let db: DatabaseSync | null = null;

export function store() {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(join(DATA_DIR, "app.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  seed(db);
  return db;
}

/** Aplica migrations/*.sql em ordem, uma única vez cada, dentro de transação. */
function migrate(d: DatabaseSync) {
  d.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const done = new Set(d.prepare("SELECT name FROM schema_migrations").all().map((r) => String(r.name)));
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    d.exec("BEGIN");
    try {
      d.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
      d.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(file, now());
      d.exec("COMMIT");
      console.log(JSON.stringify({ level: "info", scope: "store", msg: "migration aplicada", file }));
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
  }
}

/** Perfis padrão: criados se não existirem. O Administrador é sempre ressincronizado com TODAS as permissões. */
function seed(d: DatabaseSync) {
  const ins = d.prepare("INSERT OR IGNORE INTO roles (id, name, description, permissions, system, updated_at) VALUES (?, ?, ?, ?, 1, ?)");
  for (const r of DEFAULT_ROLES) ins.run(r.id, r.name, r.description, JSON.stringify(r.permissions), now());
  const admin = DEFAULT_ROLES.find((r) => r.id === "admin")!;
  d.prepare("UPDATE roles SET permissions = ? WHERE id = 'admin'").run(JSON.stringify(admin.permissions));
}

export function closeStore() {
  db?.close();
  db = null;
}

// ---------------- Configurações persistentes ----------------
export const SETTING_DEFAULTS = {
  "security.session_idle_minutes": 30,
  "security.session_max_hours": 12,
  "security.login_max_attempts": 5,
  "security.lockout_minutes": 15,
  "security.password_min_length": 12,
  "general.organization": "Quest Comunicação",
  "general.default_period": "Mês atual",
  // RINNE: toda IA é orquestrada no n8n (URL/segredo só em variáveis de ambiente). Aqui ficam só preferências da aplicação.
  "rinne.browser_tts": true, // permite síntese de voz nativa do navegador como alternativa local
  "rinne.history_retention_days": 365,
  "meetings.retention_days": 365,
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export function getSetting<K extends SettingKey>(key: K): (typeof SETTING_DEFAULTS)[K] {
  const row = store().prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? JSON.parse(String(row.value)) : SETTING_DEFAULTS[key];
}

export function allSettings() {
  return Object.fromEntries((Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((k) => [k, getSetting(k)]));
}

export function setSetting(key: SettingKey, value: unknown, by: string) {
  store().prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by").run(key, JSON.stringify(value), now(), by);
}

// ---------------- Auditoria ----------------
export interface AuditEvent {
  event: string;
  outcome?: "success" | "failure" | "denied";
  actorId?: number | null;
  actor?: string | null;
  ip?: string | null;
  target?: string | null;
  details?: Record<string, unknown>;
}

// Chaves que nunca podem ir para a auditoria, mesmo por engano.
const SECRET_KEY = /pass|senha|token|secret|key|cookie|authorization|hash/i;
const scrub = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !SECRET_KEY.test(k)));

export function audit(e: AuditEvent) {
  try {
    store().prepare("INSERT INTO audit_log (at, event, outcome, actor_id, actor, ip, target, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(now(), e.event, e.outcome ?? "success", e.actorId ?? null, e.actor ?? null, e.ip ?? null, e.target ?? null, JSON.stringify(scrub(e.details ?? {})));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "audit", msg: (err as Error).message, event: e.event }));
  }
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

/** Retenção: auditoria (AUDIT_RETENTION_DAYS), conversas, reuniões, nonces e contextos expirados. */
export function pruneAudit() {
  const d = store();
  d.prepare("DELETE FROM audit_log WHERE at < ?").run(daysAgo(Number(process.env.AUDIT_RETENTION_DAYS ?? 365)));
  d.prepare("DELETE FROM rinne_sessions WHERE updated_at < ? AND mode <> 'MEETING'").run(daysAgo(getSetting("rinne.history_retention_days")));
  d.prepare("DELETE FROM meetings WHERE updated_at < ?").run(daysAgo(getSetting("meetings.retention_days")));
  d.prepare("DELETE FROM n8n_requests WHERE created_at < ?").run(daysAgo(Number(process.env.AUDIT_RETENTION_DAYS ?? 365)));
  d.prepare("DELETE FROM webhook_nonces WHERE seen_at < ?").run(daysAgo(1));
  d.prepare("DELETE FROM rinne_exec_contexts WHERE expires_at < ?").run(now());
}
