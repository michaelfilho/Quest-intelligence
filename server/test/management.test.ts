import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {managementFixtures} from './management-fixtures.js';
import {entitySummary,cashPeriods,resultEvolution} from '../src/management.js';
import {timeTable,type Query} from '../src/analytics.js';
import {workedActivities} from '../src/activities.js';
import {dreDimensionTable} from '../src/dre.js';
import {SEARCH_COLUMNS} from '../../shared/management.js';
import {authorizedContext} from '../src/performance.js';
const db=new PGlite(),f={start:'2026-01-01',end:'2026-01-31',compare:false},p={page:1,pageSize:25};
const read:Query=async<T extends Record<string,any>>(sql:string,params:unknown[])=>(await db.query<T>(sql,params)).rows;
before(()=>managementFixtures(db));after(()=>db.close());
test('clientes separam componentes, cadastros sem movimento e margem não comprovada',async()=>{
  const r=await entitySummary('client',f,p,read),row=r.rows.find(x=>x.id==='10')!;
  assert.equal(r.total,3);assert.equal(row.cliente,'Cliente Aurora');assert.equal(Number(row.faturado),90);
  assert.equal(Number(row.recebido),1000);assert.equal(Number(row.despesas),100);assert.equal(Number(row.custo_registrado),100);
  assert.equal(Number(row.horas),2.5);assert.equal(row.resultado,null);assert.equal(row.margem,null);
  const empty=r.rows.find(x=>x.id==='30')!;assert.equal(empty.horas,null);assert.equal(empty.faturado,null);
});
test('lista operacional não lê fatos financeiros nem custo pessoal sem a permissão',async()=>{
  const guarded:Query=(sql,params)=>{assert.ok(!/core\.(financial_entries|invoices)\b|\bt\.labor_cost\b/.test(sql));return read(sql,params);};
  const rows=await authorizedContext({id:991,permissions:new Set(['clientes.view']),scopeDepartment:null},()=>entitySummary('client',f,p,guarded));
  assert.ok(rows.rows.every(row=>row.recebido==null&&row.despesas==null&&row.faturado==null&&row.custo_registrado==null));
});
test('escopo departamental impede atribuição financeira e não revela outros cadastros',async()=>{
  const r=await entitySummary('client',{...f,department:'A'},p,read);
  assert.deepEqual(r.rows.map(x=>x.id),['10']);assert.equal(r.rows[0].recebido,null);assert.equal(r.rows[0].faturado,null);
});
test('documento ambíguo não distribui faturamento entre clientes',async()=>{
  await db.query('UPDATE core.clients SET document=$1 WHERE iclips_id=20',['12345678909']);
  try{const r=await entitySummary('client',f,p,read);assert.ok(r.rows.every(row=>row.faturado==null));}
  finally{await db.exec('UPDATE core.clients SET document=NULL WHERE iclips_id=20');}
});
test('referência financeira sem projeto cadastrado não comprova receita atribuída ao projeto',async()=>{
  await db.exec("INSERT INTO core.financial_entries VALUES(102,NULL,'Entrada',200,'2026-01-10',1,9999,1)");
  try{const r=await entitySummary('project',f,p,read),orphan=r.rows.find(row=>row.id==='9999')!;assert.ok(orphan);assert.equal(orphan.recebido,null);assert.equal(orphan.despesas,null);}
  finally{await db.exec('DELETE FROM core.financial_entries WHERE iclips_id=102');}
});
test('projetos têm nomes, estimativas por unidade e responsabilidade sem rateio individual',async()=>{
  const r=await entitySummary('project',f,p,read),one=r.rows.find(x=>x.id==='1')!;
  assert.equal(one.projeto,'Campanha Aurora');assert.equal(one.cliente,'Cliente Aurora');assert.equal(one.responsavel,'Ana Lima');
  assert.equal(Number(one.horas),2.5);assert.equal(Number(one.horas_previstas),1);assert.equal(Number(one.horas_retrabalho),0.5);
  const individual=await entitySummary('project',{...f,employee:'1'},p,read);assert.equal(individual.rows[0].horas_previstas,null);
  const grouped=await entitySummary('group',f,p,read);assert.equal(grouped.total,2);
});
test('pesquisa é parametrizada, literal e aplicada antes da paginação',async()=>{
  const found=await entitySummary('client',f,{...p,pageSize:1,search:'%',searchColumns:SEARCH_COLUMNS.gestao_clientes},read);
  assert.equal(found.total,1);assert.equal(found.rows[0].cliente,'Cliente % literal');
  const injection=await entitySummary('client',f,{...p,search:"' OR 1=1 --",searchColumns:SEARCH_COLUMNS.gestao_clientes},read);assert.equal(injection.total,0);
});
test('listagem gerencial não exige coluna de conclusão que não utiliza',async()=>{
  await db.exec('ALTER TABLE core.jobs RENAME COLUMN completed_at TO unavailable_completed_at');
  try{const rows=await entitySummary('project',f,p,read);assert.equal(rows.total,2);assert.ok(rows.rows.some(row=>row.projeto==='Campanha Aurora'));}
  finally{await db.exec('ALTER TABLE core.jobs RENAME COLUMN unavailable_completed_at TO completed_at');}
  await db.exec('ALTER TABLE core.jobs RENAME COLUMN entered_at TO unavailable_entered_at');
  try{const rows=await entitySummary('project',f,p,read);assert.equal(rows.total,2);assert.ok(rows.reason?.includes('Data de cadastro não integrada'));}
  finally{await db.exec('ALTER TABLE core.jobs RENAME COLUMN unavailable_entered_at TO entered_at');}
});
test('calendário e projeto reconciliam as horas e fornecem nomes reais',async()=>{
  const calendar=await timeTable('timesheet_calendario',f,p,read);assert.equal(calendar.rows.reduce((n,r)=>n+Number(r.horas),0),4.75);
  const projects=await timeTable('timesheet_projetos',f,p,read);assert.equal(projects.rows.find(r=>r.projeto==='Campanha Aurora')!.horas,2.5);
});
test('atividade expansível preserva origem e chave composta nos apontamentos',async()=>{
  const r=await workedActivities(f,p,read);assert.equal(r.total,2);assert.ok(r.rows.some(r=>r.origem==='TASK'&&r.activity_parent==='1'&&r.activity_child==='7'));
  const records=await timeTable('apontamentos',f,{...p,activity:{kind:'TASK',parent:'1',child:'7'}},read);
  assert.equal(records.total,3);assert.ok(records.rows.every(r=>r.atividade==='Criação da campanha'&&r.projeto==='Campanha Aurora'));
  const wrong=await timeTable('apontamentos',f,{...p,activity:{kind:'WORKFLOW',parent:'1',child:'7'}},read);assert.equal(wrong.total,0);
});
test('DRE expande somente o grupo; caixa não presume saldo onde falta uma perspectiva',async()=>{
  const r=await dreDimensionTable('category',f,{...p,dreGroup:'receita_recebida'},read);assert.equal(r.total,1);assert.equal(r.rows[0].nome,'Receita fixture');
  const category=await dreDimensionTable('category',{...f,category:'2'},p,read);assert.equal(category.total,1);assert.equal(category.rows[0].nome,'Despesa fixture');
  const daily=await cashPeriods('day',f,p,read);assert.ok(daily.rows.every(r=>r.saldo==null));
  const monthly=await cashPeriods('month',f,p,read);assert.equal(Number(monthly.rows[0].saldo),900);
  const result=await resultEvolution(f,read);assert.equal(result.points[0].resultado,900);
});
