import type {PGlite} from '@electric-sql/pglite';
import {initialiseFixtures} from './analytics-fixtures.js';
// Exclusivo de testes. Nunca importado pelo backend de produção.
export async function managementFixtures(db:PGlite){
  await initialiseFixtures(db);
  await db.exec(`ALTER TABLE core.clients ADD COLUMN document text;
    ALTER TABLE core.invoices ADD COLUMN client_document text;
    UPDATE core.clients SET document='12345678909' WHERE iclips_id=10;
    UPDATE core.invoices SET client_document='123.456.789-09' WHERE iclips_id IN(1,3);
    INSERT INTO core.clients VALUES(30,'Cliente % literal',NULL);
    ALTER TABLE core.time_entries ADD COLUMN source_kind text,ADD COLUMN task_id bigint,ADD COLUMN workflow_step_id bigint,ADD COLUMN job_piece_id bigint;
    UPDATE core.time_entries SET source_kind='TASK',task_id=7 WHERE job_id=1;
    UPDATE core.time_entries SET source_kind='WORKFLOW',workflow_step_id=7,job_piece_id=11 WHERE job_id=2;
    CREATE TABLE core.job_tasks(job_id bigint,iclips_id bigint,name text,estimated_minutes numeric,description text);
    INSERT INTO core.job_tasks VALUES(1,7,'Criação da campanha',60,'Descrição sintética da tarefa');
    CREATE TABLE core.job_pieces(iclips_id bigint PRIMARY KEY,job_id bigint,name text);
    INSERT INTO core.job_pieces VALUES(11,2,'Peça Horizonte');
    CREATE TABLE core.workflow_steps(job_piece_id bigint,iclips_id bigint,name text,estimated_minutes numeric,description text);
    INSERT INTO core.workflow_steps VALUES(11,7,'Etapa Horizonte',120,'Descrição sintética da etapa');
    CREATE TABLE core.financial_entries(iclips_id bigint PRIMARY KEY,parent_id bigint,entry_type text,amount numeric,payment_date date,category_id bigint,job_id bigint,account_id bigint);
    INSERT INTO core.financial_entries VALUES(100,NULL,'Entrada',1000,'2026-01-10',1,1,1),(101,NULL,'Saída',100,'2026-01-11',2,1,1);
    CREATE TABLE core.financial_categories(iclips_id bigint,name text,dre_indicator text);
    INSERT INTO core.financial_categories VALUES(1,'Receita fixture','RECEITAS OPERACIONAIS'),(2,'Despesa fixture','DESPESAS OPERACIONAIS CUSTO FIXO');
    CREATE TABLE core.financial_accounts(iclips_id bigint,name text);INSERT INTO core.financial_accounts VALUES(1,'Conta fixture');`);
}
