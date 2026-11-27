// Somente testes: PostgreSQL embutido (PGlite) com as migrations reais e os mesmos privilégios de produção.
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/migrate.js";
import { seedRoles, setAppDriver } from "../src/store.js";

export async function createDatabase() {
  const db = new PGlite();
  await db.exec("CREATE ROLE qi_owner; CREATE ROLE qi_migrator; CREATE ROLE qi_app; CREATE ROLE qi_reader; CREATE ROLE qi_ingest; GRANT qi_owner TO qi_migrator; GRANT CREATE ON DATABASE postgres TO qi_owner;");
  const applied = await migrate({ exec: (sql) => db.exec(sql), query: (sql, params) => db.query(sql, params as unknown[]) });
  await db.exec("RESET ROLE");
  return { db, applied };
}

/** Banco da aplicação para os testes: consultas executadas como qi_app. */
export async function useAppDatabase() {
  const { db } = await createDatabase();
  await db.exec("SET ROLE qi_app");
  setAppDriver({ query: (sql, params) => db.query(sql, params) });
  await seedRoles();
  return db;
}
