// Autenticação individual: sessões no servidor (PostgreSQL, schema app), cookie HttpOnly/SameSite=Strict, Argon2id,
// limite de tentativas, expiração por inatividade e absoluta, revogação e auditoria.
import { createHash, randomBytes } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { isPermission, type Permission } from "../../shared/permissions.js";
import { normalizeBasePath } from "../../shared/base-path.js";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "./passwords.js";
import { all, audit, get, getSetting, now, run } from "./store.js";

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
    const v = typeof s === "string" ? JSON.parse(s) : s;
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const ms = (value: unknown) => new Date(value as string | Date).getTime();

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
export async function createSession(userId: number, req: Request, res: Response) {
  const token = randomBytes(32).toString("base64url");
  const maxHours = await getSetting("security.session_max_hours");
  const t = now();
  await run("INSERT INTO app.sessions (id, user_id, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)", sha256(token), userId, t, t, new Date(Date.now() + maxHours * 3600000).toISOString(), clientIp(req), String(req.headers["user-agent"] ?? "").slice(0, 200));
  setSessionCookie(res, token, maxHours * 3600);
}

export async function revokeSessions(where: { userId: number; exceptId?: string } | { id: string }) {
  if ("id" in where) return run("DELETE FROM app.sessions WHERE id = ?", where.id);
  return run("DELETE FROM app.sessions WHERE user_id = ? AND id <> ?", where.userId, where.exceptId ?? "");
}

/** Popula req.user a partir do cookie (não bloqueia; quem bloqueia é requireAuth). */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  if (!token) return next();
  const id = sha256(token);
  const row = await get(
    `SELECT s.id sid, s.last_seen_at, s.expires_at, u.id, u.username, u.name, u.active, u.must_change_password, u.grants, u.denies, u.scope_department, r.id role_id, r.name role_name, r.permissions
       FROM app.sessions s JOIN app.users u ON u.id = s.user_id LEFT JOIN app.roles r ON r.id = u.role_id WHERE s.id = ?`,
    id
  );
  const idleMs = (await getSetting("security.session_idle_minutes")) * 60000;
  if (!row || !row.active || ms(row.expires_at) < Date.now() || ms(row.last_seen_at) + idleMs < Date.now()) {
    if (row) await run("DELETE FROM app.sessions WHERE id = ?", id);
    setSessionCookie(res, null, 0);
    return next();
  }
  // Renovação deslizante (no máximo 1 escrita por minuto por sessão).
  if (Date.now() - ms(row.last_seen_at) > 60000) await run("UPDATE app.sessions SET last_seen_at = ? WHERE id = ?", now(), id);
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
  return async (req: Request, res: Response, next: NextFunction) => {
    if (perms.every((p) => can(req, p))) return next();
    await audit({ event: "access.denied", outcome: "denied", actorId: req.user?.id, actor: req.user?.username, ip: clientIp(req), target: req.path, details: { required: perms } });
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
// ponytail: em memória (zera ao reiniciar, 1 instância). Mover para o PostgreSQL se houver múltiplas instâncias.
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
const lockedMs = async (ip: string) => {
  const row = await get("SELECT locked_until FROM app.login_locks WHERE ip = ?", ip);
  return row ? Math.max(0, ms(row.locked_until) - Date.now()) : 0;
};
/**
 * Conta a tentativa ANTES de verificar a senha, em uma única instrução atômica: requisições paralelas
 * não furam o limite. Devolve false quando o IP já está bloqueado (nada é contado).
 */
async function countIpAttempt(ip: string) {
  const base = (await getSetting("security.lockout_minutes")) * 60;
  const at = now();
  const rows = await all(
    `INSERT INTO app.login_locks AS l (ip, fails) VALUES (?, 1)
     ON CONFLICT (ip) DO UPDATE SET
       fails = CASE WHEN l.fails + 1 >= ${IP_ATTEMPTS} THEN 0 ELSE l.fails + 1 END,
       locks = CASE WHEN l.fails + 1 >= ${IP_ATTEMPTS} THEN l.locks + 1 ELSE l.locks END,
       locked_until = CASE WHEN l.fails + 1 >= ${IP_ATTEMPTS} THEN ?::timestamptz + make_interval(secs => ?::double precision * power(3, l.locks)) ELSE l.locked_until END
     WHERE l.locked_until <= ?::timestamptz
     RETURNING ip`,
    ip, at, base, at
  );
  return rows.length > 0;
}
export const clearIpLock = (ip: string) => run("DELETE FROM app.login_locks WHERE ip = ?", ip);
export const listIpLocks = async () => (await all("SELECT ip, fails, locks, locked_until FROM app.login_locks ORDER BY locked_until DESC LIMIT 200")).map((l) => ({ ...l, locked_until: ms(l.locked_until) }));

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
    const max = await getSetting("security.login_max_attempts");
    const windowMs = (await getSetting("security.lockout_minutes")) * 60000;
    const userKey = "u:" + username.toLowerCase();
    const blocked = async (wait: number) => {
      await audit({ event: "auth.login", outcome: "denied", actor: username, ip, details: { reason: "bloqueio por tentativas" } });
      res.set("Retry-After", String(Math.ceil(wait / 1000)));
      return res.status(429).json({ error: `Muitas tentativas. Aguarde ${Math.ceil(wait / 60000)} minutos.` });
    };
    const waiting = await lockedMs(ip);
    if (waiting) return blocked(waiting);
    if (locked(userKey, max, windowMs)) return blocked(windowMs);
    if (!(await countIpAttempt(ip))) return blocked(await lockedMs(ip));
    const u = await get("SELECT id, username, password_hash, active FROM app.users WHERE lower(username) = lower(?)", username);
    const ok = u ? await verifyPassword(password, String(u.password_hash)) : (await verifyPassword(password, await dummyHash()), false);
    if (!u || !ok || !u.active) {
      fail(userKey);
      await audit({ event: "auth.login", outcome: "failure", actorId: u ? Number(u.id) : null, actor: username, ip, details: { reason: !u ? "usuário inexistente" : !ok ? "senha incorreta" : "usuário desativado" } });
      const after = await lockedMs(ip);
      if (after) return blocked(after);
      return res.status(401).json({ error: "Usuário ou senha inválidos." }); // mesma mensagem para todos os casos
    }
    attempts.delete(userKey);
    await clearIpLock(ip);
    await createSession(Number(u.id), req, res);
    await run("UPDATE app.users SET last_login_at = ? WHERE id = ?", now(), u.id);
    await audit({ event: "auth.login", actorId: Number(u.id), actor: String(u.username), ip });
    res.status(204).end();
  });

  r.post("/logout", async (req, res) => {
    if (req.user) {
      await revokeSessions({ id: req.user.sessionId });
      await audit({ event: "auth.logout", actorId: req.user.id, actor: req.user.username, ip: clientIp(req) });
    }
    setSessionCookie(res, null, 0);
    res.status(204).end();
  });

  r.get("/me", (req, res) => (req.user ? res.json(publicUser(req.user)) : res.status(401).json({ error: "Não autenticado", code: "UNAUTHENTICATED" })));

  r.post("/password", async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Não autenticado", code: "UNAUTHENTICATED" });
    const p = passwordSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Informe a senha atual e a nova." });
    const row = await get("SELECT password_hash FROM app.users WHERE id = ?", req.user.id);
    if (!row || !(await verifyPassword(p.data.current, String(row.password_hash)))) {
      await audit({ event: "auth.password_change", outcome: "failure", actorId: req.user.id, actor: req.user.username, ip: clientIp(req), details: { reason: "senha atual incorreta" } });
      return res.status(400).json({ error: "Senha atual incorreta." });
    }
    const problem = passwordProblem(p.data.next, req.user.username, await getSetting("security.password_min_length")) ?? (p.data.next === p.data.current ? "A nova senha deve ser diferente da atual." : null);
    if (problem) return res.status(400).json({ error: problem });
    await run("UPDATE app.users SET password_hash = ?, must_change_password = false, password_changed_at = ?, updated_at = ? WHERE id = ?", await hashPassword(p.data.next), now(), now(), req.user.id);
    const revoked = await revokeSessions({ userId: req.user.id, exceptId: req.user.sessionId }); // derruba as outras sessões
    await audit({ event: "auth.password_change", actorId: req.user.id, actor: req.user.username, ip: clientIp(req), details: { otherSessionsRevoked: revoked } });
    res.status(204).end();
  });

  // Sessões do próprio usuário
  r.get("/sessions", async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Não autenticado", code: "UNAUTHENTICATED" });
    const rows = await all("SELECT id, created_at, last_seen_at, expires_at, ip, user_agent FROM app.sessions WHERE user_id = ? ORDER BY last_seen_at DESC", req.user.id);
    res.json(rows.map((s) => ({ ...s, current: s.id === req.user!.sessionId })));
  });
  r.delete("/sessions/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Não autenticado", code: "UNAUTHENTICATED" });
    const n = await run("DELETE FROM app.sessions WHERE id = ? AND user_id = ?", String(req.params.id), req.user.id);
    if (n) await audit({ event: "session.revoke", actorId: req.user.id, actor: req.user.username, ip: clientIp(req), target: req.user.username, details: { own: true } });
    res.status(n ? 204 : 404).end();
  });

  return r;
}
