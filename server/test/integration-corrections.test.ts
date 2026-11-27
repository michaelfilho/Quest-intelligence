import assert from 'node:assert/strict';
import { after,before,test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { initialiseFixtures } from './analytics-fixtures.js';
import { timeChart,timeTable,operationalDimension,clientTable,jobTable,computeMetric,type Query } from '../src/analytics.js';
import { activityMetric,activityChart,workedActivities } from '../src/activities.js';
import { costChart,costCoverage,costTable } from '../src/costs.js';
import { computeCash,classifiedCash,costCenterLinks,cashRecords } from '../src/cash.js';
import { qualityMetric,conflictsTable } from '../src/quality.js';
import { projectMetric } from '../src/policies.js';
import { discoverSchema,prepareStatement } from '../src/schema.js';
import { SourceLimitation } from '../src/source-errors.js';
const pg=new PGlite();
const read:Query=async <T extends Record<string,any>>(sql:string,params:unknown[])=>(await pg.query<T>(sql,params)).rows;
const f={start:'2026-01-01',end:'2026-01-31',compare:false},page={page:1,pageSize:100};
before(async()=>{
  await initialiseFixtures(pg);
  await pg.exec(`ALTER TABLE core.time_entries ADD COLUMN source_kind text;
    ALTER TABLE core.time_entries ADD COLUMN task_id bigint;
    ALTER TABLE core.time_entries ADD COLUMN workflow_step_id bigint;
    ALTER TABLE core.time_entries ADD COLUMN job_piece_id bigint;
    ALTER TABLE core.time_entries ADD COLUMN department_name_snapshot text;
    ALTER TABLE core.time_entries ADD COLUMN hourly_rate numeric;
    UPDATE core.time_entries SET source_kind='TASK',task_id=7,hourly_rate=999999 WHERE job_id=1;
    UPDATE core.time_entries SET job_id=1,source_kind='TASK',task_id=8 WHERE id=6;
    UPDATE core.time_entries SET source_kind='WORKFLOW',job_piece_id=80,workflow_step_id=7 WHERE id=5;
    UPDATE core.time_entries SET labor_cost=0 WHERE id=2;
    CREATE TABLE core.job_tasks(job_id bigint,iclips_id bigint,name text,estimated_minutes numeric);
    INSERT INTO core.job_tasks VALUES (1,7,'Planejamento',60),(1,8,'Revisão',NULL),(2,7,'Outra tarefa',900);
    CREATE TABLE core.workflow_steps(job_piece_id bigint,iclips_id bigint,name text,estimated_minutes numeric);
    INSERT INTO core.workflow_steps VALUES (80,7,'Criação da peça',120);
    CREATE TABLE core.job_pieces(iclips_id bigint,job_id bigint,name text);
    INSERT INTO core.job_pieces VALUES(80,2,'Peça Horizonte');
    CREATE TABLE core.financial_entries(iclips_id bigint PRIMARY KEY,source_id text,parent_entry_source_id text,entry_type text,amount numeric,payment_date date,job_id bigint,category_id bigint);
    INSERT INTO core.financial_entries VALUES (1,'src1',NULL,'Entrada',100,'2026-01-10',1,5),(2,'src2',NULL,'Saída',40,'2026-01-11',2,6),
      (3,'src3','orfao','A Pagar',900,NULL,1,NULL),(4,'src4',NULL,'Entrada',700,'2025-12-01',1,5);
    CREATE TABLE core.financial_categories(iclips_id bigint,name text,dre_indicator text);
    INSERT INTO core.financial_categories VALUES(5,'Serviços','R'),(6,'Operação','D');
    ALTER TABLE core.financial_entries ADD COLUMN account_id bigint;
    UPDATE core.financial_entries SET account_id=7;
    CREATE TABLE core.financial_accounts(iclips_id bigint,name text);
    INSERT INTO core.financial_accounts VALUES(7,'Conta Exemplo');
    CREATE SCHEMA audit;CREATE SCHEMA ingest;
    CREATE TABLE audit.publication_state(published_at timestamptz);
    INSERT INTO audit.publication_state VALUES ('2026-01-31');
    CREATE TABLE audit.publication_conflicts(resolved_at timestamptz);
    INSERT INTO audit.publication_conflicts VALUES(NULL),('2026-01-30');
    CREATE TABLE ingest.tasks(status text,expected_total int,received_records int);
    INSERT INTO ingest.tasks VALUES('RECEIVED',10,8),('DONE',3,3),('RUNNING',NULL,7);
    CREATE TABLE ingest.pages(record_count int);
    INSERT INTO ingest.pages VALUES(8),(3),(7);`);
});
after(async()=>pg.close());
test('nomes reais, homônimos separados e departamento histórico pelo ID interno',async()=>{
  const c=await timeChart('horas_por_colaborador',f,read);
  assert.equal(c.points.filter(p=>p.label==='Ana Lima').length,2);
  assert.equal(c.points.reduce((s,p)=>s+Number(p.horas),0),4.75);
  const dept=await operationalDimension('departments',f,read);
  assert.deepEqual(dept,[{value:'A',label:'Criação'},{value:'B',label:'Operações'}]);
  const people=await timeTable('colaboradores',f,page,read);
  assert.equal(people.total,3);assert.equal(people.rows.find(r=>r.entity_id==='1')?.cargo,'Criação');
  assert.equal(people.rows.find(r=>r.entity_id==='3')?.colaborador,'Colaborador sem nome');
  assert.equal((await clientTable(f,page,read)).rows[0].cliente,'Cliente Aurora');
  assert.equal((await jobTable(f,page,read)).rows[0].titulo,'Campanha Aurora');
  const financial=await cashRecords('movimentos',f,page,read,await discoverSchema(read));
  assert.equal(financial.rows[0].cliente,'Cliente Aurora');assert.equal(financial.rows[0].projeto,'Campanha Aurora');
  assert.equal(financial.rows[0].categoria,'Serviços');assert.equal(financial.rows[0].conta,'Conta Exemplo');
});
test('cadastro duplicado não multiplica fatos, nome ausente tem fallback histórico',async()=>{
  await pg.exec("INSERT INTO core.employees VALUES(1,'Duplicada','A'); UPDATE core.time_entries SET department_id='X',department_name_snapshot='Histórico' WHERE id=6");
  try {
    const c=await timeChart('horas_por_colaborador',f,read);
    assert.equal(c.points.reduce((s,p)=>s+Number(p.horas),0),4.75);
    assert.ok(c.points.some(p=>p.label==='Cadastro com chave duplicada'));
    assert.ok((await operationalDimension('departments',f,read)).some(p=>p.value==='X'&&p.label==='Histórico'));
  } finally {await pg.exec("DELETE FROM core.employees WHERE name='Duplicada'; UPDATE core.time_entries SET department_id='A' WHERE id=6");}
});
test('estimativa composta conta uma vez, compara só cobertura válida e não soma taxa ao custo',async()=>{
  const planned=await activityMetric('horas_previstas',f,read);
  assert.equal(planned.value,3);assert.ok(planned.coverage?.includes('80.0%'));
  assert.equal((await activityMetric('desvio_horas',f,read)).value,1.5);
  assert.equal((await activityMetric('horas_vs_previstas',f,read)).value,1.5);
  assert.equal((await activityMetric('atividades_trabalhadas',f,read)).value,3);
  assert.equal((await activityMetric('atividades_trabalhadas',f,read)).recordsUsed,5);
  assert.equal((await activityMetric('pecas_trabalhadas',f,read)).recordsUsed,1);
  assert.equal((await activityMetric('pecas_trabalhadas',f,read)).value,1);
  assert.equal((await activityChart(f,read)).points.reduce((n,r)=>n+Number(r.previstas),0),3);
  const table=await workedActivities(f,page,read);assert.equal(table.total,3);
  assert.equal(table.rows.reduce((n,r)=>n+Number(r.custo_registrado),0),150);
  await assert.rejects(()=>activityMetric('horas_previstas',{...f,employee:'1'},read),SourceLimitation);
  await pg.exec("INSERT INTO core.job_tasks VALUES(1,7,'Duplicada',60)");
  try {assert.equal((await activityMetric('horas_previstas',f,read)).value,2);}finally{await pg.exec("DELETE FROM core.job_tasks WHERE name='Duplicada'");}
});
test('custos e cobertura são factuais, zero distinto de ausente',async()=>{
  assert.equal((await costCoverage('cobertura_custos',f,read)).value,.6);
  assert.equal((await costCoverage('apontamentos_custo_zero',f,read)).value,1);
  const costs=await costChart('custo_por_colaborador',f,read);
  assert.equal(costs.points.reduce((n,p)=>n+Number(p.custo_registrado),0),150);
  const rows=await costTable(f,page,read);assert.equal(rows.total,5);
  assert.equal(rows.rows.filter(r=>r.custo_registrado===null).length,2);
});
test('pais órfãos de A Pagar não bloqueiam isolados; filho fora do período exclui família',async()=>{
  let s=await discoverSchema(read);
  assert.equal((await computeCash('entradas_realizadas',f,read,s)).value,100);
  await pg.exec("UPDATE core.financial_entries SET parent_entry_source_id='src1' WHERE iclips_id=3");
  try {assert.equal((await computeCash('entradas_realizadas',f,read,s)).value,null);}finally{await pg.exec("UPDATE core.financial_entries SET parent_entry_source_id='orfao' WHERE iclips_id=3");}
  await pg.exec("UPDATE core.financial_entries SET parent_entry_source_id='orfao' WHERE iclips_id=1");
  try {await assert.rejects(()=>computeCash('entradas_realizadas',f,read,s),SourceLimitation);}finally{await pg.exec('UPDATE core.financial_entries SET parent_entry_source_id=NULL WHERE iclips_id=1');}
});
test('DRE só classifica códigos após política aprovada e preserva preliminar',async()=>{
  const s=await discoverSchema(read);
  await assert.rejects(()=>classifiedCash('receita_recebida',f,read,s),SourceLimitation);
  process.env.FINANCIAL_DRE_POLICY=JSON.stringify({approved:true,revenue:['R'],expense:['D']});
  try {assert.equal((await classifiedCash('receita_recebida',f,read,s)).value,100);assert.equal((await classifiedCash('despesas',f,read,s)).value,40);}finally{delete process.env.FINANCIAL_DRE_POLICY;}
});
test('qualidade pontual distingue páginas, recebidos, publicados e conflitos',async()=>{
  const s=await discoverSchema(read);
  for (const [id,value] of [['paginas_recebidas',3],['registros_recebidos',18],['conflitos_abertos',1],['conflitos_resolvidos',1],['divergencias_contagem',1],['registros_reportados_tarefas',18]] as const) assert.equal((await qualityMetric(id,f,read,s)).value,value);
  assert.ok((await qualityMetric('ultima_publicacao_core',f,read,s)).value);
  await assert.rejects(()=>qualityMetric('conflitos_abertos',{...f,department:'A'},read,s),SourceLimitation);
});
test('órfãos de A Pagar não bloqueiam caixa isolado; pais externos ao período continuam excluindo famílias',async()=>{
  let s=await discoverSchema(read);
  assert.equal((await computeCash('entradas_realizadas',f,read,s)).value,100);
  assert.equal((await computeCash('saidas_realizadas',f,read,s)).value,40);
  await pg.exec("UPDATE core.financial_entries SET parent_entry_source_id='src4' WHERE iclips_id=3");
  assert.equal((await computeCash('entradas_realizadas',f,read,s)).value,100);
  await pg.exec("UPDATE core.financial_entries SET parent_entry_source_id='src1' WHERE iclips_id=3");
  assert.equal((await computeCash('entradas_realizadas',f,read,s)).value,null);
  await pg.exec("UPDATE core.financial_entries SET parent_entry_source_id='orfao' WHERE iclips_id=1");
  await assert.rejects(()=>computeCash('entradas_realizadas',f,read,s),SourceLimitation);
  await pg.exec("UPDATE core.financial_entries SET parent_entry_source_id=NULL WHERE iclips_id=1; UPDATE core.financial_entries SET parent_entry_source_id='orfao' WHERE iclips_id=3");
  await pg.exec(`CREATE TABLE core.financial_entry_cost_centers(financial_entry_id bigint,cost_center_id bigint);
    INSERT INTO core.financial_entry_cost_centers VALUES (1,10),(1,20),(1,20),(2,30)`);
  s=await discoverSchema(read);
  const links=await costCenterLinks(f,page,read,s);assert.equal(links.total,2);
  assert.equal(links.rows.reduce((n,r)=>n+Number(r.valor),0),140);
  assert.equal(links.rows.find(r=>Number(r.id)===1)?.centros,2);
  await pg.exec(`ALTER TABLE core.financial_entries DROP CONSTRAINT financial_entries_pkey;
    INSERT INTO core.financial_entries(iclips_id,source_id,entry_type,amount,payment_date) VALUES(1,'duplicate','Entrada',100,'2026-01-10')`);
  try {await assert.rejects(()=>discoverSchema(read).then(snapshot=>computeCash('entradas_realizadas',f,read,snapshot)),SourceLimitation);}
  finally {await pg.exec("DELETE FROM core.financial_entries WHERE source_id='duplicate'; ALTER TABLE core.financial_entries ADD PRIMARY KEY(iclips_id)");}
});
test('política de status é explícita; conclusões futuras e datas inválidas não entram',async()=>{
  await assert.rejects(()=>projectMetric('projetos_ativos',f,read),SourceLimitation);
  process.env.JOB_STATUS_POLICY=JSON.stringify({approved:true,active:['Autorizado'],suspended:['Stand By'],completed:['Exemplo'],overdue:['Autorizado']});
  try {assert.equal((await projectMetric('projetos_concluidos',f,read)).value,1);}finally{delete process.env.JOB_STATUS_POLICY;}
  const avg=await computeMetric('tempo_medio_execucao',f,read);assert.equal(avg.value,10);assert.ok(avg.reason?.includes('denominador 1'));
  const s=await discoverSchema(read);const source=(await import('../src/activities.js')).activitySource;
  const statement=await source(f,read);assert.doesNotThrow(()=>prepareStatement(s,statement.sql));
});
test('perfil de origem alternativo exige aprovação, valida chaves e não interpreta source_path',async()=>{
  await pg.exec('ALTER TABLE core.time_entries RENAME COLUMN task_id TO origin_task; ALTER TABLE core.time_entries RENAME COLUMN workflow_step_id TO origin_step');
  try {
    await assert.rejects(()=>activityMetric('horas_previstas',f,read),SourceLimitation);
    process.env.TIME_ACTIVITY_KEYS=JSON.stringify({approved:true,kind:'source_kind',taskId:'origin_task',stepId:'origin_step',pieceId:'job_piece_id'});
    assert.equal((await activityMetric('horas_previstas',f,read)).value,3);
    process.env.TIME_ACTIVITY_KEYS=JSON.stringify({approved:true,kind:'source_kind',taskId:'origin_task; DROP TABLE core.jobs',stepId:'origin_step',pieceId:'job_piece_id'});
    await assert.rejects(()=>activityMetric('horas_previstas',f,read),SourceLimitation);
    assert.equal((await timeTable('colaboradores',f,page,read)).total,3);
  } finally {
    delete process.env.TIME_ACTIVITY_KEYS;
    await pg.exec('ALTER TABLE core.time_entries RENAME COLUMN origin_task TO task_id; ALTER TABLE core.time_entries RENAME COLUMN origin_step TO workflow_step_id');
  }
});
test('políticas independentes não exigem classificações de outros indicadores e qualidade discrimina recurso explicitamente',async()=>{
  process.env.JOB_STATUS_POLICY=JSON.stringify({approved:true,completed:['Exemplo']});
  process.env.FINANCIAL_DRE_POLICY=JSON.stringify({approved:true,revenue:['R']});
  try {
    assert.equal((await projectMetric('projetos_concluidos',f,read)).value,1);
    await assert.rejects(()=>projectMetric('projetos_ativos',f,read),SourceLimitation);
    const s=await discoverSchema(read);
    assert.equal((await classifiedCash('receita_recebida',f,read,s)).value,100);
    await assert.rejects(()=>classifiedCash('despesas',f,read,s),SourceLimitation);
    assert.equal((await conflictsTable(f,page,read,s)).rows.reduce((n,r)=>n+Number(r.quantidade),0),2);
    await assert.rejects(()=>qualityMetric('divergencias_projetos',f,read,s),SourceLimitation);
    await pg.exec("ALTER TABLE ingest.tasks ADD COLUMN resource text; UPDATE ingest.tasks SET resource='jobs' WHERE expected_total=10");
    process.env.QUALITY_PROJECT_RESOURCE='jobs';
    assert.equal((await qualityMetric('divergencias_projetos',f,read,await discoverSchema(read))).value,1);
  } finally {
    delete process.env.JOB_STATUS_POLICY;delete process.env.FINANCIAL_DRE_POLICY;delete process.env.QUALITY_PROJECT_RESOURCE;
  }
});
