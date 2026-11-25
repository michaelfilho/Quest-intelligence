import { initialiseFixtures } from "./analytics-fixtures.js";
// PostgreSQL real embarcado (PGlite), exclusivamente fixtures sintéticas em memória.
// Não acessa o banco externo nem usa SQLite como substituto de SQL PostgreSQL.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { computeMetric, metricRecords, metricStatement, sourceStatement, timeTable, timeChart, invoiceChart, type Query, SourceLimitation } from "../src/analytics.js";
import type { Filters } from "../../shared/contracts.js";

const pg = new PGlite();
const query: Query = async <T extends Record<string, any>>(sql: string, params: unknown[]) => (await pg.query<T>(sql, params)).rows;
const f: Filters = { start: "2026-01-01", end: "2026-01-31", compare: false };
test('agregado consolidado equivale ao SQL anterior para valor, usados e excluídos em vários escopos',async()=>{
  for(const scope of [f,{...f,employee:'1'},{...f,department:'B'},{...f,client:'10'},{...f,start:'2099-01-01',end:'2099-01-31'}]){
    for(const id of ['horas_registradas','horas_retrabalho','retrabalho','percentual_retrabalho','colaboradores_ativos','projetos_atendidos','clientes_ativos']){
      const stmt=metricStatement(id,scope),[old]=await query(stmt.sql,stmt.params),now=await computeMetric(id,scope,query);
      const zero=id==='horas_retrabalho'&&old.value==null&&Number(old.base_used)>0&&Number(old.missing_flags)===0;
      assert.equal(now.value,zero?0:old.value==null?null:Number(old.value),`${id} valor`);
      assert.equal(now.recordsUsed,Number(old.used),`${id} usados`);assert.equal(now.recordsExcluded,Number(old.excluded),`${id} excluídos`);
    }
  }
});
before(async () => {
  await initialiseFixtures(pg);
});
after(async () => pg.close());
test('predicado temporal sem função na coluna preserva fronteiras e timezone nos três tipos',async()=>{
  try{
    for(const zone of ['America/Sao_Paulo','UTC','America/New_York']){
      await pg.query('SELECT set_config($1,$2,false)',['TimeZone',zone]);
      for(const type of ['date','timestamp','timestamptz']){
        const [r]=await query(`WITH samples AS (SELECT x::${type} AS value FROM unnest(ARRAY['2026-01-01','2026-01-31 23:59:59','2026-02-01','2026-02-01 02:59:59+00',NULL]) x)
          SELECT count(*) FILTER(WHERE ((value::timestamptz>=($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND value::timestamptz<(($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')) IS DISTINCT FROM
            (value>=($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND value<(($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))))::int AS differences FROM samples`,[f.start,f.end]);
        assert.equal(r.differences,0,`${zone} ${type}`);
      }
    }
  }finally{await pg.query('SELECT set_config($1,$2,false)',['TimeZone','America/Sao_Paulo']);}
});

test("PostgreSQL: duração única, fallback, nulos, negativos, inconsistências e sem fanout", async () => {
  const r = await computeMetric("horas_registradas", f, query);
  assert.equal(r.value, 4.75); // 1 + .5 + 2 + .25 + 1; nenhum join 1:N
  assert.equal(r.recordsUsed, 5);
  assert.equal(r.recordsExcluded, 3);
  assert.equal(r.reliability, "PARCIAL");
});
test("PostgreSQL: escopo departamental e cliente com filtro por IDs parametrizados", async () => {
  assert.equal((await computeMetric("horas_registradas", { ...f, department: "A", client: "10" }, query)).value, 2.5);
  assert.equal((await computeMetric("horas_registradas", { ...f, employee: "2" }, query)).value, 2);
  const s = metricStatement("horas_registradas", { ...f, department: "x' OR 1=1 --" });
  assert.ok(!s.sql.includes("x' OR")); assert.ok(s.params.includes("x' OR 1=1 --"));
});
test("PostgreSQL: retrabalho soma a mesma base elegível e percentual é fração", async () => {
  assert.equal((await computeMetric("horas_retrabalho", f, query)).value, .5);
  assert.equal((await computeMetric("percentual_retrabalho", f, query)).value, .5 / 4.75);
});
test('zero de retrabalho exige evidência; flags ausentes não viram zero',async()=>{
  const employee={...f,employee:'2'};
  assert.equal((await computeMetric('horas_retrabalho',employee,query)).value,0);
  assert.equal((await computeMetric('percentual_retrabalho',employee,query)).value,0);
  await pg.exec('UPDATE core.time_entries SET is_rework=NULL WHERE id=5');
  try {
    assert.equal((await computeMetric('horas_retrabalho',employee,query)).value,null);
    assert.equal((await computeMetric('percentual_retrabalho',employee,query)).value,null);
  } finally {await pg.exec('UPDATE core.time_entries SET is_rework=false WHERE id=5');}
});
test("PostgreSQL: faturamento exclui canceladas/nulos, preserva sinal e separa competência", async () => {
  assert.equal((await computeMetric("receita_faturada", f, query)).value, 90);
  assert.equal((await computeMetric("faturamento_liquido", f, query)).value, 81);
  assert.equal((await computeMetric("faturamento_competencia", f, query)).value, -10);
  assert.equal((await computeMetric("notas_canceladas", f, query)).value, 1);
});
test("PostgreSQL: datas futuras não viram realizados; ausência não vira soma zero", async () => {
  const future = { ...f, start: "2099-01-01", end: "2099-01-31" };
  assert.equal((await computeMetric("receita_faturada", future, query)).value, null);
  assert.ok((await computeMetric("horas_registradas", future, query)).insufficient);
});
test("PostgreSQL: paginação conserva total em página vazia; registros reconciliam card", async () => {
  const r = await metricRecords("horas_registradas", f, { page: 1, pageSize: 100 }, query);
  assert.equal(r.rows.reduce((n, r) => n + Number(r.horas), 0), 4.75);
  const empty = await metricRecords("horas_registradas", f, { page: 10, pageSize: 100 }, query);
  assert.equal(empty.total, 5); assert.equal(empty.rows.length, 0);
  const t = await timeTable("timesheet_departamentos", f, { page: 1, pageSize: 10, sort: "horas", dir: "desc" }, query);
  assert.equal(t.total, 2); assert.equal(t.rows[0].departamento, "Criação");
});
test("PostgreSQL: gráficos usam a mesma base de cards e filtros", async () => {
  const c = await timeChart("horas_por_departamento", { ...f, department: "A" }, query);
  assert.equal(c.points.length, 1); assert.equal(c.points[0].horas, 2.75);
  const i = await invoiceChart(f, query); assert.equal(i.points[0].faturado, 90);
});
test("filtros incompatíveis são recusados antes do SQL, inclusive escopo financeiro", () => {
  assert.throws(() => sourceStatement("invoices", { ...f, department: "A" }), SourceLimitation);
  const client=sourceStatement('invoices',{...f,client:"10' OR 1=1 --"});
  assert.ok(!client.sql.includes("10' OR"));assert.ok(client.params.includes("10' OR 1=1 --"));
  assert.throws(() => sourceStatement("time", { ...f, service: "99" }), SourceLimitation);
  assert.throws(() => sourceStatement("jobs", { ...f, department: "A" }), SourceLimitation);
});
test("PostgreSQL: custo registrado usa labor_cost uma vez e informa cobertura incompleta", async () => {
  const r = await computeMetric("custo_mao_de_obra", f, query);
  assert.equal(r.value, 150); assert.equal(r.recordsUsed, 2); assert.equal(r.reliability, "PARCIAL");
  assert.equal((await computeMetric("custo_mao_de_obra", { ...f, department: "A" }, query)).value, 100);
  const records = await metricRecords("custo_mao_de_obra", f, { page: 1, pageSize: 20 }, query);
  assert.equal(records.rows.reduce((n, r) => n + Number(r.custo_registrado), 0), 150);
});
