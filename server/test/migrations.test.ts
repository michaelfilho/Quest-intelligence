// Migration 003 (remoção de IA/voz/reunião) aplicada sobre um banco já migrado até a 002, com dados.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

const DIR = new URL("../migrations/", import.meta.url);
const sql = (name: string) => readFileSync(new URL(name, DIR), "utf8");

test("003 preserva usuários, perfis, sessões e auditoria e limpa permissões extintas", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(sql("001_auth.sql"));
  db.exec(sql("002_rinne_n8n_meetings.sql"));

  // Estado "de produção local" antes da remoção
  db.exec(`INSERT INTO roles (id, name, permissions, system, updated_at) VALUES
    ('gestor', 'Gestor', '["projetos.view","rinne_ia.use","reuniao.use"]', 1, 'x'),
    ('so_ia', 'Só IA', '["rinne_voz.use"]', 0, 'x')`);
  db.exec(`INSERT INTO users (id, username, name, password_hash, role_id, grants, denies, created_at, updated_at)
    VALUES (1, 'ana', 'Ana', '$argon2id$x', 'gestor', '["rinne_ia.use","financeiro.view"]', '["rinne_voz.use","producao.view"]', 'x', 'x')`);
  db.exec(`INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at) VALUES ('s1', 1, 'x', 'x', 'x')`);
  db.exec(`INSERT INTO audit_log (at, event) VALUES ('x', 'auth.login')`);
  db.exec(`INSERT INTO app_settings (key, value, updated_at) VALUES ('security.session_idle_minutes', '45', 'x'), ('ai.model', '"x"', 'x'), ('meetings.retention_days', '30', 'x')`);
  db.exec(`INSERT INTO rinne_sessions (id, user_id, mode, title, created_at, updated_at) VALUES ('c1', 1, 'CHAT', 't', 'x', 'x')`);
  db.exec(`INSERT INTO meetings (id, user_id, rinne_session_id, title, state, started_at, updated_at) VALUES ('m1', 1, 'c1', 'r', 'IDLE', 'x', 'x')`);

  db.exec(sql("003_remove_ai_voice_meetings.sql"));

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name));
  for (const t of ["rinne_sessions", "rinne_messages", "n8n_requests", "webhook_nonces", "rinne_exec_contexts", "meetings", "meeting_departments", "meeting_items", "meeting_segments"]) assert.ok(tables.includes(t), `${t} deve permanecer como histórico`);
  for (const t of ["users", "roles", "sessions", "audit_log", "app_settings", "schema_migrations"].filter((t) => t !== "schema_migrations")) assert.ok(tables.includes(t), `${t} deveria permanecer`);

  assert.equal(db.prepare("SELECT count(*) n FROM users").get()?.n, 1);
  assert.equal(db.prepare("SELECT count(*) n FROM sessions").get()?.n, 1);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_log").get()?.n, 1);
  assert.equal(db.prepare("SELECT password_hash h FROM users WHERE id = 1").get()?.h, "$argon2id$x");
  assert.deepEqual(db.prepare("SELECT key FROM app_settings ORDER BY key").all().map((r) => r.key), ["ai.model", "meetings.retention_days", "security.session_idle_minutes"]);
  assert.equal(db.prepare("SELECT count(*) n FROM rinne_sessions").get()?.n, 1);
  assert.equal(db.prepare("SELECT count(*) n FROM meetings").get()?.n, 1);
  assert.deepEqual(JSON.parse(String(db.prepare("SELECT permissions p FROM roles WHERE id = 'gestor'").get()?.p)), ["projetos.view"]);
  assert.deepEqual(JSON.parse(String(db.prepare("SELECT permissions p FROM roles WHERE id = 'so_ia'").get()?.p)), []);
  const u = db.prepare("SELECT grants g, denies d FROM users WHERE id = 1").get()!;
  assert.deepEqual(JSON.parse(String(u.g)), ["financeiro.view"]);
  assert.deepEqual(JSON.parse(String(u.d)), ["producao.view"]);
  db.close();
});

test("a 002 já aplicada não foi alterada e as migrations são sequenciais", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  assert.deepEqual(files, ["001_auth.sql", "002_rinne_n8n_meetings.sql", "003_remove_ai_voice_meetings.sql"]);
});
