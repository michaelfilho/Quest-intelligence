import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoData } from '../src/data/demo.js';
import { bootstrap, round } from '../src/analytics.js';
import { simulateIndirect, simulatedAnswer } from '../src/simulations.js';
import { startApp } from './helpers.js';
const data=bootstrap(createDemoData());const m=data.modules;
test('caixa, DRE e lançamentos conciliam sem misturar etapas de receita',()=>{
 const expenses=m.ledger.filter(r=>r.group==='Despesa');
 assert.equal(round(expenses.reduce((s,r)=>s+r.amount,0)),data.totals.cost);
 assert.equal(round(m.ledger.filter(r=>r.group==='Receita').reduce((s,r)=>s+r.amount,0)),data.totals.revenue);
 assert.equal(round(expenses.reduce((s,r)=>s+r.settled,0)),m.paid);
 assert.equal(round(m.cash.reduce((s,r)=>s+r.incoming,0)),data.totals.received);
 assert.equal(round(m.cash.reduce((s,r)=>s+r.outgoing,0)),m.paid);
 assert.equal(round(m.forecast.reduce((s,r)=>s+r.incoming,0)),m.receivable);
 assert.equal(round(m.forecast.reduce((s,r)=>s+r.outgoing,0)),m.payable);
 const timeline=[...m.cash,...m.forecast];for(let i=0;i<timeline.length;i++){const r=timeline[i];assert.equal(r.closing,round(r.opening+r.incoming-r.outgoing));if(i)assert.equal(r.opening,timeline[i-1].closing);}
 assert.equal(round(data.totals.revenue-data.totals.tax-data.totals.labor-data.totals.external-data.totals.indirect),data.totals.profit);
});
test('capacidade, retrabalho e cenários de orçamento usam os mesmos projetos',()=>{
 assert.equal(m.capacity.reduce((s,r)=>s+r.hours,0),data.totals.hours);
 assert.equal(m.rework.reduce((s,r)=>s+r.rework,0),data.totals.rework);
 assert.equal(m.rework.reduce((s,r)=>s+r.reworkCost,0),data.entries.filter(e=>e.rework).reduce((s,e)=>s+e.hours*data.people.find(p=>p.id===e.personId)!.rate,0));
 assert.equal(m.budgets.length,35);assert.ok(m.budgets.some(r=>r.variance>0));assert.ok(m.budgets.some(r=>r.variance<0));
 for(const r of m.budgets)assert.equal(r.variance,round(r.cost-r.plannedCost));
 for(const r of m.audit)assert.ok(data.contracts.some(c=>r.path===`/contratos/${c.id}`));
});
test('simulador de indiretos conserva centavos, não distribui valores negativos e não grava',()=>{
 const before=JSON.stringify(data);for(const pool of [0,0.01,0.18,1000,58404.37])for(const criterion of ['hours','revenue']){const preview=simulateIndirect(data,pool,criterion);assert.equal(round(preview.rows.reduce((s,r)=>s+r.after,0)),pool);assert.ok(preview.rows.every(r=>r.after>=0));assert.equal(preview.persisted,false);}
 assert.equal(JSON.stringify(data),before);assert.throws(()=>simulateIndirect(data,-1,'hours'));assert.throws(()=>simulateIndirect(data,1,'invalid'));
});
test('assistente é explicitamente simulado e seleciona evidências do assunto',()=>{
 assert.equal(simulatedAnswer(data,'Onde há retrabalho?').links[0].path,'/refacoes-alteracoes');
 assert.equal(simulatedAnswer(data,'Como está o caixa?').links[0].path,'/fluxo-caixa');
 assert.equal(simulatedAnswer(data,'Capacidade da equipe').simulated,true);
});
test('endpoints dos módulos e simulações validam entradas e devolvem dados demo',async()=>{
 const app=await startApp();const base=app.base;const Cookie=await app.login();
 const fetch=(url:string,init:RequestInit={})=>globalThis.fetch(url,{...init,headers:{...init.headers as Record<string,string>,Cookie}});
 try{const modules=await fetch(`${base}/modulos`).then(r=>r.json());assert.equal(modules.mode,'demo');assert.equal(modules.data.accounts.length,7);
  for(const payload of [{},{pool:-1,criterion:'hours'},{pool:1,criterion:'wrong'}])assert.equal((await fetch(`${base}/rateios/indiretos/simular`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).status,422);
  const response=await fetch(`${base}/assistente/simular`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'Caixa'})});assert.equal(response.status,200);assert.equal((await response.json()).simulated,true);
  assert.equal((await fetch(`${base}/assistente/simular`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'x'.repeat(501)})})).status,422);
 }finally{await app.close();}
});
