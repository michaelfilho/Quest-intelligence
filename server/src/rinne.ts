// RINNE — inteligência ÚNICA compartilhada por RINNE IA (CHAT), RINNE Voz (VOICE) e Modo Reunião (MEETING).
// A interpretação inteligente acontece no n8n (integrations/n8n.ts). Aqui ficam: sessões, histórico, permissões,
// o modo determinístico (catálogo → indicadores) e a validação de tudo que volta para o navegador.
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { INDICATORS } from "../../shared/catalog.js";
import type { Filters, IndicatorResult } from "../../shared/contracts.js";
import type { Permission } from "../../shared/permissions.js";
import { RINNE_MODES, type RinneMessage, type RinneMode, type RinneOperation } from "../../shared/rinne.js";
import { clientIp, requirePerm, type SessionUser } from "./auth.js";
import { indicatorAllowed, scopeFilters } from "./authz.js";
import { dbState } from "./db.js";
import { filtersSchema } from "./filters.js";
import { callN8n, n8nStatus, type CallResult } from "./integrations/n8n.js";
import { resolveIndicator } from "./services.js";
import { audit, getSetting, now, store } from "./store.js";

// ---------------- Modo determinístico ----------------
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set("que qual quais quanto quantos quantas como onde nosso nossa nossos estamos foi foram esta este mes ano periodo para com dos das por mais menos uma uns sobre the".split(" "));
const SYNONYMS: Record<string, string[]> = {
  recebemos: ["recebida"], recebido: ["recebida"], faturamos: ["faturada"], faturamento: ["faturada"], gastamos: ["despesas"], gasto: ["despesas"], gastos: ["despesas"],
  lucro: ["resultado", "margem"], ganhamos: ["resultado"], rentabilidade: ["margem", "resultado"], atrasados: ["atraso", "atrasadas"], atrasos: ["atraso", "atrasadas"],
  produzimos: ["pecas", "entregas", "atividades"], producao: ["pecas", "entregas"], refacao: ["retrabalho"], refacoes: ["retrabalho"], horas: ["horas"], equipe: ["colaboradores"],
  sincronizacao: ["sincronizacao"], conflitos: ["conflitos"], clientes: ["clientes"], contratado: ["contratado", "escopo"], capacidade: ["capacidade", "ocupacao"], sobrecarregados: ["ocupacao", "capacidade"], gargalos: ["atraso", "retrabalho", "ocupacao"],
};

export function matchIndicators(question: string, limit = 4) {
  const tokens = norm(question).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t)).flatMap((t) => [t, ...(SYNONYMS[t] ?? [])]);
  if (!tokens.length) return [];
  return Object.values(INDICATORS)
    .map((d) => {
      const hay = norm(`${d.label} ${d.id.replace(/_/g, " ")}`);
      const score = tokens.reduce((s, t) => s + (hay.includes(t) ? (hay.split(/\s+/).includes(t) ? 2 : 1) : 0), 0);
      return { id: d.id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.id);
}

type Resolved = IndicatorResult & { label: string; unit: string; basis: string; formula: string; sources: string[] };

/** Valores SEMPRE calculados pelo backend com as permissões do usuário (nunca vindos da IA). */
export async function resolveForUser(user: SessionUser, ids: string[], f: Filters) {
  const { state } = await dbState();
  const out: Resolved[] = [];
  let hidden = 0;
  for (const id of [...new Set(ids)]) {
    if (!INDICATORS[id]) continue;
    if (!indicatorAllowed(user, id)) {
      hidden++;
      continue;
    }
    const d = INDICATORS[id];
    out.push({ ...(await resolveIndicator(id, f, state)), label: d.label, unit: d.unit, basis: d.basis, formula: d.formula, sources: d.sources });
  }
  return { database: state, resolved: out, hidden };
}

/** Compatibilidade: pergunta avulsa, só determinística (POST /api/rinne/ask). */
export async function ask(user: SessionUser, question: string, f: Filters) {
  const ids = matchIndicators(question);
  const { database, resolved, hidden } = await resolveForUser(user, ids, f);
  return {
    mode: "deterministico" as const,
    period: { start: f.start, end: f.end },
    database,
    answers: resolved,
    note: !ids.length
      ? "Não identifiquei um indicador na pergunta. Tente termos como receita recebida, despesas, horas, projetos atrasados ou retrabalho."
      : hidden && !resolved.length
        ? "Os indicadores relacionados à pergunta não estão liberados para o seu perfil."
        : hidden
          ? `${hidden} indicador(es) relacionado(s) não aparece(m) por falta de permissão.`
          : null,
  };
}

// ---------------- Sessões e histórico ----------------
export const MODE_PERMISSION: Record<RinneMode, Permission> = { CHAT: "rinne_ia.use", VOICE: "rinne_voz.use", MEETING: "reuniao.use" };

export class RinneError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function createSession(user: SessionUser, mode: RinneMode, title?: string) {
  const id = randomUUID();
  const t = now();
  store().prepare("INSERT INTO rinne_sessions (id, user_id, mode, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, user.id, mode, title?.trim() || "Nova conversa", t, t);
  return id;
}

export function ownSession(user: SessionUser, id: string) {
  const s = store().prepare("SELECT * FROM rinne_sessions WHERE id = ? AND user_id = ?").get(id, user.id);
  if (!s) throw new RinneError(404, "Conversa inexistente.");
  if (!user.permissions.has(MODE_PERMISSION[s.mode as RinneMode])) throw new RinneError(403, "Sem permissão para este modo da RINNE.");
  return s;
}

function toMessage(r: Record<string, unknown>): RinneMessage {
  return { id: String(r.id), sessionId: String(r.session_id), role: r.role as RinneMessage["role"], status: r.status as RinneMessage["status"], content: String(r.content), payload: JSON.parse(String(r.payload)), createdAt: String(r.created_at) };
}

function insertMessage(sessionId: string, role: RinneMessage["role"], status: RinneMessage["status"], content: string, payload: object, requestId: string | null = null) {
  const id = randomUUID();
  store().prepare("INSERT INTO rinne_messages (id, session_id, role, status, content, payload, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, sessionId, role, status, content, JSON.stringify(payload), requestId, now());
  store().prepare("UPDATE rinne_sessions SET updated_at = ? WHERE id = ?").run(now(), sessionId);
  return toMessage(store().prepare("SELECT * FROM rinne_messages WHERE id = ?").get(id)!);
}

const UNAVAILABLE_TEXT: Record<string, string> = {
  unavailable: "A análise inteligente da RINNE está indisponível: a integração com o n8n não está configurada ou ativa.",
  timeout: "A RINNE não respondeu a tempo. Nada foi reenviado automaticamente; tente novamente se desejar.",
  error: "A RINNE não conseguiu concluir esta solicitação.",
  busy: "A RINNE está ocupada com outra solicitação desta conversa. Aguarde a resposta anterior.",
  cancelled: "Solicitação cancelada.",
};

/** Converte o resultado do n8n (+ apoio determinístico) na mensagem da assistente. */
async function replyFrom(user: SessionUser, sessionId: string, r: CallResult, deterministicIds: string[], f: Filters, extra: object = {}) {
  const ids = [...deterministicIds, ...(r.body?.indicators.map((i) => i.id) ?? [])];
  const { resolved, hidden, database } = await resolveForUser(user, ids, f);
  const base = { requestId: r.requestId, correlationId: r.correlationId, resolvedIndicators: resolved, period: { from: f.start, to: f.end }, database, ...extra };
  const hiddenWarn = hidden ? [`${hidden} indicador(es) relacionado(s) omitido(s) por falta de permissão.`] : [];
  if (r.status === "success" && r.body) {
    return insertMessage(sessionId, "assistant", "done", r.body.text, { ...r.body, ...base, origin: "n8n", warnings: [...r.body.warnings, ...hiddenWarn] }, r.requestId);
  }
  if (r.status === "accepted") return insertMessage(sessionId, "assistant", "pending", "A RINNE está processando esta solicitação…", { ...base, origin: "n8n" }, r.requestId);
  const status = r.status === "cancelled" ? "cancelled" : r.status === "unavailable" ? "unavailable" : "error";
  const text = (UNAVAILABLE_TEXT[r.status] ?? UNAVAILABLE_TEXT.error) + (resolved.length ? " Abaixo, os indicadores relacionados calculados diretamente pelo sistema." : "");
  return insertMessage(sessionId, "assistant", status, text, { ...base, origin: "deterministico", warnings: [r.error, ...hiddenWarn].filter(Boolean) }, r.requestId);
}

export interface SendInput {
  message: string | null;
  operation?: RinneOperation;
  departmentId?: string | null;
  period?: { from: string; to: string } | null;
  meetingId?: string | null;
  data?: Record<string, unknown>;
  audio?: { bytes: Buffer; mimeType: string; durationMs: number } | null;
  idempotencyKey?: string | null;
  signal?: AbortSignal;
  userContent?: string | null; // texto exibido para a mensagem do usuário (ex.: "[áudio 12 s]")
}

export async function sendMessage(user: SessionUser, sessionId: string, input: SendInput, f: Filters) {
  const s = ownSession(user, sessionId);
  const mode = s.mode as RinneMode;
  const userMsg = input.userContent !== null && (input.message || input.userContent) ? insertMessage(sessionId, "user", "done", input.userContent ?? input.message!, {}) : null;
  if (userMsg && s.title === "Nova conversa" && input.message) store().prepare("UPDATE rinne_sessions SET title = ? WHERE id = ?").run(input.message.slice(0, 80), sessionId);
  const r = await callN8n({
    user,
    mode,
    operation: input.operation ?? (input.audio ? "TRANSCRIBE" : "ASK"),
    sessionId,
    message: input.message,
    departmentId: input.departmentId ?? f.department ?? null,
    period: input.period ?? { from: f.start, to: f.end },
    meetingId: input.meetingId,
    data: input.data,
    audio: input.audio,
    idempotencyKey: input.idempotencyKey,
    signal: input.signal,
  });
  const reply = await replyFrom(user, sessionId, r, input.message ? matchIndicators(input.message) : [], f, r.body?.transcript ? { transcript: r.body.transcript } : {});
  return { userMessage: userMsg, reply, n8n: { status: r.status, requestId: r.requestId, correlationId: r.correlationId, latencyMs: r.latencyMs, replayed: !!r.replayed } };
}

/** Callback assíncrono do n8n: conclui mensagens e consolidações de reunião pendentes. */
export function applyAsyncResult(requestId: string, body: Record<string, unknown> | null, error: string | null) {
  const d = store();
  for (const m of d.prepare("SELECT * FROM rinne_messages WHERE request_id = ? AND status = 'pending'").all(requestId)) {
    const prev = JSON.parse(String(m.payload));
    d.prepare("UPDATE rinne_messages SET status = ?, content = ?, payload = ? WHERE id = ?").run(body ? "done" : "error", body ? String(body.text ?? "") : `A RINNE não conseguiu concluir esta solicitação${error ? `: ${error}` : "."}`, JSON.stringify({ ...prev, ...(body ?? {}), origin: "n8n", warnings: [...((body?.warnings as string[]) ?? []), ...(error ? [error] : [])] }), m.id);
  }
  const ai = JSON.stringify({ status: body ? "done" : "error", requestId, text: body?.text ?? null, summary: body?.summary ?? null, error });
  d.prepare("UPDATE meeting_departments SET summary = json_set(summary, '$.ai', json(?)) WHERE json_extract(summary, '$.ai.requestId') = ?").run(ai, requestId);
  d.prepare("UPDATE meetings SET report = json_set(report, '$.ai', json(?)), updated_at = ? WHERE json_extract(report, '$.ai.requestId') = ?").run(ai, now(), requestId);
}

// ---------------- Rotas /api/rinne ----------------
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/wav", "audio/mp4", "audio/mpeg"];
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // 2 MB por segmento
export const MAX_AUDIO_MS = 60000; // 60 s por segmento

export function readAudio(req: Request) {
  const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim();
  if (!AUDIO_TYPES.includes(mime)) throw new RinneError(415, "Formato de áudio não suportado.");
  const bytes = req.body as Buffer;
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new RinneError(400, "Segmento de áudio vazio.");
  const durationMs = Number(req.headers["x-audio-duration-ms"]);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_AUDIO_MS) throw new RinneError(400, `Duração do segmento inválida (máximo ${MAX_AUDIO_MS / 1000} s).`);
  return { bytes, mimeType: mime, durationMs };
}

const idemKey = (req: Request) => {
  const k = req.headers["idempotency-key"];
  return typeof k === "string" && /^[A-Za-z0-9-]{16,80}$/.test(k) ? `${req.user!.id}:${k}` : null;
};

/** Aborta a chamada ao n8n se o navegador desistir da espera. */
function abortOnClose(req: Request, res: Response) {
  const ac = new AbortController();
  res.on("close", () => !res.writableEnded && ac.abort());
  return ac.signal;
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) =>
  fn(req, res).catch((e) => (e instanceof RinneError ? res.status(e.status).json({ error: e.message }) : (console.error(JSON.stringify({ level: "error", scope: "rinne", msg: (e as Error).message })), res.status(500).json({ error: "Erro interno" }))));

const filtersOf = (req: Request) => {
  const p = filtersSchema.safeParse(req.query);
  if (!p.success) throw new RinneError(400, "Filtros inválidos.");
  return scopeFilters(req.user!, p.data);
};

export function rinneRouter() {
  const r = express.Router();
  const json = express.json({ limit: "16kb" });

  r.post("/ask", requirePerm("rinne_ia.use"), json, wrap(async (req, res) => {
    const p = z.object({ question: z.string().trim().min(3).max(500) }).safeParse(req.body);
    if (!p.success) throw new RinneError(400, "Pergunta inválida.");
    res.json(await ask(req.user!, p.data.question, filtersOf(req)));
  }));

  // Disponibilidade da RINNE para qualquer modo liberado (sem detalhes de configuração).
  r.get("/status", (req, res) => {
    const s = n8nStatus();
    res.json({ available: s.enabled, reason: s.enabled ? null : "A análise inteligente da RINNE depende da integração com o n8n, que não está configurada.", browserTts: getSetting("rinne.browser_tts") });
  });

  r.get("/sessions", (req, res) => {
    const mode = RINNE_MODES.includes(req.query.mode as RinneMode) ? (req.query.mode as RinneMode) : "CHAT";
    if (!req.user!.permissions.has(MODE_PERMISSION[mode])) return res.status(403).json({ error: "Sem permissão." });
    const rows = store().prepare("SELECT s.*, (SELECT count(*) FROM rinne_messages m WHERE m.session_id = s.id) messages FROM rinne_sessions s WHERE s.user_id = ? AND s.mode = ? ORDER BY s.updated_at DESC LIMIT 100").all(req.user!.id, mode);
    res.json(rows.map((s) => ({ id: s.id, mode: s.mode, title: s.title, createdAt: s.created_at, updatedAt: s.updated_at, messages: Number(s.messages) })));
  });

  r.post("/sessions", json, wrap(async (req, res) => {
    const p = z.object({ mode: z.enum(["CHAT", "VOICE"]), title: z.string().trim().max(80).optional() }).safeParse(req.body);
    if (!p.success) throw new RinneError(400, "Dados inválidos.");
    if (!req.user!.permissions.has(MODE_PERMISSION[p.data.mode])) throw new RinneError(403, "Sem permissão.");
    res.status(201).json({ id: createSession(req.user!, p.data.mode, p.data.title) });
  }));

  r.patch("/sessions/:id", json, wrap(async (req, res) => {
    ownSession(req.user!, String(req.params.id));
    const p = z.object({ title: z.string().trim().min(1).max(80) }).safeParse(req.body);
    if (!p.success) throw new RinneError(400, "Título inválido.");
    store().prepare("UPDATE rinne_sessions SET title = ?, updated_at = ? WHERE id = ?").run(p.data.title, now(), String(req.params.id));
    res.status(204).end();
  }));

  r.delete("/sessions/:id", wrap(async (req, res) => {
    const s = ownSession(req.user!, String(req.params.id));
    if (s.mode === "MEETING") throw new RinneError(409, "Conversas de reunião são excluídas junto com a reunião.");
    store().prepare("DELETE FROM rinne_sessions WHERE id = ?").run(s.id);
    audit({ event: "rinne.session_delete", actorId: req.user!.id, actor: req.user!.username, ip: clientIp(req), target: String(s.id) });
    res.status(204).end();
  }));

  r.get("/sessions/:id/messages", wrap(async (req, res) => {
    ownSession(req.user!, String(req.params.id));
    res.json(store().prepare("SELECT * FROM rinne_messages WHERE session_id = ? ORDER BY created_at, rowid LIMIT 500").all(String(req.params.id)).map(toMessage));
  }));

  r.post("/sessions/:id/messages", json, wrap(async (req, res) => {
    const p = z.object({ message: z.string().trim().min(1).max(4000), operation: z.enum(["ASK", "ANALYZE", "SUMMARIZE"]).default("ASK") }).safeParse(req.body);
    if (!p.success) throw new RinneError(400, "Mensagem inválida.");
    const f = filtersOf(req);
    res.json(await sendMessage(req.user!, String(req.params.id), { message: p.data.message, operation: p.data.operation, idempotencyKey: idemKey(req), signal: abortOnClose(req, res) }, f));
  }));

  // RINNE Voz: segmento de áudio binário (sem Base64) → n8n TRANSCRIBE/ASK. Áudio não é armazenado.
  r.post("/sessions/:id/audio", express.raw({ type: AUDIO_TYPES, limit: MAX_AUDIO_BYTES }), wrap(async (req, res) => {
    const s = ownSession(req.user!, String(req.params.id));
    if (s.mode !== "VOICE") throw new RinneError(409, "Áudio só é aceito em conversas de voz.");
    const audio = readAudio(req);
    const f = filtersOf(req);
    res.json(await sendMessage(req.user!, s.id as string, { message: null, operation: "TRANSCRIBE", audio, userContent: `[áudio ${Math.round(audio.durationMs / 1000)} s]`, idempotencyKey: idemKey(req), signal: abortOnClose(req, res) }, f));
  }));

  // Exportação da conversa (Markdown): conteúdo tratado como texto.
  r.get("/sessions/:id/export", wrap(async (req, res) => {
    const s = ownSession(req.user!, String(req.params.id));
    const msgs = store().prepare("SELECT * FROM rinne_messages WHERE session_id = ? ORDER BY created_at, rowid").all(s.id).map(toMessage);
    const lines = [`# ${s.title}`, "", `RINNE · ${s.mode} · exportado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} por ${req.user!.name}`, ""];
    for (const m of msgs) {
      lines.push(`## ${m.role === "user" ? "Pergunta" : "RINNE"} — ${new Date(m.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, "", m.content, "");
      for (const i of (m.payload.resolvedIndicators as Resolved[] | undefined) ?? []) lines.push(`- ${i.label}: ${i.status === "OK" ? i.value : `indisponível (${i.status})`} — origem: ${i.sources.join(", ")}`);
      if (m.payload.origin === "n8n" && m.role === "assistant") lines.push("", "_Conteúdo gerado pela RINNE (n8n). Valores de indicadores acima foram calculados pelo sistema._");
      lines.push("");
    }
    res.set({ "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="rinne_${String(s.id).slice(0, 8)}.md"` });
    res.send(lines.join("\n"));
  }));

  return r;
}

