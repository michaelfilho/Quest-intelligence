// Autenticação, sessões, senhas, bloqueio por tentativas, CSRF, persistência e auditoria.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client, createUser, PASSWORD, startServer } from "./helpers.js";

const { store, closeStore, setSetting } = await import("../src/store.js");
const { hashPassword, verifyPassword } = await import("../src/passwords.js");

let srv: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  srv = await startServer();
  await createUser("admin.teste", "admin");
  await createUser("ana", "analista");
});
after(() => srv.stop());

test("Argon2id: formato PHC, salt aleatório, verificação", async () => {
  const a = await hashPassword("uma-senha-qualquer-123");
  const b = await hashPassword("uma-senha-qualquer-123");
  assert.match(a, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.notEqual(a, b);
  assert.ok(await verifyPassword("uma-senha-qualquer-123", a));
  assert.ok(!(await verifyPassword("outra", a)));
  assert.ok(!(await verifyPassword("x", "texto-puro")));
  const row = store().prepare("SELECT password_hash FROM users WHERE username = 'ana'").get();
  assert.ok(!String(row?.password_hash).includes(PASSWORD)); // nunca texto puro
});

test("sem sessão: tudo bloqueado (exceto login/health)", async () => {
  const c = new Client(srv.base);
  for (const p of ["/api/modules", "/api/modules/executivo", "/api/tables/projetos", "/api/admin/users", "/api/metadata/coverage"]) assert.equal((await c.req(p)).status, 401, p);
  const h = await c.req("/api/health");
  assert.equal(h.status, 200);
  assert.equal(h.body.schemas, undefined); // health público não expõe detalhes
});

test("login: cookie seguro, sessão, logout", async () => {
  const c = new Client(srv.base);
  const r = await c.login("ana");
  assert.equal(r.status, 204);
  const set = r.headers.getSetCookie()[0];
  assert.match(set, /rinne_sid=/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  const me = await c.req("/api/auth/me");
  assert.equal(me.body.username, "ana");
  assert.equal(me.body.role, "Analista");
  assert.ok(!JSON.stringify(me.body).includes("hash"));
  // O banco guarda só o hash do token.
  const token = c.cookie.split("=")[1];
  assert.equal(store().prepare("SELECT count(*) n FROM sessions WHERE id = ?").get(token)?.n, 0);
  assert.equal((await c.req("/api/auth/logout", { method: "POST" })).status, 204);
  assert.equal((await c.req("/api/modules")).status, 401);
});

test("credenciais inválidas: mesma resposta para usuário inexistente, senha errada e desativado", async () => {
  await createUser("inativo", "analista", { active: false });
  for (const [u, p] of [["ninguem", PASSWORD], ["ana", "errada-123456"], ["inativo", PASSWORD]]) {
    const r = await new Client(srv.base, "203.0.113." + (50 + ["ninguem", "ana", "inativo"].indexOf(u))).login(u, p);
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "Usuário ou senha inválidos.");
  }
});

test("bloqueio por tentativas (por usuário)", async () => {
  await createUser("bruto", "analista");
  // IPs diferentes, para exercitar só o limite por usuário
  for (let i = 0; i < 5; i++) assert.equal((await new Client(srv.base, "203.0.113." + (60 + i)).login("bruto", "errada-" + i)).status, 401);
  assert.equal((await new Client(srv.base, "203.0.113.70").login("bruto")).status, 429); // nem a senha certa, de qualquer IP
});

test("bloqueio progressivo por IP: 3 erros = 15 min, depois 45 e 135; acertar zera", async () => {
  await createUser("progressivo", "analista");
  const ip = "203.0.113.80";
  const c = new Client(srv.base, ip);
  const expire = () => store().prepare("UPDATE login_locks SET locked_until = 1 WHERE ip = ?").run(ip);
  // usuários inexistentes diferentes: não esbarra no limite por usuário
  let n = 0;
  const wrong = () => c.login("fantasma" + n++, "errada-123456");
  for (const minutes of [15, 45, 135]) {
    assert.equal((await wrong()).status, 401);
    assert.equal((await wrong()).status, 401);
    const third = await wrong();
    assert.equal(third.status, 429);
    assert.ok(Math.abs(Number(third.headers.get("retry-after")) - minutes * 60) <= 2);
    assert.equal((await c.login("progressivo")).status, 429); // nem a senha certa durante o bloqueio
    expire();
  }
  assert.equal((await c.login("progressivo")).status, 204);
  assert.equal(store().prepare("SELECT count(*) n FROM login_locks WHERE ip = ?").get(ip)?.n, 0);
});

test("CSRF: POST sem header próprio ou de outra origem é recusado", async () => {
  const c = new Client(srv.base);
  assert.equal((await c.req("/api/auth/login", { method: "POST", body: { username: "ana", password: PASSWORD }, csrf: false })).status, 403);
  assert.equal((await c.req("/api/auth/login", { method: "POST", body: { username: "ana", password: PASSWORD }, headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal((await c.req("/api/auth/login", { method: "POST", body: { username: "ana", password: PASSWORD }, headers: { origin: "null" } })).status, 403);
  // Origem local do Vite é aceita fora de produção; em produção, não.
  await createUser("origem.vite", "consulta");
  assert.equal((await new Client(srv.base).req("/api/auth/login", { method: "POST", body: { username: "origem.vite", password: PASSWORD }, headers: { origin: "http://localhost:5173" } })).status, 204);
  process.env.NODE_ENV = "production";
  assert.equal((await new Client(srv.base).req("/api/auth/login", { method: "POST", body: { username: "origem.vite", password: PASSWORD }, headers: { origin: "http://localhost:5173" } })).status, 403);
  process.env.NODE_ENV = "test";
});

test("troca obrigatória de senha no primeiro acesso + política de senha + revogação das outras sessões", async () => {
  await createUser("novo", "analista", { mustChange: true });
  const a = new Client(srv.base);
  const b = new Client(srv.base);
  await a.login("novo");
  await b.login("novo");
  const blocked = await a.req("/api/modules");
  assert.deepEqual([blocked.status, blocked.body.code], [403, "PASSWORD_CHANGE_REQUIRED"]);
  assert.equal((await a.req("/api/auth/password", { method: "POST", body: { current: PASSWORD, next: "curta" } })).status, 400);
  assert.equal((await a.req("/api/auth/password", { method: "POST", body: { current: PASSWORD, next: "novo-e-mais-alguma-coisa" } })).status, 400); // contém o usuário
  assert.equal((await a.req("/api/auth/password", { method: "POST", body: { current: "errada", next: "Outra-Senha-Forte-2026" } })).status, 400);
  assert.equal((await a.req("/api/auth/password", { method: "POST", body: { current: PASSWORD, next: "Outra-Senha-Forte-2026" } })).status, 204);
  assert.equal((await a.req("/api/modules")).status, 200);
  assert.equal((await b.req("/api/modules")).status, 401); // outra sessão revogada
  assert.equal((await new Client(srv.base).login("novo", "Outra-Senha-Forte-2026")).status, 204);
});

test("expiração por inatividade e absoluta", async () => {
  const c = new Client(srv.base);
  await c.login("ana");
  store().prepare("UPDATE sessions SET last_seen_at = ? WHERE user_id = (SELECT id FROM users WHERE username = 'ana')").run(new Date(Date.now() - 31 * 60000).toISOString());
  assert.equal((await c.req("/api/modules")).status, 401);
  const d = new Client(srv.base);
  await d.login("ana");
  store().prepare("UPDATE sessions SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE username = 'ana')").run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await d.req("/api/modules")).status, 401);
  assert.equal(store().prepare("SELECT count(*) n FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = 'ana')").get()?.n, 0); // limpas
  setSetting("security.session_idle_minutes", 30, "teste");
});

test("sessões: listar e revogar as próprias; admin revoga de outros", async () => {
  const a1 = new Client(srv.base);
  const a2 = new Client(srv.base);
  await a1.login("ana");
  await a2.login("ana");
  const list = await a1.req("/api/auth/sessions");
  assert.equal(list.body.length, 2);
  const other = list.body.find((s: any) => !s.current);
  assert.equal((await a1.req(`/api/auth/sessions/${other.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await a2.req("/api/modules")).status, 401);
  // analista não vê sessões de todos
  assert.equal((await a1.req("/api/admin/sessions")).status, 403);
  const adm = new Client(srv.base);
  await adm.login("admin.teste");
  const all = await adm.req("/api/admin/sessions");
  const anas = all.body.find((s: any) => s.username === "ana");
  assert.equal((await adm.req(`/api/admin/sessions/${anas.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await a1.req("/api/modules")).status, 401);
});

test("gestão de usuários: criação com senha temporária, desativação derruba sessões, último admin protegido", async () => {
  const adm = new Client(srv.base);
  await adm.login("admin.teste");
  const created = await adm.req("/api/admin/users", { method: "POST", body: { username: "fin.um", name: "Financeiro Um", roleId: "financeiro" } });
  assert.equal(created.status, 201);
  assert.ok(created.body.temporaryPassword.length >= 12);
  const u = new Client(srv.base);
  assert.equal((await u.login("fin.um", created.body.temporaryPassword)).status, 204);
  assert.equal((await u.req("/api/modules")).body.code, "PASSWORD_CHANGE_REQUIRED");
  await u.req("/api/auth/password", { method: "POST", body: { current: created.body.temporaryPassword, next: "Financeiro-Forte-2026" } });
  assert.equal((await u.req("/api/modules")).status, 200);
  // Edição parcial não apaga permissões individuais.
  assert.equal((await adm.req(`/api/admin/users/${created.body.id}`, { method: "PATCH", body: { grants: ["qualidade.view"] } })).status, 204);
  assert.equal((await adm.req(`/api/admin/users/${created.body.id}`, { method: "PATCH", body: { name: "Financeiro 1" } })).status, 204);
  assert.deepEqual(JSON.parse(String(store().prepare("SELECT grants FROM users WHERE id = ?").get(created.body.id)?.grants)), ["qualidade.view"]);
  assert.equal((await adm.req(`/api/admin/users/${created.body.id}`, { method: "PATCH", body: { active: false } })).status, 204);
  assert.equal((await u.req("/api/modules")).status, 401);
  assert.equal((await u.login("fin.um", "Financeiro-Forte-2026")).status, 401);

  const adminId = store().prepare("SELECT id FROM users WHERE username = 'admin.teste'").get()?.id;
  assert.equal((await adm.req(`/api/admin/users/${adminId}`, { method: "PATCH", body: { roleId: "analista" } })).status, 409);
  assert.equal((await adm.req(`/api/admin/users/${adminId}`, { method: "PATCH", body: { active: false } })).status, 409);
  assert.equal((await adm.req("/api/admin/users", { method: "POST", body: { username: "x", name: "x" } })).status, 400);
  assert.equal((await adm.req("/api/admin/users", { method: "POST", body: { username: "fin.um", name: "dup" } })).status, 409);
});

test("auditoria registra eventos sem segredos", async () => {
  const adm = new Client(srv.base);
  await adm.login("admin.teste");
  const r = await adm.req("/api/admin/audit?pageSize=200");
  assert.equal(r.status, 200);
  const events = new Set(r.body.rows.map((x: any) => `${x.event}:${x.outcome}`));
  for (const e of ["auth.login:success", "auth.login:failure", "auth.login:denied", "auth.logout:success", "auth.password_change:success", "user.create:success", "user.update:success", "session.revoke:success"]) assert.ok(events.has(e), e);
  const dump = JSON.stringify(store().prepare("SELECT * FROM audit_log").all());
  for (const secret of [PASSWORD, "Outra-Senha-Forte-2026", "Financeiro-Forte-2026", "rinne_sid"]) assert.ok(!dump.includes(secret), "vazou: " + secret);
  assert.ok(!/argon2id/.test(dump));
  const ana = new Client(srv.base);
  await ana.login("ana");
  assert.equal((await ana.req("/api/admin/audit")).status, 403);
});

test("persistência: dados sobrevivem ao fechar e reabrir o banco da aplicação", async () => {
  const before = store().prepare("SELECT count(*) n FROM users").get()?.n;
  setSetting("general.organization", "Quest Teste", "teste");
  closeStore();
  assert.equal(store().prepare("SELECT count(*) n FROM users").get()?.n, before);
  assert.equal(JSON.parse(String(store().prepare("SELECT value FROM app_settings WHERE key = 'general.organization'").get()?.value)), "Quest Teste");
  const files = (await import("node:fs")).readdirSync(new URL("../migrations", import.meta.url)).filter((x) => x.endsWith(".sql")).length;
  assert.equal(store().prepare("SELECT count(*) n FROM schema_migrations").get()?.n, files); // cada migration aplicada uma única vez
  assert.equal((await new Client(srv.base).login("ana")).status, 204);
});
