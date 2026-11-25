// Homologação isolada e multiplataforma. Não carrega .env nem acessa o PostgreSQL.
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'rinne-homolog-'));
// Snapshot do build: uma nova compilação/limpeza local não pode mudar o artefato sob teste.
cpSync(join(root,'web/dist'),join(dir,'dist'),{recursive:true});
const apiPort = Number(process.env.HOMOLOG_API_PORT ?? 3334);
const webPort = Number(process.env.HOMOLOG_WEB_PORT ?? 4174);
const basePath = process.env.VITE_BASE_PATH ?? '/';
const analyticsFixture=process.env.HOMOLOG_ANALYTICS_FIXTURE==='1';
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: '', DATA_DIR: dir,
  IP_ALLOWLIST_FILE: join(dir, 'ip-allowlist.json'), IP_ALLOWLIST_BOOTSTRAP: '',
  REQUIRE_PROXY: 'false', TRUST_PROXY: 'loopback', COOKIE_SECURE: 'false',
  PORT: String(apiPort), HOST: '127.0.0.1', APP_BASE_PATH: basePath, RINNE_API_TARGET: `http://127.0.0.1:${apiPort}` };
const children = [];
function run(args, options = {}) {
  return spawn(process.execPath, args, { cwd: root, env, windowsHide: true, ...options });
}
const done = p => new Promise((resolve, reject) => { p.once('error', reject); p.once('exit', code => code === 0 ? resolve() : reject(new Error(`processo terminou com ${code}`))); });
for (const port of [apiPort, webPort]) {
  await new Promise((resolve, reject) => {
    const probe = createServer(); probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
try {
  const cli = run(['server/node_modules/tsx/dist/cli.mjs', 'server/src/cli.ts', 'homolog.admin', 'Administrador de Homologação']);
  let output = ''; cli.stdout.on('data', d => output += d);
  await done(cli);
  const password = output.match(/Senha temporária \(exibida só agora\): (\S+)/)?.[1];
  if (!password) throw new Error('senha temporária não gerada');
  for (const [name, args] of [
    ['api', ['server/node_modules/tsx/dist/cli.mjs',analyticsFixture?'server/test/serve-management-fixture.ts':'server/src/index.ts']],
    ['web', [join(root, 'web/node_modules/vite/bin/vite.js'), 'preview', '--outDir',join(dir,'dist'),'--host', '127.0.0.1', '--port', String(webPort), '--strictPort']],
  ]) {
    const log = openSync(join(dir, `${name}.log`), 'a');
    const p = run(args, { cwd: name === 'web' ? join(root, 'web') : root, stdio: ['ignore', log, log] });
    children.push(p);
  }
  const base = `http://127.0.0.1:${webPort}${basePath === '/' ? '' : basePath.replace(/\/$/, '')}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (children.some(p => p.exitCode !== null)) throw new Error(`serviço encerrou; logs: ${dir}`);
    try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  if (!ready) throw new Error('serviços não ficaram prontos');
  await done(run([analyticsFixture?'e2e/management.mjs':'e2e/homologacao.mjs'], { env: { ...env, BASE: base, ADMIN_USER: 'homolog.admin', ADMIN_TEMP_PASSWORD: password }, stdio: 'inherit' }));
} finally {
  for (const p of children) p.kill();
  console.log(`Logs e SQLite temporário: ${dir}`);
}
