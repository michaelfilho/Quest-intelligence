// Instalação limpa em PostgreSQL REAL: banco vazio e bloqueado → roles → migrations (2x) → administrador →
// API → login, sessão, revogação, permissões e módulos sem dados. Uso: npm run test:install
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bootstrapScript, runMigrations, startPostgres, urls } from './pg-temp.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bootstrap = bootstrapScript(readFileSync(new URL('../server/db/bootstrap.sql', import.meta.url), 'utf8'));
const catalog = async () => JSON.parse(execFileSync(process.execPath, ['server/node_modules/tsx/dist/cli.mjs', '-e', "import('./shared/catalog.ts').then(c=>console.log(JSON.stringify({INDICATORS:Object.keys(c.INDICATORS),CHARTS:Object.keys(c.CHARTS),TABLES:Object.keys(c.TABLES),ACCESS:c.ACCESS_MODULES})))"], { cwd: root, encoding: 'utf8' }));
const pg = await startPostgres();
let api;
let done = 0;
const step = (name) => console.log(`OK ${++done}. ${name}`);
try {
  // Estado da VPS: banco recriado vazio, conexões bloqueadas, role antiga ainda existente.
  assert.equal(pg.psql('postgres', "CREATE DATABASE quest_rinne; ALTER DATABASE quest_rinne ALLOW_CONNECTIONS false; CREATE ROLE quest_rinne_app_ro LOGIN PASSWORD 'antiga';").status, 0);
  assert.notEqual(pg.psql('quest_rinne', 'select 1').status, 0);
  step('ponto de partida reproduzido (banco bloqueado)');

  const first = pg.psql('postgres', bootstrap);
  assert.equal(first.status, 0, first.err);
  assert.equal(pg.psql('postgres', bootstrap).status, 0);
  assert.equal(pg.psql('postgres', "SELECT datallowconn FROM pg_database WHERE datname='quest_rinne'").out, 't');
  step('roles criadas e conexões liberadas (reexecutável)');

  const old = pg.psql('quest_rinne', 'select 1', { user: 'quest_rinne_app_ro', password: 'antiga' });
  assert.notEqual(old.status, 0);
  assert.match(old.err, /permission denied|CONNECT/i);
  step('credencial antiga não consegue conectar');

  assert.match(runMigrations(pg.port), /001_app\.sql, 002_data\.sql, 003_grants\.sql/);
  assert.match(runMigrations(pg.port), /Banco já atualizado/);
  step('migrations aplicadas e reexecução sem efeito');

  const attrs = pg.psql('postgres', "SELECT string_agg(rolname||':'||rolsuper||rolcreaterole||rolcreatedb||rolcanlogin, ',' ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'qi\\_%'").out;
  assert.equal(attrs, 'qi_app:falsefalsefalsetrue,qi_ingest:falsefalsefalsefalse,qi_migrator:falsefalsefalsetrue,qi_owner:falsefalsefalsefalse,qi_reader:falsefalsefalsetrue');
  const as = (user, password, sql) => pg.psql('quest_rinne', sql, { user, password });
  assert.notEqual(as('qi_reader', 'reader-local-teste', 'SELECT * FROM app.users').status, 0);
  assert.notEqual(as('qi_app', 'app-local-teste', 'SELECT * FROM core.clients').status, 0);
  assert.notEqual(as('qi_app', 'app-local-teste', 'CREATE TABLE app.x (a int)').status, 0);
  assert.notEqual(as('qi_app', 'app-local-teste', "UPDATE app.audit_log SET actor='x'").status, 0);
  step('privilégios mínimos conferidos no servidor real');

  const env = { ...process.env, NODE_ENV: 'test', ...urls(pg.port), MIGRATION_DATABASE_URL: '', COOKIE_SECURE: 'false', REQUIRE_PROXY: 'false', IP_ALLOWLIST_BOOTSTRAP: '', APP_BASE_PATH: '/core/', PORT: '0', HOST: '127.0.0.1' };
  const cli = execFileSync(process.execPath, ['server/node_modules/tsx/dist/cli.mjs', 'server/src/cli.ts', 'primeiro.admin', 'Primeiro Administrador'], { cwd: root, env, encoding: 'utf8' });
  const temporary = cli.match(/Senha temporária \(exibida só agora\): (\S+)/)?.[1];
  assert.ok(temporary);
  assert.equal(pg.psql('quest_rinne', 'SELECT count(*) FROM app.users WHERE password_hash LIKE \'$argon2id$%\'').out, '1');
  step('primeiro administrador criado pelo CLI');

  const port = 3900 + Math.floor(Math.random() * 90);
  const start = async () => {
    api = spawn(process.execPath, ['server/node_modules/tsx/dist/cli.mjs', 'server/src/index.ts'], { cwd: root, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; const keep = (d) => { log += d; if (process.env.SHOW_API) process.stdout.write(d); }; api.stdout.on('data', keep); api.stderr.on('data', keep);
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch { /* aguardando */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('API não subiu: ' + log.slice(-1500));
  };
  const stopApi = async () => { const exited = new Promise((r) => api.once('exit', r)); api.kill(); await exited; };
  await start();
  const base = `http://127.0.0.1:${port}/api`;
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const r = await fetch(base + path, { method, headers: { 'x-requested-with': 'rinne', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    return { status: r.status, body: text && r.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text, cookie: r.headers.getSetCookie()[0] };
  };
  const health = await call('/health');
  assert.equal(health.body.database, 'CONNECTED');
  assert.equal((await call('/modules')).status, 401);
  step('API no ar com PostgreSQL conectado e rotas protegidas');

  const login = await call('/auth/login', { method: 'POST', body: { username: 'primeiro.admin', password: temporary } });
  assert.equal(login.status, 204);
  assert.match(login.cookie, /Path=\/core\/; HttpOnly; SameSite=Strict/);
  let cookie = login.cookie.split(';')[0];
  assert.equal((await call('/modules', { cookie })).body.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await call('/auth/password', { method: 'POST', cookie, body: { current: temporary, next: 'Instalacao-Limpa-2026!' } })).status, 204);
  assert.equal((await call('/modules', { cookie })).status, 200);
  step('login, troca obrigatória de senha e cookie em /core/');

  await stopApi();
  await start();
  assert.equal((await call('/auth/me', { cookie })).body.username, 'primeiro.admin');
  step('sessão persiste após reiniciar a API');

  const other = (await call('/auth/login', { method: 'POST', body: { username: 'primeiro.admin', password: 'Instalacao-Limpa-2026!' } })).cookie.split(';')[0];
  const sessions = (await call('/auth/sessions', { cookie })).body;
  assert.equal(sessions.length, 2);
  assert.equal((await call(`/auth/sessions/${sessions.find((s) => !s.current).id}`, { method: 'DELETE', cookie })).status, 204);
  assert.equal((await call('/auth/me', { cookie: other })).status, 401);
  step('sessões listadas e revogadas');

  const created = await call('/admin/users', { method: 'POST', cookie, body: { username: 'gestor.dep', name: 'Gestor', roleId: 'gestor', scopeDepartment: 'A' } });
  assert.equal(created.status, 201);
  const g = (await call('/auth/login', { method: 'POST', body: { username: 'gestor.dep', password: created.body.temporaryPassword } })).cookie.split(';')[0];
  assert.equal((await call('/auth/password', { method: 'POST', cookie: g, body: { current: created.body.temporaryPassword, next: 'Outra-Senha-Segura-77' } })).status, 204);
  assert.equal((await call('/modules/financeiro?start=2026-01-01&end=2026-01-31', { cookie: g })).status, 403);
  assert.equal((await call('/modules/timesheet?start=2026-01-01&end=2026-01-31', { cookie: g })).body.filters.department, 'A');
  assert.equal((await call('/admin/users', { cookie: g })).status, 403);
  step('permissões por perfil e escopo de departamento');

  const modules = (await call('/modules', { cookie })).body;
  for (const m of modules.filter((m) => !m.detailOf)) {
    const r = await call(`/modules/${m.id}?start=2026-01-01&end=2026-01-31`, { cookie });
    assert.equal(r.status, 200, m.id);
    const bad = [...r.body.indicators, ...r.body.charts].filter((x) => x.status === 'ERROR' || x.reasonCode === 'QUERY_FAILURE' || x.reasonCode === 'MISSING_FIELD');
    assert.deepEqual(bad.map((x) => `${x.id}:${x.reason}`), [], m.id);
    for (const t of m.tables) {
      const table = await call(`/tables/${t}?start=2026-01-01&end=2026-01-31`, { cookie });
      assert.equal(table.status, 200, t);
      assert.notEqual(table.body.status, 'ERROR', `${t}: ${table.body.reason}`);
      if (t !== 'alertas') assert.equal(table.body.rows.length, 0, t + ' deveria estar vazia');
    }
  }
  step(`${modules.length} módulos e suas tabelas respondem com o banco vazio`);

  const { INDICATORS, CHARTS, TABLES, ACCESS } = await catalog();
  const failures = [];
  for (const [kind, ids] of [['indicators', INDICATORS], ['charts', CHARTS], ['tables', TABLES]]) for (const id of ids) {
    const r = await call(`/${kind}/${id}?start=2026-01-01&end=2026-01-31`, { cookie });
    const result = r.body?.result ?? r.body;
    // Itens do catálogo que não pertencem a nenhum módulo não são acessíveis por ninguém (403).
    if (r.status === 403 && !ACCESS[kind][id]) continue;
    if (r.status !== 200 || result?.status === 'ERROR') failures.push(`${kind}/${id}: ${r.status} ${result?.reason ?? ''}`);
  }
  assert.deepEqual(failures, []);
  step(`${INDICATORS.length} indicadores, ${CHARTS.length} gráficos e ${TABLES.length} tabelas sem erro de consulta`);

  assert.equal((await call('/access', { method: 'PUT', cookie, body: { enabled: true, entries: [{ cidr: '127.0.0.1', label: 'local' }] } })).status, 200);
  assert.equal(pg.psql('quest_rinne', 'SELECT enabled FROM app.access_state').out, 't');
  assert.equal((await call('/access', { method: 'PUT', cookie, body: { enabled: false, entries: [] } })).status, 200);
  for (let i = 0; i < 2; i++) assert.equal((await call('/auth/login', { method: 'POST', body: { username: 'ninguem' + i, password: 'x' } })).status, 401);
  const parallel = await Promise.all(Array.from({ length: 8 }, (_, i) => call('/auth/login', { method: 'POST', body: { username: 'ninguem.p' + i, password: 'x' } })));
  assert.ok(parallel.every((r) => r.status === 429), parallel.map((r) => r.status).join(','));
  step('controle por IP persistido e bloqueio atômico de tentativas');

  assert.equal((await call('/auth/logout', { method: 'POST', cookie })).status, 204);
  assert.equal((await call('/auth/me', { cookie })).status, 401);
  assert.ok(Number(pg.psql('quest_rinne', "SELECT count(*) FROM app.audit_log WHERE event IN ('auth.login','auth.logout','user.create')").out) >= 4);
  step('logout encerra a sessão e a auditoria está gravada');
  await stopApi();
  api = null;

  const dump = `${pg.dir}/backup.dump`;
  execFileSync(pg.tool('pg_dump'), ['-h', '127.0.0.1', '-p', String(pg.port), '-U', 'postgres', '-d', 'quest_rinne', '-Fc', '-f', dump], { env: { ...process.env, PGPASSWORD: pg.superPassword } });
  assert.match(execFileSync(pg.tool('pg_restore'), ['--list', dump], { encoding: 'utf8' }), /TABLE DATA app users/);
  step('backup pg_dump legível (usado nas atualizações)');
  console.log(`\n${done} etapas da instalação limpa aprovadas em PostgreSQL real.`);
} finally {
  api?.kill();
  pg.stop();
}
