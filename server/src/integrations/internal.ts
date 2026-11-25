// Rotas chamadas PELO n8n (rede privada; o nginx bloqueia /api/internal/ externamente).
// Exige: assinatura HMAC + timestamp + nonce único (anti-replay) e, para ferramentas, um contexto de execução
// de curta duração criado pelo backend. O segredo do webhook NÃO substitui a autorização do usuário.
import express, { type NextFunction, type Request, type Response } from "express";
import { RINNE_TOOLS } from "../../../shared/rinne.js";
import { ipInList } from "../access.js";
import { loadUser } from "../auth.js";
import { applyAsyncResult } from "../rinne.js";
import { audit, now, store } from "../store.js";
import { runTool, ToolError } from "../tools.js";
import { responseSchema, sanitizeBody, sha256hex, verifySignature } from "./n8n.js";

function guard(req: Request, res: Response, next: NextFunction) {
  const allowed = process.env.RINNE_N8N_ALLOWED_IPS;
  const peer = String(req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  if (allowed && !ipInList(allowed, peer)) return res.status(403).json({ success: false, error: { code: "FORBIDDEN_ORIGIN", message: "Origem não autorizada" } });
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const problem = verifySignature(req.headers, raw);
  if (problem) {
    console.warn(JSON.stringify({ level: "warn", scope: "n8n-internal", msg: "assinatura recusada", reason: problem, path: req.path }));
    return res.status(401).json({ success: false, error: { code: "INVALID_SIGNATURE", message: problem } });
  }
  try {
    req.body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch {
    return res.status(400).json({ success: false, error: { code: "INVALID_JSON", message: "JSON inválido" } });
  }
  next();
}

export function internalRouter() {
  const r = express.Router();
  r.use(express.raw({ type: () => true, limit: "512kb" }), guard);

  // Catálogo das ferramentas (contrato) para configurar os agentes.
  r.get("/tools", (_req, res) => res.json({ version: "1.0", tools: RINNE_TOOLS.map(({ name, description }) => ({ name, description })) }));

  r.post("/tools/:name", async (req, res) => {
    const token = String(req.headers["x-rinne-execution"] ?? "");
    const ctx = token ? store().prepare("SELECT * FROM rinne_exec_contexts WHERE id = ?").get(sha256hex(token)) : null;
    if (!ctx || Date.parse(String(ctx.expires_at)) < Date.now()) return res.status(401).json({ success: false, error: { code: "INVALID_EXECUTION_CONTEXT", message: "Contexto de execução inválido ou expirado." } });
    if (Number(ctx.calls) >= Number(ctx.max_calls)) return res.status(429).json({ success: false, error: { code: "TOOL_LIMIT", message: "Limite de chamadas de ferramentas desta solicitação atingido." } });
    store().prepare("UPDATE rinne_exec_contexts SET calls = calls + 1 WHERE id = ?").run(ctx.id);
    const user = loadUser(Number(ctx.user_id)); // permissões atuais do banco
    if (!user) return res.status(403).json({ success: false, error: { code: "USER_INACTIVE", message: "Usuário inativo ou sem acesso." } });
    const tool = String(req.params.name);
    try {
      const data = await runTool(user, tool, (req.body as { input?: unknown }).input);
      audit({ event: "rinne.tool", actorId: user.id, actor: user.username, target: tool, details: { requestId: String(ctx.request_id) } });
      res.json({ success: true, requestId: ctx.request_id, data, error: null });
    } catch (e) {
      const status = e instanceof ToolError ? e.status : 500;
      audit({ event: "rinne.tool", outcome: status === 403 ? "denied" : "failure", actorId: user.id, actor: user.username, target: tool, details: { requestId: String(ctx.request_id), status } });
      res.status(status).json({ success: false, requestId: ctx.request_id, data: null, error: { code: status === 403 ? "FORBIDDEN" : status === 400 ? "INVALID_INPUT" : "TOOL_ERROR", message: e instanceof ToolError ? e.message : "Falha interna na ferramenta." } });
    }
  });

  // Resultado de processamento assíncrono (o n8n respondeu 202 antes).
  r.post("/callback", (req, res) => {
    const p = responseSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ success: false, error: { code: "INVALID_CONTRACT", message: "Resposta fora do contrato." } });
    const row = store().prepare("SELECT status FROM n8n_requests WHERE request_id = ?").get(p.data.requestId);
    if (!row) return res.status(404).json({ success: false, error: { code: "UNKNOWN_REQUEST", message: "requestId desconhecido." } });
    if (row.status !== "accepted") return res.status(409).json({ success: false, error: { code: "ALREADY_COMPLETED", message: "Solicitação já concluída." } }); // idempotente
    const body = p.data.success && p.data.response ? sanitizeBody(p.data.response) : null;
    store().prepare("UPDATE n8n_requests SET status = ?, response = ?, error = ?, completed_at = ? WHERE request_id = ?").run(body ? "success" : "error", body ? JSON.stringify(body) : null, p.data.error?.message ?? null, now(), p.data.requestId);
    applyAsyncResult(p.data.requestId, body, p.data.error?.message ?? null);
    res.json({ success: true });
  });

  return r;
}
