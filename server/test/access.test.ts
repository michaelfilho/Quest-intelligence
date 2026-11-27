// Allowlist de IPs, falsificação de cabeçalhos e REQUIRE_PROXY.
// IPs de "cliente" simulados via X-Forwarded-For (a API confia só em loopback como proxy).
// Faixas de documentação (RFC 5737 / 3849): nenhum IP real.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.IP_ALLOWLIST_BOOTSTRAP = "192.0.2.10, invalido"; // antes de carregar a API
const { Client, createUser, appDb, startServer } = await import("./helpers.js");
const { parseCidr, normalizeIp, loadAccess } = await import("../src/access.js");
const { setAppDriver } = await import("../src/store.js");
const { all, get, run } = await import("../src/store.js");

const ME = "203.0.113.5";
const OTHER = "198.51.100.7";
let srv: Awaited<ReturnType<typeof startServer>>;
let adm: InstanceType<typeof Client>;
before(async () => {
  srv = await startServer();
  await createUser("adm.ip", "admin");
  await createUser("diretor", "diretoria");
  adm = new Client(srv.base, ME);
  await adm.login("adm.ip");
});
after(() => srv.stop());

const anon = (path: string, ip: string, headers: Record<string, string> = {}) => new Client(srv.base, ip).req(path, { headers });
const put = (body: unknown, c = adm) => c.req("/api/access", { method: "PUT", body });

test("parse de IP/CIDR", () => {
  assert.equal(parseCidr("203.0.113.5")?.cidr, "203.0.113.5/32");
  assert.equal(parseCidr("203.0.113.0/24")?.cidr, "203.0.113.0/24");
  assert.equal(parseCidr("2001:db8::/32")?.cidr, "2001:db8::/32");
  assert.equal(parseCidr("::ffff:203.0.113.5")?.cidr, "203.0.113.5/32");
  for (const bad of ["0.0.0.0/0", "::/0", "203.0.113.5/33", "999.1.1.1", "abc", "1.2.3.4/24/1", ""]) assert.equal(parseCidr(bad), null, bad);
  assert.equal(normalizeIp("::ffff:10.0.0.1"), "10.0.0.1");
});

test("desativado por padrão: nenhum IP bloqueado", async () => {
  assert.equal((await anon("/api/health", OTHER)).status, 200);
  assert.deepEqual((await anon("/api/access/me", ME)).body, { enabled: false, ip: ME });
});

test("gestão exige sessão com ip.manage", async () => {
  assert.equal((await anon("/api/access", ME)).status, 401);
  const dir = new Client(srv.base, ME);
  await dir.login("diretor");
  assert.equal((await dir.req("/api/access")).status, 403);
  assert.equal((await put({ enabled: false, entries: [] }, dir)).status, 403);
  const ok = await adm.req("/api/access");
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.bootstrap, ["192.0.2.10"]); // entrada inválida ignorada
});

test("validação e anti-lockout", async () => {
  assert.equal((await put({ enabled: true, entries: [{ cidr: "0.0.0.0/0" }] })).status, 400);
  assert.equal((await adm.req("/api/access", { method: "PUT", body: "{nao-json" })).status, 400);
  const lock = await put({ enabled: true, entries: [{ cidr: OTHER, label: "outro" }] });
  assert.equal(lock.status, 409);
  assert.match(lock.body.error, /203\.0\.113\.5/);
});

test("ativo: só IPs liberados (lista + bootstrap) acessam; alteração auditada", async () => {
  const save = await put({ enabled: true, entries: [{ cidr: "203.0.113.0/24", label: "Escritório" }] });
  assert.equal(save.status, 200);
  assert.equal(save.body.updatedBy, "adm.ip");
  assert.equal((await get("SELECT enabled FROM app.access_state"))!.enabled, true); // persistido
  assert.deepEqual((await all("SELECT cidr FROM app.ip_allowlist")).map((e) => e.cidr), ["203.0.113.0/24"]);

  assert.equal((await anon("/api/health", ME)).status, 200);
  assert.equal((await anon("/api/access/check", ME)).status, 204); // consulta do nginx
  assert.equal((await anon("/api/access/check", "192.0.2.10")).status, 204); // bootstrap
  const blocked = await anon("/api/auth/login", OTHER);
  assert.equal(blocked.status, 404); // recusado ANTES do login, sem revelar o site
  assert.deepEqual(blocked.body, { error: "Not Found" });
  assert.equal((await anon("/api/access/check", OTHER)).status, 403);

  const ev = (await all("SELECT event, details FROM app.audit_log WHERE event IN ('ip_allowlist.update', 'access.blocked')"));
  assert.ok(ev.some((e) => e.event === "ip_allowlist.update" && JSON.stringify(e.details).includes("203.0.113.0/24")));
  assert.ok(ev.some((e) => e.event === "access.blocked"));
});

test("IP recusado fica pendente; autorizar libera, excluir mantém 404 sem nova notificação", async () => {
  const request = async (ip: string) => (await adm.req("/api/access")).body.requests.find((r: any) => r.ip === ip);
  const act = (ip: string, action: string) => adm.req("/api/access/requests", { method: "POST", body: { ip, action } });
  assert.equal((await request(OTHER)).status, "pending");
  assert.equal((await act(OTHER, "dismiss")).status, 200);
  assert.equal((await anon("/api/health", OTHER)).status, 404);
  assert.equal((await request(OTHER)).status, "dismissed");
  assert.equal((await act(OTHER, "allow")).status, 200);
  assert.equal((await anon("/api/health", OTHER)).status, 200);
  assert.equal(await request(OTHER), undefined);
  assert.equal((await act("abc", "allow")).status, 400);
  const dir = new Client(srv.base, ME);
  await dir.login("diretor");
  assert.equal((await dir.req("/api/access/requests", { method: "POST", body: { ip: OTHER, action: "allow" } })).status, 403);
  await put({ enabled: true, entries: [{ cidr: "203.0.113.0/24", label: "Escritório" }] }); // restaura para os próximos testes
});

test("falsificação de cabeçalhos não burla o bloqueio", async () => {
  // X-Forwarded-For forjado à esquerda: vale o último salto não confiável.
  assert.equal((await anon("/api/health", `${ME}, ${OTHER}`)).status, 404);
  // X-Real-IP e CF-Connecting-IP são ignorados (só X-Forwarded-For de proxy confiável conta).
  assert.equal((await anon("/api/health", OTHER, { "x-real-ip": ME, "cf-connecting-ip": ME })).status, 404);
  // Healthcheck local direto (sem proxy) continua funcionando.
  const direct = await fetch(srv.base + "/api/health");
  assert.equal(direct.status, 200);
});

test("REQUIRE_PROXY: conexão fora dos proxies confiáveis é recusada", async () => {
  process.env.REQUIRE_PROXY = "true";
  process.env.TRUST_PROXY = "loopback";
  try {
    // Loopback é o proxy confiável aqui → passa.
    assert.equal((await anon("/api/health", ME)).status, 200);
    // Simula outro container chamando a API direto: proxy confiável = só 192.0.2.99 (não somos nós).
    const { createApp } = await import("../src/app.js");
    process.env.TRUST_PROXY = "192.0.2.99";
    const app2 = createApp().listen(0);
    await new Promise((r) => app2.once("listening", r));
    const port = (app2.address() as { port: number }).port;
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { "x-forwarded-for": ME } });
    assert.equal(r.status, 403);
    app2.close();
  } finally {
    delete process.env.REQUIRE_PROXY;
    delete process.env.TRUST_PROXY;
  }
});

test("banco indisponível ao carregar a lista falha fechado e se recupera", async () => {
  setAppDriver({ query: async () => { throw new Error("indisponível"); } });
  await loadAccess();
  assert.notEqual((await anon("/api/health", ME)).status, 200);
  assert.equal((await anon("/api/health", "192.0.2.10")).status, 200); // bootstrap ainda entra
  setAppDriver({ query: (sql, params) => appDb.query(sql, params) });
  await loadAccess();
  assert.equal((await anon("/api/health", ME)).status, 200);
});
