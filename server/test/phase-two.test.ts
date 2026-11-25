import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {initialiseFixtures} from './analytics-fixtures.js';
import {computeMetric,type Query} from '../src/analytics.js';
import {invoiceLinkMetric,invoiceClientTable,invoiceLinkTable} from '../src/invoice-links.js';
import {validDocument,normalizedDocument} from '../src/documents.js';
import {dreMetric,dreMonthly,dreDimensionTable,billingVersusReceipts,dreMonthlyTable} from '../src/dre.js';
import {allocationMetric,allocationChart,allocationTable} from '../src/allocations.js';
import {activityMetric} from '../src/activities.js';
import {workedPiecesMetric,pieceTable,pieceChart} from '../src/production.js';
import {observedStatusMetric,calendarMetric,calendarTable} from '../src/project-observations.js';
import {publicationMetric,publicationsTable,conflictDetails} from '../src/publications.js';
import {costCoverage} from '../src/costs.js';
import {SourceLimitation} from '../src/source-errors.js';
const pg=new PGlite(),f={start:'2026-01-01',end:'2026-01-31',compare:false},p={page:1,pageSize:100};
const read:Query=async <T extends Record<string,any>>(sql:string,params:unknown[])=>(await pg.query<T>(sql,params)).rows;
// Documentos de teste gerados, sem dados de clientes reais.
function cpf(base:string){let n=base;for(let count=9;count<=10;count++){const d=([...n].reduce((s,v,i)=>s+Number(v)*(count+1-i),0)*10)%11;n+=d===10?'0':String(d);}return n;}
function cnpj(base:string){let n=base;for(const weights of [[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]]){const rest=[...n].reduce((s,v,i)=>s+Number(v)*weights[i],0)%11;n+=rest<2?'0':String(11-rest);}return n;}
const docA=cpf('123456780'),docB=cpf('234567890'),docC=cpf('345678900');
before(async()=>{
  await initialiseFixtures(pg);
  await pg.exec(`ALTER TABLE core.clients ADD COLUMN document text;
    INSERT INTO core.clients(iclips_id,name) VALUES(30,'Cadastro homônimo');
    ALTER TABLE core.invoices ADD COLUMN client_document text;
    INSERT INTO core.invoices(iclips_id,invoice_number,status,issued_at,service_amount) VALUES(6,'Fixture adicional','issued','2026-01-20',25);
    ALTER TABLE core.time_entries ADD COLUMN source_kind text;
    ALTER TABLE core.time_entries ADD COLUMN task_id bigint;
    ALTER TABLE core.time_entries ADD COLUMN workflow_id bigint;
    ALTER TABLE core.time_entries ADD COLUMN job_piece_id bigint;
    UPDATE core.time_entries SET source_kind='TASK',task_id=7,job_piece_id=100 WHERE job_id=1;
    UPDATE core.time_entries SET source_kind='WORKFLOW',workflow_id=7,job_piece_id=200 WHERE id=5;
    UPDATE core.time_entries SET job_id=1,source_kind='TASK',task_id=8 WHERE id=6;
    CREATE TABLE core.job_tasks(job_id bigint,iclips_id bigint,name text,estimated_minutes numeric);
    INSERT INTO core.job_tasks VALUES(1,7,'Tarefa prevista',60),(1,8,'Sem orçamento',0),(2,7,'Outra chave composta',900);
    CREATE TABLE core.workflow_steps(job_piece_id bigint,iclips_id bigint,name text,estimated_minutes numeric);
    INSERT INTO core.workflow_steps VALUES(200,7,'Etapa prevista',120);
    CREATE TABLE core.job_pieces(iclips_id bigint,job_id bigint,catalog_piece_id bigint,name text);
    INSERT INTO core.job_pieces VALUES(100,1,9,'Peça da tarefa'),(200,2,9,'Peça da etapa');
    CREATE TABLE core.piece_catalog(iclips_id bigint,name text);INSERT INTO core.piece_catalog VALUES(9,'Catálogo de teste');
    UPDATE core.time_entries SET labor_cost=0 WHERE id=2;
    UPDATE core.jobs SET status_text='Finalizado' WHERE iclips_id=1;
    UPDATE core.jobs SET status_text='Stand By' WHERE iclips_id=2;
    CREATE TABLE core.financial_entries(iclips_id bigint PRIMARY KEY,source_id text,parent_entry_source_id text,entry_type text,amount numeric,payment_date date,competence_date date,job_id bigint,category_id bigint,account_id bigint);
    CREATE TABLE core.financial_categories(iclips_id bigint,name text,dre_indicator text);
    INSERT INTO core.financial_categories VALUES
      (1,'Categoria receita','RECEITAS OPERACIONAIS'),(2,'Categoria fixa','DESPESAS OPERACIONAIS CUSTO FIXO'),(3,'Categoria variável','DESPESAS OPERACIONAIS CUSTO VARIÁVEL'),
      (4,'Recebimento não operacional','RECEITAS NÃO OPERACIONAIS'),(5,'Saída não operacional','DESPESAS NÃO OPERACIONAIS'),(6,'Tributo','IMPOSTOS'),(7,'Participação','PARTICIPAÇÃO NOS LUCROS'),(8,'A classificar','NENHUM');
    CREATE TABLE core.financial_accounts(iclips_id bigint,name text);INSERT INTO core.financial_accounts VALUES(1,'Conta de teste');
    INSERT INTO core.financial_entries(iclips_id,source_id,entry_type,amount,payment_date,job_id,category_id,account_id) VALUES
      (100,'src100','Entrada',1000,'2026-01-10',1,1,1),(101,'src101','Saída',100,'2026-01-11',1,2,1),(102,'src102','Saída',200,'2026-01-12',1,3,1),
      (103,'src103','Entrada',50,'2026-01-13',2,4,1),(104,'src104','Saída',20,'2026-01-14',2,5,1),(105,'src105','Saída',30,'2026-01-15',2,6,1),
      (106,'src106','Saída',10,'2026-01-16',NULL,7,1),(107,'src107','Saída',5,'2026-01-17',NULL,8,1),
      (150,'src150','Entrada',500,'2026-01-18',1,1,1),(151,'src151','Entrada',500,'2026-02-10',1,1,1);
    UPDATE core.financial_entries SET parent_entry_source_id='src150' WHERE iclips_id=151;
    INSERT INTO core.financial_entries(iclips_id,source_id,parent_entry_source_id,entry_type,amount) VALUES(199,'src199','órfão','A Pagar',900);
    CREATE TABLE core.financial_entry_cost_centers(financial_entry_id bigint,source_center_id bigint,name text,amount numeric,percentage numeric);
    INSERT INTO core.financial_entry_cost_centers VALUES (101,1,'Centro teste',60,60),(101,2,'Centro teste',40,40),(102,1,'Centro teste',200,90);
    CREATE SCHEMA audit;CREATE TABLE audit.qpf11_publication_state(resource text,source_id text,published_at timestamptz);
    INSERT INTO audit.qpf11_publication_state VALUES('FIN_ENTRIES_ENTRY','100','2026-01-10'),('PROJECTS','1','2026-01-11');
    CREATE TABLE audit.qpf11_publication_conflicts(resource text,source_id text,reason text,resolved_at timestamptz);
    INSERT INTO audit.qpf11_publication_conflicts VALUES('FIN_ENTRIES_ENTRY','199','Razão sintética',NULL),('PROJECTS','2','Razão sintética','2026-01-20');`);
  await pg.query('UPDATE core.clients SET document=$1 WHERE iclips_id=10',[docA]);
  await pg.query('UPDATE core.clients SET document=$1 WHERE iclips_id IN (20,30)',[docB]);
  await pg.query('UPDATE core.invoices SET client_document=$1 WHERE iclips_id IN (1,2)',[docA]);
  await pg.query('UPDATE core.invoices SET client_document=$1 WHERE iclips_id=3',[docB]);
  await pg.query('UPDATE core.invoices SET client_document=$1 WHERE iclips_id=6',[docC]);
});
after(async()=>pg.close());
test('documentos são normalizados, validados e ambiguidades não distribuem faturamento',async()=>{
  assert.equal((await invoiceLinkMetric('notas_vinculadas',f,read)).value,1);
  assert.equal((await invoiceLinkMetric('notas_ambiguas',f,read)).value,1);
  assert.equal((await invoiceLinkMetric('notas_sem_vinculo',f,read)).value,2);
  assert.equal((await invoiceLinkMetric('faturamento_clientes_vinculados',f,read)).value,100);
  assert.equal((await computeMetric('receita_faturada',f,read)).value,115);
  assert.equal((await computeMetric('receita_faturada',{...f,client:'10'},read)).value,100);
  assert.equal((await computeMetric('receita_faturada',{...f,client:'20'},read)).value,null);
  const table=await invoiceClientTable(f,p,read);assert.equal(table.total,1);assert.equal(table.rows[0].cliente,'Cliente Aurora');assert.equal(Number(table.rows[0].faturado),100);
  const notes=await invoiceLinkTable(f,p,read);assert.ok(notes.rows.some(r=>r.vinculo==='Documento ambíguo'));assert.ok(notes.rows.some(r=>r.vinculo==='Sem vínculo válido'));
  for(const value of [docA,docB,docC])assert.equal((await read(`WITH n AS (SELECT ${normalizedDocument('$1::text')} AS doc) SELECT ${validDocument('doc')} AS valid FROM n`,[value]))[0].valid,true);
  const company=cnpj('123456780001');assert.equal((await read(`WITH n AS (SELECT ${normalizedDocument('$1::text')} AS doc) SELECT ${validDocument('doc')} AS valid FROM n`,[`${company.slice(0,2)}.${company.slice(2,5)}.${company.slice(5,8)}/${company.slice(8,12)}-${company.slice(12)}`]))[0].valid,true);
  for(const value of ['11111111111',docA.slice(0,10)+(Number(docA[10])+1)%10,'ABC'+docA,'00000000000000'])assert.equal((await read(`WITH n AS (SELECT ${normalizedDocument('$1::text')} AS doc) SELECT ${validDocument('doc')} AS valid FROM n`,[value]))[0].valid,false);
  await assert.rejects(()=>invoiceClientTable({...f,department:'A'},p,read),SourceLimitation);
});
test('DRE utiliza literais de origem sem exigir aprovação de grupos conhecidos e sem misturar bases',async()=>{
  for(const [id,value]of [['receita_recebida',1000],['despesas_fixas',100],['despesas_variaveis',200],['receitas_nao_operacionais',50],['despesas_nao_operacionais',20],['impostos_pagos',30],['participacao_lucros_paga',10],['movimentacoes_sem_classificacao',5],['resultado_operacional',700],['margem_operacional',0.7]] as const)assert.equal((await dreMetric(id,f,read)).value,value,id);
  assert.equal((await dreMonthly(f,read)).points[0].receita_operacional,1000);
  const comparison=await billingVersusReceipts(f,read);assert.equal(comparison.points[0].faturado_emitido,115);assert.equal(comparison.points[0].receita_operacional_recebida,1000);
  const monthly=await dreMonthlyTable(f,p,read);assert.equal(Number(monthly.rows[0].resultado),700);assert.equal(Number(monthly.rows[0].margem),0.7);
  assert.equal((await dreDimensionTable('account',f,p,read)).rows[0].nome,'Conta de teste');
  assert.equal((await dreDimensionTable('category',f,p,read)).rows.find(r=>r.nome==='Categoria receita')?.entrada,1000);
  const clients=await dreDimensionTable('client',f,p,read);assert.ok(clients.rows.some(r=>r.nome==='Cliente Aurora'));assert.ok(clients.rows.some(r=>r.nome==='Cadastro sem vínculo/nome'));
  await assert.rejects(()=>dreMetric('resultado_operacional',{...f,department:'A'},read),SourceLimitation);
  await pg.exec("UPDATE core.financial_entries SET amount=-100 WHERE iclips_id=101");
  try {assert.ok((await dreMetric('resultado_operacional',f,read)).insufficient);assert.equal((await dreMetric('despesas_fixas',f,read)).value,-100);}finally{await pg.exec('UPDATE core.financial_entries SET amount=100 WHERE iclips_id=101');}
});
test('competência recorta apenas movimentos já realizados sem títulos ou famílias duplicadas',async()=>{
  await pg.exec(`UPDATE core.financial_entries SET competence_date='2026-01-01';
    INSERT INTO core.financial_entries(iclips_id,source_id,entry_type,amount,payment_date,competence_date,job_id,category_id,account_id)
      VALUES(200,'src200','Entrada',30,'2025-12-10','2026-01-01',1,1,1)`);
  try {
    assert.equal((await dreMetric('receita_competencia',f,read)).value,1030);
    assert.equal((await dreMetric('receita_recebida',f,read)).value,1000);
  }finally {await pg.exec('DELETE FROM core.financial_entries WHERE iclips_id=200');}
});
test('conta financeira independe da classificação DRE e categoria duplicada não multiplica caixa',async()=>{
  await pg.exec('ALTER TABLE core.financial_categories RENAME COLUMN dre_indicator TO unavailable_dre');
  try {assert.equal((await dreDimensionTable('account',f,p,read)).rows[0].entrada,1050);await assert.rejects(()=>dreMetric('resultado_operacional',f,read),SourceLimitation);}finally{await pg.exec('ALTER TABLE core.financial_categories RENAME COLUMN unavailable_dre TO dre_indicator');}
  await pg.exec("INSERT INTO core.financial_categories VALUES(1,'Duplicada','RECEITAS OPERACIONAIS')");
  try {const d=await dreDimensionTable('account',f,p,read);assert.equal(d.rows[0].entrada,1050);assert.equal((await dreMetric('receita_recebida',f,read)).value,null);}finally{await pg.exec("DELETE FROM core.financial_categories WHERE name='Duplicada'");}
});
test('rateios exigem valores, percentuais e parcelas conciliados; homônimos continuam separados',async()=>{
  assert.equal((await allocationMetric('despesas_rateadas',f,read)).value,100);
  assert.equal((await allocationMetric('despesas_rateio_divergente',f,read)).value,200);
  assert.equal((await allocationMetric('despesas_sem_rateio',f,read)).value,65);
  const chart=await allocationChart(f,read);assert.equal(chart.points.length,2);assert.equal(chart.points.reduce((n,r)=>n+Number(r.despesa),0),100);
  const rows=await allocationTable(f,p,read);assert.equal(rows.total,6);assert.equal(rows.rows.reduce((n,r)=>n+Number(r.valor),0),365);
  await pg.exec("UPDATE core.financial_entry_cost_centers SET percentage=100 WHERE financial_entry_id=102");
  assert.equal((await allocationMetric('despesas_rateadas',f,read)).value,300);
  await pg.exec("INSERT INTO core.financial_entry_cost_centers VALUES(101,1,'Duplicado',0,0)");
  try {assert.equal((await allocationMetric('despesas_rateadas',f,read)).value,200);}finally{await pg.exec("DELETE FROM core.financial_entry_cost_centers WHERE name='Duplicado';UPDATE core.financial_entry_cost_centers SET percentage=90 WHERE financial_entry_id=102");}
});
test('workflow_id real, chaves compostas, estimativas positivas e peças TASK são aproveitados',async()=>{
  assert.equal((await activityMetric('horas_previstas',f,read)).value,3);
  assert.equal((await activityMetric('tarefas_trabalhadas',f,read)).value,2);
  assert.equal((await activityMetric('etapas_trabalhadas',f,read)).value,1);
  assert.equal((await activityMetric('unidades_sem_estimativa',f,read)).value,1);
  assert.ok((await activityMetric('desvio_horas',f,read)).reason?.includes('estimativa integral'));
  assert.equal((await workedPiecesMetric(f,read)).value,2);
  assert.equal((await pieceTable(f,p,read)).rows[0].catalogo,'Catálogo de teste');
  assert.equal((await pieceChart('department',f,read)).points.reduce((n,r)=>n+Number(r.pecas),0),2);
  assert.equal((await workedPiecesMetric({...f,department:'A'},read)).value,1);
  assert.equal((await computeMetric('projetos_atendidos',f,read)).value,2);
});
test('status observado dispensa inferência gerencial; calendário usa Finalizado com data válida',async()=>{
  assert.equal((await observedStatusMetric('projetos_status_finalizado',f,read)).value,1);
  assert.equal((await observedStatusMetric('projetos_status_standby',f,read)).value,1);
  assert.equal((await observedStatusMetric('projetos_status_autorizado',f,read)).value,0);
  assert.equal((await calendarMetric('tempo_medio_execucao',f,read)).value,10);
  assert.equal((await calendarMetric('projetos_finalizados_periodo',f,read)).value,1);
  assert.equal((await calendarTable(f,p,read)).rows[0].projeto,'Campanha Aurora');
  await assert.rejects(()=>observedStatusMetric('projetos_status_finalizado',{...f,department:'A'},read),SourceLimitation);
  await pg.exec(`INSERT INTO core.jobs(iclips_id,status_text,entered_at,completed_at,name) VALUES
    (3,'Finalizado','2026-01-20','2026-01-10','Conclusão anterior'),(4,'Finalizado',NULL,'2026-01-11','Abertura ausente');
    UPDATE core.jobs SET status_text='Finalizado' WHERE iclips_id=2`);
  try {
    const cohort=await calendarMetric('tempo_medio_execucao',f,read);assert.equal(cohort.value,10);assert.equal(cohort.recordsExcluded,2);
    assert.equal((await calendarMetric('tempo_medio_execucao',{...f,start:'2099-01-01',end:'2099-01-31'},read)).value,null);
  }finally{await pg.exec("DELETE FROM core.jobs WHERE iclips_id IN (3,4);UPDATE core.jobs SET status_text='Stand By' WHERE iclips_id=2");}
});
test('cobertura de custos por horas preserva ausência/zero e publicação não equivale a recebidos',async()=>{
  assert.equal((await costCoverage('horas_com_custo_positivo',f,read)).value,3);
  assert.equal((await costCoverage('horas_sem_custo_positivo',f,read)).value,1.75);
  assert.equal((await costCoverage('cobertura_custo_positivo_horas',f,read)).value,3/4.75);
  assert.equal((await publicationMetric(f,read)).value,2);
  assert.equal((await publicationsTable(f,p,read)).total,2);
  assert.equal((await conflictDetails(f,p,read)).rows.length,2);
  await assert.rejects(()=>publicationMetric({...f,employee:'1'},read),SourceLimitation);
});
test('namespace interno de rateio é validado sem FK e ambiguidades não bloqueiam DRE independente',async()=>{
  await pg.exec(`ALTER TABLE core.financial_entries ADD COLUMN id text;
    UPDATE core.financial_entries SET id='row-'||iclips_id::text;
    ALTER TABLE core.financial_entry_cost_centers ALTER COLUMN financial_entry_id TYPE text USING 'row-'||financial_entry_id::text`);
  try {
    assert.equal((await allocationMetric('despesas_rateadas',f,read)).value,100);
    assert.equal((await allocationChart(f,read)).points.reduce((n,r)=>n+Number(r.despesa),0),100);
    await pg.exec("INSERT INTO core.financial_entry_cost_centers VALUES('107',99,'Ambíguo',5,100)");
    await assert.rejects(()=>allocationMetric('despesas_rateadas',f,read),SourceLimitation);
    assert.equal((await dreMetric('receita_recebida',f,read)).value,1000);
  } finally {
    await pg.exec("DELETE FROM core.financial_entry_cost_centers WHERE name='Ambíguo';ALTER TABLE core.financial_entry_cost_centers ALTER COLUMN financial_entry_id TYPE bigint USING replace(financial_entry_id,'row-','')::bigint;ALTER TABLE core.financial_entries DROP COLUMN id");
  }
});
