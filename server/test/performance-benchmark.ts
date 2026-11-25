import {PGlite} from '@electric-sql/pglite';
import {performanceFixtures} from './performance-volume-fixtures.js';
import type {Query} from '../src/analytics.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// Deve preceder os imports dinâmicos de módulos que carregam env.ts.
process.env.NODE_ENV='test';
const {computeMetric,metricStatement,METRICS}=await import('../src/analytics.js');
const {activityMetric}=await import('../src/activities.js');
const {entitySummary}=await import('../src/management.js');
const {timeTable}=await import('../src/analytics.js');
const {dreMetric,DRE_METRICS}=await import('../src/dre.js');
const {discoverSchema,prepareStatement}=await import('../src/schema.js');
const {readOnce,withReadContext}=await import('../src/read-once.js');
const {authorizedContext,cachedResult,Admission}=await import('../src/performance.js');
const db=new PGlite();const raw:Query=async<T extends Record<string,any>>(sql:string,params:unknown[])=>(await db.query<T>(sql,params)).rows;
try{
  console.info('Gerando volumes sintéticos efêmeros.');await performanceFixtures(db);
  const schema=await discoverSchema(raw);let queries=0;
  const read:Query=(sql,params)=>readOnce(sql,params,async()=>{queries++;return raw(prepareStatement(schema,sql),params);});
  const f={start:'2026-01-01',end:'2026-01-31',compare:false};
  const ids=Object.keys(METRICS).filter(id=>METRICS[id].domain==='time'&&id!=='custo_mao_de_obra');
  const measure=async(fn:()=>Promise<unknown>)=>{const count=queries,t=performance.now();await fn();return {ms:+(performance.now()-t).toFixed(2),queries:queries-count};};
  const before=await measure(async()=>{for(const id of ids){const s=metricStatement(id,f);await read(s.sql,s.params);}});
  const after=await measure(()=>withReadContext(()=>Promise.all(ids.map(id=>computeMetric(id,f,read)))));
  console.info('Comparação dos sete cards concluída.');
  const baseline=`SELECT a.iclips_id,(SELECT CASE WHEN count(*)=1 THEN max(p.job_id::text) END FROM core.job_pieces p WHERE p.iclips_id::text=a.job_piece_id::text) AS job_key FROM core.workflow_steps a LIMIT 500`;
  const optimized=`SELECT a.iclips_id,p.job_key FROM core.workflow_steps a LEFT JOIN (SELECT iclips_id::text AS piece_key,CASE WHEN count(*)=1 THEN max(job_id::text) END AS job_key FROM core.job_pieces GROUP BY iclips_id::text) p ON p.piece_key=a.job_piece_id::text LIMIT 500`;
  assert.deepEqual(await raw(baseline,[]),await raw(optimized,[]));
  const explain=async(sql:string)=>(await db.query(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${sql}`)).rows[0];
  const plans={before:await explain(baseline),after:await explain(optimized)};
  const activity=await measure(()=>activityMetric('atividades_trabalhadas',f,read));
  const finance=await measure(()=>withReadContext(()=>Promise.all(DRE_METRICS.filter(id=>id!=='receita_competencia').map(id=>dreMetric(id,f,read)))));
  const newTables={clients:await measure(()=>entitySummary('client',f,{page:1,pageSize:25},read)),projects:await measure(()=>entitySummary('project',f,{page:1,pageSize:25},read)),records:await measure(()=>timeTable('apontamentos',f,{page:1,pageSize:25},read))};
  const user={id:1,permissions:new Set(['producao.view']),scopeDepartment:null};
  const get=()=>authorizedContext(user,()=>cachedResult('benchmark:cards',[f],()=>withReadContext(()=>Promise.all(ids.map(id=>computeMetric(id,f,read))))));
  const cold=await measure(get),warm=[];
  for(let i=0;i<20;i++)warm.push(await measure(get));
  const values=warm.map(x=>x.ms).sort((a,b)=>a-b),coldSamples=[];
  for(let i=0;i<5;i++)coldSamples.push(await measure(()=>withReadContext(()=>Promise.all(ids.map(id=>computeMetric(id,f,read))))));
  const coldSorted=coldSamples.map(x=>x.ms).sort((a,b)=>a-b);
  const {mock}=await import('node:test'),pg=(await import('pg')).default;
  const {Client,createUser,startServer}=await import('./helpers.js');
  const transport=mock.method(pg.Pool.prototype,'connect',async()=>({query:async(sql:string,params:unknown[])=>{queries++;return db.query(sql,params);},release(){}}));
  process.env.DATABASE_URL='postgres://synthetic_ro@127.0.0.1:1/quest_rinne';
  const server=await startServer(),http=new Client(server.base),modules:Record<string,unknown>={};let report:unknown,progressive:unknown,warmModule:unknown;
  try{
    await createUser('benchmark.synthetic','admin');await http.login('benchmark.synthetic');
    const launched=performance.now(),cards:{id:string;ms:number}[]=[];
    await Promise.all(['horas_registradas','atividades_trabalhadas','projetos_status_finalizado'].map(async id=>{
      const r=await http.req(`/api/indicators/${id}?start=${f.start}&end=2026-01-26`);assert.equal(r.body.result.status,'OK');
      cards.push({id,ms:+(performance.now()-launched).toFixed(2)});
    }));
    progressive={firstCardMs:Math.min(...cards.map(c=>c.ms)),completeMs:Math.max(...cards.map(c=>c.ms)),cards};
    for(const id of ['executivo','financeiro','producao']){
      console.info(`Medindo API ${id}.`);
      modules[id]=await measure(async()=>{
        const r=await http.req(`/api/modules/${id}?start=${f.start}&end=${f.end}`);assert.equal(r.status,200);
        assert.ok(![...r.body.indicators,...r.body.charts].some(x=>x.status==='ERROR'),`${id}: erro de SQL`);
      });
    }
    report=await measure(async()=>{const r=await http.req(`/api/reports/financeiro?start=${f.start}&end=${f.end}`);assert.equal(r.status,200);});
    const runs=[];
    for(let i=0;i<20;i++)runs.push(await measure(()=>http.req(`/api/modules/financeiro?start=${f.start}&end=${f.end}`)));
    const sorted=runs.map(r=>r.ms).sort((a,b)=>a-b);warmModule={n:20,p50Ms:sorted[9],p95Ms:sorted[18],queries:runs.reduce((n,r)=>n+r.queries,0)};
  }finally{await(await import('../src/db.js')).closePool();transport.mock.restore();server.stop();}
  const gate=new Admission(2,30,10000);let active=0,peak=0;
  await Promise.all(Array.from({length:12},async()=>{const done=await gate.enter();active++;peak=Math.max(peak,active);try{await new Promise(r=>setTimeout(r,2));}finally{active--;done();}}));
  const out={engine:'PGlite WASM; não equivale ao PostgreSQL nativo ou à VPS',synthetic:true,volumes:{time:200000,financial:50000,steps:80000,tasks:25000,pieces:20000,jobs:4000,employees:100,departments:30,clients:100},before,after,activity,finance,cold,coldSamples:{n:5,p50Ms:coldSorted[2],p95Ms:coldSorted[4]},progressive,modules,report,warmModule,warm:{n:20,p50Ms:values[9],p95Ms:values[18],queries:warm.reduce((n,x)=>n+x.queries,0)},admissionPeak:peak,memory:process.memoryUsage(),plans};
  mkdirSync(new URL('../../e2e/output/',import.meta.url),{recursive:true});
  writeFileSync(new URL('../../e2e/output/performance.private.json',import.meta.url),JSON.stringify({...out,newTables},null,2));
  console.info(JSON.stringify({...out,newTables,plans:'e2e/output/performance.private.json'},null,2));
}finally{await db.close();}
