import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {initialiseFixtures} from './analytics-fixtures.js';

test('verificador usa referências PostgreSQL, continua com fontes ausentes e não imprime valores/nomes',async()=>{
  const engine=new PGlite();await initialiseFixtures(engine);
  const oldArgv=process.argv,oldExit=process.exitCode,oldUrl=process.env.DATABASE_URL,oldMode=process.env.NODE_ENV;
  const logs:string[]=[];
  const logger=mock.method(console,'log',(...args:unknown[])=>logs.push(args.join(' ')));
  const query=mock.method(pg.Pool.prototype,'connect',async()=>({query:async(sql:any,params:any)=>
    String(sql).includes('current_user AS role')?{rows:[{role:'quest_rinne_app_ro',readonly:'on'}]}:engine.query(sql,params),release(){}}));
  try {
    process.env.NODE_ENV='test';process.env.DATABASE_URL='postgres://fixture_ro@127.0.0.1:1/quest_rinne';
    process.argv=['node','verify-analytics.ts','--start','2026-01-01','--end','2026-01-31'];
    await import('../src/verify-analytics.js');
    assert.equal(process.exitCode,2);
    const results=logs.map(s=>JSON.parse(s));
    assert.ok(results.some(r=>r.check==='horas_registradas'&&r.status==='PASS'));
    assert.ok(results.some(r=>r.check==='receita_faturada'&&r.status==='PASS'));
    assert.ok(results.some(r=>r.check==='names_departments'&&r.status==='PASS'));
    assert.ok(results.some(r=>r.check==='estimates_once_per_unit'&&r.status==='UNAVAILABLE'));
    assert.ok(results.some(r=>r.verification==='PARTIAL'));
    for(const r of results)assert.ok(Object.keys(r).every(k=>['check','match','status','verification'].includes(k)));
    assert.ok(!logs.join('\n').includes('Ana Lima'));assert.ok(!logs.join('\n').includes('Cliente Aurora'));
    assert.ok(!logs.join('\n').includes('Campanha Aurora'));assert.ok(!logs.join('\n').includes('postgres://'));
  } finally {
    query.mock.restore();logger.mock.restore();process.argv=oldArgv;process.exitCode=oldExit;
    if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
    if(oldMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldMode;
    await engine.close();
  }
});
