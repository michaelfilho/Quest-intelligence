// PostgreSQL REAL e temporário para testes locais, preparado como a VPS: banco quest_rinne vazio e com
// ALLOW_CONNECTIONS false; depois bootstrap.sql (roles) e migrations. Requer os binários do PostgreSQL
// (PG_BIN, ou a instalação padrão). Nunca usa banco existente.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const exe = process.platform === 'win32' ? '.exe' : '';

export function pgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const base = process.platform === 'win32' ? 'C:/Program Files/PostgreSQL' : '/usr/lib/postgresql';
  const versions = existsSync(base) ? readdirSync(base).sort((a, b) => Number(b) - Number(a)) : [];
  const found = versions.map((v) => join(base, v, 'bin')).find((dir) => existsSync(join(dir, 'initdb' + exe)));
  if (!found) throw new Error('PostgreSQL não encontrado: defina PG_BIN com a pasta dos binários.');
  return found;
}

const freePort = () => new Promise((resolve) => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

export async function startPostgres() {
  const bin = pgBin();
  const dir = mkdtempSync(join(tmpdir(), 'qi-pg-'));
  const data = join(dir, 'data');
  const port = await freePort();
  const superPassword = 'super-local-teste';
  writeFileSync(join(dir, 'pw'), superPassword);
  const tool = (name) => join(bin, name + exe);
  execFileSync(tool('initdb'), ['-D', data, '-U', 'postgres', '--pwfile', join(dir, 'pw'), '--auth=scram-sha-256', '-E', 'UTF8', '--locale=C'], { stdio: 'pipe' });
  // pg_ctl sem pipes: no Windows o servidor herdaria o stdout e a chamada não retornaria.
  const started = spawnSync(tool('pg_ctl'), ['-D', data, '-l', join(dir, 'server.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'], { stdio: 'ignore' });
  if (started.status !== 0) throw new Error(`PostgreSQL temporário não iniciou; veja ${join(dir, 'server.log')}`);

  const psql = (database, input, { user = 'postgres', password = superPassword, args = [] } = {}) => {
    const r = spawnSync(tool('psql'), ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', user, '-d', database, ...args], { input, env: { ...process.env, PGPASSWORD: password, PGCLIENTENCODING: 'UTF8' }, encoding: 'utf8' });
    return { status: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
  };
  const stop = () => { spawnSync(tool('pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore' }); rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); };
  return { port, dir, bin, psql, tool, stop, superPassword };
}

export const passwords = { migrator: 'migrator-local-teste', app: 'app-local-teste', reader: 'reader-local-teste' };
export const urls = (port) => ({
  DATABASE_URL: `postgres://qi_reader:${passwords.reader}@127.0.0.1:${port}/quest_rinne`,
  APP_DATABASE_URL: `postgres://qi_app:${passwords.app}@127.0.0.1:${port}/quest_rinne`,
  MIGRATION_DATABASE_URL: `postgres://qi_migrator:${passwords.migrator}@127.0.0.1:${port}/quest_rinne`,
});
export const bootstrapScript = (readFile) => `\\set db quest_rinne\n\\set migrator_password ${passwords.migrator}\n\\set app_password ${passwords.app}\n\\set reader_password ${passwords.reader}\n` + readFile;

export function runMigrations(port) {
  return execFileSync(process.execPath, ['server/node_modules/tsx/dist/cli.mjs', 'server/src/migrate.ts'], { cwd: root, env: { ...process.env, NODE_ENV: 'test', MIGRATION_DATABASE_URL: urls(port).MIGRATION_DATABASE_URL }, encoding: 'utf8' }).trim();
}
