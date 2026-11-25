import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Admission,ResultCache,authorizedContext,cachedResult,queryTelemetry} from '../src/performance.js';

test('LRU: TTL, limite de bytes/entradas, cópias e singleflight; falhas não persistem',async()=>{
  let now=0,calls=0;const cache=new ResultCache(50,2,400,()=>now);
  const load=async()=>{calls++;return {status:'OK',rows:[1]};};
  const [a,b]=await Promise.all([cache.get('a',load),cache.get('a',load)]);assert.equal(calls,1);
  a.rows.push(2);assert.deepEqual(b.rows,[1]);assert.deepEqual((await cache.get('a',load)).rows,[1]);
  now=51;await cache.get('a',load);assert.equal(calls,2);
  await cache.get('b',load);await cache.get('c',load);assert.equal(cache.stats().entries,2);
  await cache.get('large',async()=>({value:'x'.repeat(500)}));assert.ok(cache.stats().bytes<=400);
  let errors=0;for(let i=0;i<2;i++)await cache.get('err',async()=>{errors++;return {status:'ERROR'};});assert.equal(errors,2);
  for(let i=0;i<2;i++)await assert.rejects(cache.get('timeout',async()=>{throw new Error('timeout');}));
  assert.equal(cache.stats().pending,0);
});
test('cache muda com usuário, escopo, permissões, semântica, filtros e paginação',async()=>{
  let calls=0;const user={id:991,permissions:new Set(['financeiro.view']),scopeDepartment:null as string|null};
  const get=(args:unknown[]=[])=>authorizedContext(user,()=>cachedResult('test:security',args,async()=>({status:'OK',count:++calls})));
  assert.equal((await get()).count,1);assert.equal((await get()).count,1);
  user.permissions.clear();assert.equal((await get()).count,2);
  user.scopeDepartment='A';assert.equal((await get()).count,3);
  user.id++;assert.equal((await get()).count,4);
  assert.equal((await get([{page:2}])).count,5);
  const old=process.env.FINANCIAL_PARENT_TARGET;
  try{process.env.FINANCIAL_PARENT_TARGET='source_id';assert.equal((await get()).count,6);}finally{if(old===undefined)delete process.env.FINANCIAL_PARENT_TARGET;else process.env.FINANCIAL_PARENT_TARGET=old;}
});
test('admissão limita concorrência, rejeita excesso e expira a fila sem vazar vagas',async()=>{
  const gate=new Admission(2,1,20),a=await gate.enter(),b=await gate.enter();
  const c=gate.enter();await assert.rejects(gate.enter(),/full/);assert.equal(gate.stats().active,2);
  a();const release=await c;release();b();assert.deepEqual(gate.stats(),{active:0,queued:0});
  const one=new Admission(1,1,5),end=await one.enter();await assert.rejects(one.enter(),/timeout/);end();assert.deepEqual(one.stats(),{active:0,queued:0});
});
test('telemetria só contém fingerprint, tempos, contagem e desfecho',()=>{
  const record=queryTelemetry('SELECT confidential_name FROM core.clients WHERE id=$1',{durationMs:1,poolWaitMs:0,queueWaitMs:0,rows:1,outcome:'ok'});
  assert.deepEqual(Object.keys(record).sort(),['metric','fingerprint','durationMs','poolWaitMs','queueWaitMs','rows','outcome'].sort());
  assert.ok(!JSON.stringify(record).includes('confidential_name'));assert.equal(record.fingerprint.length,20);
});
