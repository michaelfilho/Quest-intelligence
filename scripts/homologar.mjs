// Homologação no navegador sobre PostgreSQL REAL e temporário (nunca banco existente, nunca a VPS).
// Padrão: banco vazio, como uma instalação nova. HOMOLOG_ANALYTICS_FIXTURE=1: dados sintéticos de teste.
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, openSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapScript, runMigrations, startPostgres, urls } from './pg-temp.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'qi-homolog-'));
// Snapshot do build: uma nova compilação/limpeza local não pode mudar o artefato sob teste.
cpSync(join(root, 'frontend/dist'), join(dir, 'dist'), { recursive: true });
const apiPort = Number(process.env.HOMOLOG_API_PORT ?? 3334);
const webPort = Number(process.env.HOMOLOG_WEB_PORT ?? 4174);
const basePath = process.env.VITE_BASE_PATH ?? '/';
const fixture = process.env.HOMOLOG_ANALYTICS_FIXTURE === '1';
for (const port of [apiPort, webPort]) {
  await new Promise((resolve, reject) => {
    const probe = createServer(); probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
const pg = await startPostgres();
const children = [];
try {
  const must = (r) => { if (r.status !== 0) throw new Error(r.err); };
  must(pg.psql('postgres', 'CREATE DATABASE quest_rinne'));
  must(pg.psql('postgres', bootstrapScript(readFileSync(join(root, 'server/db/bootstrap.sql'), 'utf8'))));
  runMigrations(pg.port);
  if (fixture) must(pg.psql('quest_rinne', readFileSync(join(root, 'server/test/seed-synthetic.sql'), 'utf8')));

  const env = { ...process.env, NODE_ENV: 'test', ...urls(pg.port), MIGRATION_DATABASE_URL: '', IP_ALLOWLIST_BOOTSTRAP: '',
    REQUIRE_PROXY: 'false', TRUST_PROXY: 'loopback', COOKIE_SECURE: 'false',
    PORT: String(apiPort), HOST: '127.0.0.1', APP_BASE_PATH: basePath, RINNE_API_TARGET: `http://127.0.0.1:${apiPort}` };
  const run = (args, options = {}) => spawn(process.execPath, args, { cwd: root, env, windowsHide: true, ...options });
  const done = (p) => new Promise((resolve, reject) => { p.once('error', reject); p.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`processo terminou com ${code}`))); });

  const cli = run(['server/node_modules/tsx/dist/cli.mjs', 'server/src/cli.ts', 'homolog.admin', 'Administrador de Homologação']);
  let output = ''; cli.stdout.on('data', (d) => { output += d; });
  await done(cli);
  const password = output.match(/Senha temporária \(exibida só agora\): (\S+)/)?.[1];
  if (!password) throw new Error('senha temporária não gerada');
  for (const [name, args] of [
    ['api', ['server/node_modules/tsx/dist/cli.mjs', 'server/src/index.ts']],
    ['web', [join(root, 'frontend/node_modules/vite/bin/vite.js'), 'preview', '--outDir', join(dir, 'dist'), '--host', '127.0.0.1', '--port', String(webPort), '--strictPort']],
  ]) {
    const log = openSync(join(dir, `${name}.log`), 'a');
    children.push(run(args, { cwd: name === 'web' ? join(root, 'frontend') : root, stdio: ['ignore', log, log] }));
  }
  const base = `http://127.0.0.1:${webPort}${basePath === '/' ? '' : basePath.replace(/\/$/, '')}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (children.some((p) => p.exitCode !== null)) throw new Error(`serviço encerrou; logs: ${dir}`);
    try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch { /* aguardando */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) throw new Error('serviços não ficaram prontos');
  await done(run([fixture ? 'e2e/management.mjs' : 'e2e/homologacao.mjs'], { env: { ...env, BASE: base, ADMIN_USER: 'homolog.admin', ADMIN_TEMP_PASSWORD: password }, stdio: 'inherit' }));
} finally {
  for (const p of children) p.kill();
  pg.stop();
  console.log(`Logs temporários: ${dir}`);
}
