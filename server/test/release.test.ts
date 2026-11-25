import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const { renderRelease, verifyRunning } = createRequire(import.meta.url)("../../deploy/render-release.cjs");
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
