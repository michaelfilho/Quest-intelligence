// Persistência da aplicação no PostgreSQL (schema app, role qi_app): usuários, perfis, sessões, auditoria,
// configurações e controle de acesso. Separada da conexão analítica somente leitura (db.ts).
import "./env.js";
import pg from "pg";
import { DEFAULT_ROLES } from "../../shared/permissions.js";

export type Row = Record<string, any>;
export interface AppDriver {
  query(sql: string, params: unknown[]): Promise<{ rows: Row[]; rowCount?: number | null; affectedRows?: number }>;
}

let driver: AppDriver | null = null;
let pool: pg.Pool | null = null;
/** Somente testes: substitui o pool por um PostgreSQL embutido. */
export const setAppDriver = (d: AppDriver | null) => { driver = d; };

function appDriver(): AppDriver {
  if (driver) return driver;
  if (!pool) {
    const url = new URL(process.env.APP_DATABASE_URL || "invalid:");
    const expected = process.env.DATABASE_NAME ?? "quest_rinne";
    if (!/^postgres(ql)?:$/.test(url.protocol) || decodeURIComponent(url.pathname.slice(1)) !== expected || url.username === "postgres") {
      throw new Error(`APP_DATABASE_URL ausente ou inválida: exige PostgreSQL, banco ${expected} e usuário diferente de postgres.`);
    }
    pool = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL, max: 5, connectionTimeoutMillis: 3000, options: "-c statement_timeout=15000" });
    pool.on("error", () => console.error(JSON.stringify({ level: "error", msg: "pg app pool" })));
  }
  return pool;
}

export const now = () => new Date().toISOString();

/** SQL com "?" como marcador; valores sempre parametrizados. */
const run_ = (sql: string, params: unknown[]) => {
  let n = 0;
  return appDriver().query(sql.replace(/\?/g, () => `$${++n}`), params);
};
export const all = async (sql: string, ...params: unknown[]) => (await run_(sql, params)).rows;
export const get = async (sql: string, ...params: unknown[]) => (await run_(sql, params)).rows[0] as Row | undefined;
export const run = async (sql: string, ...params: unknown[]) => {
  const r = await run_(sql, params);
  return Number(r.affectedRows ?? r.rowCount ?? 0);
};

/** Perfis padrão: criados se não existirem. O Administrador é sempre ressincronizado com TODAS as permissões. */
export async function seedRoles() {
  for (const r of DEFAULT_ROLES) {
    await run("INSERT INTO app.roles (id, name, description, permissions, system) VALUES (?, ?, ?, ?, true) ON CONFLICT (id) DO NOTHING", r.id, r.name, r.description, JSON.stringify(r.permissions));
  }
  const admin = DEFAULT_ROLES.find((r) => r.id === "admin")!;
  await run("UPDATE app.roles SET permissions = ? WHERE id = 'admin'", JSON.stringify(admin.permissions));
}

export async function closeStore() {
  await pool?.end();
  pool = null;
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
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const row = await get("SELECT value FROM app.app_settings WHERE key = ?", key);
  return row ? row.value : SETTING_DEFAULTS[key];
}

export async function allSettings() {
  const stored = new Map((await all("SELECT key, value FROM app.app_settings")).map((r) => [r.key, r.value]));
  return Object.fromEntries((Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((k) => [k, stored.get(k) ?? SETTING_DEFAULTS[k]]));
}

export async function setSetting(key: SettingKey, value: unknown, by: string) {
  await run("INSERT INTO app.app_settings (key, value, updated_by) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now(), updated_by = excluded.updated_by", key, JSON.stringify(value), by);
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

export async function audit(e: AuditEvent) {
  try {
    await run("INSERT INTO app.audit_log (event, outcome, actor_id, actor, ip, target, details) VALUES (?, ?, ?, ?, ?, ?, ?)", e.event, e.outcome ?? "success", e.actorId ?? null, e.actor ?? null, e.ip ?? null, e.target ?? null, JSON.stringify(scrub(e.details ?? {})));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", scope: "audit", msg: (err as Error).message, event: e.event }));
  }
}

/** Retenção: remove auditoria antiga (AUDIT_RETENTION_DAYS, padrão 365) e sessões expiradas. */
export async function pruneAudit() {
  await run("DELETE FROM app.audit_log WHERE at < ?", new Date(Date.now() - Number(process.env.AUDIT_RETENTION_DAYS ?? 365) * 86400000).toISOString());
  await run("DELETE FROM app.sessions WHERE expires_at < ?", now());
}
