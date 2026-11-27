// Autorização por perfil, acesso indevido entre perfis, bloqueio por padrão, colunas e escopo.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client, createUser, startServer } from "./helpers.js";

const { MODULES } = await import("../../shared/catalog.js");
const { DEFAULT_ROLES, MODULE_PERMISSION } = await import("../../shared/permissions.js");
const { all, get, run } = await import("../src/store.js");

let srv: Awaited<ReturnType<typeof startServer>>;
const as: Record<string, Client> = {};
async function login(name: string, role: string | null, o: Parameters<typeof createUser>[2] = {}) {
  await createUser(name, role, o);
  as[name] = new Client(srv.base);
  assert.equal((await as[name].login(name)).status, 204, name);
}

before(async () => {
  srv = await startServer();
  for (const r of DEFAULT_ROLES) await login("u_" + r.id, r.id);
  await login("sem_perfil", null);
  await login("gestor_criacao", "gestor", { scope: "Criação" });
  await login("dir_sem_fin", "diretoria", { denies: ["financeiro.view"] });
  await login("consulta_mais_fin", "consulta", { grants: ["financeiro.view"] });
});
after(() => srv.stop());

test("matriz: cada perfil acessa exatamente os módulos das suas permissões", async () => {
  for (const r of DEFAULT_ROLES) {
    for (const m of MODULES.filter((x) => !x.detailOf)) {
      const expected = r.permissions.includes(MODULE_PERMISSION[m.id]) ? 200 : 403;
      assert.equal((await as["u_" + r.id].req(`/api/modules/${m.id}`)).status, expected, `${r.id} → ${m.id}`);
    }
    const listed = (await as["u_" + r.id].req("/api/modules")).body.map((m: any) => m.id).sort();
    const expected = MODULES.filter((m) => r.permissions.includes(MODULE_PERMISSION[m.id])).map((m) => m.id).sort();
    assert.deepEqual(listed, expected, r.id);
  }
});

test("bloqueio por padrão: usuário sem perfil não acessa nada", async () => {
  const c = as.sem_perfil;
  assert.deepEqual((await c.req("/api/modules")).body, []);
  for (const p of ["/api/modules/projetos", "/api/tables/projetos", "/api/indicators/horas_registradas", "/api/dimensions/clients", "/api/metadata/coverage", "/api/admin/users"]) assert.equal((await c.req(p)).status, 403, p);
  assert.equal((await c.req("/api/auth/me")).status, 200); // pode ver a si mesmo
});

test("dados financeiros não vazam para perfis operacionais (item e coluna)", async () => {
  const ana = as.u_analista;
  const mod = await ana.req("/api/modules/clientes");
  assert.equal(mod.status, 200);
  const st = Object.fromEntries(mod.body.indicators.map((i: any) => [i.id, i.status]));
  assert.equal(st.receita_faturada, "FORBIDDEN");
  assert.equal(st.receita_recebida, "FORBIDDEN");
  assert.notEqual(st.clientes_ativos, "FORBIDDEN");
  assert.ok(mod.body.indicators.filter((i: any) => i.status === "FORBIDDEN").every((i: any) => i.value === null));
  assert.equal((await ana.req("/api/indicators/receita_recebida")).status, 403);
  assert.equal((await ana.req("/api/indicators/receita_recebida/records")).status, 403);
  assert.equal((await ana.req("/api/tables/lancamentos_financeiros")).status, 403);
  const cols = (await ana.req("/api/tables/clientes")).body.columns;
  assert.ok(cols.includes("cliente") && cols.includes("horas"));
  assert.ok(!cols.includes("faturado") && !cols.includes("recebido"));
  const fin = (await as.u_financeiro.req("/api/tables/clientes")).body.columns;
  assert.ok(fin.includes("faturado"));
});

test("custos de pessoal e contratos exigem permissão própria", async () => {
  assert.equal((await as.u_diretoria.req("/api/indicators/custo_mao_de_obra")).status, 200);
  assert.equal((await as.u_gestor.req("/api/indicators/custo_mao_de_obra")).status, 403);
  const ts = await as.u_gestor.req("/api/modules/timesheet");
  assert.equal(ts.body.indicators.find((i: any) => i.id === "custo_mao_de_obra").status, "FORBIDDEN");
  assert.equal((await as.u_gestor.req("/api/modules/contratado")).status, 403);
});

test("concessões e remoções individuais sobrepõem o perfil", async () => {
  assert.equal((await as.dir_sem_fin.req("/api/modules/financeiro")).status, 403);
  assert.equal((await as.dir_sem_fin.req("/api/modules/rentabilidade")).status, 200);
  assert.equal((await as.consulta_mais_fin.req("/api/modules/financeiro")).status, 200);
  assert.equal((await as.u_consulta.req("/api/modules/financeiro")).status, 403);
});

test("escopo de departamento é imposto pelo servidor", async () => {
  const r = await as.gestor_criacao.req("/api/modules/producao?department=Atendimento");
  assert.equal(r.status, 200);
  assert.equal(r.body.filters.department, "Criação");
  const i = await as.gestor_criacao.req("/api/indicators/horas_registradas");
  assert.equal(i.body.filters.department, "Criação");
});

test("relatórios: exportação exige relatorios.export; dimensões protegidas", async () => {
  assert.equal((await as.u_analista.req("/api/reports/rentabilidade?format=csv")).status, 403);
  assert.equal((await as.u_financeiro.req("/api/reports/rentabilidade?format=csv")).status, 200); // permitido; sem banco, declara DADOS INDISPONÍVEIS
  assert.equal((await as.u_consulta.req("/api/dimensions/clients")).status, 403);
  assert.equal((await as.u_consulta.req("/api/dimensions/statuses")).status, 200);
});

test("administração só para quem tem permissão", async () => {
  for (const c of [as.u_diretoria, as.u_financeiro, as.u_analista]) {
    assert.equal((await c.req("/api/admin/users")).status, 403);
    assert.equal((await c.req("/api/admin/roles")).status, 403);
    assert.equal((await c.req("/api/admin/audit")).status, 403);
    assert.equal((await c.req("/api/access")).status, 403);
    assert.equal((await c.req("/api/admin/settings", { method: "PUT", body: { "ai.enabled": true } })).status, 403);
  }
  assert.equal((await as.u_diretoria.req("/api/admin/settings")).status, 200); // config.view
  // Escalada: usuário comum não consegue se promover
  const me = (await as.u_analista.req("/api/auth/me")).body.id;
  assert.equal((await as.u_analista.req(`/api/admin/users/${me}`, { method: "PATCH", body: { roleId: "admin" } })).status, 403);
  const denied = (await get("SELECT count(*) n FROM app.audit_log WHERE event = 'access.denied'"))?.n;
  assert.ok(Number(denied) > 0);
});

test("perfis: alteração vale na hora; Administrador é imutável; excluir perfil deixa usuários sem acesso", async () => {
  const adm = as.u_admin;
  assert.equal((await adm.req("/api/admin/roles/admin", { method: "PUT", body: { name: "Administrador", permissions: [] } })).status, 409);
  assert.equal((await adm.req("/api/admin/roles/consulta", { method: "PUT", body: { name: "Consulta restrita", permissions: ["producao.view"] } })).status, 204);
  assert.equal((await as.u_consulta.req("/api/modules/projetos")).status, 403);
  assert.equal((await as.u_consulta.req("/api/modules/producao")).status, 200);
  assert.equal((await adm.req("/api/admin/roles", { method: "POST", body: { name: "Permissão inválida", permissions: ["tudo.liberado"] } })).status, 400);

  const created = await adm.req("/api/admin/roles", { method: "POST", body: { name: "Comercial", permissions: ["clientes.view"] } });
  assert.equal(created.status, 201);
  await login("comercial1", created.body.id);
  assert.equal((await as.comercial1.req("/api/modules/clientes")).status, 200);
  assert.equal((await adm.req(`/api/admin/roles/${created.body.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await as.comercial1.req("/api/modules/clientes")).status, 403);
  assert.equal((await adm.req("/api/admin/roles/diretoria", { method: "DELETE" })).status, 409);
  const ev = (await all("SELECT event FROM app.audit_log WHERE event LIKE 'role.%'")).map((r) => r.event);
  assert.ok(ev.includes("role.permissions_update") && ev.includes("role.create") && ev.includes("role.delete"));
});
