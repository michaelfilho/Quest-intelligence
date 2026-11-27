// Controle de acesso por IP (allowlist). Quando ativo, só IPs/CIDRs liberados acessam o site e a API.
//
// - Persistência no PostgreSQL (app.access_state e app.ip_allowlist); a lista fica em memória e é relida ao salvar.
// - Break-glass: IP_ALLOWLIST_BOOTSTRAP="200.1.2.3,10.0.0.0/8" — sempre liberados, não editáveis pela interface.
// - Gestão exige sessão com a permissão ip.manage; toda alteração vai para a auditoria.
// - REQUIRE_PROXY=true: recusa conexões que não venham de um proxy em TRUST_PROXY (ninguém contorna o nginx).
// - O nginx consulta GET /api/access/check (auth_request) a cada requisição do site.
// - IP fora da lista recebe 404 (como se não houvesse site) e entra em ip_requests para autorizar ou excluir.
// - Banco indisponível na leitura = falha FECHADA (bloqueia tudo exceto bootstrap e loopback local).
import "./env.js";
import { BlockList, isIP } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { clearIpLock, listIpLocks, requireAuth, requirePerm } from "./auth.js";
import { all, audit, get, run } from "./store.js";

const log = (level: string, msg: string, extra: object = {}) => console[level === "info" ? "log" : "warn"](JSON.stringify({ level, scope: "access", msg, ...extra }));

// ---------------- IP / CIDR ----------------
export function normalizeIp(ip: string | undefined) {
  if (!ip) return "";
  const s = ip.trim().replace(/%.*$/, ""); // remove zone id (fe80::1%eth0)
  return /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(s) ? s.slice(7) : s; // IPv4 mapeado em IPv6
}

export function parseCidr(input: string) {
  const [raw, p, extra] = input.trim().split("/");
  if (extra !== undefined) return null;
  const ip = normalizeIp(raw);
  const fam = isIP(ip);
  if (!fam) return null;
  const max = fam === 4 ? 32 : 128;
  const prefix = p === undefined ? max : /^\d{1,3}$/.test(p) ? Number(p) : NaN;
  // /0 liberaria a internet inteira: para isso, desative o controle.
  if (!(prefix >= 1 && prefix <= max)) return null;
  return { ip, prefix, type: fam === 4 ? ("ipv4" as const) : ("ipv6" as const), cidr: `${ip}/${prefix}` };
}

function buildList(cidrs: string[]) {
  const bl = new BlockList();
  for (const c of cidrs) {
    const p = parseCidr(c);
    if (p) bl.addSubnet(p.ip, p.prefix, p.type);
  }
  return bl;
}

const check = (bl: BlockList, ip: string) => {
  const n = normalizeIp(ip);
  const fam = isIP(n);
  return fam ? bl.check(n, fam === 4 ? "ipv4" : "ipv6") : false;
};

// ---------------- Estado ----------------
const entrySchema = z.object({
  cidr: z.string().trim().max(64).refine((s) => parseCidr(s) !== null, "IP ou CIDR inválido (ex.: 200.10.20.30 ou 200.10.20.0/24; /0 não é permitido)"),
  label: z.string().trim().max(80).default(""),
  addedAt: z.string().max(40).optional(),
});
const putSchema = z.object({ enabled: z.boolean(), entries: z.array(entrySchema).max(500) });

interface State {
  enabled: boolean;
  entries: { cidr: string; label: string; addedAt?: string }[];
  updatedAt: string | null;
  updatedBy?: string;
}

const BOOTSTRAP = (process.env.IP_ALLOWLIST_BOOTSTRAP ?? "").split(",").map((s) => s.trim()).filter(Boolean).filter((s) => {
  const ok = parseCidr(s) !== null;
  if (!ok) log("warn", "IP_ALLOWLIST_BOOTSTRAP: entrada inválida ignorada", { entry: s });
  return ok;
});

let state: State = { enabled: false, entries: [], updatedAt: null };
let list = buildList(BOOTSTRAP);

function apply(s: State) {
  state = s;
  list = buildList([...BOOTSTRAP, ...s.entries.map((e) => e.cidr)]);
}

let loaded = false;
export async function loadAccess() {
  try {
    const control = await get("SELECT enabled, updated_at, updated_by FROM app.access_state");
    const entries = await all("SELECT cidr, label, added_at FROM app.ip_allowlist ORDER BY added_at, cidr");
    apply({
      enabled: !!control?.enabled,
      entries: entries.map((e) => ({ cidr: e.cidr, label: e.label, addedAt: new Date(e.added_at).toISOString() })),
      updatedAt: control?.updated_at ? new Date(control.updated_at).toISOString() : null,
      updatedBy: control?.updated_by ?? undefined,
    });
    loaded = true;
  } catch (e) {
    log("error", "controle de acesso indisponível no banco — falha FECHADA (somente bootstrap e loopback)", { error: (e as Error).message });
    apply({ enabled: true, entries: [], updatedAt: null });
    loaded = false;
  }
}

/** Grava estado e lista em uma única instrução (atômica). */
async function save(s: State) {
  await run(
    `WITH control AS (UPDATE app.access_state SET enabled = ?, updated_at = ?, updated_by = ?),
          removed AS (DELETE FROM app.ip_allowlist WHERE NOT (cidr = ANY(?::text[])))
     INSERT INTO app.ip_allowlist (cidr, label, added_at)
     SELECT * FROM unnest(?::text[], ?::text[], ?::timestamptz[])
     ON CONFLICT (cidr) DO UPDATE SET label = excluded.label`,
    s.enabled, s.updatedAt, s.updatedBy ?? null, s.entries.map((e) => e.cidr),
    s.entries.map((e) => e.cidr), s.entries.map((e) => e.label), s.entries.map((e) => e.addedAt ?? s.updatedAt)
  );
  apply(s);
}

// ---------------- Middleware ----------------
/** Acesso direto de dentro do container (ex.: HEALTHCHECK), sem passar por proxy. */
const directLoopback = (req: Request) => !req.headers["x-forwarded-for"] && ["127.0.0.1", "::1"].includes(normalizeIp(req.socket.remoteAddress));
const clientIp = (req: Request) => normalizeIp(req.ip);
/** A conexão TCP veio de um proxy listado em TRUST_PROXY? */
const fromTrustedProxy = (req: Request) => !!req.app.get("trust proxy fn")?.(normalizeIp(req.socket.remoteAddress), 0);

// Auditoria de bloqueios com no máximo 1 registro por IP por minuto (evita inundar o log em ataque).
const lastBlockedAudit = new Map<string, number>();
async function auditBlocked(ip: string, path: string, reason: string) {
  log("warn", "acesso bloqueado", { ip, path, reason });
  if ((lastBlockedAudit.get(ip) ?? 0) > Date.now() - 60000) return;
  if (lastBlockedAudit.size > 10000) lastBlockedAudit.clear();
  lastBlockedAudit.set(ip, Date.now());
  await audit({ event: "access.blocked", outcome: "denied", ip, target: path, details: { reason } });
}

const MAX_PENDING = 2000;
/** Registra o IP recusado (no máximo 1 escrita por minuto por IP; excluídos continuam excluídos). */
async function recordRequest(ip: string, userAgent: string) {
  if (!isIP(ip)) return;
  const at = new Date().toISOString();
  const changes = await run(
    "INSERT INTO app.ip_requests AS r (ip, first_seen, last_seen, user_agent) VALUES (?, ?, ?, ?) ON CONFLICT (ip) DO UPDATE SET last_seen = excluded.last_seen, user_agent = excluded.user_agent WHERE r.last_seen < ?",
    ip, at, at, userAgent.slice(0, 200), new Date(Date.now() - 60000).toISOString()
  );
  if (changes) await run("DELETE FROM app.ip_requests WHERE ip IN (SELECT ip FROM app.ip_requests WHERE status = 'pending' ORDER BY last_seen DESC OFFSET ?)", MAX_PENDING);
}

export async function accessGuard(req: Request, res: Response, next: NextFunction) {
  if (directLoopback(req)) return next();
  // REQUIRE_PROXY=true (produção): só aceita conexões vindas do proxy confiável — ninguém contorna o nginx.
  if (process.env.REQUIRE_PROXY === "true" && !fromTrustedProxy(req)) {
    await auditBlocked(normalizeIp(req.socket.remoteAddress), req.path, "conexão fora do proxy confiável");
    return res.status(403).json({ error: "Acesso direto à API não permitido." });
  }
  if (!loaded) await loadAccess(); // banco voltou: relê antes de decidir
  if (!state.enabled || check(list, clientIp(req))) return next();
  await auditBlocked(clientIp(req), req.path, "IP fora da allowlist");
  await recordRequest(clientIp(req), String(req.headers["user-agent"] ?? ""));
  // O auth_request do nginx só entende 2xx/401/403: a consulta usa 403 e o nginx devolve 404 ao navegador.
  res.status(req.path === "/access/check" ? 403 : 404).json({ error: "Not Found" });
}

// ---------------- Gestão (sessão com permissão ip.manage) ----------------
const view = async (req: Request) => ({
  enabled: state.enabled,
  entries: state.entries,
  bootstrap: BOOTSTRAP,
  updatedAt: state.updatedAt,
  updatedBy: state.updatedBy ?? null,
  ip: clientIp(req),
  requests: await all("SELECT ip, status, first_seen, last_seen, user_agent FROM app.ip_requests ORDER BY last_seen DESC LIMIT 200"),
  locks: await listIpLocks(),
});

export function accessRouter() {
  const r = express.Router();
  r.get("/me", (req, res) => res.json({ enabled: state.enabled, ip: clientIp(req) }));
  r.get("/check", (_req, res) => res.status(204).end()); // chegou aqui = passou pelo accessGuard (consulta do nginx)
  r.get("/", requireAuth, requirePerm("ip.manage"), async (req, res) => res.json(await view(req)));
  r.put("/", requireAuth, requirePerm("ip.manage"), express.json({ limit: "64kb" }), async (req, res) => {
    const p = putSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Lista inválida", details: p.error.issues.map((i) => ({ campo: i.path.join("."), erro: i.message })) });
    const now = new Date().toISOString();
    const entries = p.data.entries.map((e) => ({ cidr: parseCidr(e.cidr)!.cidr, label: e.label, addedAt: e.addedAt ?? now }));
    const ip = clientIp(req);
    // Anti-lockout: não permite ativar uma lista que bloqueie quem está salvando.
    if (p.data.enabled && !directLoopback(req) && !check(buildList([...BOOTSTRAP, ...entries.map((e) => e.cidr)]), ip)) {
      return res.status(409).json({ error: `Seu IP (${ip}) não está na lista. Salvar agora bloquearia o seu próprio acesso — adicione-o antes de ativar.` });
    }
    const before = new Set(state.entries.map((e) => e.cidr));
    const after = new Set(entries.map((e) => e.cidr));
    const wasEnabled = state.enabled;
    await save({ enabled: p.data.enabled, entries, updatedAt: now, updatedBy: req.user!.username });
    await audit({ event: "ip_allowlist.update", actorId: req.user!.id, actor: req.user!.username, ip, details: { enabled: p.data.enabled, wasEnabled, added: [...after].filter((x) => !before.has(x)), removed: [...before].filter((x) => !after.has(x)) } });
    res.json(await view(req));
  });
  // allow = autorizar · dismiss = excluir a notificação (segue em 404) · unlock = zerar o bloqueio de login
  const requestSchema = z.object({ ip: z.string().trim().max(64).refine((s) => isIP(normalizeIp(s)) !== 0, "IP inválido"), action: z.enum(["allow", "dismiss", "unlock"]) });
  r.post("/requests", requireAuth, requirePerm("ip.manage"), express.json({ limit: "4kb" }), async (req, res) => {
    const p = requestSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "IP ou ação inválida." });
    const ip = normalizeIp(p.data.ip);
    const { action } = p.data;
    if (action === "unlock") await clearIpLock(ip);
    else if (action === "dismiss") await run("UPDATE app.ip_requests SET status = 'dismissed' WHERE ip = ?", ip);
    else {
      const cidr = parseCidr(ip)!.cidr;
      if (!state.entries.some((e) => e.cidr === cidr)) {
        if (state.entries.length >= 500) return res.status(409).json({ error: "A lista atingiu o limite de 500 entradas." });
        const now = new Date().toISOString();
        await save({ ...state, entries: [...state.entries, { cidr, label: "Autorizado pelo painel", addedAt: now }], updatedAt: now, updatedBy: req.user!.username });
      }
      await run("DELETE FROM app.ip_requests WHERE ip = ?", ip);
    }
    await audit({ event: "ip_allowlist.update", actorId: req.user!.id, actor: req.user!.username, ip: clientIp(req), target: ip, details: { action } });
    res.json(await view(req));
  });
  return r;
}
