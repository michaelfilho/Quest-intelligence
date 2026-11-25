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
let sqlReads=0;
before(async () => {
  await initialiseFixtures(engine);
  await engine.exec(`ALTER TABLE core.time_entries ADD COLUMN source_kind text;
    ALTER TABLE core.time_entries ADD COLUMN task_id bigint;
    UPDATE core.time_entries SET source_kind='TASK',task_id=7 WHERE job_id=1;
    CREATE TABLE core.job_tasks(job_id bigint,iclips_id bigint,name text,estimated_minutes numeric);
    INSERT INTO core.job_tasks VALUES(1,7,'Atividade fixture',60);
    ALTER TABLE core.clients ADD COLUMN document text;
    ALTER TABLE core.invoices ADD COLUMN client_document text;
    UPDATE core.clients SET document='12345678909' WHERE iclips_id=10;
    UPDATE core.invoices SET client_document='123.456.789-09' WHERE iclips_id IN (1,2);
    CREATE TABLE core.financial_entries(iclips_id bigint PRIMARY KEY,parent_id bigint,entry_type text,amount numeric,payment_date date,category_id bigint,job_id bigint,account_id bigint);
    INSERT INTO core.financial_entries VALUES(1,NULL,'Entrada',100,'2026-01-10',1,1,1),(2,NULL,'Saída',40,'2026-01-11',2,1,1);
    CREATE TABLE core.financial_categories(iclips_id bigint,name text,dre_indicator text);
    INSERT INTO core.financial_categories VALUES(1,'Receita fixture','RECEITAS OPERACIONAIS'),(2,'Despesa fixture','DESPESAS OPERACIONAIS CUSTO FIXO');
    CREATE TABLE core.financial_accounts(iclips_id bigint,name text);INSERT INTO core.financial_accounts VALUES(1,'Conta fixture');`);
  // Substitui apenas o transporte pg por PostgreSQL embarcado de testes; nenhuma rede é usada.
  mock.method(pg.Pool.prototype, "connect", async () => ({query:(sql:any,params:any)=>{sqlReads++;return engine.query(sql,params);},release(){}}));
  process.env.DATABASE_URL = "postgres://fixture_ro@127.0.0.1:1/quest_rinne";
  srv = await startServer();
  await createUser("admin.analytics", "admin");
  await createUser("gestor.analytics", "gestor", { scope: "A", grants: ["financeiro.view", "relatorios.export"] });
  admin = new Client(srv.base); restricted = new Client(srv.base);
  await admin.login("admin.analytics"); await restricted.login("gestor.analytics");
});
after(async () => { await closePool(); srv.stop(); await engine.close(); mock.restoreAll(); });
const period = "start=2026-01-01&end=2026-01-31";
test('listas gerenciais e CSV aplicam pesquisa, colunas e permissão de exportar no servidor',async()=>{
  const r=await admin.req(`/api/tables/gestao_clientes?${period}&search=Aurora`);
  assert.equal(r.body.status,'OK');assert.equal(r.body.total,1);assert.equal(r.body.rows[0].recebido,100);
  await createUser('management.analyst','analista',{grants:['relatorios.export']});const user=new Client(srv.base);await user.login('management.analyst');
  const own=await user.req(`/api/tables/gestao_clientes?${period}&search=Aurora`);assert.equal(own.body.status,'OK');
  for(const key of ['faturado','recebido','despesas','resultado','margem','custo_registrado'])assert.ok(!(key in own.body.rows[0]));
  assert.equal((await user.req(`/api/tables/gestao_clientes?${period}&sort=faturado`)).status,400);
  assert.equal((await user.req(`/api/tables/gestao_clientes?${period}&search=100`)).body.total,0);
  const csv=await user.req(`/api/tables/gestao_clientes/export?${period}&search=Aurora`);assert.equal(csv.status,200);
  assert.ok(csv.body.includes('Cliente Aurora'));assert.ok(!csv.body.includes('Faturamento'));assert.ok(!csv.body.includes('Custo registrado'));
  await createUser('management.noexport','analista');const denied=new Client(srv.base);await denied.login('management.noexport');
  assert.equal((await denied.req(`/api/tables/gestao_clientes/export?${period}`)).status,403);
});
test('curadoria de abas não amplia permissões dos itens anteriores; identidade do detalhe é composta',async()=>{
  await createUser('management.client',null, {grants:['clientes.view']});const client=new Client(srv.base);await client.login('management.client');
  assert.equal((await client.req(`/api/tables/atividades?${period}`)).status,403);
  const r=await admin.req(`/api/activities/TASK/1/7/records?${period}`);assert.equal(r.body.status,'OK');assert.equal(r.body.total,3);
  assert.ok(r.body.rows.every((row:any)=>row.atividade==='Atividade fixture'));
  const scope=await admin.req(`/api/activities/TASK/1/7/records?${period}&department=B`);assert.equal(scope.body.total,0);
  await createUser('management.records','analista');const analyst=new Client(srv.base);await analyst.login('management.records');
  assert.equal((await analyst.req(`/api/activities/TASK/1/7/records?${period}&sort=custo_registrado`)).status,400);
});

test('cache aquecido não consulta SQL e revogação real continua bloqueando o acesso',async()=>{
  const id=await createUser('cache.viewer','analista',{grants:['financeiro.view']});
  const viewer=new Client(srv.base);await viewer.login('cache.viewer');
  const url=`/api/indicators/receita_recebida?${period}`;
  const cold=await viewer.req(url);assert.equal(cold.body.result.status,'OK');
  const before=sqlReads,warm=await viewer.req(url);assert.equal(sqlReads,before);assert.equal(warm.body.result.calculatedAt,cold.body.result.calculatedAt);
  const {store}=await import('../src/store.js');
  store().prepare('UPDATE users SET grants=?,denies=? WHERE id=?').run('[]','["financeiro.view"]',id);
  assert.equal((await viewer.req(url)).status,403);assert.equal(sqlReads,before);
});
test('resumo do módulo não executa cards/gráficos; gráfico possui autorização e endpoint próprio',async()=>{
  const summary=await admin.req(`/api/modules/financeiro?${period}&view=summary`);assert.equal(summary.status,200);
  assert.ok(summary.body.indicators.every((i:any)=>i.status==='FORBIDDEN'));
  const chart=await admin.req(`/api/charts/horas_por_cliente?${period}`);assert.equal(chart.body.status,'OK');
  const read=await createUser('chart.denied',null);assert.ok(read);
  const blocked=new Client(srv.base);await blocked.login('chart.denied');
  assert.equal((await blocked.req(`/api/charts/horas_por_cliente?${period}`)).status,403);
});
test('fase 2: dados financeiros e razões livres não vazam e escopo não é ampliado',async()=>{
  await createUser('analista.phase2','analista');const analyst=new Client(srv.base);await analyst.login('analista.phase2');
  for(const path of ['/api/tables/faturamento_por_cliente','/api/tables/dre_contas','/api/tables/notas_vinculos','/api/tables/conflitos_detalhes','/api/indicators/receitas_nao_operacionais','/api/indicators/horas_sem_custo_positivo'])assert.equal((await analyst.req(`${path}?${period}`)).status,403,path);
  for(const id of ['dre_contas','faturamento_por_cliente','notas_vinculos']) {
    const r=await restricted.req(`/api/tables/${id}?${period}&department=B`);assert.equal(r.body.status,'INSUFFICIENT_DATA');assert.deepEqual(r.body.rows,[]);
  }
  const rows=await admin.req(`/api/tables/clientes?${period}`);assert.equal(Number(rows.body.rows.find((r:any)=>Number(r.id)===10).faturado),100);
  const scoped=await restricted.req(`/api/tables/clientes?${period}`);assert.ok(scoped.body.rows.every((r:any)=>r.faturado==null));
  const note=await admin.req(`/api/tables/notas_fiscais?${period}`);assert.equal(note.body.rows.find((r:any)=>Number(r.id)===1).cliente,'Cliente Aurora');
});
test('custos novos são removidos de linhas, colunas, relatórios e gráficos operacionais',async()=>{
  const rows=await restricted.req(`/api/tables/colaboradores?${period}`);
  assert.ok(!rows.body.columns.includes('custo_registrado'));
  assert.ok(rows.body.rows.every((r:any)=>!('custo_registrado' in r)&&!('cobertura_custos' in r)));
  const adminRows=await admin.req(`/api/tables/colaboradores?${period}`);
  assert.equal(adminRows.body.rows.reduce((n:number,r:any)=>n+Number(r.custo_registrado),0),150);
  assert.equal((await restricted.req(`/api/indicators/cobertura_custos?${period}`)).status,403);
  const detail=await restricted.req(`/api/indicators/atividades_trabalhadas/records?${period}`);
  assert.equal(detail.body.status,'OK');assert.ok(detail.body.rows.length>0);
  assert.ok(detail.body.rows.every((r:any)=>!('custo_registrado'in r)));
  const mod=await restricted.req(`/api/modules/colaboradores?${period}`);
  assert.ok(mod.body.charts.every((c:any)=>!c.id.startsWith('custo_')||c.status==='FORBIDDEN'));
  const report=await restricted.req(`/api/reports/departamentos?${period}&format=json`);
  assert.ok(report.body.tables.every((t:any)=>t.rows.every((r:any)=>!('custo_registrado'in r)&&!('cobertura_custos'in r))));
});

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
  assert.deepEqual(dim.body.options, [{ value: "A", label: "Criação" }]);
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
  assert.equal(r.body.indicators.find((i: any) => i.id === "receita_recebida").value, 100);
  assert.equal(r.body.indicators.find((i:any)=>i.id==='resultado_operacional').value,60);
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


test('status de projeto não é interpretado como situação de nota fiscal', async()=>{
  const wrong=await admin.req(`/api/indicators/notas_emitidas?${period}&status=Exemplo&statusSource=projects`);
  assert.equal(wrong.body.result.status,'INSUFFICIENT_DATA');
  assert.equal(wrong.body.result.value,null);
  assert.equal(wrong.body.result.reasonCode,'UNSUPPORTED_FILTER');
  const legacy=await admin.req(`/api/indicators/notas_emitidas?${period}&status=issued`);
  assert.equal(legacy.body.result.status,'OK');
  assert.equal(legacy.body.result.value,3);
  const hours=await admin.req(`/api/indicators/horas_registradas?${period}&status=issued&statusSource=invoices`);
  assert.equal(hours.body.result.reasonCode,'UNSUPPORTED_FILTER');
  assert.equal(hours.body.result.value,null);
});
