// Ambiente isolado por arquivo de teste: SQLite temporário, sem PostgreSQL, sem serviços externos.
// Usuários e senhas aqui são fixtures de teste (nunca usados fora dos testes).
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DIR = mkdtempSync(join(tmpdir(), "rinne-test-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.DATA_DIR = DIR;
process.env.IP_ALLOWLIST_FILE = join(DIR, "ip-allowlist.json");
process.env.COOKIE_SECURE = "false";

const { createApp } = await import("../src/app.js");
const { store, closeStore, now } = await import("../src/store.js");
const { hashPassword } = await import("../src/passwords.js");

export const PASSWORD = "Senha-de-teste-forte-123";

export async function startServer() {
  const server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    stop: () => {
      server.close();
      closeStore();
      rmSync(DIR, { recursive: true, force: true });
    },
  };
}

export async function createUser(username: string, roleId: string | null, o: { grants?: string[]; denies?: string[]; scope?: string; mustChange?: boolean; active?: boolean; password?: string } = {}) {
  const t = now();
  const r = store()
    .prepare("INSERT INTO users (username, name, password_hash, role_id, grants, denies, scope_department, active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(username, username, await hashPassword(o.password ?? PASSWORD), roleId, JSON.stringify(o.grants ?? []), JSON.stringify(o.denies ?? []), o.scope ?? null, o.active === false ? 0 : 1, o.mustChange ? 1 : 0, t, t);
  return Number(r.lastInsertRowid);
}

/** Cliente HTTP com cookie de sessão e IP simulado (X-Forwarded-For; a API confia em loopback como proxy). */
export class Client {
  cookie = "";
  constructor(private base: string, public ip = "203.0.113.10") {}

  async req(path: string, o: { method?: string; body?: unknown; headers?: Record<string, string>; csrf?: boolean } = {}) {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, ...(o.headers ?? {}) };
    if (this.cookie) headers.cookie = this.cookie;
    if (o.csrf !== false && o.method && o.method !== "GET") headers["x-requested-with"] = "rinne";
    if (o.body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(this.base + path, { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : typeof o.body === "string" ? o.body : JSON.stringify(o.body) });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";");
      this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const text = await r.text();
    let body: any = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* não-JSON */
    }
    return { status: r.status, body, headers: r.headers };
  }

  login(username: string, password = PASSWORD) {
    return this.req("/api/auth/login", { method: "POST", body: { username, password } });
  }
}
