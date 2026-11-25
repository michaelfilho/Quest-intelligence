// Ferramentas internas chamadas pelo n8n: HMAC + anti-replay + contexto de execução vinculado ao usuário.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client, createUser, startServer } from "./helpers.js";
import { enableN8n, ok, signedHeaders, startMock } from "./n8nmock.js";

const { sign } = await import("../src/integrations/n8n.js");
const { store } = await import("../src/store.js");

let srv: Awaited<ReturnType<typeof startServer>>;
let mock: Awaited<ReturnType<typeof startMock>>;
const tokens: Record<string, string> = {};

/** Obtém um contexto de execução real: o usuário conversa com a RINNE e o mock captura o token enviado. */
async function tokenFor(username: string) {
  const cl = new Client(srv.base);
  await cl.login(username);
  const id = (await cl.req("/api/rinne/sessions", { method: "POST", body: { mode: "CHAT" } })).body.id;
  const before = mock.received.length;
  await cl.req(`/api/rinne/sessions/${id}/messages`, { method: "POST", body: { message: "teste" } });
  return mock.received[before].envelope.context.executionToken as string;
}

const call = (tool: string, input: unknown, token?: string, o: Parameters<typeof signedHeaders>[2] = {}) => {
  const body = Buffer.from(JSON.stringify({ input }));
  return fetch(`${srv.base}/api/internal/tools/${tool}`, { method: "POST", headers: { ...signedHeaders(sign, body, o), ...(token ? { "x-rinne-execution": token } : {}) }, body: new Uint8Array(body) });
};

before(async () => {
  srv = await startServer();
  mock = await startMock(sign);
  enableN8n(mock.url);
  mock.setScenario((r) => ({ status: 200, json: ok(r.envelope.requestId) }));
  await createUser("dir", "diretoria");
  await createUser("gest", "gestor", { scope: "Criação" });
  await createUser("ana", "analista", { grants: ["rinne_ia.use"] }); // usa a RINNE, mas continua sem financeiro
  for (const u of ["dir", "gest", "ana"]) tokens[u] = await tokenFor(u);
});
after(() => (mock.stop(), srv.stop()));

test("sem assinatura, assinatura errada ou sem contexto de execução: recusado", async () => {
  const body = Buffer.from(JSON.stringify({ input: {} }));
  assert.equal((await fetch(`${srv.base}/api/internal/tools/consultar_producao`, { method: "POST", headers: { "content-type": "application/json", "x-rinne-execution": tokens.dir }, body: new Uint8Array(body) })).status, 401);
  assert.equal((await call("consultar_producao", {}, tokens.dir, { secret: "outro-segredo-qualquer-com-32-caracteres!!" })).status, 401);
  assert.equal((await call("consultar_producao", {})).status, 401);
  assert.equal((await call("consultar_producao", {}, "token-inventado-pelo-agente")).status, 401);
});

test("anti-replay: o mesmo nonce não é aceito duas vezes", async () => {
  const o = { nonce: "nonce-fixo-de-teste-0001" };
  assert.equal((await call("consultar_producao", {}, tokens.dir, o)).status, 200);
  assert.equal((await call("consultar_producao", {}, tokens.dir, o)).status, 401);
});

test("permissões da sessão original: o agente não escala privilégios", async () => {
  assert.equal((await call("consultar_receitas", {}, tokens.ana)).status, 403); // analista sem financeiro
  assert.equal((await call("consultar_resultado", {}, tokens.gest)).status, 403); // gestor sem rentabilidade
  const r = await call("consultar_receitas", {}, tokens.dir);
  assert.equal(r.status, 200);
  const j = (await r.json()) as any;
  assert.equal(j.data.tool, "consultar_receitas");
  assert.ok(j.data.items.every((i: any) => i.value === null)); // sem banco: nunca inventa
  assert.ok(j.data.limitations.some((l: string) => /indisponível/.test(l)));
  assert.ok(j.data.limitations.some((l: string) => /não equivale a zero/.test(l)));
  assert.equal((await call("detalhar_indicador", { indicatorId: "receita_recebida" }, tokens.ana)).status, 403);
  assert.equal((await call("detalhar_indicador", { indicatorId: "horas_registradas" }, tokens.ana)).status, 200);
});

test("escopo departamental imposto e entradas validadas (sem SQL livre)", async () => {
  const r = (await (await call("consultar_departamento", { department: "Atendimento" }, tokens.gest)).json()) as any;
  assert.equal(r.data.filters.department, "Criação");
  const cli = (await (await call("consultar_producao", {}, tokens.ana)).json()) as any;
  assert.equal(cli.success, true);
  const t = (await (await call("consultar_rentabilidade", {}, tokens.dir)).json()) as any;
  assert.ok(t.data.tables.length > 0);
  assert.equal((await call("consultar_producao", { sql: "select * from core.clients" }, tokens.dir)).status, 400); // nada de SQL livre
  assert.equal((await call("consultar_producao", { limit: 5000 }, tokens.dir)).status, 400);
  assert.equal((await call("consultar_cliente", {}, tokens.dir)).status, 400);
  assert.equal((await call("executar_sql", {}, tokens.dir)).status, 404);
});

test("usuário desativado, contexto expirado e limite de chamadas", async () => {
  const tok = await tokenFor("dir");
  store().prepare("UPDATE rinne_exec_contexts SET calls = max_calls").run();
  assert.equal((await call("consultar_producao", {}, tok)).status, 429);
  store().prepare("UPDATE rinne_exec_contexts SET calls = 0, expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await call("consultar_producao", {}, tok)).status, 401);
  store().prepare("UPDATE rinne_exec_contexts SET expires_at = ?").run(new Date(Date.now() + 600000).toISOString());
  store().prepare("UPDATE users SET active = 0 WHERE username = 'dir'").run();
  assert.equal((await call("consultar_producao", {}, tok)).status, 403);
  store().prepare("UPDATE users SET active = 1 WHERE username = 'dir'").run();
  const ev = store().prepare("SELECT outcome FROM audit_log WHERE event = 'rinne.tool'").all().map((x) => x.outcome);
  assert.ok(ev.includes("success") && ev.includes("denied"));
});
