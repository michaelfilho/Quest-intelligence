import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDemoData} from '../src/data/demo.js';
import {bootstrap,round,simulateAllocation,sum} from '../src/analytics.js';
import { startApp } from './helpers.js';
const source=createDemoData();const data=bootstrap(source);
test('inventário, referências e totais financeiros são consistentes',()=>{
 assert.deepEqual([source.clients.length,source.brands.length,source.contracts.length,source.categories.length,source.allocations.length,source.projects.length,source.departments.length,source.people.length,source.entries.length],[12,25,20,7,24,35,9,30,385]);
 for(const p of data.projectRows){assert.ok(source.clients.some(c=>c.id===p.clientId));assert.ok(source.brands.some(b=>b.id===p.brandId&&b.clientId===p.clientId));assert.ok(source.contracts.some(c=>c.id===p.contractId&&c.clientId===p.clientId));assert.ok(p.external>=0);assert.equal(round(p.revenue-p.cost),p.profit);assert.equal(round(p.labor+p.external+p.tax+p.indirect),p.cost);}
 assert.equal(data.totals.revenue,1705800);assert.equal(data.totals.cost,584043.5);assert.equal(data.totals.profit,1121756.5);
 assert.equal(round(source.financialEntries.filter(e=>e.type==='Recebimento').reduce((s,e)=>s+e.amount,0)),data.totals.received);
 for(const allocation of source.allocations){assert.equal(source.projects.find(p=>p.id===allocation.projectId)?.contractId,allocation.contractId);}
 assert.equal(round(data.contracts.reduce((s,c)=>s+c.value,0)),data.totals.contracted);
 assert.deepEqual(sum(data.clientRows),data.totals);assert.deepEqual(sum(data.brandRows),data.totals);
 assert.equal(round(data.personRows.reduce((s,p)=>s+p.labor,0)),data.totals.labor);
 assert.equal(round(data.departmentRows.reduce((s,p)=>s+p.labor,0)),data.totals.labor);
 assert.equal(round(data.monthly.reduce((s,p)=>s+p.revenue,0)),data.totals.revenue);
});
test('margem agrupada é ponderada e receita ausente não gera margem zero',()=>{const combined=sum(data.projectRows.slice(0,4));assert.equal(combined.margin,round(combined.profit/combined.revenue*100));assert.equal(sum([]).margin,null);});
test('peças e indicadores executivos conciliam com a base e alertas respeitam as regras',()=>{
 const executive=data.executive;
 assert.equal(executive.pieces.length,385);
 assert.equal(round(executive.pieces.reduce((s,p)=>s+p.labor,0)),data.totals.labor);
 assert.equal(executive.pieces.reduce((s,p)=>s+p.hours,0),data.totals.hours);
 assert.equal(executive.pieces.reduce((s,p)=>s+p.rework,0),data.totals.rework);
 assert.equal(new Set(executive.pieces.flatMap(p=>p.entryIds)).size,data.entries.length);
 assert.equal(executive.indicators.find(i=>i.id==='margin')?.value,data.totals.margin);
 assert.equal(executive.indicators.find(i=>i.id==='late')?.value,round(5/35*100));
 assert.equal(executive.managementAlerts.filter(a=>a.category==='Prazo').length,5);
 assert.equal(new Set(executive.managementAlerts.map(a=>a.category)).size,6);
 for(const alert of executive.managementAlerts.filter(a=>a.category==='Capacidade')){const dept=data.departmentRows.find(d=>alert.id===`capacity-${d.id}`)!;assert.ok(dept.hours/dept.capacity>0.9);}
});
test('rateio simula sem alterar dados e bloqueia excesso, valores inválidos e cliente divergente',()=>{
 const before=JSON.stringify(source.allocations);const c=source.contracts[0];const p=source.projects.find(p=>p.clientId===c.clientId)!;
 const result=simulateAllocation(source,c.id,p.id,100);assert.equal(result.after,result.before+100);assert.equal(result.persisted,false);assert.equal(JSON.stringify(source.allocations),before);
 assert.throws(()=>simulateAllocation(source,c.id,p.id,c.value),/excede/);assert.throws(()=>simulateAllocation(source,c.id,p.id,-1),/válido/);assert.throws(()=>simulateAllocation(source,c.id,'proj-5',1),/mesmo cliente/);
});
test('API REST: filtros, ordenação, detalhes, 404 e erros de simulação',async()=>{
 const app=await startApp();const base=app.base;const Cookie=await app.login();
 const fetch=(url:string,init:RequestInit={})=>globalThis.fetch(url,{...init,headers:{...init.headers as Record<string,string>,Cookie}});
 try{
  const response=await fetch(`${base}/projetos?status=atrasado&sort=revenue&direction=desc`);const body=await response.json();assert.equal(body.total,5);assert.ok(body.data.every((p:{status:string})=>p.status==='atrasado'));assert.ok(body.data[0].revenue>=body.data[1].revenue);
  const client=await fetch(`${base}/clientes/cli-2`).then(r=>r.json());assert.equal(client.name,'Omni Retail Group');
  const filtered=await fetch(`${base}/apontamentos?retrabalho=true&projeto=proj-1`).then(r=>r.json());assert.ok(filtered.total>0);assert.ok(filtered.data.every((e:{rework:boolean;projectId:string})=>e.rework&&e.projectId==='proj-1'));
  assert.equal((await fetch(`${base}/projetos/inexistente`)).status,404);
  const pieces=await fetch(`${base}/pecas?cliente=cli-2`).then(r=>r.json());assert.equal(pieces.total,55);
  assert.equal((await fetch(`${base}/indicadores`).then(r=>r.json())).total,8);
  assert.ok((await fetch(`${base}/alertas-gerenciais`).then(r=>r.json())).total>0);
  assert.equal((await fetch(`${base}/rateios/simular`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contractId:'ctr-1',projectId:'proj-1',amount:1e9})})).status,422);
  assert.equal((await fetch(`${base}/rateios/simular`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
 }finally{await app.close();}
});
