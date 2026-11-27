import { loadAccess } from "./access.js";
import { createApp } from "./app.js";
import { closePool, dbState } from "./db.js";
import { migrationFiles } from "./migrate.js";
import { all, closeStore, get, pruneAudit, seedRoles } from "./store.js";

/** A API só aceita conexões com o banco da aplicação acessível e todas as migrations aplicadas. */
async function prepare() {
  for (let attempt = 1; ; attempt++) {
    try {
      const applied = new Set((await all("SELECT name FROM app.schema_migrations")).map((r) => r.name));
      const missing = migrationFiles().filter((f) => !applied.has(f));
      if (missing.length) throw new Error(`migrations pendentes: ${missing.join(", ")}`);
      break;
    } catch (e) {
      if (attempt >= 10) throw e;
      console.warn(JSON.stringify({ level: "warn", msg: "banco da aplicação indisponível; nova tentativa", attempt }));
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await seedRoles();
  await pruneAudit();
  await loadAccess();
  const users = Number((await get("SELECT count(*) AS n FROM app.users"))?.n ?? 0);
  if (!users) console.warn(JSON.stringify({ level: "warn", msg: "Nenhum usuário cadastrado. Crie o administrador: npm run user:admin -- <usuario>" }));
}

await prepare().catch((e) => {
  console.error(JSON.stringify({ level: "error", msg: `Não foi possível iniciar: ${(e as Error).message}` }));
  process.exit(1);
});

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "127.0.0.1"; // no container: HOST=0.0.0.0 (rede interna do Docker)

const server = createApp().listen(port, host, async () => {
  console.log(JSON.stringify({ level: "info", msg: `QUEST INTELLIGENCE API em http://${host}:${port}`, database: (await dbState()).state }));
});
const prune = setInterval(() => void pruneAudit().catch(() => {}), 6 * 3600_000);
prune.unref();

for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => server.close(() => Promise.all([closePool(), closeStore()]).then(() => process.exit(0))));
