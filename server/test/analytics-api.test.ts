import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { Client, createUser, startServer } from "./helpers.js";
import { initialiseFixtures } from "./analytics-fixtures.js";
import { closePool } from "../src/db.js";

const engine = new PGlite();
let srv: Awaited<ReturnType<typeof startServer>>;
let admin: Client, restricted: Client;
before(async () => {
  await initialiseFixtures(engine);
  // Substitui apenas o transporte pg por PostgreSQL embarcado de testes; nenhuma rede é usada.
  mock.method(pg.Pool.prototype, "query", async (sql: any, params: any) => engine.query(sql, params));
  process.env.DATABASE_URL = "postgres://fixture_ro@127.0.0.1:1/quest_rinne";
  srv = await startServer();
  await createUser("admin.analytics", "admin");
  await createUser("gestor.analytics", "gestor", { scope: "A", grants: ["financeiro.view", "relatorios.export"] });
  admin = new Client(srv.base); restricted = new Client(srv.base);
  await admin.login("admin.analytics"); await restricted.login("gestor.analytics");
});
after(async () => { await closePool(); srv.stop(); await engine.close(); mock.restoreAll(); });
const period = "start=2026-01-01&end=2026-01-31";

test("API real consulta introspecção e reconcilia indicador, registros e comparação", async () => {
  const k = await admin.req(`/api/indicators/horas_registradas?${period}&compare=1`);
  assert.equal(k.status, 200); assert.equal(k.body.result.value, 4.75);
  assert.equal(k.body.result.previous, null); assert.equal(k.body.result.temporalField, "started_at");
  const r = await admin.req(`/api/indicators/horas_registradas/records?${period}`);
  assert.equal(r.body.rows.reduce((n: number, r: any) => n + Number(r.horas), 0), 4.75);
  const schema = await admin.req("/api/metadata/schema");
  assert.equal(schema.status, 200); assert.equal(schema.body.capabilities.domains.time_entries.available, true);
});
test("escopo imposto vale para cards, registros, dimensões e exportações", async () => {
  const k = await restricted.req(`/api/indicators/horas_registradas?${period}&department=B`);
  assert.equal(k.body.result.value, 2.75);
  const r = await restricted.req(`/api/indicators/horas_registradas/records?${period}&department=B`);
  assert.ok(r.body.rows.every((r: any) => r.department_id === "A"));
  const dim = await restricted.req(`/api/dimensions/departments?${period}&department=B`);
  assert.deepEqual(dim.body.options, [{ value: "A", label: "A" }]);
  const report = await restricted.req(`/api/reports/departamentos?${period}&department=B&format=json`);
  assert.equal(report.body.filters.department, "A");
  assert.equal(report.body.indicators.find((i: any) => i.id === "horas_registradas").value, 2.75);
  const md = await restricted.req(`/api/reports/departamentos?${period}&department=B&format=md`);
  assert.equal(md.status, 200); assert.ok(String(md.body).includes("2,8 h"));
});
test("financeiro sem vínculo departamental retorna insuficiência mesmo com grant financeiro", async () => {
  const k = await restricted.req(`/api/indicators/receita_faturada?${period}`);
  assert.equal(k.body.result.status, "INSUFFICIENT_DATA"); assert.equal(k.body.result.value, null);
  const rows = await restricted.req(`/api/tables/notas_fiscais?${period}`);
  assert.equal(rows.body.status, "INSUFFICIENT_DATA"); assert.deepEqual(rows.body.rows, []);
  assert.equal((await restricted.req("/api/metadata/schema")).status, 403);
});
test("relatório financeiro usa PostgreSQL e mantém faturamento separado de caixa", async () => {
  const r = await admin.req(`/api/reports/financeiro?${period}&format=json`);
  assert.equal(r.status, 200);
  assert.equal(r.body.indicators.find((i: any) => i.id === "receita_faturada").value, 90);
  assert.equal(r.body.indicators.find((i: any) => i.id === "receita_recebida").value, null);
  for (const format of ["csv", "xlsx", "md"]) assert.equal((await admin.req(`/api/reports/financeiro?${period}&format=${format}`)).status, 200);
});
test("cookie em /core/ é emitido e apagado pelo backend mantendo os atributos", async () => {
  process.env.APP_BASE_PATH = "/core/";
  process.env.COOKIE_SECURE = "true";
  try {
    const c = new Client(srv.base); const login = await c.login("admin.analytics");
    const cookie = login.headers.getSetCookie()[0];
    for (const attribute of ["Path=/core/", "Secure", "HttpOnly", "SameSite=Strict"]) assert.ok(cookie.includes(attribute));
    const logout = await c.req("/api/auth/logout", { method: "POST" });
    assert.match(logout.headers.getSetCookie()[0], /Path=\/core\/;.*Max-Age=0/);
  } finally { process.env.APP_BASE_PATH = "/"; process.env.COOKIE_SECURE = "false"; }
});
test("fotografia de cadastro não fabrica comparação histórica", async () => {
  const r = await admin.req(`/api/indicators/projetos_cadastrados?${period}&compare=1`);
  assert.equal(r.body.result.value, 2); assert.equal(r.body.result.previous, null);
  assert.ok(r.body.result.reason.includes("sem reconstrução"));
});
