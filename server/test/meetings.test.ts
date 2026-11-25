// Modo Reunião: máquina de estados, comandos por regra, períodos, fluxo completo, pausa/retomada,
// encerramento, segmentos de áudio (idempotência/checkpoint), limite de 5 h e recuperação após reinício.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client, createUser, startServer } from "./helpers.js";
import { disableN8n, enableN8n, ok, startMock } from "./n8nmock.js";

const { transition, allowedEvents, parseCommand, MEETING_STATES } = await import("../src/meetings/state.js");
const { resolvePeriod } = await import("../../shared/rinne.js");
const { sign } = await import("../src/integrations/n8n.js");
const { store, closeStore } = await import("../src/store.js");

let srv: Awaited<ReturnType<typeof startServer>>;
let mock: Awaited<ReturnType<typeof startMock>>;
const c: Record<string, Client> = {};
before(async () => {
  srv = await startServer();
  mock = await startMock(sign);
  disableN8n();
  await createUser("dir", "diretoria");
  await createUser("gest", "gestor", { scope: "Criação" });
  await createUser("ana", "analista");
  for (const u of ["dir", "gest", "ana"]) (c[u] = new Client(srv.base)), await c[u].login(u);
});
after(() => (mock.stop(), srv.stop()));

const ev = (cl: Client, id: string, body: object) => cl.req(`/api/rinne/meetings/${id}/events`, { method: "POST", body });
const cmd = (cl: Client, id: string, text: string) => cl.req(`/api/rinne/meetings/${id}/command`, { method: "POST", body: { text } });

test("máquina de estados: caminho feliz, pausa/retomada, erro/recuperação e estados terminais", () => {
  const path: [string, string, string][] = [
    ["IDLE", "START", "CONSENT"], ["CONSENT", "CONSENT", "DEPARTMENT_SELECTION"], ["DEPARTMENT_SELECTION", "SELECT_DEPARTMENT", "PERIOD_SELECTION"],
    ["PERIOD_SELECTION", "SELECT_PERIOD", "ANALYSIS"], ["ANALYSIS", "RECORD_ITEM", "ANALYSIS"], ["ANALYSIS", "COMPLETE_DEPARTMENT", "DEPARTMENT_COMPLETED"],
    ["DEPARTMENT_COMPLETED", "NEXT_DEPARTMENT", "NEXT_DEPARTMENT"], ["NEXT_DEPARTMENT", "SELECT_DEPARTMENT", "PERIOD_SELECTION"], ["ANALYSIS", "COMPLETE_MEETING", "MEETING_COMPLETED"],
  ];
  for (const [s, e, n] of path) assert.equal(transition(s as any, e as any), n, `${s} + ${e}`);
  assert.equal(transition("ANALYSIS", "PAUSE"), "PAUSED");
  assert.equal(transition("PAUSED", "RESUME", "ANALYSIS"), "ANALYSIS");
  assert.equal(transition("PAUSED", "RECORD_ITEM", "ANALYSIS"), null);
  assert.equal(transition("ANALYSIS", "FAIL"), "ERROR");
  assert.equal(transition("ERROR", "RECOVER", "ANALYSIS"), "ANALYSIS");
  assert.equal(transition("CONSENT", "SELECT_PERIOD"), null);
  assert.equal(transition("PERIOD_SELECTION", "RECORD_ITEM"), null);
  for (const t of ["MEETING_COMPLETED", "CANCELLED"]) for (const e of ["START", "RESUME", "CANCEL", "PAUSE"]) assert.equal(transition(t as any, e as any), null);
  for (const s of MEETING_STATES) if (!["MEETING_COMPLETED", "CANCELLED"].includes(s)) assert.equal(transition(s, "CANCEL"), "CANCELLED");
  assert.deepEqual(allowedEvents("PAUSED", "ANALYSIS"), ["RESUME", "CANCEL"]);
});

test("comandos por regra: sem inventar responsáveis nem prazos", () => {
  const today = "2026-11-25";
  assert.deepEqual(parseCommand("RINNE, iniciar modo reunião", "IDLE", today), { event: "START" });
  assert.deepEqual(parseCommand("Departamento finalizado.", "ANALYSIS", today), { event: "COMPLETE_DEPARTMENT" });
  assert.deepEqual(parseCommand("Encerrar reunião", "ANALYSIS", today), { event: "COMPLETE_MEETING" });
  assert.deepEqual(parseCommand("Departamento de Criação", "DEPARTMENT_SELECTION", today), { event: "SELECT_DEPARTMENT", department: "Criação" });
  assert.deepEqual(parseCommand("decisão: contratar freelancer", "ANALYSIS", today), { event: "RECORD_ITEM", kind: "decision", text: "contratar freelancer", responsible: null, dueDate: null });
  assert.deepEqual(parseCommand("encaminhamento: revisar escopo do cliente X; responsável: Ana Souza; prazo: 10/12/2026", "ANALYSIS", today), { event: "RECORD_ITEM", kind: "action", text: "revisar escopo do cliente X", responsible: "Ana Souza", dueDate: "2026-12-10" });
  assert.deepEqual(parseCommand("Quais clientes atrasaram?", "ANALYSIS", today), { event: "ASK", message: "Quais clientes atrasaram?" });
  assert.equal(parseCommand("período de bananas", "PERIOD_SELECTION", today).event, null);
});

test("períodos em linguagem natural", () => {
  const t = "2026-11-25"; // quarta-feira
  assert.deepEqual(resolvePeriod("hoje", t), { label: "Hoje", start: t, end: t });
  assert.deepEqual(resolvePeriod("ontem", t), { label: "Ontem", start: "2026-11-24", end: "2026-11-24" });
  assert.deepEqual(resolvePeriod("esta semana", t), { label: "Esta semana", start: "2026-11-23", end: t });
  assert.deepEqual(resolvePeriod("Este mês", t), { label: "Este mês", start: "2026-11-01", end: t });
  assert.deepEqual(resolvePeriod("mês anterior", "2026-01-10"), { label: "Mês anterior", start: "2025-12-01", end: "2025-12-31" });
  assert.deepEqual(resolvePeriod("últimos 30 dias", t), { label: "Últimos 30 dias", start: "2026-10-27", end: t });
  assert.deepEqual(resolvePeriod("últimos três meses", t), { label: "Últimos três meses", start: "2026-08-26", end: t });
  assert.deepEqual(resolvePeriod("este ano", t), { label: "Este ano", start: "2026-01-01", end: t });
  assert.deepEqual(resolvePeriod("01/10/2026 a 31/10/2026", t), { label: "Período personalizado", start: "2026-10-01", end: "2026-10-31" });
  assert.equal(resolvePeriod("31/10/2026 a 01/10/2026", t), null);
});

test("fluxo completo sem n8n: departamentos, itens, pausa, encerramento e relatório honesto", async () => {
  const m = await c.dir.req("/api/rinne/meetings", { method: "POST", body: { title: "Reunião de teste" } });
  assert.equal(m.status, 201);
  assert.equal(m.body.state, "CONSENT");
  assert.match(m.body.prompt, /microfone/);
  const id = m.body.id;
  assert.equal((await ev(c.dir, id, { event: "SELECT_PERIOD", period: "hoje" })).status, 409); // fora de ordem
  let r = await ev(c.dir, id, { event: "CONSENT", microphone: false, recording: false });
  assert.equal(r.body.view.state, "DEPARTMENT_SELECTION");
  assert.equal(r.body.view.prompt, "Qual departamento você deseja analisar?");
  r = await cmd(c.dir, id, "Departamento de Criação");
  assert.equal(r.body.view.state, "PERIOD_SELECTION");
  r = await cmd(c.dir, id, "este mês");
  assert.equal(r.body.view.state, "ANALYSIS");
  assert.ok(r.body.view.departments[0].indicators.length > 0); // snapshot determinístico
  assert.ok(r.body.view.departments[0].indicators.every((i: any) => i.value === null)); // sem banco
  await cmd(c.dir, id, "observação: equipe com muitas refações");
  await cmd(c.dir, id, "decisão: priorizar o cliente Y");
  await cmd(c.dir, id, "encaminhamento: revisar briefing; responsável: João; prazo: 05/12/2026");
  const ask = await cmd(c.dir, id, "Quantas horas registradas?");
  assert.equal(ask.body.reply.reply.status, "unavailable"); // RINNE sem n8n: informa, não inventa
  r = await ev(c.dir, id, { event: "PAUSE" });
  assert.equal(r.body.view.state, "PAUSED");
  assert.equal((await cmd(c.dir, id, "observação: durante a pausa")).status, 409);
  r = await cmd(c.dir, id, "retomar");
  assert.equal(r.body.view.state, "ANALYSIS");
  r = await cmd(c.dir, id, "departamento finalizado");
  assert.equal(r.body.view.state, "DEPARTMENT_COMPLETED");
  assert.match(r.body.view.prompt, /próximo departamento/);
  const d1 = r.body.view.departments[0];
  assert.equal(d1.status, "completed");
  assert.deepEqual(d1.summary.deterministic.counts, { observation: 1, decision: 1, problem: 0, opportunity: 0, action: 1 });
  assert.equal(d1.summary.ai.status, "unavailable");
  r = await cmd(c.dir, id, "Atendimento");
  r = await cmd(c.dir, id, "mês anterior");
  assert.equal(r.body.view.departments.length, 2);
  r = await cmd(c.dir, id, "encerrar reunião");
  assert.equal(r.body.view.state, "MEETING_COMPLETED");
  assert.equal(r.body.view.departments[1].status, "completed");
  assert.equal(r.body.view.report.ai.status, "unavailable");
  const md = await c.dir.req(`/api/rinne/meetings/${id}/report?format=md`);
  assert.match(md.body, /Análise inteligente indisponível/);
  assert.match(md.body, /revisar briefing — responsável: João — prazo: 05\/12\/2026/);
  assert.match(md.body, /priorizar o cliente Y$/m); // decisão sem responsável/prazo inventados
  assert.equal((await ev(c.dir, id, { event: "RESUME" })).status, 409); // terminal
});

test("consolidação via n8n (mock): DEPARTMENT_SUMMARY e MEETING_REPORT usam a mesma inteligência", async () => {
  enableN8n(mock.url);
  mock.setScenario((r) => ({ status: 200, json: ok(r.envelope.requestId, { text: `Consolidação ${r.envelope.operation}` }) }));
  const id = (await c.dir.req("/api/rinne/meetings", { method: "POST", body: {} })).body.id;
  await ev(c.dir, id, { event: "CONSENT", microphone: true, recording: false });
  await cmd(c.dir, id, "Mídia");
  await cmd(c.dir, id, "últimos 30 dias");
  await cmd(c.dir, id, "problema: atraso nas aprovações");
  const done = await cmd(c.dir, id, "departamento finalizado");
  assert.equal(done.body.view.departments[0].summary.ai.text, "Consolidação DEPARTMENT_SUMMARY");
  const end = await cmd(c.dir, id, "encerrar reunião");
  assert.equal(end.body.view.report.ai.text, "Consolidação MEETING_REPORT");
  const ops = mock.received.map((x) => x.envelope);
  const sum = ops.find((x) => x.operation === "DEPARTMENT_SUMMARY");
  assert.equal(sum.mode, "MEETING");
  assert.equal(sum.context.meetingId, id);
  assert.deepEqual(sum.context.data.items.map((i: any) => i.kind), ["problem"]);
  assert.ok(ops.some((x) => x.operation === "MEETING_START"));
  disableN8n();
});

test("áudio: exige consentimento e análise; segmentos idempotentes com checkpoint; áudio não é armazenado", async () => {
  const id = (await c.dir.req("/api/rinne/meetings", { method: "POST", body: {} })).body.id;
  const audio = (seq: number) => fetch(`${srv.base}/api/rinne/meetings/${id}/audio`, { method: "POST", headers: { cookie: c.dir.cookie, "x-requested-with": "rinne", "x-forwarded-for": c.dir.ip, "content-type": "audio/webm", "x-audio-duration-ms": "20000", "x-segment-seq": String(seq) }, body: new Uint8Array(Buffer.alloc(1024, 1)) });
  await ev(c.dir, id, { event: "CONSENT", microphone: false, recording: false });
  await cmd(c.dir, id, "Criação");
  await cmd(c.dir, id, "hoje");
  assert.equal((await audio(0)).status, 403); // sem consentimento do microfone
  store().prepare("UPDATE meetings SET consent_microphone = 1 WHERE id = ?").run(id);
  const a = (await (await audio(0)).json()) as any;
  assert.equal(a.segment.status, "unavailable"); // sem n8n: registrado, não transcrito
  const dup = (await (await audio(0)).json()) as any;
  assert.equal(dup.segment.duplicate, true);
  await audio(1);
  const v = (await c.dir.req(`/api/rinne/meetings/${id}`)).body;
  assert.deepEqual(v.segments, { count: 2, lastSeq: 1, totalMs: 40000 });
});

test("reuniões longas: limite de 5 h e recuperação do estado após reinício", async () => {
  const id = (await c.dir.req("/api/rinne/meetings", { method: "POST", body: {} })).body.id;
  await ev(c.dir, id, { event: "CONSENT", microphone: false, recording: false });
  await cmd(c.dir, id, "Criação");
  await cmd(c.dir, id, "hoje");
  await cmd(c.dir, id, "observação: antes do reinício");
  closeStore(); // simula reinício do processo
  const v = (await c.dir.req(`/api/rinne/meetings/${id}`)).body;
  assert.equal(v.state, "ANALYSIS");
  assert.equal(v.departments[0].items[0].text, "antes do reinício");
  store().prepare("UPDATE meetings SET started_at = ? WHERE id = ?").run(new Date(Date.now() - 5.5 * 3600000).toISOString(), id);
  assert.equal((await cmd(c.dir, id, "observação: depois do limite")).status, 409);
  assert.equal((await cmd(c.dir, id, "encerrar reunião")).body.view.state, "MEETING_COMPLETED"); // encerrar continua permitido
});

test("permissões: escopo departamental, dono da reunião e perfil sem Modo Reunião", async () => {
  const id = (await c.gest.req("/api/rinne/meetings", { method: "POST", body: {} })).body.id;
  await ev(c.gest, id, { event: "CONSENT", microphone: false, recording: false });
  assert.equal((await cmd(c.gest, id, "Financeiro")).status, 403);
  assert.equal((await cmd(c.gest, id, "criação")).status, 200);
  assert.equal((await c.dir.req(`/api/rinne/meetings/${id}`)).status, 404); // reunião de outro usuário
  assert.equal((await c.ana.req("/api/rinne/meetings", { method: "POST", body: {} })).status, 403);
  assert.equal((await c.gest.req(`/api/rinne/meetings/${id}`, { method: "DELETE" })).status, 409); // ainda ativa
  await cmd(c.gest, id, "cancelar reunião");
  assert.equal((await c.gest.req(`/api/rinne/meetings/${id}`, { method: "DELETE" })).status, 204);
});
