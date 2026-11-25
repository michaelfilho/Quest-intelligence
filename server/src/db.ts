import "./env.js";
import pg from "pg";
import type { DbState } from "../../shared/contracts.js";

const warned = new Set<string>();
const warn = (msg: string) => warned.has(msg) || (warned.add(msg), console.warn(JSON.stringify({ level: "warn", msg })));

/** Só aceita postgres://…/quest_rinne e recusa o superusuário. Nunca registra a URL. */
function databaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  const expected = process.env.DATABASE_NAME ?? "quest_rinne";
  try {
    const u = new URL(raw);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return warn("DATABASE_URL ignorada: não é uma URL PostgreSQL"), null;
    if (decodeURIComponent(u.pathname.slice(1)) !== expected) return warn(`DATABASE_URL ignorada: banco diferente de ${expected}`), null;
    if (u.username === "postgres") return warn("DATABASE_URL ignorada: a aplicação não pode usar o usuário postgres"), null;
    return raw;
  } catch {
    return warn("DATABASE_URL ignorada: formato inválido"), null;
  }
}

export const SCHEMAS = {
  core: process.env.DATABASE_SCHEMA_CORE ?? "core",
  ingest: process.env.DATABASE_SCHEMA_INGEST ?? "ingest",
  audit: process.env.DATABASE_SCHEMA_AUDIT ?? "audit",
};

let pool: pg.Pool | null = null;

/** Pool criado sob demanda. Retorna null quando DATABASE_URL não está configurado — a aplicação continua de pé. */
export function getPool() {
  const url = databaseUrl();
  if (!url) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
      // Defesa em profundidade: mesmo que a role tenha mais permissões, a sessão é somente leitura.
      options: `-c default_transaction_read_only=on -c statement_timeout=15000 -c TimeZone=${process.env.APP_TIMEZONE ?? "America/Sao_Paulo"}`,
    });
    // Sem este handler, a queda de uma conexão ociosa derrubaria o processo.
    pool.on("error", (e) => console.error(JSON.stringify({ level: "error", msg: "pg pool", error: e.message })));
  }
  return pool;
}

export async function q<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL não configurado");
  return (await p.query<T>(sql, params)).rows;
}

// Estado do banco com cache curto, para não pingar o PostgreSQL a cada indicador.
let cached: { state: DbState; at: number; error?: string } | null = null;
export async function dbState(): Promise<{ state: DbState; error?: string }> {
  if (!getPool()) return { state: "NOT_CONFIGURED" };
  if (cached && Date.now() - cached.at < 15000) return cached;
  try {
    await q("select 1");
    cached = { state: "CONNECTED", at: Date.now() };
  } catch (e) {
    cached = { state: "DATABASE_UNAVAILABLE", at: Date.now(), error: (e as Error).message };
  }
  return cached;
}

export async function closePool() {
  await pool?.end();
  pool = null;
  cached = null;
}
