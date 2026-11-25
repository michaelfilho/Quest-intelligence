// Integração n8n: indisponibilidade, assinatura, validação de contrato, timeout sem reenvio, idempotência,
// concorrência, processamento assíncrono (callback), anti-replay, áudio binário e contexto de segurança.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client, createUser, startServer } from "./helpers.js";
import { disableN8n, enableN8n, ok, signedHeaders, startMock } from "./n8nmock.js";

const { sign, safeUrl } = await import("../src/integrations/n8n.js");
const { store } = await import("../src/store.js");

let srv: Awaited<ReturnType<typeof startServer>>;
let mock: Awaited<ReturnType<typeof startMock>>;
const c: Record<string, Client> = {};

before(async () => {
  srv = await startServer();
  mock = await startMock(sign);
  for (const [u, role, o] of [["dir", "diretoria", {}], ["adm", "admin", {}], ["gest", "gestor", { scope: "Criação" }], ["ana", "analista", {}]] as const) {
    await createUser(u, role, o);
    c[u] = new Client(srv.base);
    await c[u].login(u);
  }
});
after(() => (mock.stop(), srv.stop()));

const newSession = async (cl: Client, mode = "CHAT") => (await cl.req("/api/rinne/sessions", { method: "POST", body: { mode } })).body.id as string;
const send = (cl: Client, id: string, message: string, headers: Record<string, string> = {}) => cl.req(`/api/rinne/sessions/${id}/messages`, { method: "POST", body: { message }, headers });

test("URL do webhook: só HTTPS ou rede privada", () => {
  assert.ok(safeUrl("https://n8n.exemplo.com.br/webhook/rinne"));
  assert.ok(safeUrl("http://n8n:5678/webhook/rinne"));
  assert.ok(safeUrl("http://10.0.0.5/webhook"));
  assert.ok(!safeUrl("http://n8n.exemplo.com/webhook"));
  assert.ok(!safeUrl("https://user:pass@n8n.exemplo.com/x"));
  assert.ok(!safeUrl("ftp://n8n/x"));
});

test("n8n indisponível: estado explícito, sem resposta fictícia, com apoio determinístico", async () => {
  disableN8n();
  const id = await newSession(c.dir);
  const r = await send(c.dir, id, "Quanto recebemos neste mês?");
  assert.equal(r.status, 200);
  assert.equal(r.body.n8n.status, "unavailable");
  assert.equal(r.body.reply.status, "unavailable");
  assert.match(r.body.reply.content, /indisponível/);
  assert.equal(r.body.reply.payload.origin, "deterministico");
  assert.ok(r.body.reply.payload.resolvedIndicators.some((i: any) => i.id === "receita_recebida" && i.value === null));
  assert.equal(mock.received.length, 0);
  const status = await c.dir.req("/api/rinne/status");
  assert.equal(status.body.available, false);
});

test("sucesso: requisição assinada, contexto de segurança do backend e valores recalculados", async () => {
  enableN8n(mock.url);
  mock.setScenario((r) => ({ status: 200, json: ok(r.envelope.requestId, { indicators: [{ id: "receita_recebida", value: 999999 }, { id: "inventado" }], sources: [{ type: "indicator", id: "receita_recebida" }], suggestions: ["Revisar contratos"] }) }));
  const id = await newSession(c.gest);
  const before = mock.received.length;
  const r = await send(c.gest, id, "Quantas horas registradas?");
  assert.equal(r.body.n8n.status, "success");
  const got = mock.received[before];
  assert.ok(got.signatureOk, "assinatura HMAC válida");
  assert.equal(got.envelope.version, "1.0");
  assert.equal(got.envelope.mode, "CHAT");
  assert.equal(got.envelope.operation, "ASK");
  assert.equal(got.envelope.context.departmentId, "Criação"); // escopo imposto pelo backend
  assert.ok(!got.envelope.context.allowedTools.includes("consultar_receitas")); // gestor sem financeiro
  assert.ok(got.envelope.context.allowedTools.includes("consultar_producao"));
  assert.ok(got.envelope.context.executionToken?.length > 20);
  const userRow = store().prepare("SELECT id FROM users WHERE username = 'gest'").get();
  assert.equal(got.envelope.userId, String(userRow?.id)); // da sessão, nunca do navegador
  // A IA não injeta valores: indicador desconhecido some; financeiro não liberado ao gestor é omitido.
  assert.ok(!r.body.reply.payload.resolvedIndicators.some((i: any) => i.id === "receita_recebida"));
  assert.ok(!JSON.stringify(r.body).includes("999999"));
  assert.equal(r.body.reply.status, "done");
  assert.equal(r.body.reply.content, "Resposta de teste da RINNE.");
});

test("resposta fora do contrato, requestId divergente e falha do provedor viram erro controlado", async () => {
  enableN8n(mock.url);
  const id = await newSession(c.dir);
  for (const sc of [() => ({ status: 200, json: "{nao-json" }), () => ({ status: 200, json: { version: "1.0", success: true } }), () => ({ status: 200, json: ok("00000000-0000-4000-8000-000000000000") }), (r: any) => ({ status: 200, json: { ...ok(r.envelope.requestId), success: false, response: null, error: { code: "PROVIDER_DOWN", message: "provedor fora" } } }), () => ({ status: 500, json: {} })]) {
    mock.setScenario(sc as any);
    const r = await send(c.dir, id, "teste");
    assert.equal(r.body.n8n.status, "error");
    assert.equal(r.body.reply.status, "error");
  }
  mock.setScenario((r) => ({ status: 200, json: ok(r.envelope.requestId, { text: "<script>alert(1)</script>", audio: { mimeType: "text/html", data: "x" } }) }));
  assert.equal((await send(c.dir, id, "x")).body.n8n.status, "error"); // mime de áudio fora da lista
});

test("timeout: sem reenvio automático", async () => {
  enableN8n(mock.url, 1000);
  mock.setScenario(() => ({ status: 200, json: {}, delayMs: 1500 }));
  const id = await newSession(c.dir);
  const before = mock.received.length;
  const r = await send(c.dir, id, "demora");
  assert.equal(r.body.n8n.status, "timeout");
  await new Promise((ok) => setTimeout(ok, 700));
  assert.equal(mock.received.length - before, 1); // uma única tentativa
});

test("idempotência: mesma Idempotency-Key não gera segundo processamento", async () => {
  enableN8n(mock.url);
  mock.setScenario((r) => ({ status: 200, json: ok(r.envelope.requestId) }));
  const id = await newSession(c.dir);
  const before = mock.received.length;
  const key = "idem-chave-teste-0001";
  const a = await send(c.dir, id, "pergunta", { "idempotency-key": key });
  const b = await send(c.dir, id, "pergunta", { "idempotency-key": key });
  assert.equal(mock.received.length - before, 1);
  assert.equal(b.body.n8n.replayed, true);
  assert.equal(a.body.n8n.requestId, b.body.n8n.requestId);
});

test("concorrência: uma solicitação por conversa", async () => {
  enableN8n(mock.url, 3000);
  mock.setScenario((r) => ({ status: 200, json: ok(r.envelope.requestId), delayMs: 400 }));
  const id = await newSession(c.dir);
  const [a, b] = await Promise.all([send(c.dir, id, "um"), send(c.dir, id, "dois")]);
  assert.deepEqual([a.body.n8n.status, b.body.n8n.status].sort(), ["busy", "success"]);
});

test("assíncrono: 202 → pendente; callback assinado conclui; replay e callback duplicado recusados", async () => {
  enableN8n(mock.url);
  mock.setScenario(() => ({ status: 202 }));
  const id = await newSession(c.dir);
  const r = await send(c.dir, id, "processamento longo");
  assert.equal(r.body.reply.status, "pending");
  const requestId = r.body.n8n.requestId;
  const body = Buffer.from(JSON.stringify(ok(requestId, { text: "Concluído no callback." })));
  const h = signedHeaders(sign, body);
  const cb = (headers: Record<string, string>, b = body) => fetch(srv.base + "/api/internal/callback", { method: "POST", headers, body: new Uint8Array(b) });
  assert.equal((await cb({ ...h, "x-rinne-signature": "sha256=" + "0".repeat(64) })).status, 401); // assinatura inválida
  assert.equal((await cb(signedHeaders(sign, body, { ts: Math.floor(Date.now() / 1000) - 600 }))).status, 401); // fora da janela
  assert.equal((await cb(h)).status, 200);
  assert.equal((await cb(h)).status, 401); // mesmo nonce = replay
  assert.equal((await cb(signedHeaders(sign, body))).status, 409); // já concluída
  const msgs = (await c.dir.req(`/api/rinne/sessions/${id}/messages`)).body;
  assert.equal(msgs.at(-1).status, "done");
  assert.equal(msgs.at(-1).content, "Concluído no callback.");
});

test("RINNE Voz: áudio binário (sem Base64), limites e transcrição", async () => {
  enableN8n(mock.url);
  mock.setScenario((r) => ({ status: 200, json: ok(r.envelope.requestId, { transcript: "quanto recebemos", text: "Resposta falada.", audio: { mimeType: "audio/mpeg", data: Buffer.from("fake-mp3").toString("base64") } }) }));
  const id = await newSession(c.dir, "VOICE");
  const audio = Buffer.alloc(2048, 7);
  const send = (headers: Record<string, string>, body: Buffer | string = audio) => fetch(`${srv.base}/api/rinne/sessions/${id}/audio`, { method: "POST", headers: { cookie: c.dir.cookie, "x-requested-with": "rinne", "x-forwarded-for": c.dir.ip, ...headers }, body: typeof body === "string" ? body : new Uint8Array(body) });
  const before = mock.received.length;
  const r = await send({ "content-type": "audio/webm", "x-audio-duration-ms": "4000" });
  assert.equal(r.status, 200);
  const j = (await r.json()) as any;
  const got = mock.received[before];
  assert.ok(got.signatureOk);
  assert.equal(got.headers["content-type"], "audio/webm");
  assert.equal(got.body.length, 2048); // binário bruto
  assert.equal(got.envelope.mode, "VOICE");
  assert.equal(got.envelope.operation, "TRANSCRIBE");
  assert.equal(j.reply.payload.transcript, "quanto recebemos");
  assert.equal(j.reply.payload.audio.mimeType, "audio/mpeg");
  assert.equal((await send({ "content-type": "text/plain", "x-audio-duration-ms": "1000" }, "x")).status, 415);
  assert.equal((await send({ "content-type": "audio/webm", "x-audio-duration-ms": "90000" })).status, 400);
  assert.equal((await send({ "content-type": "audio/webm", "x-audio-duration-ms": "1000" }, Buffer.alloc(3 * 1024 * 1024))).status, 413);
  const chat = await newSession(c.dir);
  const r2 = await fetch(`${srv.base}/api/rinne/sessions/${chat}/audio`, { method: "POST", headers: { cookie: c.dir.cookie, "x-requested-with": "rinne", "x-forwarded-for": c.dir.ip, "content-type": "audio/webm", "x-audio-duration-ms": "1000" }, body: new Uint8Array(audio) });
  assert.equal(r2.status, 409);
  assert.ok(!store().prepare("SELECT 1 FROM sqlite_master WHERE sql LIKE '%BLOB%'").get()); // nenhum áudio armazenado
});

test("Configurações: status sem segredos, histórico rastreável, teste PING só com config.manage", async () => {
  enableN8n(mock.url);
  mock.setScenario((r) => ({ status: 200, json: ok(r.envelope.requestId, { text: "pong" }) }));
  const st = await c.adm.req("/api/admin/integrations/n8n");
  assert.equal(st.status, 200);
  const dump = JSON.stringify(st.body);
  assert.ok(!dump.includes(mock.url) && !dump.includes("segredo-de-teste"));
  assert.ok(st.body.history.length > 0 && st.body.history[0].correlation_id);
  assert.equal((await c.dir.req("/api/admin/integrations/n8n/test", { method: "POST" })).status, 403);
  const before = mock.received.length;
  const t = await c.adm.req("/api/admin/integrations/n8n/test", { method: "POST" });
  assert.equal(t.body.status, "success");
  const ping = mock.received[before].envelope;
  assert.equal(ping.operation, "PING");
  assert.equal(ping.context.executionToken, null); // PING não habilita ferramentas
  const settings = await c.adm.req("/api/admin/settings");
  assert.ok(!JSON.stringify(settings.body).match(/openai|api_key|aiKey/i));
  assert.equal((await c.adm.req("/api/admin/settings", { method: "PUT", body: { "ai.model": "gpt" } })).status, 400); // chave removida
});

test("histórico de conversas: renomear, listar, exportar, excluir; isolamento entre usuários", async () => {
  disableN8n();
  const id = await newSession(c.dir);
  await send(c.dir, id, "Quanto faturamos?");
  assert.equal((await c.dir.req(`/api/rinne/sessions/${id}`, { method: "PATCH", body: { title: "Faturamento" } })).status, 204);
  const list = (await c.dir.req("/api/rinne/sessions?mode=CHAT")).body;
  assert.ok(list.some((s: any) => s.id === id && s.title === "Faturamento" && s.messages === 2));
  const exp = await c.dir.req(`/api/rinne/sessions/${id}/export`);
  assert.match(exp.body, /# Faturamento/);
  assert.equal((await c.adm.req(`/api/rinne/sessions/${id}/messages`)).status, 404); // conversa de outro usuário
  assert.equal((await c.ana.req("/api/rinne/sessions?mode=CHAT")).status, 403); // analista sem RINNE IA
  assert.equal((await c.dir.req(`/api/rinne/sessions/${id}`, { method: "DELETE" })).status, 204);
  assert.equal((await c.dir.req(`/api/rinne/sessions/${id}/messages`)).status, 404);
});
