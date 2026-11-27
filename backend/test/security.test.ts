import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD, startApp } from './helpers.js';

const MIN=60_000;
const from=(ip:string)=>({'X-Forwarded-For':ip});

test('sem sessão: dados e painel recusados; cookie HttpOnly/Strict; logout encerra',async()=>{
 const app=await startApp();
 try{
  assert.equal((await fetch(`${app.base}/bootstrap`)).status,401);
  assert.equal((await fetch(`${app.origin}/api/admin/ips`)).status,401);
  const response=await app.post('/api/auth/login',{username:'admin',password:PASSWORD});
  assert.equal(response.status,204);
  assert.match(response.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);
  const Cookie=response.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await fetch(`${app.base}/bootstrap`,{headers:{Cookie}})).status,200);
  assert.equal((await fetch(`${app.origin}/api/auth/logout`,{method:'POST',headers:{Cookie}})).status,415); // CSRF
  await app.post('/api/auth/logout',{},{Cookie});
  assert.equal((await fetch(`${app.base}/bootstrap`,{headers:{Cookie}})).status,401);
 }finally{await app.close();}
});

test('3 erros bloqueiam o IP por 15, 45 e 135 minutos; acertar zera',async()=>{
 let clock=Date.now();const app=await startApp({now:()=>clock});
 const attempt=(password:string)=>app.post('/api/auth/login',{username:'admin',password});
 try{
  for(const minutes of [15,45,135]){
   assert.equal((await attempt('errada')).status,401);
   assert.equal((await attempt('errada')).status,401);
   const third=await attempt('errada');
   assert.equal(third.status,429);assert.equal(Number(third.headers.get('retry-after')),minutes*60);
   assert.equal((await attempt(PASSWORD)).status,429); // bloqueado mesmo com a senha certa
   clock+=minutes*MIN-1000;assert.equal((await attempt(PASSWORD)).status,429);
   clock+=2000;
  }
  assert.equal((await attempt(PASSWORD)).status,204);
  await attempt('errada');await attempt('errada');
  assert.equal(Number((await attempt('errada')).headers.get('retry-after')),15*60);
 }finally{await app.close();}
});

test('tentativas paralelas não furam o limite',async()=>{
 const app=await startApp();
 try{
  const statuses=await Promise.all(Array.from({length:10},()=>app.post('/api/auth/login',{username:'admin',password:'errada'}).then(r=>r.status)));
  assert.equal(statuses.filter(s=>s===401).length,2);
  assert.equal(statuses.filter(s=>s===429).length,8);
 }finally{await app.close();}
});

test('IP desconhecido recebe 404 em tudo, aparece no painel, pode ser autorizado ou excluído',async()=>{
 const app=await startApp();const stranger='203.0.113.7';
 const visit=(path:string)=>fetch(app.origin+path,{headers:from(stranger)});
 try{
  for(const path of ['/','/api/v1/health','/api/auth/me','/assets/x.js'])assert.equal((await visit(path)).status,404);
  assert.equal((await app.post('/api/auth/login',{username:'admin',password:PASSWORD},from(stranger))).status,404);
  const Cookie=await app.login();
  const panel=()=>fetch(`${app.origin}/api/admin/ips`,{headers:{Cookie}}).then(r=>r.json());
  const status=async()=>(await panel()).ips.find((i:{ip:string})=>i.ip===stranger).status;
  assert.equal(await status(),'pending');
  const act=(ip:string,action:string)=>app.post('/api/admin/ips',{ip,action},{Cookie});
  assert.equal((await act(stranger,'allowed')).status,200);
  assert.equal((await visit('/api/auth/me')).status,200);
  await act(stranger,'blocked');
  assert.equal((await visit('/api/auth/me')).status,404);
  assert.equal(await status(),'blocked');
  assert.equal((await act('127.0.0.1','blocked')).status,409); // anti-lockout
  assert.equal((await act('não-é-ip','allowed')).status,422);
 }finally{await app.close();}
});
