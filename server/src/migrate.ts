// Migrations versionadas do PostgreSQL. Executadas pela role qi_migrator (nunca pela API).
// Uso: MIGRATION_DATABASE_URL=postgres://qi_migrator:...@host:5432/quest_rinne npm run db:migrate
// Reexecutável: aplica só o que falta, em uma transação por arquivo, e recusa arquivo já aplicado que mudou.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const DIR = new URL("../db/migrations/", import.meta.url);
export const migrationFiles = () => readdirSync(DIR).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();

/** `exec` roda um script com várias instruções; `query` devolve linhas. */
export interface Runner {
  exec(sql: string): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export async function migrate(db: Runner) {
  await db.exec("SET ROLE qi_owner");
  await db.exec("CREATE SCHEMA IF NOT EXISTS app_meta; CREATE TABLE IF NOT EXISTS app_meta.migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Map((await db.query("SELECT name, checksum FROM app_meta.migrations")).rows.map((r) => [String(r.name), String(r.checksum)]));
  const applied: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(new URL(file, DIR), "utf8").replace(/\r\n/g, "\n");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (done.has(file)) {
      if (done.get(file) !== checksum) throw new Error(`Migration já aplicada foi alterada: ${file}. Crie uma nova migration.`);
      continue;
    }
    await db.exec("BEGIN");
    try {
      // A tabela abaixo existe antes de 003 para que os grants possam referenciá-la.
      await db.exec(file === "003_grants.sql" ? `CREATE VIEW app.schema_migrations AS SELECT name, applied_at FROM app_meta.migrations;\n${sql}` : sql);
      await db.query("INSERT INTO app_meta.migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
    applied.push(file);
  }
  return applied;
}

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL não configurado.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // Trava global: duas execuções simultâneas não aplicam a mesma migration.
    await client.query("SELECT pg_advisory_lock(hashtext('quest-intelligence-migrations'))");
    const applied = await migrate({ exec: (sql) => client.query(sql), query: (sql, params) => client.query(sql, params) });
    console.log(applied.length ? `Migrations aplicadas: ${applied.join(", ")}` : "Banco já atualizado.");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`Falha na migration: ${(e as Error).message}`);
    process.exitCode = 1;
  });
}
export const MIGRATIONS_DIR = fileURLToPath(DIR);
