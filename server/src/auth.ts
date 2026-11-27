// Autenticação individual: sessões no servidor (SQLite), cookie HttpOnly/SameSite=Strict, Argon2id,
// limite de tentativas, expiração por inatividade e absoluta, revogação e auditoria.
import { createHash, randomBytes } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { isPermission, type Permission } from "../../shared/permissions.js";
import { normalizeBasePath } from "../../shared/base-path.js";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "./passwords.js";
import { audit, getSetting, now, store } from "./store.js";

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  roleId: string | null;
  roleName: string | null;
  permissions: Set<Permission>;
  scopeDepartment: string | null;
  mustChangePassword: boolean;
  sessionId: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

export const COOKIE = "rinne_sid";
const secureCookie = () => process.env.COOKIE_SECURE !== "false";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const clientIp = (req: Request) => (req.ip ?? "").replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");
const parseJson = (s: unknown): string[] => {
  try {
    const v = JSON.parse(String(s ?? "[]"));
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setSessionCookie(res: Response, token: string | null, maxAgeSec: number) {
  const parts = [`${COOKIE}=${token ?? ""}`, `Path=${normalizeBasePath(process.env.APP_BASE_PATH ?? "/")}`, "HttpOnly", "SameSite=Strict", `Max-Age=${token ? maxAgeSec : 0}`];
  if (secureCookie()) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

/** Permissões efetivas = (perfil ∪ concessões) − remoções. Sem perfil = nenhuma (bloqueio por padrão). */
export function effectivePermissions(rolePerms: unknown, grants: unknown, denies: unknown) {
  const deny = new Set(parseJson(denies));
  return new Set([...parseJson(rolePerms), ...parseJson(grants)].filter((p): p is Permission => isPermission(p) && !deny.has(p)));
}

// ---------------- Sessão ----------------
export function createSession(userId: number, req: Request, res: Response) {
  const token = randomBytes(32).toString("base64url");
  const maxHours = getSetting("security.session_max_hours");
  const t = now();
  store().prepare("INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)").run(sha256(token), userId, t, t, new Date(Date.now() + maxHours * 3600000).toISOString(), clientIp(req), String(req.headers["user-agent"] ?? "").slice(0, 200));
  setSessionCookie(res, token, maxHours * 3600);
}

export function revokeSessions(where: { userId: number; exceptId?: string } | { id: string }) {
  if ("id" in where) return store().prepare("DELETE FROM sessions WHERE id = ?").run(where.id).changes;
  return store().prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(where.userId, where.exceptId ?? "").changes;
}

/** Popula req.user a partir do cookie (não bloqueia; quem bloqueia é requireAuth). */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  if (!token) return next();
  const id = sha256(token);
  const row = store()
    .prepare(
      `SELECT s.id sid, s.last_seen_at, s.expires_at, u.id, u.username, u.name, u.active, u.must_change_password, u.grants, u.denies, u.scope_department, r.id role_id, r.name role_name, r.permissions
         FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN roles r ON r.id = u.role_id WHERE s.id = ?`
    )
    .get(id);
  const idleMs = getSetting("security.session_idle_minutes") * 60000;
  if (!row || !row.active || Date.parse(String(row.expires_at)) < Date.now() || Date.parse(String(row.last_seen_at)) + idleMs < Date.now()) {
    if (row) store().prepare("DELETE FROM sessions WHERE id = ?").run(id);
    setSessionCookie(res, null, 0);
    return next();
  }
  // Renovação deslizante (no máximo 1 escrita por minuto por sessão).
  if (Date.now() - Date.parse(String(row.last_seen_at)) > 60000) store().prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now(), id);
  req.user = {
    id: Number(row.id),
    username: String(row.username),
    name: String(row.name),
    roleId: row.role_id ? String(row.role_id) : null,
    roleName: row.role_name ? String(row.role_name) : null,
    permissions: effectivePermissions(row.permissions, row.grants, row.denies),
    scopeDepartment: row.scope_department ? String(row.scope_department) : null,
    mustChangePassword: !!row.must_change_password,
    sessionId: id,
  };
  next();
}

/** Exige sessão válida. Com troca de senha pendente, só /api/auth/* fica liberado. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Sessão inválida ou expirada. Entre novamente.", code: "UNAUTHENTICATED" });
  if (req.user.mustChangePassword) return res.status(403).json({ error: "Troque sua senha para continuar.", code: "PASSWORD_CHANGE_REQUIRED" });
  next();
}

export const can = (req: Request, p: Permission) => !!req.user?.permissions.has(p);

export function requirePerm(...perms: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (perms.every((p) => can(req, p))) return next();
    audit({ event: "access.denied", outcome: "denied", actorId: req.user?.id, actor: req.user?.username, ip: clientIp(req), target: req.path, details: { required: perms } });
    res.status(403).json({ error: "Você não tem permissão para esta operação.", code: "FORBIDDEN" });
  };
}

const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"];
const allowedOrigins = () => [...(process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean), ...(process.env.NODE_ENV === "production" ? [] : DEV_ORIGINS)];

/** CSRF: métodos que alteram estado exigem header próprio e Origin igual ao host (além de SameSite=Strict). */
export function csrf(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  // O header customizado já impede CSRF (cross-site exige preflight CORS, que a API não libera).
  // Origin é verificação extra: o nginx preserva o Host original (proxy_set_header Host $host).
  // Origens extras permitidas: ALLOWED_ORIGINS (lista) e, fora de produção, os servidores locais do Vite
  // (o proxy do `vite preview` reescreve o Host). Em produção vale Origin = Host preservado pelo nginx.
  const origin = req.headers.origin;
  let sameOrigin = true;
  if (origin) {
    try {
      sameOrigin = new URL(origin).host === req.headers.host || allowedOrigins().includes(origin);
    } catch {
      sameOrigin = false;
    }
  }
  if (req.headers["x-requested-with"] !== "rinne" || !sameOrigin) {
    return res.status(403).json({ error: "Requisição recusada (proteção CSRF).", code: "CSRF" });
  }
  next();
}

// ---------------- Limite de tentativas ----------------
// Por IP: 3 falhas bloqueiam por security.lockout_minutes; cada novo bloqueio triplica (15, 45, 135...). Persistido.
// Por usuário (qualquer IP): contador em memória, contra ataque distribuído.
// ponytail: em memória (zera ao reiniciar, 1 instância). Mover para o SQLite se houver múltiplas instâncias.
const attempts = new Map<string, { n: number; first: number }>();
function locked(key: string, max: number, windowMs: number) {
  const a = attempts.get(key);
  if (a && Date.now() - a.first > windowMs) attempts.delete(key);
  return (attempts.get(key)?.n ?? 0) >= max;
}
function fail(key: string) {
  if (attempts.size > 50000) attempts.clear();
  const a = attempts.get(key);
  attempts.set(key, a ? { n: a.n + 1, first: a.first } : { n: 1, first: Date.now() });
}

export const IP_ATTEMPTS = 3;
const ipLock = (ip: string) => store().prepare("SELECT fails, locks, locked_until FROM login_locks WHERE ip = ?").get(ip);
const lockedMs = (ip: string) => Math.max(0, Number(ipLock(ip)?.locked_until ?? 0) - Date.now());
/** Conta a tentativa ANTES de verificar a senha (SQLite síncrono): requisições paralelas não furam o limite. */
function countIpAttempt(ip: string) {
  const row = ipLock(ip);
  let fails = Number(row?.fails ?? 0) + 1;
  let locks = Number(row?.locks ?? 0);
  let until = 0;
  if (fails >= IP_ATTEMPTS) {
    until = Date.now() + getSetting("security.lockout_minutes") * 60000 * 3 ** locks;
    locks += 1;
    fails = 0;
  }
  store().prepare("INSERT INTO login_locks (ip, fails, locks, locked_until) VALUES (?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET fails = excluded.fails, locks = excluded.locks, locked_until = excluded.locked_until").run(ip, fails, locks, until);
}
export const clearIpLock = (ip: string) => store().prepare("DELETE FROM login_locks WHERE ip = ?").run(ip).changes;
export const listIpLocks = () => store().prepare("SELECT ip, fails, locks, locked_until FROM login_locks ORDER BY locked_until DESC LIMIT 200").all();

// ---------------- Rotas /api/auth ----------------
const loginSchema = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(256) });
const passwordSchema = z.object({ current: z.string().min(1).max(256), next: z.string().min(1).max(256) });

export function publicUser(u: SessionUser) {
  return { id: u.id, username: u.username, name: u.name, role: u.roleName, roleId: u.roleId, permissions: [...u.permissions].sort(), scopeDepartment: u.scopeDepartment, mustChangePassword: u.mustChangePassword };
}

export function authRouter() {
  const r = express.Router();
  r.use(express.json({ limit: "8kb" }));

  r.post("/login", async (req, res) => {
    const p = loginSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Informe usuário e senha." });
    const { username, password } = p.data;
    const ip = clientIp(req);
    const max = getSetting("security.login_max_attempts");
    const windowMs = getSetting("security.lockout_minutes") * 60000;
    const userKey = "u:" + username.toLowerCase();
    const blocked = (ms: number) => {
      audit({ event: "auth.login", outcome: "denied", actor: username, ip, details: { reason: "bloqueio por tentativas" } });
      res.set("Retry-After", String(Math.ceil(ms / 1000)));
      return res.status(429).json({ error: `Muitas tentativas. Aguarde ${Math.ceil(ms / 60000)} minutos.` });
    };
    if (lockedMs(ip)) return blocked(lockedMs(ip));
    if (locked(userKey, max, windowMs)) return blocked(windowMs);
    countIpAttempt(ip);
    const u = store().prepare("SELECT id, username, password_hash, active FROM users WHERE username = ?").get(username);
    const ok = u ? await verifyPassword(password, String(u.password_hash)) : (await verifyPassword(password, await dummyHash()), false);
    if (!u || !ok || !u.active) {
      fail(userKey);
      audit({ event: "auth.login", outcome: "failure", actorId: u ? Number(u.id) : null, actor: username, ip, details: { reason: !u ? "usuário inexistente" : !ok ? "senha incorreta" : "usuário desativado" } });
      if (lockedMs(ip)) return blocked(lockedMs(ip));
      return res.status(401).json({ error: "Usuário ou senha inválidos." }); // mesma mensagem para todos os casos
    }
    attempts.delete(userKey);
    clearIpLock(ip);
    createSession(Number(u.id), req, res);
    store().prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now(), u.id);
    audit({ event: "auth.login", actorId: Number(u.id), actor: String(u.username), ip });
    res.status(204).end();
  });

  r.post("/logout", (req, res) => {
    if (req.user) {
      revokeSessions({ id: req.user.sessionId });
      audit({ event: "auth.logout", actorId: req.user.id, actor: req.user.username, ip: clientIp(req) });
    }
    setSessionCookie(res, null, 0);
    res.status(204).end();
  });

  r.get("/me", (req, res) => (req.user ? res.json(publicUser(req.user)) : res.status(401).json({ error: "Não autenticado", code: "UNAUTHENTICATED" })));

  r.post("/password", async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Não autenticado", code: "UNAUTHENTICATED" });
    const p = passwordSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Informe a senha atual e a nova." });
    const row = store().prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
    if (!row || !(await verifyPassword(p.data.current, String(row.password_hash)))) {
      audit({ event: "auth.password_change", outcome: "failure", actorId: req.user.id, actor: req.user.username, ip: clientIp(req), details: { reason: "senha atual incorreta" } });
      return res.status(400).json({ error: "Senha atual incorreta." });
    }
    const problem = passwordProblem(p.data.next, req.user.username, getSetting("security.password_min_length")) ?? (p.data.next === p.data.current ? "A nova senha deve ser diferente da atual." : null);
    if (problem) return res.status(400).json({ error: problem });
    store().prepare("UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ?").run(await hashPassword(p.data.next), now(), now(), req.user.id);
    const revoked = revokeSessions({ userId: req.user.id, exceptId: req.user.sessionId }); // derruba as outras sessões
    audit({ event: "auth.password_change", actorId: req.user.id, actor: req.user.username, ip: clientIp(req), details: { otherSessionsRevoked: revoked } });
    res.status(204).end();
  });

  // Sessões do próprio usuário
  r.get("/sessions", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Não autenticado", code: "UNAUTHENTICATED" });
    const rows = store().prepare("SELECT id, created_at, last_seen_at, expires_at, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC").all(req.user.id);
    res.json(rows.map((s) => ({ ...s, current: s.id === req.user!.sessionId })));
  });
  r.delete("/sessions/:id", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Não autenticado", code: "UNAUTHENTICATED" });
    const n = store().prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").run(String(req.params.id), req.user.id).changes;
    if (n) audit({ event: "session.revoke", actorId: req.user.id, actor: req.user.username, ip: clientIp(req), target: req.user.username, details: { own: true } });
    res.status(n ? 204 : 404).end();
  });

  return r;
}
