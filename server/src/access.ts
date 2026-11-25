// Controle de acesso por IP (allowlist). Quando ativo, só IPs/CIDRs liberados acessam o site e a API.
//
// - Persistência em arquivo JSON (o banco é somente leitura): IP_ALLOWLIST_FILE, padrão server/data/ip-allowlist.json.
// - Break-glass: IP_ALLOWLIST_BOOTSTRAP="200.1.2.3,10.0.0.0/8" — sempre liberados, não editáveis pela interface.
// - Gestão exige sessão com a permissão ip.manage; toda alteração vai para a auditoria.
// - REQUIRE_PROXY=true: recusa conexões que não venham de um proxy em TRUST_PROXY (ninguém contorna o nginx).
// - O nginx consulta GET /api/access/check (auth_request) a cada requisição do site.
// - Arquivo corrompido = falha FECHADA (bloqueia tudo exceto bootstrap e loopback local).
import "./env.js";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { BlockList, isIP } from "node:net";
import { dirname, join } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requirePerm } from "./auth.js";
import { audit, DATA_DIR } from "./store.js";

const FILE = process.env.IP_ALLOWLIST_FILE || join(DATA_DIR, "ip-allowlist.json");
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

export function loadAccess() {
  if (!existsSync(FILE)) return apply({ enabled: false, entries: [], updatedAt: null });
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8"));
    const parsed = putSchema.parse(raw);
    apply({ ...parsed, updatedAt: raw.updatedAt ?? null, updatedBy: raw.updatedBy });
  } catch (e) {
    log("error", "arquivo da allowlist inválido — falha FECHADA (somente bootstrap e loopback)", { file: FILE, error: (e as Error).message });
    apply({ enabled: true, entries: [], updatedAt: null });
  }
}
loadAccess();

function save(s: State) {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE); // escrita atômica
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
function auditBlocked(ip: string, path: string, reason: string) {
  log("warn", "acesso bloqueado", { ip, path, reason });
  if ((lastBlockedAudit.get(ip) ?? 0) > Date.now() - 60000) return;
  if (lastBlockedAudit.size > 10000) lastBlockedAudit.clear();
  lastBlockedAudit.set(ip, Date.now());
  audit({ event: "access.blocked", outcome: "denied", ip, target: path, details: { reason } });
}

export function accessGuard(req: Request, res: Response, next: NextFunction) {
  if (directLoopback(req)) return next();
  // REQUIRE_PROXY=true (produção): só aceita conexões vindas do proxy confiável — ninguém contorna o nginx.
  if (process.env.REQUIRE_PROXY === "true" && !fromTrustedProxy(req)) {
    auditBlocked(normalizeIp(req.socket.remoteAddress), req.path, "conexão fora do proxy confiável");
    return res.status(403).json({ error: "Acesso direto à API não permitido." });
  }
  if (!state.enabled || check(list, clientIp(req))) return next();
  auditBlocked(clientIp(req), req.path, "IP fora da allowlist");
  res.status(403).json({ error: "Acesso bloqueado: este IP não está autorizado. Solicite a liberação ao administrador.", ip: clientIp(req) });
}

// ---------------- Gestão (sessão com permissão ip.manage) ----------------
const view = (req: Request) => ({
  enabled: state.enabled,
  entries: state.entries,
  bootstrap: BOOTSTRAP,
  updatedAt: state.updatedAt,
  updatedBy: state.updatedBy ?? null,
  ip: clientIp(req),
});

export function accessRouter() {
  const r = express.Router();
  r.get("/me", (req, res) => res.json({ enabled: state.enabled, ip: clientIp(req) }));
  r.get("/check", (_req, res) => res.status(204).end()); // chegou aqui = passou pelo accessGuard (consulta do nginx)
  r.get("/", requireAuth, requirePerm("ip.manage"), (req, res) => res.json(view(req)));
  r.put("/", requireAuth, requirePerm("ip.manage"), express.json({ limit: "64kb" }), (req, res) => {
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
    save({ enabled: p.data.enabled, entries, updatedAt: now, updatedBy: req.user!.username });
    audit({ event: "ip_allowlist.update", actorId: req.user!.id, actor: req.user!.username, ip, details: { enabled: p.data.enabled, wasEnabled, added: [...after].filter((x) => !before.has(x)), removed: [...before].filter((x) => !after.has(x)) } });
    res.json(view(req));
  });
  return r;
}

/** IP dentro de uma lista "a.b.c.d,rede/24,..." (usado para restringir a origem das chamadas internas do n8n). */
export function ipInList(listCsv: string, ip: string) {
  return check(buildList(listCsv.split(",").map((s) => s.trim()).filter(Boolean)), ip);
}
