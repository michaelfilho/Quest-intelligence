// Testes sem banco: a API deve subir, responder e declarar DATABASE_UNAVAILABLE/NOT_CONFIGURED — nunca valores.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client, createUser, startServer } from "./helpers.js";

const { CHARTS, INDICATORS, MODULES, TABLES } = await import("../../shared/catalog.js");
const { previousPeriod, monthPeriod, defaultPeriod } = await import("../../shared/contracts.js");

let srv: Awaited<ReturnType<typeof startServer>>;
let admin: Client;
before(async () => {
  srv = await startServer();
  await createUser("admin.api", "admin");
  admin = new Client(srv.base);
  await admin.login("admin.api");
});
after(() => srv.stop());

const get = (path: string) => admin.req(path);

test("catálogo: ids únicos e referências válidas", () => {
  const ids = new Set<string>();
  for (const m of MODULES) {
    assert.ok(!ids.has(m.id), `módulo duplicado ${m.id}`);
    ids.add(m.id);
    for (const i of m.indicators) assert.ok(INDICATORS[i], `${m.id}: indicador ${i} inexistente`);
    for (const c of m.charts) assert.ok(CHARTS[c], `${m.id}: gráfico ${c} inexistente`);
    for (const t of m.tables) assert.ok(TABLES[t], `${m.id}: tabela ${t} inexistente`);
  }
  for (const i of Object.values(INDICATORS)) assert.ok(i.formula && i.sources.length, `${i.id} sem fórmula/fonte`);
  for (const t of Object.keys(TABLES)) assert.ok(MODULES.some((m) => m.tables.includes(t)), `tabela ${t} sem módulo (ficaria inacessível)`);
});

test("datas: período anterior e mês", () => {
  assert.deepEqual(previousPeriod("2026-11-01", "2026-11-30"), { start: "2026-10-02", end: "2026-10-31" });
  assert.deepEqual(previousPeriod("2026-03-01", "2026-03-01"), { start: "2026-02-28", end: "2026-02-28" });
  assert.deepEqual(monthPeriod(2028, 2), { start: "2028-02-01", end: "2028-02-29" });
  assert.equal(defaultPeriod("2026-11-24").start, "2026-11-01");
});

test("health responde 200 sem banco", async () => {
  const r = await get("/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "ok");
  assert.equal(r.body.database, "NOT_CONFIGURED");
  assert.equal(r.body.session, null);
});

test("todos os módulos respondem sem banco e sem valores", async () => {
  for (const m of MODULES) {
    const qs = m.detailOf === "client" ? "?client=123" : m.detailOf === "project" ? "?project=456" : "";
    const r = await get(`/api/modules/${m.id}${qs}`);
    assert.equal(r.status, 200, m.id);
    assert.equal(r.body.indicators.length, m.indicators.length);
    for (const i of r.body.indicators) {
      assert.equal(i.status, "DATABASE_UNAVAILABLE");
      assert.equal(i.reliability, "INDISPONIVEL");
      assert.equal(i.value, null);
    }
    for (const c of r.body.charts) assert.deepEqual([c.status, c.points.length], ["DATABASE_UNAVAILABLE", 0]);
  }
});

test("filtros: padrão, comparação e validação", async () => {
  const ok = await get("/api/modules/financeiro?start=2026-11-01&end=2026-11-30&compare=1&client=abc-1");
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.previousPeriod, { start: "2026-10-02", end: "2026-10-31" });
  assert.equal(ok.body.filters.client, "abc-1");

  const def = await get("/api/modules/executivo");
  assert.match(def.body.filters.start, /^\d{4}-\d{2}-01$/);

  for (const bad of ["start=2026-13-45", "start=2026-12-01&end=2026-11-01", "client=1;drop table x", "start=2010-01-01&end=2026-01-01", "client=" + "x".repeat(65)]) {
    const r = await get(`/api/modules/financeiro?${bad}`);
    assert.equal(r.status, 400, bad);
    assert.ok(r.body.details.length);
  }
});

test("detalhe exige escopo; ids desconhecidos dão 404", async () => {
  assert.equal((await get("/api/modules/cliente")).status, 400);
  assert.equal((await get("/api/modules/nao-existe")).status, 404);
  assert.equal((await get("/api/indicators/nao-existe")).status, 404);
  assert.equal((await get("/api/tables/nao-existe")).status, 404);
  assert.equal((await get("/api/dimensions/nao-existe")).status, 404);
  assert.equal((await get("/api/qualquer")).status, 404);
});

test("rastreabilidade, tabelas, dimensões e cobertura sem banco", async () => {
  const d = await get("/api/indicators/receita_recebida?compare=1");
  assert.equal(d.status, 200);
  assert.equal(d.body.definition.basis, "recebimento");
  assert.equal(d.body.result.status, "DATABASE_UNAVAILABLE");
  assert.ok(d.body.previousPeriod);

  const rec = await get("/api/indicators/receita_recebida/records?page=2&pageSize=10");
  assert.deepEqual([rec.body.status, rec.body.page, rec.body.pageSize, rec.body.rows.length], ["DATABASE_UNAVAILABLE", 2, 10, 0]);

  const t = await get("/api/tables/lancamentos_financeiros?pageSize=50");
  assert.deepEqual([t.status, t.body.status, t.body.total], [200, "DATABASE_UNAVAILABLE", 0]);
  assert.equal((await get("/api/tables/lancamentos_financeiros?pageSize=500")).status, 400);
  assert.equal((await get("/api/tables/lancamentos_financeiros?page=0")).status, 400);

  const csv = await get("/api/reports/rentabilidade?format=csv");
  assert.equal(csv.status, 200);
  assert.match(csv.body, /DADOS INDISPONÍVEIS/); // exporta, mas declara a ausência de valores
  assert.equal((await get("/api/reports/nao-existe?format=csv")).status, 404);

  const dim = await get("/api/dimensions/clients");
  assert.deepEqual([dim.body.status, dim.body.options], ["DATABASE_UNAVAILABLE", []]);

  const cov = await get("/api/metadata/coverage");
  assert.deepEqual([cov.status, cov.body.database, cov.body.tables], [200, "NOT_CONFIGURED", []]);
});

test("DATABASE_URL de outro projeto, de outro banco ou com usuário postgres é recusada", async () => {
  const { closePool, getPool } = await import("../src/db.js");
  for (const url of ["file:./dev.db", "postgres://app:x@127.0.0.1:5432/outro_banco", "postgres://postgres:x@127.0.0.1:5432/quest_rinne", "não é url"]) {
    process.env.DATABASE_URL = url;
    await closePool();
    assert.equal(getPool(), null, url);
  }
  process.env.DATABASE_URL = "";
  assert.equal((await get("/api/health")).body.database, "NOT_CONFIGURED");
});

test("banco configurado porém inacessível → DATABASE_UNAVAILABLE sem derrubar a API", async () => {
  const { closePool, dbState } = await import("../src/db.js");
  process.env.DATABASE_URL = "postgres://ninguem:x@127.0.0.1:1/quest_rinne"; // porta fechada
  await closePool();
  try {
    const s = await dbState();
    assert.equal(s.state, "DATABASE_UNAVAILABLE");
    const r = await get("/api/modules/qualidade");
    assert.equal(r.status, 200);
    assert.equal(r.body.database, "DATABASE_UNAVAILABLE");
    assert.equal((await get("/api/health")).body.database, "DATABASE_UNAVAILABLE");
  } finally {
    process.env.DATABASE_URL = "";
    await closePool();
  }
});
