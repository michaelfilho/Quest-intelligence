// A modelagem nova precisa servir TODAS as consultas existentes: com o banco vazio, nada pode falhar,
// nem apontar campo/relacionamento ausente. Executado com os privilégios de qi_reader.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import pg from "pg";
import { createDatabase } from "./app-db.js";
import { CHARTS, INDICATORS, MODULES, TABLES } from "../../shared/catalog.js";
import { DIMENSIONS, type Filters } from "../../shared/contracts.js";

const { db, applied } = await createDatabase();
await db.exec("SET ROLE qi_reader; SET TIME ZONE 'America/Sao_Paulo'");
mock.method(pg.Pool.prototype, "connect", async () => ({ query: (sql: string, params: unknown[]) => db.query(sql, params), release() {} }));
process.env.DATABASE_URL = "postgres://qi_reader@127.0.0.1:1/quest_rinne";
const services = await import("../src/services.js");

const filters: Filters = { start: "2026-01-01", end: "2026-01-31", compare: true };
const page = { page: 1, pageSize: 10 };
// Limitações que denunciam modelagem incompatível (diferente de "sem registros" ou critério pendente).
const BROKEN = new Set(["MISSING_FIELD", "INVALID_RELATIONSHIP", "QUERY_FAILURE"]);
const broken: string[] = [];
const verify = (kind: string, id: string, r: { status: string; reasonCode?: string; reason?: string }) => {
  // NOT_IMPLEMENTED: itens do catálogo que nunca tiveram mapeamento (ex.: títulos a pagar/receber).
  if (r.status !== "NOT_IMPLEMENTED" && (r.status === "ERROR" || r.status === "DATABASE_UNAVAILABLE" || BROKEN.has(r.reasonCode ?? ""))) broken.push(`${kind} ${id}: ${r.status} ${r.reasonCode} — ${r.reason}`);
};

test("as migrations criam o banco do zero", () => {
  assert.deepEqual(applied, ["001_app.sql", "002_data.sql", "003_grants.sql"]);
});

test("todos os indicadores, gráficos, tabelas e filtros funcionam sem dados empresariais", async () => {
  for (const id of Object.keys(INDICATORS)) verify("indicador", id, await services.resolveIndicator(id, filters, "CONNECTED"));
  for (const id of Object.keys(CHARTS)) verify("gráfico", id, await services.resolveChart(id, filters, "CONNECTED"));
  for (const id of Object.keys(TABLES)) verify("tabela", id, await services.resolveTable(id, filters, page, "CONNECTED"));
  for (const dim of DIMENSIONS) verify("filtro", dim, await services.resolveDimension(dim, filters));
  assert.deepEqual(broken, []);
  assert.ok(MODULES.length >= 16);
});

test("nenhum valor é inventado: só contagens zero ou ausência de valor", async () => {
  for (const id of Object.keys(INDICATORS)) {
    const r = await services.resolveIndicator(id, filters, "CONNECTED");
    if (r.status === "OK") assert.ok(r.value === null || Number(r.value) === 0, `${id} devolveu ${r.value} com o banco vazio`);
  }
});

test("a role analítica não escreve nem lê a aplicação", async () => {
  await assert.rejects(() => db.query("SELECT * FROM app.users"), /permission denied/);
  await assert.rejects(() => db.query("INSERT INTO core.client_groups (iclips_id, ingest_task_id) VALUES (1, 1)"), /permission denied/);
});

test("workflow antigo não grava: toda linha exige uma tarefa de coleta nova", async () => {
  await db.exec("RESET ROLE; SET ROLE qi_ingest");
  await assert.rejects(() => db.query("INSERT INTO core.clients (iclips_id, name) VALUES (1, 'x')"), /ingest_task_id/);
  await assert.rejects(() => db.query("SELECT * FROM ingest.qpf11_tasks"), /does not exist/);
  await assert.rejects(() => db.query("SELECT * FROM app.users"), /permission denied/);
  await assert.rejects(() => db.query("INSERT INTO core.goals (indicator_id, period_start, period_end, target, direction) VALUES ('a', '2026-01-01', '2026-01-31', 1, 'above')"), /permission denied/);
  // carga idempotente: a mesma chave de origem atualiza em vez de duplicar
  const task = await db.query<{ id: number }>("INSERT INTO ingest.tasks (source_code, resource, idempotency_key) VALUES ('iclips', 'clients', 'lote-1') RETURNING id");
  const upsert = "INSERT INTO core.clients (iclips_id, name, ingest_task_id) VALUES (1, $1, $2) ON CONFLICT (iclips_id) DO UPDATE SET name = excluded.name, ingest_task_id = excluded.ingest_task_id, updated_at = now()";
  await db.query(upsert, ["A", task.rows[0].id]);
  await db.query(upsert, ["B", task.rows[0].id]);
  assert.deepEqual((await db.query("SELECT name FROM core.clients")).rows, [{ name: "B" }]);
  await assert.rejects(() => db.query("INSERT INTO ingest.tasks (source_code, resource, idempotency_key) VALUES ('iclips', 'clients', 'lote-1')"), /duplicate key/);
});
