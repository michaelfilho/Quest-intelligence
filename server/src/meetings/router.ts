// Modo Reunião: estados controlados no backend (state.ts), inteligência única da RINNE via n8n.
// Persistência incremental: cada departamento, item e segmento é gravado na hora (checkpoint para reuniões longas).
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { INDICATORS, moduleById } from "../../../shared/catalog.js";
import { todaySP } from "../../../shared/contracts.js";
import { resolvePeriod } from "../../../shared/rinne.js";
import { clientIp, requirePerm, type SessionUser } from "../auth.js";
import { chartAllowed, indicatorAllowed, scopeFilters } from "../authz.js";
import { filtersSchema } from "../filters.js";
import { callN8n, n8nStatus } from "../integrations/n8n.js";
import { createSession, MAX_AUDIO_BYTES, readAudio, RinneError, sendMessage } from "../rinne.js";
import { resolveModule } from "../services.js";
import { audit, now, store } from "../store.js";
import { allowedEvents, parseCommand, promptFor, transition, type Command, type ItemKind, type MeetingState } from "./state.js";

export const MAX_MEETING_MS = 5 * 3600 * 1000; // 5 horas
const KIND_LABEL: Record<ItemKind, string> = { observation: "Observações", decision: "Decisões", problem: "Problemas", opportunity: "Oportunidades", action: "Encaminhamentos" };

type Row = Record<string, unknown>;
const j = (s: unknown, fallback: unknown = null) => (s == null ? fallback : JSON.parse(String(s)));

function own(user: SessionUser, id: string) {
  const m = store().prepare("SELECT * FROM meetings WHERE id = ? AND user_id = ?").get(id, user.id);
  if (!m) throw new RinneError(404, "Reunião inexistente.");
  return m;
}

const currentDept = (m: Row) => (m.current_department_id ? store().prepare("SELECT * FROM meeting_departments WHERE id = ?").get(String(m.current_department_id)) ?? null : null);

export function meetingView(user: SessionUser, id: string) {
  const m = own(user, id);
  const d = store();
  const depts = d.prepare("SELECT * FROM meeting_departments WHERE meeting_id = ? ORDER BY seq").all(id);
  const items = d.prepare("SELECT * FROM meeting_items WHERE meeting_id = ? ORDER BY created_at, rowid").all(id);
  const seg = d.prepare("SELECT count(*) n, max(seq) last, coalesce(sum(duration_ms), 0) ms FROM meeting_segments WHERE meeting_id = ?").get(id)!;
  const cur = currentDept(m);
  const state = m.state as MeetingState;
  const pausedFrom = (m.paused_from as MeetingState) ?? null;
  return {
    id: m.id,
    title: m.title,
    state,
    pausedFrom,
    prompt: promptFor(state === "PAUSED" || state === "ERROR" ? state : state, { department: cur ? String(cur.department) : null, period: cur?.period_label ? String(cur.period_label) : null }),
    allowedEvents: allowedEvents(state, pausedFrom),
    consent: { microphone: !!m.consent_microphone, recording: !!m.consent_recording },
    sessionId: m.rinne_session_id,
    startedAt: m.started_at,
    completedAt: m.completed_at,
    elapsedMs: Date.now() - Date.parse(String(m.started_at)),
    maxDurationMs: MAX_MEETING_MS,
    error: m.error,
    currentDepartmentId: m.current_department_id,
    departments: depts.map((x) => ({
      id: x.id,
      seq: x.seq,
      department: x.department,
      period: x.period_start ? { label: x.period_label, start: x.period_start, end: x.period_end } : null,
      status: x.status,
      indicators: j(x.indicators, []),
      summary: j(x.summary),
      items: items.filter((i) => i.department_id === x.id).map((i) => ({ id: i.id, kind: i.kind, text: i.text, responsible: i.responsible, dueDate: i.due_date, source: i.source, createdAt: i.created_at })),
      startedAt: x.started_at,
      completedAt: x.completed_at,
    })),
    segments: { count: Number(seg.n), lastSeq: seg.last == null ? null : Number(seg.last), totalMs: Number(seg.ms) },
    report: j(m.report),
    intelligence: { available: n8nStatus().enabled },
  };
}

function setState(id: string, state: MeetingState, extra: Record<string, unknown> = {}) {
  const sets = ["state = ?", "updated_at = ?", ...Object.keys(extra).map((k) => `${k} = ?`)];
  store().prepare(`UPDATE meetings SET ${sets.join(", ")} WHERE id = ?`).run(state, now(), ...(Object.values(extra) as (string | number | null)[]), id);
}

/** Snapshot determinístico dos indicadores do departamento (permissões e escopo do usuário). */
async function snapshot(user: SessionUser, department: string, start: string, end: string) {
  const m = moduleById("departamentos")!;
  if (!user.permissions.has("departamentos.view")) return [];
  const f = scopeFilters(user, filtersSchema.parse({ start, end, department }));
  const r = await resolveModule(m, f, { indicator: (x) => indicatorAllowed(user, x), chart: (x) => chartAllowed(user, x) });
  return r.indicators.filter((i) => i.status !== "FORBIDDEN").map((i) => ({ id: i.id, label: INDICATORS[i.id].label, unit: INDICATORS[i.id].unit, status: i.status, value: i.value, reliability: i.reliability }));
}

function itemsOf(meetingId: string, deptId?: string) {
  const rows = deptId
    ? store().prepare("SELECT kind, text, responsible, due_date FROM meeting_items WHERE department_id = ? ORDER BY created_at, rowid").all(deptId)
    : store().prepare("SELECT kind, text, responsible, due_date FROM meeting_items WHERE meeting_id = ? ORDER BY created_at, rowid").all(meetingId);
  return rows.map((r) => ({ kind: r.kind, text: r.text, responsible: r.responsible ?? null, dueDate: r.due_date ?? null }));
}

/** Consolidação: parte determinística sempre; parte inteligente só via n8n (se disponível). */
async function consolidateDepartment(user: SessionUser, m: Row, dept: Row) {
  const items = itemsOf(String(m.id), String(dept.id));
  const counts = Object.fromEntries(Object.keys(KIND_LABEL).map((k) => [k, items.filter((i) => i.kind === k).length]));
  const indicators = j(dept.indicators, []) as { status: string }[];
  const r = await callN8n({ user, mode: "MEETING", operation: "DEPARTMENT_SUMMARY", sessionId: null, message: null, departmentId: String(dept.department), period: dept.period_start ? { from: String(dept.period_start), to: String(dept.period_end) } : null, meetingId: String(m.id), data: { department: dept.department, items, indicators } });
  const ai = r.status === "success" ? { status: "done", requestId: r.requestId, text: r.body?.text ?? null, summary: r.body?.summary ?? null, error: null } : r.status === "accepted" ? { status: "pending", requestId: r.requestId, text: null, summary: null, error: null } : { status: "unavailable", requestId: r.requestId, text: null, summary: null, error: r.error };
  const summary = { deterministic: { counts, items: items.length, indicatorsAnalyzed: indicators.length, indicatorsUnavailable: indicators.filter((i) => i.status !== "OK").length }, ai };
  store().prepare("UPDATE meeting_departments SET status = 'completed', summary = ?, completed_at = ? WHERE id = ?").run(JSON.stringify(summary), now(), String(dept.id));
}

async function buildReport(user: SessionUser, m: Row) {
  const depts = store().prepare("SELECT * FROM meeting_departments WHERE meeting_id = ? ORDER BY seq").all(String(m.id));
  const all = itemsOf(String(m.id));
  const r = await callN8n({ user, mode: "MEETING", operation: "MEETING_REPORT", sessionId: null, message: null, meetingId: String(m.id), data: { title: m.title, departments: depts.map((d) => ({ department: d.department, period: d.period_label, summary: j(d.summary) })), items: all } });
  const ai = r.status === "success" ? { status: "done", requestId: r.requestId, text: r.body?.text ?? null, summary: r.body?.summary ?? null, error: null } : r.status === "accepted" ? { status: "pending", requestId: r.requestId, text: null, summary: null, error: null } : { status: "unavailable", requestId: r.requestId, text: null, summary: null, error: r.error };
  return { generatedAt: now(), departments: depts.length, totals: Object.fromEntries(Object.keys(KIND_LABEL).map((k) => [k, all.filter((i) => i.kind === k).length])), ai };
}

type Applied = { view: ReturnType<typeof meetingView>; reply?: unknown };

/** Aplica um evento validando a transição; efeitos colaterais persistidos na mesma requisição. */
export async function applyEvent(user: SessionUser, id: string, cmd: Exclude<Command, { event: null }> | { event: "CONSENT"; microphone: boolean; recording: boolean } | { event: "AUDIO_SEGMENT" }, signal?: AbortSignal): Promise<Applied> {
  const m = own(user, id);
  const state = m.state as MeetingState;
  const pausedFrom = (m.paused_from as MeetingState) ?? null;
  const next = transition(state, cmd.event, pausedFrom);
  if (!next) throw new RinneError(409, `Ação “${cmd.event}” não permitida no estado ${state}.`);
  const overtime = Date.now() - Date.parse(String(m.started_at)) > MAX_MEETING_MS;
  if (overtime && !["COMPLETE_MEETING", "CANCEL", "COMPLETE_DEPARTMENT", "PAUSE"].includes(cmd.event)) throw new RinneError(409, "Duração máxima de 5 horas atingida. Encerre a reunião para gerar o relatório.");
  const cur = currentDept(m);
  let reply: unknown;

  switch (cmd.event) {
    case "CONSENT":
      setState(id, next, { consent_microphone: cmd.microphone ? 1 : 0, consent_recording: cmd.recording ? 1 : 0 });
      break;
    case "SELECT_DEPARTMENT": {
      if (user.scopeDepartment && user.scopeDepartment.localeCompare(cmd.department, "pt-BR", { sensitivity: "base" }) !== 0) throw new RinneError(403, `Seu acesso é restrito ao departamento ${user.scopeDepartment}.`);
      if (state === "PERIOD_SELECTION" && cur && cur.status === "active" && !cur.period_start) {
        store().prepare("UPDATE meeting_departments SET department = ? WHERE id = ?").run(cmd.department, cur.id);
      } else {
        const deptId = randomUUID();
        const seq = Number(store().prepare("SELECT coalesce(max(seq), 0) + 1 n FROM meeting_departments WHERE meeting_id = ?").get(id)!.n);
        store().prepare("INSERT INTO meeting_departments (id, meeting_id, seq, department, started_at) VALUES (?, ?, ?, ?, ?)").run(deptId, id, seq, cmd.department, now());
        store().prepare("UPDATE meetings SET current_department_id = ? WHERE id = ?").run(deptId, id);
      }
      setState(id, next);
      break;
    }
    case "SELECT_PERIOD": {
      if (!cur) throw new RinneError(409, "Selecione um departamento antes do período.");
      const indicators = await snapshot(user, String(cur.department), cmd.start, cmd.end);
      store().prepare("UPDATE meeting_departments SET period_label = ?, period_start = ?, period_end = ?, indicators = ? WHERE id = ?").run(cmd.label, cmd.start, cmd.end, JSON.stringify(indicators), cur.id);
      setState(id, next);
      break;
    }
    case "RECORD_ITEM":
      if (!cur) throw new RinneError(409, "Nenhum departamento em análise.");
      store().prepare("INSERT INTO meeting_items (id, meeting_id, department_id, kind, text, responsible, due_date, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?)").run(randomUUID(), id, cur.id, cmd.kind, cmd.text.slice(0, 2000), cmd.responsible?.slice(0, 120) ?? null, cmd.dueDate, now());
      setState(id, next);
      break;
    case "ASK": {
      if (!cur) throw new RinneError(409, "Nenhum departamento em análise.");
      const f = scopeFilters(user, filtersSchema.parse({ start: cur.period_start ?? undefined, end: cur.period_end ?? undefined, department: String(cur.department) }));
      reply = await sendMessage(user, String(m.rinne_session_id), { message: cmd.message, operation: "DEPARTMENT_ANALYSIS", departmentId: String(cur.department), meetingId: id, data: { items: itemsOf(id, String(cur.id)) }, signal }, f);
      setState(id, next);
      break;
    }
    case "COMPLETE_DEPARTMENT":
      if (!cur || cur.status !== "active") throw new RinneError(409, "Nenhum departamento em análise.");
      await consolidateDepartment(user, m, cur);
      setState(id, next);
      break;
    case "COMPLETE_MEETING": {
      if (cur && cur.status === "active" && cur.period_start) await consolidateDepartment(user, m, cur);
      if (cur && cur.status === "active" && !cur.period_start) store().prepare("DELETE FROM meeting_departments WHERE id = ?").run(cur.id); // seleção incompleta
      const report = await buildReport(user, store().prepare("SELECT * FROM meetings WHERE id = ?").get(id)!);
      setState(id, next, { report: JSON.stringify(report), completed_at: now(), current_department_id: null });
      audit({ event: "meeting.complete", actorId: user.id, actor: user.username, target: id, details: { departments: report.departments } });
      break;
    }
    case "PAUSE":
      setState(id, next, { paused_from: state });
      break;
    case "RESUME":
    case "RECOVER":
      setState(id, next, { paused_from: null, error: null });
      break;
    case "CANCEL":
      setState(id, next, { completed_at: now() });
      break;
    default:
      setState(id, next);
  }
  return { view: meetingView(user, id), reply };
}

// ---------------- Rotas /api/rinne/meetings ----------------
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) =>
  fn(req, res).catch((e) => (e instanceof RinneError ? res.status(e.status).json({ error: e.message }) : (console.error(JSON.stringify({ level: "error", scope: "meetings", msg: (e as Error).message })), res.status(500).json({ error: "Erro interno" }))));

const eventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("CONSENT"), microphone: z.boolean(), recording: z.boolean() }),
  z.object({ event: z.literal("SELECT_DEPARTMENT"), department: z.string().trim().min(2).max(64) }),
  z.object({ event: z.literal("SELECT_PERIOD"), period: z.string().trim().max(60).optional(), start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  z.object({ event: z.literal("RECORD_ITEM"), kind: z.enum(["observation", "decision", "problem", "opportunity", "action"]), text: z.string().trim().min(1).max(2000), responsible: z.string().trim().max(120).nullable().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }),
  z.object({ event: z.literal("ASK"), message: z.string().trim().min(1).max(4000) }),
  ...(["START", "COMPLETE_DEPARTMENT", "NEXT_DEPARTMENT", "COMPLETE_MEETING", "PAUSE", "RESUME", "CANCEL", "RECOVER"] as const).map((e) => z.object({ event: z.literal(e) })),
]);

export function meetingsRouter() {
  const r = express.Router();
  r.use(requirePerm("reuniao.use"));
  const json = express.json({ limit: "16kb" });

  r.get("/", (req, res) => {
    res.json(store().prepare("SELECT id, title, state, started_at, completed_at, updated_at, (SELECT count(*) FROM meeting_departments d WHERE d.meeting_id = m.id) departments FROM meetings m WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100").all(req.user!.id));
  });

  // "RINNE, iniciar modo reunião" → cria a reunião e já pede o consentimento.
  r.post("/", json, wrap(async (req, res) => {
    const p = z.object({ title: z.string().trim().max(120).optional() }).safeParse(req.body ?? {});
    if (!p.success) throw new RinneError(400, "Título inválido.");
    const id = randomUUID();
    const title = p.data.title || `Reunião ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`;
    const sessionId = createSession(req.user!, "MEETING", title);
    const t = now();
    store().prepare("INSERT INTO meetings (id, user_id, rinne_session_id, title, state, started_at, updated_at) VALUES (?, ?, ?, ?, 'IDLE', ?, ?)").run(id, req.user!.id, sessionId, title, t, t);
    const out = await applyEvent(req.user!, id, { event: "START" });
    audit({ event: "meeting.start", actorId: req.user!.id, actor: req.user!.username, ip: clientIp(req), target: id });
    // MEETING_START: aviso opcional ao n8n (sem bloquear a reunião se indisponível).
    void callN8n({ user: req.user!, mode: "MEETING", operation: "MEETING_START", sessionId: null, message: null, meetingId: id, data: { title } });
    res.status(201).json(out.view);
  }));

  r.get("/:id", wrap(async (req, res) => res.json(meetingView(req.user!, String(req.params.id)))));

  r.post("/:id/events", json, wrap(async (req, res) => {
    const p = eventSchema.safeParse(req.body);
    if (!p.success) throw new RinneError(400, "Evento inválido.");
    let cmd = p.data as Parameters<typeof applyEvent>[2];
    if (p.data.event === "SELECT_PERIOD") {
      const d = p.data;
      const per = d.start && d.end ? (d.start <= d.end ? { label: "Período personalizado", start: d.start, end: d.end } : null) : resolvePeriod(d.period ?? "", todaySP());
      if (!per) throw new RinneError(400, "Período inválido.");
      cmd = { event: "SELECT_PERIOD", ...per };
    }
    if (p.data.event === "RECORD_ITEM") cmd = { ...p.data, responsible: p.data.responsible ?? null, dueDate: p.data.dueDate ?? null };
    const ac = new AbortController();
    res.on("close", () => !res.writableEnded && ac.abort());
    res.json(await applyEvent(req.user!, String(req.params.id), cmd, ac.signal));
  }));

  // Comando em linguagem natural (texto ou transcrição) → regra determinística → evento.
  r.post("/:id/command", json, wrap(async (req, res) => {
    const p = z.object({ text: z.string().trim().min(1).max(4000) }).safeParse(req.body);
    if (!p.success) throw new RinneError(400, "Comando inválido.");
    const m = own(req.user!, String(req.params.id));
    const cmd = parseCommand(p.data.text, m.state as MeetingState, todaySP());
    if (cmd.event === null) throw new RinneError(422, cmd.error);
    res.json({ command: cmd, ...(await applyEvent(req.user!, String(req.params.id), cmd)) });
  }));

  // Segmento de áudio (binário, ≤ 2 MB, ≤ 60 s). Idempotente por (reunião, seq): repetição NÃO reenvia ao n8n.
  r.post("/:id/audio", express.raw({ type: ["audio/webm", "audio/ogg", "audio/wav", "audio/mp4", "audio/mpeg"], limit: MAX_AUDIO_BYTES }), wrap(async (req, res) => {
    const id = String(req.params.id);
    const m = own(req.user!, id);
    const seq = Number(req.headers["x-segment-seq"]);
    if (!Number.isInteger(seq) || seq < 0 || seq > 100000) throw new RinneError(400, "X-Segment-Seq inválido.");
    const existing = store().prepare("SELECT * FROM meeting_segments WHERE meeting_id = ? AND seq = ?").get(id, seq);
    if (existing) return res.json({ segment: { seq, status: existing.status, transcript: existing.transcript, duplicate: true }, checkpoint: seq });
    if (m.state !== "ANALYSIS") throw new RinneError(409, "Áudio só é aceito durante a análise de um departamento.");
    if (!m.consent_microphone) throw new RinneError(403, "Uso do microfone não autorizado nesta reunião.");
    if (Date.now() - Date.parse(String(m.started_at)) > MAX_MEETING_MS) throw new RinneError(409, "Duração máxima de 5 horas atingida.");
    const audio = readAudio(req);
    const cur = currentDept(m);
    const r2 = await callN8n({ user: req.user!, mode: "MEETING", operation: "TRANSCRIBE", sessionId: null, message: null, departmentId: cur ? String(cur.department) : null, meetingId: id, audio, idempotencyKey: `${req.user!.id}:seg:${id}:${seq}` });
    const status = r2.status === "success" ? "transcribed" : r2.status === "accepted" ? "received" : r2.status === "unavailable" ? "unavailable" : "error";
    const transcript = r2.body?.transcript ?? null;
    store().prepare("INSERT INTO meeting_segments (id, meeting_id, department_id, seq, duration_ms, bytes, status, transcript, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), id, cur?.id ?? null, seq, audio.durationMs, audio.bytes.length, status, transcript, r2.requestId, now());
    if (transcript && cur) store().prepare("INSERT INTO meeting_items (id, meeting_id, department_id, kind, text, source, created_at) VALUES (?, ?, ?, 'observation', ?, 'rinne', ?)").run(randomUUID(), id, cur.id, `[transcrição] ${transcript.slice(0, 2000)}`, now());
    res.json({ segment: { seq, status, transcript, duplicate: false, error: r2.error }, checkpoint: seq });
  }));

  r.delete("/:id", wrap(async (req, res) => {
    const m = own(req.user!, String(req.params.id));
    if (!["MEETING_COMPLETED", "CANCELLED"].includes(String(m.state))) throw new RinneError(409, "Encerre ou cancele a reunião antes de excluí-la.");
    store().prepare("DELETE FROM meetings WHERE id = ?").run(m.id);
    if (m.rinne_session_id) store().prepare("DELETE FROM rinne_sessions WHERE id = ?").run(m.rinne_session_id);
    audit({ event: "meeting.delete", actorId: req.user!.id, actor: req.user!.username, ip: clientIp(req), target: String(m.id) });
    res.status(204).end();
  }));

  // Relatório da reunião: SEMPRE disponível (observações/decisões), indicando a ausência da análise por IA.
  r.get("/:id/report", wrap(async (req, res) => {
    const v = meetingView(req.user!, String(req.params.id));
    const format = String(req.query.format ?? "json");
    if (format === "json") return res.json(v);
    if (format !== "md") throw new RinneError(400, "Formato inválido (json ou md).");
    res.set({ "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="reuniao_${String(v.id).slice(0, 8)}.md"` });
    res.send(meetingMarkdown(v, req.user!.name));
  }));

  return r;
}

const fmtDate = (iso?: unknown) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");

export function meetingMarkdown(v: ReturnType<typeof meetingView>, by: string) {
  const L = [`# ${v.title}`, "", `- Situação: ${v.state}`, `- Início: ${new Date(String(v.startedAt)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, `- Encerramento: ${v.completedAt ? new Date(String(v.completedAt)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}`, `- Exportado por: ${by}`, `- Departamentos analisados: ${v.departments.length}`, ""];
  const ai = v.report?.ai;
  L.push("## Análise da RINNE (IA)", "", ai?.status === "done" ? String(ai.text ?? ai.summary ?? "") : "> **Análise inteligente indisponível.** A consolidação por IA depende da integração com o n8n. Este relatório contém apenas os registros feitos durante a reunião e os indicadores calculados pelo sistema.", "");
  for (const d of v.departments) {
    L.push(`## ${d.seq}. ${d.department}`, "", `Período: ${d.period ? `${d.period.label} (${fmtDate(d.period.start)} a ${fmtDate(d.period.end)})` : "não definido"}`, "");
    L.push("### Indicadores analisados", "");
    const inds = d.indicators as { label: string; status: string; value: unknown }[];
    L.push(...(inds.length ? inds.map((i) => `- ${i.label}: ${i.status === "OK" ? String(i.value) : `indisponível (${i.status})`}`) : ["- Nenhum indicador disponível para o perfil ou período."]), "");
    for (const k of Object.keys(KIND_LABEL) as ItemKind[]) {
      const items = d.items.filter((i) => i.kind === k);
      if (!items.length) continue;
      L.push(`### ${KIND_LABEL[k]}`, "", ...items.map((i) => `- ${i.text}${i.responsible ? ` — responsável: ${i.responsible}` : ""}${i.dueDate ? ` — prazo: ${fmtDate(i.dueDate)}` : ""}${i.source === "rinne" ? " _(transcrição)_" : ""}`), "");
    }
    const s = d.summary as { ai?: { status: string; text?: string | null } } | null;
    if (s?.ai?.status === "done" && s.ai.text) L.push("### Consolidação da RINNE", "", String(s.ai.text), "");
  }
  L.push("---", "", "_Valores indisponíveis não foram estimados. Responsáveis e prazos aparecem apenas quando informados. Áudio bruto não é armazenado._");
  return L.join("\n");
}

