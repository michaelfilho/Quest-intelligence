import type {PGlite} from '@electric-sql/pglite';
import {initialiseFixtures} from './analytics-fixtures.js';
// Dados gerados exclusivamente para benchmark local; nenhuma conexão externa.
export async function performanceFixtures(db:PGlite){
  await initialiseFixtures(db);
  await db.exec(`TRUNCATE core.time_entries,core.jobs,core.employees,core.departments,core.clients;
    INSERT INTO core.employees SELECT n,'Pessoa sintética '||n,'D'||(n%30+1) FROM generate_series(1,100)n;
    INSERT INTO core.departments SELECT 'D'||n,n,'Departamento sintético '||n FROM generate_series(1,30)n;
    INSERT INTO core.clients SELECT n,'Cliente sintético '||n FROM generate_series(1,100)n;
    INSERT INTO core.jobs(iclips_id,client_id,client_group_id,name,status_text,entered_at,completed_at)
      SELECT n,n%100+1,5,'Projeto sintético '||n,'Finalizado','2026-01-01','2026-01-20' FROM generate_series(1,4000)n;
    CREATE TABLE core.job_pieces(iclips_id bigint PRIMARY KEY,job_id bigint,name text);
    INSERT INTO core.job_pieces SELECT n,(n-1)%4000+1,'Peça sintética '||n FROM generate_series(1,20000)n;
    CREATE TABLE core.workflow_steps(iclips_id bigint,job_piece_id bigint,name text,estimated_minutes numeric);
    INSERT INTO core.workflow_steps SELECT n,(n-1)%20000+1,'Etapa sintética '||n,60 FROM generate_series(1,80000)n;
    CREATE TABLE core.job_tasks(iclips_id bigint,job_id bigint,name text,estimated_minutes numeric);
    INSERT INTO core.job_tasks SELECT n,(n-1)%4000+1,'Tarefa sintética '||n,90 FROM generate_series(1,25000)n;
    ALTER TABLE core.time_entries ADD COLUMN source_kind text,ADD COLUMN task_id bigint,
      ADD COLUMN workflow_step_id bigint,ADD COLUMN job_piece_id bigint;
    INSERT INTO core.time_entries(id,job_id,employee_id,department_id,started_at,duration_seconds,duration_minutes,is_rework,labor_cost,source_kind,task_id,workflow_step_id,job_piece_id)
      SELECT n,(n-1)%4000+1,n%100+1,'D'||(n%30+1),'2026-01-01'::timestamptz+(n%28)*interval '1 day',
        3600,60,n%10=0,50,CASE WHEN n%2=0 THEN 'WORKFLOW' ELSE 'TASK' END,
        CASE WHEN n%2=1 THEN (n-1)%25000+1 END,CASE WHEN n%2=0 THEN (n-1)%80000+1 END,
        CASE WHEN n%2=0 THEN (n-1)%20000+1 END FROM generate_series(1,200000)n;
    CREATE TABLE core.financial_entries(iclips_id bigint PRIMARY KEY,parent_id bigint,entry_type text,amount numeric,payment_date date,category_id bigint,job_id bigint,account_id bigint);
    INSERT INTO core.financial_entries SELECT n,NULL,CASE WHEN n%2=0 THEN 'Entrada' ELSE 'Saída' END,100,
      '2026-01-01'::date+n%28,CASE WHEN n%2=0 THEN 1 ELSE 2 END,n%4000+1,1 FROM generate_series(1,50000)n;
    CREATE TABLE core.financial_categories(iclips_id bigint,name text,dre_indicator text);
    INSERT INTO core.financial_categories VALUES(1,'Receita sintética','RECEITAS OPERACIONAIS'),(2,'Despesa sintética','DESPESAS OPERACIONAIS CUSTO FIXO');
    CREATE TABLE core.financial_accounts(iclips_id bigint,name text);INSERT INTO core.financial_accounts VALUES(1,'Conta sintética');
    CREATE INDEX ON core.time_entries(department_id,started_at);CREATE INDEX ON core.time_entries(employee_id,started_at);
    CREATE INDEX ON core.time_entries(job_id);CREATE INDEX ON core.financial_entries(payment_date);
    CREATE INDEX ON core.financial_entries(category_id,entry_type);CREATE INDEX ON core.financial_entries(job_id);
    CREATE INDEX ON core.job_pieces(job_id);ANALYZE;`);
}
