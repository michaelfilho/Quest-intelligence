// Administração: usuários, perfis, sessões, auditoria e configurações. Toda alteração é auditada.
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { ALL_PERMISSIONS, isPermission } from "../../shared/permissions.js";
import { clientIp, requirePerm, revokeSessions } from "./auth.js";
import { dbState, SCHEMAS } from "./db.js";
import { callN8n, n8nStatus } from "./integrations/n8n.js";
import { hashPassword, temporaryPassword } from "./passwords.js";
import { allSettings, audit, now, setSetting, store, type SettingKey } from "./store.js";

const perms = z.array(z.string().refine(isPermission, "permissão inexistente")).max(ALL_PERMISSIONS.length);
const idText = z.string().trim().max(64);
const userCreate = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, "use letras, números, ponto, hífen ou sublinhado"),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  roleId: idText.nullable().optional(),
  grants: perms.default([]),
  denies: perms.default([]),
  scopeDepartment: idText.nullable().optional(),
  active: z.boolean().default(true),
});
// Sem valores padrão: campo ausente = não alterar (um .partial() do schema de criação herdaria grants/denies = []).
const userPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  roleId: idText.nullable().optional(),
  grants: perms.optional(),
  denies: perms.optional(),
  scopeDepartment: idText.nullable().optional(),
  active: z.boolean().optional(),
});
const roleBody = z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(200).default(""), permissions: perms });

const parseList = (s: unknown) => JSON.parse(String(s ?? "[]")) as string[];
const actor = (req: Request) => ({ actorId: req.user!.id, actor: req.user!.username, ip: clientIp(req) });
function bad(res: Response, issues: z.ZodIssue[]) {
  return res.status(400).json({ error: "Dados inválidos", details: issues.map((i) => ({ campo: i.path.join("."), erro: i.message })) });
}

function userRow(u: Record<string, unknown>) {
  return {
    id: u.id, username: u.username, name: u.name, email: u.email, roleId: u.role_id, roleName: u.role_name ?? null,
    grants: parseList(u.grants), denies: parseList(u.denies), scopeDepartment: u.scope_department,
    active: !!u.active, mustChangePassword: !!u.must_change_password, lastLoginAt: u.last_login_at, createdAt: u.created_at,
    sessions: Number(u.sessions ?? 0),
  };
}
const USER_SELECT = `SELECT u.*, r.name role_name, (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) sessions FROM users u LEFT JOIN roles r ON r.id = u.role_id`;

/** Quantos administradores ativos existiriam se `exceptId` deixasse de sê-lo. */
const otherActiveAdmins = (exceptId: number) => Number(store().prepare("SELECT count(*) n FROM users WHERE role_id = 'admin' AND active = 1 AND id <> ?").get(exceptId)?.n ?? 0);

export function adminRouter() {
  const r = express.Router();
  r.use(express.json({ limit: "32kb" }));

  // ---------------- Usuários ----------------
  r.get("/users", requirePerm("usuarios.manage"), (_req, res) => {
    res.json(store().prepare(`${USER_SELECT} ORDER BY u.name`).all(now()).map(userRow));
  });

  r.post("/users", requirePerm("usuarios.manage"), async (req, res) => {
    const p = userCreate.safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues);
    const d = p.data;
    if (d.roleId && !store().prepare("SELECT 1 FROM roles WHERE id = ?").get(d.roleId)) return res.status(400).json({ error: "Perfil inexistente" });
    if (store().prepare("SELECT 1 FROM users WHERE username = ?").get(d.username)) return res.status(409).json({ error: "Nome de usuário já existe" });
    const temp = temporaryPassword();
    const t = now();
    const info = store()
      .prepare("INSERT INTO users (username, name, email, password_hash, role_id, grants, denies, scope_department, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)")
      .run(d.username, d.name, d.email || null, await hashPassword(temp), d.roleId ?? null, JSON.stringify(d.grants), JSON.stringify(d.denies), d.scopeDepartment ?? null, d.active ? 1 : 0, t, t);
    audit({ event: "user.create", ...actor(req), target: d.username, details: { roleId: d.roleId ?? null, grants: d.grants, denies: d.denies, scopeDepartment: d.scopeDepartment ?? null, active: d.active } });
    // A senha temporária só é exibida nesta resposta (troca obrigatória no primeiro acesso).
    res.status(201).json({ id: Number(info.lastInsertRowid), temporaryPassword: temp });
  });

  r.patch("/users/:id", requirePerm("usuarios.manage"), (req, res) => {
    const id = Number(req.params.id);
    const cur = store().prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!cur) return res.status(404).json({ error: "Usuário inexistente" });
    const p = userPatch.safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues);
    const d = p.data;
    if (d.roleId && !store().prepare("SELECT 1 FROM roles WHERE id = ?").get(d.roleId)) return res.status(400).json({ error: "Perfil inexistente" });
    const losingAdmin = cur.role_id === "admin" && cur.active && ((d.roleId !== undefined && d.roleId !== "admin") || d.active === false || d.denies?.length);
    if (losingAdmin && otherActiveAdmins(id) === 0) return res.status(409).json({ error: "Este é o último administrador ativo: não é possível remover seu acesso." });
    if (id === req.user!.id && d.active === false) return res.status(409).json({ error: "Você não pode desativar a si mesmo." });

    const next = {
      name: d.name ?? cur.name, email: d.email === undefined ? cur.email : d.email || null, role_id: d.roleId === undefined ? cur.role_id : d.roleId,
      grants: d.grants ? JSON.stringify(d.grants) : cur.grants, denies: d.denies ? JSON.stringify(d.denies) : cur.denies,
      scope_department: d.scopeDepartment === undefined ? cur.scope_department : d.scopeDepartment, active: d.active === undefined ? cur.active : d.active ? 1 : 0,
    };
    store().prepare("UPDATE users SET name = ?, email = ?, role_id = ?, grants = ?, denies = ?, scope_department = ?, active = ?, updated_at = ? WHERE id = ?").run(next.name, next.email, next.role_id, next.grants, next.denies, next.scope_department, next.active, now(), id);
    const revoked = next.active ? 0 : revokeSessions({ userId: id });
    const permsChanged = d.roleId !== undefined || d.grants !== undefined || d.denies !== undefined;
    audit({ event: permsChanged ? "user.permissions_update" : "user.update", ...actor(req), target: String(cur.username), details: { changes: d, sessionsRevoked: revoked } });
    res.status(204).end();
  });

  r.post("/users/:id/reset-password", requirePerm("usuarios.manage"), async (req, res) => {
    const id = Number(req.params.id);
    const u = store().prepare("SELECT username FROM users WHERE id = ?").get(id);
    if (!u) return res.status(404).json({ error: "Usuário inexistente" });
    const temp = temporaryPassword();
    store().prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?").run(await hashPassword(temp), now(), id);
    const revoked = revokeSessions({ userId: id });
    audit({ event: "user.password_reset", ...actor(req), target: String(u.username), details: { sessionsRevoked: revoked } });
    res.json({ temporaryPassword: temp });
  });

  // ---------------- Perfis ----------------
  r.get("/roles", requirePerm("perfis.manage"), (_req, res) => {
    res.json(store().prepare("SELECT r.*, (SELECT count(*) FROM users u WHERE u.role_id = r.id) users FROM roles r ORDER BY system DESC, name").all().map((x) => ({ id: x.id, name: x.name, description: x.description, permissions: parseList(x.permissions), system: !!x.system, locked: x.id === "admin", users: Number(x.users) })));
  });
  // Lista mínima para o formulário de usuários.
  r.get("/roles/options", requirePerm("usuarios.manage"), (_req, res) => res.json(store().prepare("SELECT id, name FROM roles ORDER BY name").all()));

  r.post("/roles", requirePerm("perfis.manage"), (req, res) => {
    const p = roleBody.safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues);
    const id = p.data.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "perfil";
    if (store().prepare("SELECT 1 FROM roles WHERE id = ? OR name = ?").get(id, p.data.name)) return res.status(409).json({ error: "Já existe um perfil com esse nome" });
    store().prepare("INSERT INTO roles (id, name, description, permissions, system, updated_at) VALUES (?, ?, ?, ?, 0, ?)").run(id, p.data.name, p.data.description, JSON.stringify(p.data.permissions), now());
    audit({ event: "role.create", ...actor(req), target: id, details: { permissions: p.data.permissions } });
    res.status(201).json({ id });
  });

  r.put("/roles/:id", requirePerm("perfis.manage"), (req, res) => {
    const id = String(req.params.id);
    if (id === "admin") return res.status(409).json({ error: "O perfil Administrador sempre tem todas as permissões e não pode ser alterado." });
    const cur = store().prepare("SELECT * FROM roles WHERE id = ?").get(id);
    if (!cur) return res.status(404).json({ error: "Perfil inexistente" });
    const p = roleBody.safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues);
    store().prepare("UPDATE roles SET name = ?, description = ?, permissions = ?, updated_at = ? WHERE id = ?").run(p.data.name, p.data.description, JSON.stringify(p.data.permissions), now(), id);
    const before = new Set(parseList(cur.permissions));
    const after = new Set<string>(p.data.permissions);
    audit({ event: "role.permissions_update", ...actor(req), target: id, details: { added: [...after].filter((x) => !before.has(x)), removed: [...before].filter((x) => !after.has(x)) } });
    res.status(204).end();
  });

  r.delete("/roles/:id", requirePerm("perfis.manage"), (req, res) => {
    const id = String(req.params.id);
    const cur = store().prepare("SELECT system FROM roles WHERE id = ?").get(id);
    if (!cur) return res.status(404).json({ error: "Perfil inexistente" });
    if (cur.system) return res.status(409).json({ error: "Perfis padrão não podem ser excluídos." });
    const affected = store().prepare("UPDATE users SET role_id = NULL WHERE role_id = ?").run(id).changes; // ficam sem permissão (bloqueio por padrão)
    store().prepare("DELETE FROM roles WHERE id = ?").run(id);
    audit({ event: "role.delete", ...actor(req), target: id, details: { usersWithoutRole: affected } });
    res.status(204).end();
  });

  // ---------------- Sessões (todos os usuários) ----------------
  r.get("/sessions", requirePerm("sessoes.manage"), (req, res) => {
    const rows = store().prepare("SELECT s.id, s.created_at, s.last_seen_at, s.expires_at, s.ip, s.user_agent, u.username, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.expires_at > ? ORDER BY s.last_seen_at DESC").all(now());
    res.json(rows.map((s) => ({ ...s, current: s.id === req.user!.sessionId })));
  });
  r.delete("/sessions/:id", requirePerm("sessoes.manage"), (req, res) => {
    const s = store().prepare("SELECT u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?").get(String(req.params.id));
    if (!s) return res.status(404).json({ error: "Sessão inexistente" });
    revokeSessions({ id: String(req.params.id) });
    audit({ event: "session.revoke", ...actor(req), target: String(s.username) });
    res.status(204).end();
  });
  r.delete("/users/:id/sessions", requirePerm("sessoes.manage"), (req, res) => {
    const u = store().prepare("SELECT username FROM users WHERE id = ?").get(Number(req.params.id));
    if (!u) return res.status(404).json({ error: "Usuário inexistente" });
    const n = revokeSessions({ userId: Number(req.params.id) });
    audit({ event: "session.revoke_all", ...actor(req), target: String(u.username), details: { sessionsRevoked: n } });
    res.json({ revoked: n });
  });

  // ---------------- Auditoria ----------------
  const auditQuery = z.object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    event: z.string().max(60).optional(),
    outcome: z.enum(["success", "failure", "denied"]).optional(),
    actor: z.string().max(64).optional(),
  });
  r.get("/audit", requirePerm("auditoria.view"), (req, res) => {
    const p = auditQuery.safeParse(req.query);
    if (!p.success) return bad(res, p.error.issues);
    const { page, pageSize, event, outcome, actor: who } = p.data;
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (event) (where.push("event LIKE ?"), args.push(event + "%"));
    if (outcome) (where.push("outcome = ?"), args.push(outcome));
    if (who) (where.push("actor = ?"), args.push(who));
    const w = where.length ? "WHERE " + where.join(" AND ") : "";
    const total = Number(store().prepare(`SELECT count(*) n FROM audit_log ${w}`).get(...args)?.n ?? 0);
    const rows = store().prepare(`SELECT * FROM audit_log ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
    res.json({ total, page, pageSize, rows: rows.map((x) => ({ ...x, details: JSON.parse(String(x.details)) })) });
  });

  // ---------------- Configurações ----------------
  const settingsSchema = z
    .object({
      "security.session_idle_minutes": z.number().int().min(5).max(480),
      "security.session_max_hours": z.number().int().min(1).max(72),
      "security.login_max_attempts": z.number().int().min(3).max(20),
      "security.lockout_minutes": z.number().int().min(1).max(1440),
      "security.password_min_length": z.number().int().min(10).max(64),
      "general.organization": z.string().trim().min(1).max(120),
      "general.default_period": z.enum(["Mês atual", "Mês anterior", "Ano atual", "Ano anterior", "Últimos 12 meses"]),
      "rinne.browser_tts": z.boolean(),
      "rinne.history_retention_days": z.number().int().min(7).max(3650),
      "meetings.retention_days": z.number().int().min(7).max(3650),
    })
    .partial()
    .strict();

  r.get("/settings", requirePerm("config.view"), async (_req, res) => {
    res.json({
      settings: allSettings(),
      environment: {
        database: (await dbState()).state,
        schemas: SCHEMAS,
        n8n: { enabled: n8nStatus().enabled, problem: n8nStatus().problem }, // IA só via n8n; nenhuma chave de provedor na aplicação
        trustProxy: process.env.TRUST_PROXY || "loopback",
        requireProxy: process.env.REQUIRE_PROXY === "true",
        cookieSecure: process.env.COOKIE_SECURE !== "false",
        node: process.version,
        dataDir: "server/data (volume persistente)",
      },
    });
  });

  r.put("/settings", requirePerm("config.manage"), (req, res) => {
    const p = settingsSchema.safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues);
    for (const [k, v] of Object.entries(p.data)) setSetting(k as SettingKey, v, req.user!.username);
    audit({ event: "settings.update", ...actor(req), details: { changed: p.data } });
    res.json(allSettings());
  });

  // ---------------- Integração n8n (status, rastreamento, teste) ----------------
  r.get("/integrations/n8n", requirePerm("config.view"), (_req, res) => {
    const history = store()
      .prepare("SELECT request_id, correlation_id, session_id, mode, operation, status, http_status, latency_ms, error, created_at, completed_at FROM n8n_requests ORDER BY created_at DESC LIMIT 50")
      .all();
    res.json({ status: n8nStatus(), history });
  });

  // Teste de conectividade: operação PING (o workflow deve responder sem acionar modelos → sem custo).
  r.post("/integrations/n8n/test", requirePerm("config.manage"), async (req, res) => {
    const out = await callN8n({ user: null, mode: "CHAT", operation: "PING", sessionId: null, message: null });
    audit({ event: "integration.n8n_test", outcome: out.status === "success" ? "success" : "failure", ...actor(req), details: { status: out.status, requestId: out.requestId, latencyMs: out.latencyMs } });
    res.json({ status: out.status, requestId: out.requestId, correlationId: out.correlationId, latencyMs: out.latencyMs, error: out.error });
  });

  return r;
}

