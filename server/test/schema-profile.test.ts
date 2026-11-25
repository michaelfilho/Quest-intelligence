import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { initialiseFixtures } from "./analytics-fixtures.js";
import { discoverSchema, validateStatement, mappingCapabilities, type Reader, type SchemaSnapshot } from "../src/schema.js";
import { cashProfile, computeCash, cashRecords } from "../src/cash.js";
import { qualityMetric } from "../src/quality.js";
import { SourceLimitation } from "../src/source-errors.js";
const pg = new PGlite();
const reader: Reader = async <T extends Record<string, any>>(sql: string, params: unknown[]) => (await pg.query<T>(sql, params)).rows;
let schema: SchemaSnapshot;
const f = { start: "2026-01-01", end: "2026-01-31", compare: false };
before(async () => {
  await initialiseFixtures(pg);
  await pg.exec(`CREATE TABLE core.financial_entries (iclips_id bigint PRIMARY KEY, parent_id bigint REFERENCES core.financial_entries(iclips_id), job_id bigint,
    entry_type text, amount numeric, payment_date date, competence_date date);
    INSERT INTO core.financial_entries VALUES
      (1,NULL,1,'Entrada',100,'2026-01-10','2099-01-01'),
      (2,NULL,1,'Saída',40,'2026-01-11','2026-01-01'),
      (3,NULL,1,'Entrada',500,'2026-01-11','2026-01-01'),
      (4,3,1,'Entrada',500,'2026-01-11','2026-01-01'),
      (5,NULL,1,'A Receber',1000,NULL,'2026-01-01'),
      (6,NULL,1,'Entrada',9000,'2099-01-01','2026-01-01');
    CREATE SCHEMA ingest;
    CREATE TABLE ingest.qpf11_tasks (status text, updated_at timestamptz);
    INSERT INTO ingest.qpf11_tasks VALUES ('RECONCILE_REQUIRED','2026-01-01'),('RECEIVED','2026-01-02');`);
  schema = await discoverSchema(reader);
});
after(async () => pg.close());
test("introspecção PostgreSQL retorna tipos, constraints e relacionamentos declarados", () => {
  assert.ok(schema.columns.some(c => c.table === "time_entries" && c.column === "duration_seconds" && c.type === "numeric"));
  assert.ok(schema.constraints.some(c => c.table === "jobs" && c.type === "p"));
  assert.equal(mappingCapabilities(schema).domains.time_entries.available, true);
});
test("schema divergente recusa SQL antes da leitura analítica", () => {
  const missing = { ...schema, columns: schema.columns.filter(c => c.column !== "duration_seconds") };
  assert.throws(() => validateStatement(missing, "SELECT * FROM core.time_entries"), SourceLimitation);
  const wrong = { ...schema, columns: schema.columns.map(c => c.column === "duration_seconds" ? { ...c, type: "text" } : c) };
  assert.throws(() => validateStatement(wrong, "SELECT * FROM core.time_entries"), SourceLimitation);
});
test("movimentos: exclui famílias pai/filho, usa pagamento e preserva perspectiva", async () => {
  assert.equal((await computeCash("entradas_realizadas", f, reader, schema)).value, 100);
  assert.equal((await computeCash("saidas_realizadas", f, reader, schema)).value, 40);
  const saldo = await computeCash("saldo_movimentacoes", f, reader, schema);
  assert.equal(saldo.value, 60); assert.equal(saldo.reliability, "EM_RECONCILIACAO");
  const rows = await cashRecords("entradas_realizadas", f, { page: 1, pageSize: 20 }, reader, schema);
  assert.equal(rows.total, 1); assert.equal(Number(rows.rows[0].valor), 100);
});
test("perfil ambíguo ou falta de vínculo-pai não é resolvido por heurística", async () => {
  const ambiguous = { ...schema, columns: [...schema.columns, { schema: "core", table: "financial_entries", column: "type", type: "text", nullable: "YES" }] };
  assert.throws(() => cashProfile(ambiguous), SourceLimitation);
  const noParent = { ...schema, columns: schema.columns.filter(c => c.column !== "parent_id") };
  await assert.rejects(() => computeCash("saldo_movimentacoes", f, reader, noParent), SourceLimitation);
  assert.throws(() => cashProfile({ ...schema, constraints: [] }), SourceLimitation);
});
test("sinais negativos impedem saldo sem aplicar ABS", async () => {
  await pg.exec("INSERT INTO core.financial_entries VALUES (7,NULL,1,'Entrada',-5,'2026-01-12','2026-01-01')");
  assert.equal((await computeCash("entradas_realizadas", f, reader, schema)).value, 95);
  assert.ok((await computeCash("saldo_movimentacoes", f, reader, schema)).insufficient);
});
test("tarefas são fotografia atual e RECEIVED não é cobertura", async () => {
  const r = await qualityMetric("tarefas_em_reconciliacao", f, reader, schema);
  assert.equal(r.value, 1); assert.equal(r.reliability, "PARCIAL"); assert.ok(r.reason?.includes("sem recorte"));
  assert.ok((await qualityMetric("tarefas_recebidas", f, reader, schema)).coverage?.includes("não comprova"));
  await assert.rejects(() => qualityMetric("tarefas_recebidas", { ...f, department: "A" }, reader, schema), SourceLimitation);
});
