// Serviço ÚNICO de comunicação com o n8n. Toda IA (modelos, prompts, memória, tokens, custos, fallback)
// vive nos workflows do n8n; aqui só há transporte seguro, validação e rastreabilidade.
//
// Segurança (ver docs/CONTRATOS_WEBHOOKS.md):
//  - Assinatura: X-Rinne-Signature = "sha256=" + HMAC_SHA256(segredo, `${timestamp}.${nonce}.${sha256(corpo)}.${sha256(envelope|"")}`)
//  - X-Rinne-Timestamp (s, janela ±300 s) + X-Rinne-Nonce (uso único) → proteção contra replay
//  - Sem reenvio automático (evita processamento/consumo duplicado). Idempotência por Idempotency-Key.
//  - URL só por variável de ambiente; HTTPS ou rede privada. Nunca exposta ao navegador.
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { INDICATORS } from "../../../shared/catalog.js";
import { RINNE_CONTRACT_VERSION, RINNE_TOOLS, type RinneMode, type RinneOperation, type RinneRequest, type RinneResponseBody } from "../../../shared/rinne.js";
import type { SessionUser } from "../auth.js";
import { now, store } from "../store.js";

export const sha256hex = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

export function n8nConfig() {
  const url = process.env.RINNE_N8N_WEBHOOK_URL?.trim() ?? "";
  const secret = process.env.RINNE_N8N_WEBHOOK_SECRET ?? "";
  const enabled = process.env.RINNE_N8N_ENABLED === "true";
  const timeoutMs = Math.min(Math.max(Number(process.env.RINNE_N8N_TIMEOUT_MS ?? 60000) || 60000, 1000), 600000);
  let problem: string | null = null;
  if (!enabled) problem = "Integração com o n8n desativada (RINNE_N8N_ENABLED=false).";
  else if (!url) problem = "RINNE_N8N_WEBHOOK_URL não configurada.";
  else if (secret.length < 32) problem = "RINNE_N8N_WEBHOOK_SECRET ausente ou curto (mínimo 32 caracteres).";
  else if (!safeUrl(url)) problem = "URL do n8n recusada: use HTTPS ou um endereço de rede privada.";
  return { enabled: !problem, configured: !!url && secret.length >= 32, url, secret, timeoutMs, problem, maxConcurrency: Number(process.env.RINNE_N8N_MAX_CONCURRENCY ?? 4) };
}

/** HTTPS, ou HTTP somente para localhost/rede privada/nome interno do Docker (sem ponto). */
export function safeUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.username || u.password) return false;
    if (u.protocol === "https:") return true;
    if (u.protocol !== "http:") return false;
    const h = u.hostname;
    return h === "localhost" || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^[a-z0-9-]+$/i.test(h);
  } catch {
    return false;
  }
}

export function sign(secret: string, timestamp: string, nonce: string, body: Buffer | string, envelope = "") {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${nonce}.${sha256hex(body)}.${sha256hex(envelope)}`).digest("hex");
}

/** Valida uma chamada RECEBIDA do n8n (callback/ferramentas): assinatura, janela de tempo e nonce único. */
export function verifySignature(headers: Record<string, string | string[] | undefined>, body: Buffer): string | null {
  const { secret } = n8nConfig();
  if (secret.length < 32) return "Integração não configurada";
  const ts = String(headers["x-rinne-timestamp"] ?? "");
  const nonce = String(headers["x-rinne-nonce"] ?? "");
  const sig = String(headers["x-rinne-signature"] ?? "");
  if (!/^\d{10}$/.test(ts) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !sig.startsWith("sha256=")) return "Cabeçalhos de assinatura ausentes ou inválidos";
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return "Timestamp fora da janela permitida";
  const expected = Buffer.from(sign(secret, ts, nonce, body, String(headers["x-rinne-envelope"] ?? "")));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "Assinatura inválida";
  try {
    store().prepare("INSERT INTO webhook_nonces (nonce, seen_at) VALUES (?, ?)").run(nonce, now());
  } catch {
    return "Requisição repetida (replay)";
  }
  return null;
}

// ---------------- Validação da resposta (conteúdo externo = não confiável) ----------------
const str = (max: number) => z.string().max(max);
const cell = z.union([z.string().max(500), z.number().finite(), z.null()]);
export const responseBodySchema = z.object({
  text: str(20000).default(""),
  summary: str(20000).nullable().default(null),
  sources: z.array(z.object({ type: z.enum(["indicator", "table", "tool", "document", "meeting"]), id: str(120), label: str(200).optional() })).max(50).default([]),
  indicators: z.array(z.object({ id: str(64) })).max(30).default([]),
  warnings: z.array(str(500)).max(20).default([]),
  suggestions: z.array(str(500)).max(20).default([]),
  tables: z.array(z.object({ title: str(200), columns: z.array(str(120)).max(20), rows: z.array(z.array(cell).max(20)).max(200) })).max(5).default([]),
  charts: z.array(z.object({ title: str(200), kind: z.enum(["line", "bar"]), unit: str(20), series: z.array(str(60)).max(6), points: z.array(z.record(str(60), z.union([z.string().max(60), z.number().finite(), z.null()]))).max(120) })).max(5).default([]),
  audio: z.object({ mimeType: z.enum(["audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/mp4"]), data: z.string().max(4_000_000).regex(/^[A-Za-z0-9+/]+=*$/) }).nullable().default(null),
  transcript: str(20000).nullable().default(null),
});
export const responseSchema = z.object({
  version: str(10),
  success: z.boolean(),
  requestId: z.string().uuid(),
  correlationId: str(100).optional(),
  sessionId: str(100).nullable().optional(),
  response: responseBodySchema.nullable().default(null),
  error: z.object({ code: str(60), message: str(500) }).nullable().default(null),
});
export type ValidatedBody = z.infer<typeof responseBodySchema>;

/** Remove o que a IA não pode afirmar sozinha: indicadores desconhecidos (valores são recalculados no backend). */
export function sanitizeBody(b: ValidatedBody): ValidatedBody & Pick<RinneResponseBody, "indicators"> {
  return { ...b, indicators: b.indicators.filter((i) => i.id in INDICATORS) };
}

// ---------------- Chamada ----------------
export type CallStatus = "success" | "accepted" | "unavailable" | "timeout" | "error" | "busy" | "cancelled";
export interface CallResult {
  status: CallStatus;
  requestId: string;
  correlationId: string;
  body: ValidatedBody | null;
  error: string | null;
  latencyMs: number | null;
  replayed?: boolean;
}

let inFlight = 0;
const sessionsInFlight = new Set<string>();

export function allowedTools(u: SessionUser) {
  return RINNE_TOOLS.filter((t) => t.requires.every((p) => u.permissions.has(p))).map((t) => t.name);
}

/** Contexto de execução de curta duração para as ferramentas (o token vai só no payload ao n8n). */
function createExecContext(userId: number, sessionId: string | null, requestId: string, ttlMs: number) {
  const token = randomBytes(32).toString("base64url");
  store()
    .prepare("INSERT INTO rinne_exec_contexts (id, user_id, session_id, request_id, expires_at, max_calls, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(sha256hex(token), userId, sessionId, requestId, new Date(Date.now() + ttlMs).toISOString(), Number(process.env.RINNE_TOOL_MAX_CALLS ?? 50), now());
  return token;
}

const log = (o: object) => console.log(JSON.stringify({ level: "info", scope: "n8n", ...o })); // nunca conteúdo de mensagens

function record(r: { requestId: string; idempotencyKey?: string | null; correlationId: string; sessionId: string | null; userId: number | null; mode: string; operation: string; status: CallStatus | "pending"; httpStatus?: number | null; latencyMs?: number | null; error?: string | null; response?: unknown }) {
  store()
    .prepare(
      `INSERT INTO n8n_requests (request_id, idempotency_key, correlation_id, session_id, user_id, mode, operation, status, http_status, latency_ms, error, response, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(request_id) DO UPDATE SET status = excluded.status, http_status = excluded.http_status, latency_ms = excluded.latency_ms, error = excluded.error, response = excluded.response, completed_at = excluded.completed_at`
    )
    .run(r.requestId, r.idempotencyKey ?? null, r.correlationId, r.sessionId, r.userId, r.mode, r.operation, r.status, r.httpStatus ?? null, r.latencyMs ?? null, r.error ?? null, r.response === undefined ? null : JSON.stringify(r.response), now(), r.status === "pending" ? null : now());
}

export interface CallInput {
  user: SessionUser | null; // null = chamada do sistema (ex.: PING)
  mode: RinneMode;
  operation: RinneOperation;
  sessionId: string | null;
  message: string | null;
  departmentId?: string | null;
  period?: { from: string; to: string } | null;
  meetingId?: string | null;
  data?: Record<string, unknown>;
  idempotencyKey?: string | null;
  signal?: AbortSignal;
  audio?: { bytes: Buffer; mimeType: string; durationMs: number } | null; // binário (sem Base64)
  correlationId?: string;
}

export async function callN8n(input: CallInput): Promise<CallResult> {
  const cfg = n8nConfig();
  const correlationId = input.correlationId ?? randomUUID();

  // Idempotência: a mesma chave nunca gera um segundo processamento.
  if (input.idempotencyKey) {
    const prev = store().prepare("SELECT request_id, correlation_id, status, response, error FROM n8n_requests WHERE idempotency_key = ?").get(input.idempotencyKey);
    if (prev) return { status: prev.status as CallStatus, requestId: String(prev.request_id), correlationId: String(prev.correlation_id), body: prev.response ? JSON.parse(String(prev.response)) : null, error: prev.error ? String(prev.error) : null, latencyMs: null, replayed: true };
  }
  const requestId = randomUUID();
  const base = { requestId, idempotencyKey: input.idempotencyKey, correlationId, sessionId: input.sessionId, userId: input.user?.id ?? null, mode: input.mode, operation: input.operation };

  if (!cfg.enabled) {
    record({ ...base, status: "unavailable", error: cfg.problem });
    return { status: "unavailable", requestId, correlationId, body: null, error: cfg.problem, latencyMs: null };
  }
  if (input.sessionId && sessionsInFlight.has(input.sessionId)) return { status: "busy", requestId, correlationId, body: null, error: "Já existe uma solicitação em andamento nesta sessão.", latencyMs: null };
  if (inFlight >= cfg.maxConcurrency) return { status: "busy", requestId, correlationId, body: null, error: "Muitas solicitações simultâneas à RINNE. Tente novamente em instantes.", latencyMs: null };

  const envelope: RinneRequest = {
    version: RINNE_CONTRACT_VERSION,
    requestId,
    correlationId,
    sessionId: input.sessionId,
    mode: input.mode,
    operation: input.operation,
    userId: input.user ? String(input.user.id) : "system",
    message: input.message,
    context: {
      departmentId: input.user?.scopeDepartment ?? input.departmentId ?? null, // escopo imposto
      period: input.period ?? null,
      meetingId: input.meetingId ?? null,
      allowedTools: input.user ? allowedTools(input.user) : [],
      executionToken: input.user && input.operation !== "PING" ? createExecContext(input.user.id, input.sessionId, requestId, Math.max(cfg.timeoutMs, 600000)) : null,
      toolsBaseUrl: process.env.RINNE_TOOLS_BASE_URL || null,
      data: input.data,
    },
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
  };

  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(18).toString("base64url");
  let body: Buffer;
  let envHeader = "";
  const headers: Record<string, string> = { "X-Rinne-Timestamp": ts, "X-Rinne-Nonce": nonce, "X-Rinne-Request-Id": requestId, "X-Rinne-Correlation-Id": correlationId, "X-Rinne-Operation": input.operation };
  if (input.audio) {
    // Áudio vai como binário; o envelope segue em cabeçalho (base64url) e entra na assinatura.
    envHeader = Buffer.from(JSON.stringify(envelope)).toString("base64url");
    body = input.audio.bytes;
    Object.assign(headers, { "Content-Type": input.audio.mimeType, "X-Rinne-Envelope": envHeader, "X-Rinne-Audio-Duration-Ms": String(input.audio.durationMs) });
  } else {
    body = Buffer.from(JSON.stringify(envelope));
    headers["Content-Type"] = "application/json";
  }
  headers["X-Rinne-Signature"] = sign(cfg.secret, ts, nonce, body, envHeader);

  record({ ...base, status: "pending" });
  inFlight++;
  if (input.sessionId) sessionsInFlight.add(input.sessionId);
  const t0 = Date.now();
  const timeout = AbortSignal.timeout(cfg.timeoutMs);
  const signal = input.signal ? AbortSignal.any([timeout, input.signal]) : timeout;
  try {
    const res = await fetch(cfg.url, { method: "POST", headers, body: new Uint8Array(body), signal, redirect: "error" });
    const latencyMs = Date.now() - t0;
    if (res.status === 202) {
      record({ ...base, status: "accepted", httpStatus: 202, latencyMs });
      log({ requestId, correlationId, operation: input.operation, status: "accepted", latencyMs });
      return { status: "accepted", requestId, correlationId, body: null, error: null, latencyMs };
    }
    const text = await res.text();
    if (text.length > 6_000_000) throw new Error("Resposta grande demais");
    let parsed: z.infer<typeof responseSchema>;
    try {
      parsed = responseSchema.parse(JSON.parse(text));
    } catch {
      record({ ...base, status: "error", httpStatus: res.status, latencyMs, error: "Resposta fora do contrato" });
      return { status: "error", requestId, correlationId, body: null, error: "A RINNE (n8n) retornou uma resposta fora do contrato.", latencyMs };
    }
    if (!res.ok || !parsed.success || parsed.requestId !== requestId || !parsed.response) {
      const error = parsed.error?.message ?? (parsed.requestId !== requestId ? "requestId divergente" : `HTTP ${res.status}`);
      record({ ...base, status: "error", httpStatus: res.status, latencyMs, error });
      return { status: "error", requestId, correlationId, body: null, error: `A RINNE (n8n) não concluiu a solicitação: ${error}`, latencyMs };
    }
    const clean = sanitizeBody(parsed.response);
    record({ ...base, status: "success", httpStatus: res.status, latencyMs, response: clean });
    log({ requestId, correlationId, operation: input.operation, status: "success", latencyMs });
    return { status: "success", requestId, correlationId, body: clean, error: null, latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - t0;
    const cancelled = input.signal?.aborted;
    const status: CallStatus = cancelled ? "cancelled" : timeout.aborted ? "timeout" : "error";
    const error = cancelled ? "Solicitação cancelada pelo usuário." : timeout.aborted ? `Sem resposta do n8n em ${cfg.timeoutMs / 1000}s.` : "Falha de comunicação com o n8n.";
    record({ ...base, status, latencyMs, error });
    log({ requestId, correlationId, operation: input.operation, status, latencyMs, error: (e as Error).name });
    return { status, requestId, correlationId, body: null, error, latencyMs };
  } finally {
    inFlight--;
    if (input.sessionId) sessionsInFlight.delete(input.sessionId);
  }
}

/** Situação da integração para Configurações (nunca expõe URL privada nem segredo). */
export function n8nStatus() {
  const cfg = n8nConfig();
  const d = store();
  const last = (status: string) => d.prepare("SELECT request_id, operation, created_at, completed_at, latency_ms, error FROM n8n_requests WHERE status = ? ORDER BY created_at DESC LIMIT 1").get(status) ?? null;
  const avg = d.prepare("SELECT avg(latency_ms) avg FROM (SELECT latency_ms FROM n8n_requests WHERE status = 'success' ORDER BY created_at DESC LIMIT 20)").get();
  const lastFailure = d.prepare("SELECT request_id, operation, status, created_at, error FROM n8n_requests WHERE status IN ('error', 'timeout') ORDER BY created_at DESC LIMIT 1").get() ?? null;
  return {
    enabled: cfg.enabled,
    configured: cfg.configured,
    problem: cfg.problem,
    transport: cfg.url ? (cfg.url.startsWith("https:") ? "HTTPS" : "HTTP em rede privada") : null,
    timeoutMs: cfg.timeoutMs,
    maxConcurrency: cfg.maxConcurrency,
    lastSuccess: last("success"),
    lastFailure,
    avgLatencyMs: avg?.avg == null ? null : Math.round(Number(avg.avg)),
    inFlight,
  };
}
