import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { existsSync, mkdtempSync, rmSync,writeFileSync,readFileSync } from "node:fs";
import { spawnSync } from 'node:child_process';
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const { renderRelease, verifyRunning } = createRequire(import.meta.url)("../../deploy/render-release.cjs");
const {check}=createRequire(import.meta.url)('../../deploy/check-api.cjs');
test('verificação interna exige PostgreSQL disponível e sessão protegida sem headers de proxy',async()=>{
  const ok=async(url:string,options:unknown)=>{assert.equal(options,undefined);assert.ok(url.startsWith('http://127.0.0.1:'));return url.endsWith('/health')?new Response(JSON.stringify({status:'ok',database:'CONNECTED'})):new Response('',{status:401});};
  await check(ok);
  await assert.rejects(()=>check(async()=>new Response('',{status:403})));
  await assert.rejects(()=>check(async()=>new Response(JSON.stringify({status:'ok',database:'DATABASE_UNAVAILABLE'}))));
  await assert.rejects(()=>check(async(url:string)=>url.endsWith('/health')?new Response(JSON.stringify({status:'ok',database:'CONNECTED'})):new Response('{}')));
});
test('stream binário preserva o SQLite consistente e o script não usa docker cp',()=>{
  const dir=mkdtempSync(join(tmpdir(),'rinne-stream-test-'));
  try {
    const source=join(dir,'source.db'),target=join(dir,'target.db');
    const db=new DatabaseSync(source);db.exec("CREATE TABLE sample(name TEXT); INSERT INTO sample VALUES('Criação')");db.close();
    const stream=spawnSync(process.execPath,['-e','require("node:fs").createReadStream(process.argv[1]).pipe(process.stdout)',source],{encoding:null});
    assert.equal(stream.status,0);writeFileSync(target,stream.stdout);assert.deepEqual(readFileSync(source),readFileSync(target));
    const copy=new DatabaseSync(target,{readOnly:true});assert.equal(copy.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');assert.equal(copy.prepare('SELECT name FROM sample').get()?.name,'Criação');copy.close();
    const script=readFileSync(new URL('../../deploy/prepare-release.sh',import.meta.url),'utf8');
    assert.ok(!/docker cp\s/.test(script));assert.ok(script.includes('sha256sum --check --status'));assert.ok(script.includes('check-api.cjs'));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
const config = () => ({ services: {
  api: { environment: { DATABASE_URL:'fixture-readonly', TRUST_PROXY:'172.1.2.3' }, volumes:[{ type:'bind',source:'/opt/private/data',target:'/app/server/data' }], networks:['postgres'] },
  web: { environment: { API_UPSTREAM:'api:3333' }, ports:[{published:18372,target:80,host_ip:'127.0.0.1'}], labels:{'traefik.test':'preservar'}, volumes:[] },
}, networks:{postgres:{external:true,name:'quest-rinne_private'}} });
test("release preserva credenciais, volumes, porta, proxy e rede; muda só fontes/base", () => {
  const source = config(); const original = structuredClone(source);
  const stage='/opt/apps/quest-rinne-web-runtime/.releases/test';
  const r=renderRelease(source,stage);
  assert.deepEqual(source,original);
  assert.deepEqual(r.services.api.environment,{APP_BASE_PATH:'/core/'});
  assert.ok(!JSON.stringify(r).includes('fixture-readonly'));
  for (const key of ['volumes','ports','labels','networks']) assert.ok(!(key in r.services.api) && !(key in r.services.web));
  assert.equal(r.services.api.environment.APP_BASE_PATH,'/core/');
  assert.equal(r.services.web.build.args.VITE_BASE_PATH,'/core/');
  const mounted=config(); mounted.services.web.volumes.push({type:'bind',source:'/opt/private/nginx.conf',target:'/etc/nginx/nginx.conf'} as never);
  assert.throws(()=>renderRelease(mounted,stage),/revisão manual/);
  assert.throws(()=>renderRelease(config(),'/tmp/other'),/fora/);
});
test("preparo recusa ambiente efetivo diferente sem imprimir segredo", () => {
  const c=config();const containers=['api','web'].map(service=>({Config:{Labels:{'com.docker.compose.service':service,'com.docker.compose.project':'quest-rinne-web',...(service==='web'?{'traefik.test':'preservar'}:{})},Env:Object.entries(c.services[service as 'api'|'web'].environment).map(([k,v])=>`${k}=${v}`)},Mounts:service==='api'?[{Destination:'/app/server/data',Source:'/opt/private/data'}]:[]}));
  assert.doesNotThrow(()=>verifyRunning(c,containers));
  (containers[1] as any).NetworkSettings={Ports:{'80/tcp':[{HostPort:'18372',HostIp:'127.0.0.1'}]}};
  assert.doesNotThrow(()=>verifyRunning(c,containers));
  c.services.web.ports[0].published=9999;
  assert.throws(()=>verifyRunning(c,containers),/Porta/);
  c.services.web.ports[0].published=18372;
  containers[0].Config.Env=['DATABASE_URL=divergente'];
  assert.throws(()=>verifyRunning(c,containers),e=>e instanceof Error&&e.message.includes('DATABASE_URL')&&!e.message.includes('fixture-readonly'));
});
test("backup SQLite consistente funciona em conexão de leitura e verifica integridade", () => {
  const dir=mkdtempSync(join(tmpdir(),'rinne-backup-test-'));
  try { const source=join(dir,'source.db'),target=join(dir,'copy.db');const writer=new DatabaseSync(source);writer.exec('CREATE TABLE sample (id INTEGER); INSERT INTO sample VALUES (1)');writer.close();
    const ro=new DatabaseSync(source,{readOnly:true});ro.prepare('VACUUM INTO ?').run(target);ro.close();
    const copy=new DatabaseSync(target,{readOnly:true});assert.equal(copy.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');assert.equal(copy.prepare('SELECT count(*) n FROM sample').get()?.n,1);copy.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('hotfix RINNE_PUBLISH é preservado somente para API; outros ambientes e frontend continuam validados',()=>{
  const source=config() as any;source.services.api.environment.RINNE_PUBLISH='shared';
  const containers=['api','web'].map(service=>({Config:{Labels:{'com.docker.compose.service':service,'com.docker.compose.project':'quest-rinne-web',...(service==='web'?{'traefik.test':'preservar'}:{})},Env:Object.entries(source.services[service].environment).map(([k,v])=>`${k}=${service==='api'&&k==='RINNE_PUBLISH'?'api-local':v}`)},Mounts:service==='api'?[{Destination:'/app/server/data',Source:'/opt/private/data'}]:[]}));
  const reconciled=verifyRunning(source,containers),sha='a'.repeat(40),stage='/opt/apps/quest-rinne-web-runtime/.releases/test';
  assert.equal(reconciled.api.RINNE_PUBLISH,'api-local');
  const rollback=renderRelease(source,stage,{api:'previous-api',web:'previous-web'},sha,reconciled);
  assert.equal(rollback.services.api.environment.RINNE_PUBLISH,'api-local');assert.ok(!rollback.services.web.environment);
  const override=renderRelease(source,stage,undefined,sha,reconciled);
  assert.equal(override.services.api.environment.RINNE_PUBLISH,'api-local');assert.equal(override.services.web.environment,undefined);
  assert.equal(override.services.api.build.args.RINNE_COMMIT_SHA,sha);assert.equal(override.services.web.build.args.RINNE_COMMIT_SHA,sha);
  assert.ok(!JSON.stringify(override).includes('fixture-readonly'));
  containers[1].Config.Env=['API_UPSTREAM=changed'];assert.throws(()=>verifyRunning(source,containers),/web\/API_UPSTREAM/);
});
test('CLI com marcador vazio prepara build com revisão, preservando imagens de rollback separadas',()=>{
  const source=config();const containers=['api','web'].map(service=>({Config:{Labels:{'com.docker.compose.service':service,'com.docker.compose.project':'quest-rinne-web',...(service==='web'?{'traefik.test':'preservar'}:{})},Env:Object.entries(source.services[service as 'api'|'web'].environment).map(([k,v])=>`${k}=${v}`)},Mounts:service==='api'?[{Destination:'/app/server/data',Source:'/opt/private/data'}]:[]}));
  const script=readFileSync(new URL('../../deploy/render-release.cjs',import.meta.url),'utf8'),sha='b'.repeat(40);
  const r=spawnSync(process.execPath,['-e',script,'--','--prepare-release','/opt/apps/quest-rinne-web-runtime/.releases/test','{}',sha],{input:JSON.stringify({config:source,containers}),encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);const output=JSON.parse(r.stdout);
  assert.ok(output.services.api.build);assert.equal(output.services.api.image,'quest-rinne-release-api:test');assert.equal(output.services.web.image,'quest-rinne-release-web:test');
  assert.equal(output.services.web.build.dockerfile,'frontend/Dockerfile');assert.equal(output.services.api.build.args.RINNE_COMMIT_SHA,sha);
  assert.ok(!r.stdout.includes('fixture-readonly'));
  assert.throws(()=>renderRelease(source,'/opt/apps/quest-rinne-web-runtime/.releases/test',{api:'old'}),/incompletas/);
});
test('retomada verifica identidade e integridade antes de sair, sem refazer backup; validação instalada não faz rollback',()=>{
  const prepare=readFileSync(new URL('../../deploy/prepare-release.sh',import.meta.url),'utf8'),resume=prepare.split("if [[ \"${2:-}\" == '--resume' ]]; then")[1]?.split('fi\n')[0];
  assert.ok(resume?.includes('prepared.sha'));assert.ok(resume?.includes('source.sha256'));assert.ok(resume?.includes('app.db.sha256'));assert.ok(resume?.includes('exit 0'));assert.ok(!resume?.includes('VACUUM'));
  const check=readFileSync(new URL('../../deploy/check-release.sh',import.meta.url),'utf8');
  assert.ok(check.includes('code.sha256'));assert.ok(check.includes('org.opencontainers.image.revision'));assert.ok(check.includes('web-assets.sha256'));assert.ok(!/up -d|rollback\.private/.test(check));
});

test('label de roteamento do container ausente do Compose interrompe a preparação',()=>{
  const source=config();const containers=['api','web'].map(service=>({Config:{Labels:{'com.docker.compose.service':service,'com.docker.compose.project':'quest-rinne-web',...(service==='web'?{'traefik.test':'preservar','traefik.http.routers.x.middlewares':'quest-rinne-web-tailscale-only'}:{})},Env:Object.entries(source.services[service as 'api'|'web'].environment).map(([k,v])=>`${k}=${v}`)},Mounts:service==='api'?[{Destination:'/app/server/data',Source:'/opt/private/data'}]:[]}));
  assert.throws(()=>verifyRunning(source,containers),/Label atual ausente.*middlewares/);
});
test('imagens e Compose compilam a interface consolidada; scripts descobrem API e Web e fazem rollback',()=>{
  const file=(name:string)=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
  for(const compose of ['docker-compose.yml','docker-compose.prod.yml']){assert.ok(file(compose).includes('frontend/Dockerfile'));assert.ok(!file(compose).includes('web/Dockerfile'));}
  for(const dockerfile of ['frontend/Dockerfile','server/Dockerfile'])for(const [,sources] of file(dockerfile).matchAll(/^COPY (?!--from)(?:--chmod=\d+ )?(.+) \S+\r?$/gm))for(const source of sources.split(' '))assert.ok(existsSync(new URL('../../'+source,import.meta.url)),dockerfile+': '+source);
  for(const gone of ['web/package.json','backend/package.json'])assert.ok(!existsSync(new URL('../../'+gone,import.meta.url)),gone);
  const prepare=file('deploy/prepare-release.sh');assert.ok(prepare.includes('union config_files'));assert.ok(prepare.includes('label "$c"'));
  const update=file('deploy/update.sh');for(const part of ['prepare-release.sh','check-release.sh','rollback.private.json','app.db.sha256','main "$@" < /dev/null'])assert.ok(update.includes(part),part);
  assert.ok(!/down -v|git reset|git clean|volume rm/.test(update));
});
