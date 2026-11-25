// Mock LOCAL do n8n — exclusivo dos testes. Nenhuma chamada externa, nenhum provedor de IA.
// Verifica a assinatura como o workflow real deverá verificar e responde conforme o cenário configurado.
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";

export const SECRET = "segredo-de-teste-do-webhook-com-mais-de-32-caracteres";

export interface Received {
  headers: IncomingMessage["headers"];
  body: Buffer;
  envelope: any;
  signatureOk: boolean;
}

export type Scenario = (r: Received) => { status: number; json?: unknown; delayMs?: number } | Promise<{ status: number; json?: unknown; delayMs?: number }>;

export async function startMock(signFn: (secret: string, ts: string, nonce: string, body: Buffer, env?: string) => string) {
  const received: Received[] = [];
  let scenario: Scenario = (r) => ({ status: 200, json: ok(r.envelope.requestId) });
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const envHeader = String(req.headers["x-rinne-envelope"] ?? "");
    const envelope = envHeader ? JSON.parse(Buffer.from(envHeader, "base64url").toString()) : JSON.parse(body.toString() || "{}");
    const expected = signFn(SECRET, String(req.headers["x-rinne-timestamp"]), String(req.headers["x-rinne-nonce"]), body, envHeader);
    const r: Received = { headers: req.headers, body, envelope, signatureOk: expected === req.headers["x-rinne-signature"] };
    received.push(r);
    const out = await scenario(r);
    if (out.delayMs) await new Promise((ok) => setTimeout(ok, out.delayMs));
    if (res.destroyed) return;
    res.writeHead(out.status, { "Content-Type": "application/json" });
    res.end(out.json === undefined ? "" : typeof out.json === "string" ? out.json : JSON.stringify(out.json));
  });
  server.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhook/rinne`;
  return {
    url,
    received,
    setScenario: (s: Scenario) => (scenario = s),
    stop: () => server.close(),
  };
}

export function ok(requestId: string, response: Record<string, unknown> = {}) {
  return { version: "1.0", success: true, requestId, correlationId: "c", sessionId: null, response: { text: "Resposta de teste da RINNE.", ...response }, error: null };
}

/** Cabeçalhos assinados como o n8n enviaria ao backend (callback/ferramentas). */
export function signedHeaders(signFn: (secret: string, ts: string, nonce: string, body: Buffer, env?: string) => string, body: Buffer, o: { ts?: number; nonce?: string; secret?: string } = {}) {
  const ts = String(o.ts ?? Math.floor(Date.now() / 1000));
  const nonce = o.nonce ?? randomBytes(18).toString("base64url");
  return { "content-type": "application/json", "x-rinne-timestamp": ts, "x-rinne-nonce": nonce, "x-rinne-signature": signFn(o.secret ?? SECRET, ts, nonce, body) };
}

export function enableN8n(url: string, timeoutMs = 3000) {
  process.env.RINNE_N8N_ENABLED = "true";
  process.env.RINNE_N8N_WEBHOOK_URL = url;
  process.env.RINNE_N8N_WEBHOOK_SECRET = SECRET;
  process.env.RINNE_N8N_TIMEOUT_MS = String(timeoutMs);
}

export function disableN8n() {
  process.env.RINNE_N8N_ENABLED = "false";
  delete process.env.RINNE_N8N_WEBHOOK_URL;
}
