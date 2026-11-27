// SIMULAÇÃO de deploy/install.sh e deploy/update.sh: o script real roda inteiro; docker, git e flock são
// falsos, mas o SQL (bootstrap, verificações, isolamento) e as migrations rodam em PostgreSQL REAL e
// temporário. Não substitui a homologação na VPS. Uso: npm run test:deploy
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPostgres } from './pg-temp.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)).replaceAll('\\', '/').replace(/\/$/, '');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const posix = (p) => p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_m, d) => `/${d.toLowerCase()}`);
const sim = mkdtempSync(join(tmpdir(), 'qi-deploy-'));
const S = posix(sim);
const pg = await startPostgres();
let done = 0;
const step = (name) => console.log(`OK ${++done}. ${name}`);
const file = (path, content) => { mkdirSync(join(sim, path, '..'), { recursive: true }); writeFileSync(join(sim, path), content.replace(/\r\n/g, '\n')); };
const executable = (path, content) => { file(path, content); chmodSync(join(sim, path), 0o755); };

try {
  const sha = 'a'.repeat(40);
  const runtime = `${S}/opt/apps/quest-rinne-web-runtime`;
  const reference = `${S}/opt/backups/quest-intelligence-cleanup-20261127-121400`;
  mkdirSync(join(sim, 'opt/apps/quest-rinne-web'), { recursive: true });
  mkdirSync(join(sim, 'opt/apps/quest-rinne-web-runtime/deploy'), { recursive: true });
  file('opt/apps/quest-rinne-web-runtime/docker-compose.prod.yml', 'services: {}\n');
  file('opt/apps/quest-rinne-web-runtime/security.yml', 'services: {}\n');
  file('opt/apps/quest-rinne-web-runtime/deploy/.env.production', 'PRESERVADO=1\n');
  const inspect = (service, files) => ({ Created: '2026-11-27', Config: { Labels: { 'com.docker.compose.project': 'quest-rinne-web', 'com.docker.compose.service': service, 'com.docker.compose.project.working_dir': runtime, 'com.docker.compose.project.config_files': files, 'com.docker.compose.project.environment_file': `${runtime}/deploy/.env.production`, ...(service === 'web' ? { 'traefik.http.routers.core.middlewares': 'quest-rinne-web-tailscale-only' } : {}) } }, NetworkSettings: { Networks: service === 'api' ? { 'quest-rinne_private': {} } : {} } });
  file('opt/backups/quest-intelligence-cleanup-20261127-121400/containers.private.json', JSON.stringify([inspect('api', `${runtime}/docker-compose.prod.yml`), inspect('web', `${runtime}/docker-compose.prod.yml,${runtime}/security.yml`)]));
  const base = { services: {
    api: { environment: { PRESERVADO: '1', DATABASE_URL: 'postgres://quest_rinne_app_ro:antiga@quest-rinne-db-1:5432/quest_rinne' }, networks: { default: null, postgres: null }, volumes: [] },
    web: { environment: {}, labels: { 'traefik.http.routers.core.middlewares': 'quest-rinne-web-tailscale-only' }, ports: [{ published: '18372', target: 80 }], networks: { default: null }, volumes: [] },
  }, networks: { default: { name: 'quest-rinne-web_default' }, postgres: { name: 'quest-rinne_private' } } };
  file('base.json', JSON.stringify(base));

  // docker falso: node roda de verdade; psql e migrations vão para o PostgreSQL temporário.
  executable('bin/docker.mjs', `
import { spawnSync, execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
const sim=${JSON.stringify(sim.replaceAll('\\', '/'))}, args=process.argv.slice(process.argv[2]==='--'?3:2), line=args.join(' ');
appendFileSync(sim+'/docker.log', (args[0]==='run' ? 'run node' : line)+'\\n');
const out=(t)=>process.stdout.write(t+'\\n');
const stdin=()=>readFileSync(0,'utf8');
const up=existsSync(sim+'/containers');
const assertMount=(m)=>{ if(!(m.endsWith(':/reference:ro') && m.includes('quest-intelligence-cleanup-'))){ console.error('montagem além do backup: '+m); process.exit(1);} };
if(args[0]==='info'||args[0]==='network'||line==='compose version')process.exit(0);
if(args[0]==='inspect'){ if(line.includes('State.Running'))out('true'); else if(line.includes('Networks'))out('{"quest-rinne_private":{}}'); else process.exit(up?0:1); process.exit(0); }
if(args[0]==='ps'){ if(up) out(args.includes('label=com.docker.compose.service=web')?'webid':'apiid'); process.exit(0); }
if(args[0]==='rm'){ rmSync(sim+'/containers',{force:true}); process.exit(0); }
if(args[0]==='run'){
  const i=args.indexOf('-e'); let code=args[i+1]; const rest=args.slice(i+2); if(rest[0]==='--')rest.shift();
  const v=args.indexOf('-v'); // pasta do backup montada em /reference
  if(v>0){ assertMount(args[v+1]); code=code.replace("'/reference'",JSON.stringify(args[v+1].replace(':/reference:ro','').replace(/^\\/c\\//,'C:/'))); }
  code=code.replaceAll('/opt/apps', ${JSON.stringify(`${S}/opt/apps`)});
  const r=spawnSync(process.execPath,['-e',code,'--',...rest],{input:args.includes('-i')?stdin():undefined,encoding:'utf8'});
  process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status);
}
if(args[0]==='exec'){
  const database=args.at(-1);
  const r=spawnSync(${JSON.stringify(pg.tool('psql'))},['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','${pg.port}','-U','postgres','-d',database],{input:stdin(),env:{...process.env,PGPASSWORD:'${pg.superPassword}',PGCLIENTENCODING:'UTF8'},encoding:'utf8'});
  process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status);
}
if(args[0]==='compose'){
  if(line.includes(' config ')){
    const config=JSON.parse(readFileSync(sim+'/base.json','utf8'));
    const o=args.map((a,i)=>args[i-1]==='-f'?a:null).filter(a=>a&&a.endsWith('compose.override.json'))[0];
    if(o){ const override=JSON.parse(readFileSync(o.replace(/^\\/c\\//,'C:/'),'utf8'));
      for(const [name,s] of Object.entries(override.services||{})){ Object.assign(config.services[name],{image:s.image,build:s.build}); Object.assign(config.services[name].environment,s.environment||{});
        for(const f of s.env_file||[]) for(const l of readFileSync(f.replace(/^\\/c\\//,'C:/'),'utf8').split('\\n').filter(Boolean)){ const k=l.slice(0,l.indexOf('=')); config.services[name].environment[k]=l.slice(l.indexOf('=')+1); } } }
    out(JSON.stringify(config));
  } else if(line.includes('src/migrate.ts')){
    const url=process.env.MIGRATION_DATABASE_URL.replace('quest-rinne-db-1:5432','127.0.0.1:${pg.port}');
    const r=spawnSync(process.execPath,['server/node_modules/tsx/dist/cli.mjs','server/src/migrate.ts'],{cwd:${JSON.stringify(root)},env:{...process.env,NODE_ENV:'test',MIGRATION_DATABASE_URL:url},encoding:'utf8'});
    process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status);
  } else if(line.includes(' up -d')) writeFileSync(sim+'/containers','1');
  else if(line.includes(' rm -sf')) rmSync(sim+'/containers',{force:true});
  process.exit(0);
}
process.exit(0);
`);
  executable('bin/docker', `#!/usr/bin/env bash\nexec "${posix(process.execPath)}" "${sim.replaceAll('\\', '/')}/bin/docker.mjs" -- "$@"\n`);
  executable('bin/flock', '#!/usr/bin/env bash\nexit 0\n');
  executable('bin/sleep', '#!/usr/bin/env bash\nexit 0\n');
  executable('bin/git', `#!/usr/bin/env bash
if [[ "$1" == -C ]]; then shift 2; fi
case "$1" in
  fetch|merge-base) ;;
  rev-parse) echo ${sha} ;;
  archive) cd "${posix(root)}" && tar -c --exclude=node_modules --exclude=dist server shared deploy package.json ../"$(basename "$PWD")"/frontend/Dockerfile 2>/dev/null || tar -c --exclude=node_modules --exclude=dist server shared deploy package.json frontend/Dockerfile ;;
  ls-tree) echo package.json ;;
  show) cat "${S}/fake-prepare.sh" ;;
esac
`);
  // check-release é substituído por um resultado controlado.
  executable('bin/tar', `#!/usr/bin/env bash\n/usr/bin/tar "$@" || exit $?\nif [[ "$1" == -x ]]; then printf 'echo "{\\\\"internalHealth\\\\":\\\\"OK\\\\"}"; exit \${CHECK_EXIT:-0}\\n' > "$3/deploy/check-release.sh"; fi\n`);

  const script = (name) => readFileSync(join(root, 'deploy', name), 'utf8').replace(/\r\n/g, '\n').replaceAll('/opt/', `${S}/opt/`).replace('/tmp/quest-rinne-update.lock', `${S}/lock`);
  const run = (name, args = [], env = {}) => {
    const r = spawnSync(bash, ['-c', `export PATH="${S}/bin:$PATH"; export MSYS_NO_PATHCONV=1; bash -s -- ${args.join(' ')}`], { input: script(name), env: { ...process.env, ...env }, encoding: 'utf8' });
    return { status: r.status, text: (r.stdout ?? '') + (r.stderr ?? '') };
  };
  const sql = (database, query) => pg.psql(database, query).out;
  const state = () => ({ connections: sql('postgres', "SELECT datallowconn FROM pg_database WHERE datname='quest_rinne'"), roles: sql('postgres', "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'qi\\_%'"), containers: existsSync(join(sim, 'containers')) });

  pg.psql('postgres', 'CREATE DATABASE quest_rinne; ALTER DATABASE quest_rinne ALLOW_CONNECTIONS false');

  let r = run('install.sh', ['--check']);
  assert.equal(r.status, 0, r.text);
  assert.deepEqual(state(), { connections: 'f', roles: '0', containers: false });
  assert.match(r.text, /security\.yml/);
  step('--check reconcilia o Compose (incluindo o override só do Web) sem tocar no banco');

  r = run('install.sh', [], { CHECK_EXIT: '1' });
  assert.notEqual(r.status, 0);
  assert.match(r.text, /Validação falhou/);
  assert.equal(state().containers, false);
  assert.equal(sql('quest_rinne', 'SELECT count(*) FROM app_meta.migrations'), '3');
  step('validação com falha interrompe a aplicação e mantém o banco migrado');

  r = run('install.sh');
  assert.equal(r.status, 0, r.text);
  assert.deepEqual(state(), { connections: 't', roles: '5', containers: true });
  assert.match(r.text, /Banco já atualizado/);
  assert.match(r.text, /user:admin/);
  const secrets = readFileSync(join(sim, 'opt/apps/quest-rinne-web-runtime/deploy/secrets/db.env'), 'utf8');
  assert.match(secrets, /DATABASE_URL=postgres:\/\/qi_reader:[0-9a-f]{48}@quest-rinne-db-1/);
  assert.ok(!/[0-9a-f]{48}/.test(r.text), 'senha vazou na saída');
  assert.equal(readFileSync(join(sim, 'opt/apps/quest-rinne-web-runtime/deploy/.env.production'), 'utf8'), 'PRESERVADO=1\n');
  const passwordOf = (name) => secrets.match(new RegExp(`^${name}=postgres://[^:]+:([0-9a-f]+)@`, 'm'))[1];
  assert.equal(pg.psql('quest_rinne', 'SELECT 1', { user: 'qi_app', password: passwordOf('APP_DATABASE_URL') }).out, '1');
  step('instalação completa e reexecutada: credenciais novas funcionam, arquivos antigos intactos, sem senha na saída');

  r = run('install.sh');
  assert.notEqual(r.status, 0);
  assert.match(r.text, /Já existem containers/);
  step('recusa instalar sobre uma aplicação em execução');

  r = run('install.sh', ['--stop']);
  assert.equal(r.status, 0, r.text);
  assert.equal(state().containers, false);
  assert.equal(state().connections, 't');
  step('--stop interrompe sem apagar dados');

  pg.psql('postgres', 'DROP DATABASE quest_rinne WITH (FORCE)');
  pg.psql('postgres', 'CREATE DATABASE quest_rinne');
  pg.psql('quest_rinne', 'CREATE TABLE public.de_outro_sistema (a int)');
  pg.psql('postgres', 'ALTER DATABASE quest_rinne ALLOW_CONNECTIONS false');
  r = run('install.sh');
  assert.notEqual(r.status, 0);
  assert.match(r.text, /não está vazio/);
  assert.equal(state().connections, 'f');
  assert.equal(state().containers, false);
  step('banco não vazio: aborta, bloqueia de novo e não apaga nada');

  // update.sh: preparação falsa; migrations reais; rollback quando a validação falha.
  r = run('update.sh');
  assert.notEqual(r.status, 0);
  assert.match(r.text, /use deploy\/install\.sh/);
  writeFileSync(join(sim, 'containers'), '1');
  pg.psql('postgres', 'ALTER DATABASE quest_rinne ALLOW_CONNECTIONS true');
  pg.psql('quest_rinne', 'DROP TABLE public.de_outro_sistema; GRANT CONNECT ON DATABASE quest_rinne TO qi_migrator; GRANT CREATE ON DATABASE quest_rinne TO qi_owner');
  file('fake-prepare.sh', `STAGE="${S}/stage"; BACKUP="${S}/backup"; rm -rf "$STAGE" "$BACKUP"; mkdir -p "$STAGE/deploy" "$BACKUP"
echo x > "$BACKUP/input"; sha256sum "$BACKUP/input" > "$BACKUP/input-files.sha256"; sha256sum "$BACKUP/input" > "$BACKUP/db.dump.sha256"
echo '{}' > "$STAGE/compose.override.json"; COMPOSE=(docker compose -p quest-rinne-web -f base.yml); declare -p COMPOSE > "$STAGE/compose-args.private.sh"
printf 'exit \${CHECK_EXIT:-0}\\n' > "$STAGE/deploy/check-release.sh"
printf 'PREPARADO\\nRelease: %s\\nBackup privado: %s\\n' "$STAGE" "$BACKUP"
`);
  const log = () => readFileSync(join(sim, 'docker.log'), 'utf8');
  for (const code of ['0', '1']) {
    writeFileSync(join(sim, 'docker.log'), '');
    r = run('update.sh', [], { CHECK_EXIT: code });
    assert.equal(r.status, Number(code), r.text);
    assert.match(log(), /src\/migrate\.ts[\s\S]*up -d --no-deps --no-build/);
    assert.equal(/rollback\.private\.json up/.test(log()), code === '1');
  }
  step('update.sh: migrations antes da subida; rollback das imagens só quando a validação falha');
  console.log(`\n${done} cenários de deploy aprovados (docker/git simulados; PostgreSQL real).`);
} finally {
  pg.stop();
  rmSync(sim, { recursive: true, force: true, maxRetries: 5 });
}
