import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { initialiseFixtures } from "./analytics-fixtures.js";
import { discoverSchema, prepareStatement, type Reader, type SchemaSnapshot } from "../src/schema.js";
import { metricStatement, computeMetric } from "../src/analytics.js";
import { jobChart, invoiceEvolution, futureEntries, timeAlerts, taskTable, ingestChart, ingestTable } from "../src/extensions.js";
import { SourceLimitation } from "../src/source-errors.js";
const pg = new PGlite();
const read: Reader = async <T extends Record<string, any>>(sql: string, params: unknown[]) => (await pg.query<T>(sql, params)).rows;
let schema: SchemaSnapshot;
const f = { start: "2026-01-01", end: "2026-01-31", compare: false };
before(async () => {
  await initialiseFixtures(pg);
  await pg.exec(`CREATE TABLE core.job_tasks (job_id bigint, iclips_id bigint);
    INSERT INTO core.job_tasks VALUES (1,1),(2,1);
    CREATE TABLE core.financial_entries (entry_date date, payment_date date, job_id bigint);
    INSERT INTO core.financial_entries VALUES ('2099-01-01','2026-01-01',1);
    CREATE SCHEMA ingest; CREATE TABLE ingest.tasks (id bigint, status text, updated_at timestamptz);
    INSERT INTO ingest.tasks VALUES (1,'RECEIVED','2026-01-02'), (2,'RECONCILE_REQUIRED','2026-01-03');`);
  schema = await discoverSchema(read);
});
after(async () => pg.close());
test("consultas válidas sobrevivem à falta de medidas independentes e duração alternativa", async () => {
  await pg.exec("ALTER TABLE core.invoices RENAME COLUMN net_amount TO unavailable_net; ALTER TABLE core.time_entries RENAME COLUMN duration_minutes TO unavailable_minutes");
  try {
    const minimal = await discoverSchema(read);
    for (const [id, expected] of [["receita_faturada",90], ["horas_registradas",5.25]] as const) {
      const statement = metricStatement(id, f);
      const rows = await read(prepareStatement(minimal, statement.sql), statement.params);
      assert.equal(Number(rows[0].value), expected);
    }
    assert.throws(() => prepareStatement({ ...minimal, columns: minimal.columns.filter(c => c.column !== 'duration_seconds') }, metricStatement('horas_registradas',f).sql), SourceLimitation);
  } finally { await pg.exec("ALTER TABLE core.invoices RENAME COLUMN unavailable_net TO net_amount; ALTER TABLE core.time_entries RENAME COLUMN unavailable_minutes TO duration_minutes"); }
});
test("gráficos usam status atual/cadastro e faturamento sem inventar conclusão ou caixa", async () => {
  assert.equal((await jobChart("opened",f,read)).points[0].projetos, 2);
  assert.equal((await jobChart("status",f,read)).points[0].label, "Exemplo");
  const inv = await invoiceEvolution(f,read); assert.equal(inv.points[0].bruto,90); assert.equal(inv.points[0].liquido,81);
});
test("futuro usa entry_date sem reclassificar pagamento passado", async () => {
  const r = await futureEntries({ ...f, start:'2099-01-01',end:'2099-01-31' },read,schema);
  assert.equal(r.value,1); assert.ok(r.reason?.includes('pagamento passado'));
});
test("alertas e tarefas respeitam granularidade, período de abertura e escopo", async () => {
  const page = { page:1,pageSize:20 };
  assert.equal((await timeAlerts(f,page,read)).total,1);
  const tasks = await taskTable(f,page,read,schema); assert.equal(tasks.total,2);
  assert.notEqual(tasks.rows[0].id,tasks.rows[1].id);
  await assert.rejects(() => taskTable({...f,department:'A'},page,read,schema),SourceLimitation);
  assert.equal((await computeMetric('retrabalho',f,read)).value,1);
});
test("monitoramento é fotografia literal; recusa escopo sem relação", async () => {
  assert.equal((await ingestChart(f,read,schema)).points.length,2);
  assert.equal((await ingestTable(f,{page:1,pageSize:20},read,schema)).total,2);
  await assert.rejects(() => ingestChart({...f,department:'A'},read,schema),SourceLimitation);
});
