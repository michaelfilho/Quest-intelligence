import type { Filters } from '../../shared/contracts.js';
import {q} from './db.js';
import type {Reader} from './schema.js';
import {schemaFor,nameSQL} from './presentation.js';
import {cashSource,scopedProfile} from './cash.js';
import {paginate,invoiceChart,validateFilters} from './analytics.js';
import {prepareStatement} from './schema.js';
import {SourceLimitation} from './source-errors.js';
import type {Computed,Page} from './mappings.js';

// Literais de origem confirmados no contrato da fase 2, nunca quantitativos do levantamento.
export const DRE_GROUPS:Record<string,{type:string;labels:string[]}>= {
  receita_recebida:{type:'Entrada',labels:['RECEITAS OPERACIONAIS']},
  receita_competencia:{type:'Entrada',labels:['RECEITAS OPERACIONAIS']},
  receitas_nao_operacionais:{type:'Entrada',labels:['RECEITAS NÃO OPERACIONAIS']},
  despesas_fixas:{type:'Saída',labels:['DESPESAS OPERACIONAIS CUSTO FIXO']},
  despesas_variaveis:{type:'Saída',labels:['DESPESAS OPERACIONAIS CUSTO VARIÁVEL']},
  despesas_nao_operacionais:{type:'Saída',labels:['DESPESAS NÃO OPERACIONAIS']},
  impostos_pagos:{type:'Saída',labels:['IMPOSTOS']},
  participacao_lucros_paga:{type:'Saída',labels:['PARTICIPAÇÃO NOS LUCROS']},
  despesas:{type:'Saída',labels:['DESPESAS OPERACIONAIS CUSTO FIXO','DESPESAS OPERACIONAIS CUSTO VARIÁVEL']},
};
export const DRE_METRICS=[...Object.keys(DRE_GROUPS),'movimentacoes_sem_classificacao','resultado_operacional','margem_operacional'];
const note='Classificação literal de dre_indicator da origem, sem certificação contábil. Caixa por payment_date; somente movimentações isoladas, valores finitos e pagamentos não futuros. Resultado/margem preliminares = receita operacional menos despesas operacionais fixas e variáveis, antes de impostos, participação nos lucros e itens não operacionais. Não soma notas fiscais nem custo do timesheet. Transferências, estornos, retenções e pagamentos parciais aguardam conciliação; grupos NENHUM/desconhecidos e cadastros ambíguos não são redistribuídos.';
export async function dreSource(f:Filters,reader:Reader=q,requireClassification=true,temporal:'payment_date'|'competence_date'='payment_date') {
  const s=await schemaFor(reader),profile=await scopedProfile(f,reader,s,temporal);
  const classified=profile.hasCategory&&['iclips_id','dre_indicator'].every(column=>s.columns.some(c=>c.schema==='core'&&c.table==='financial_categories'&&c.column===column));
  if(!classified&&requireClassification)throw new SourceLimitation('Campo ausente: financial_categories.iclips_id/dre_indicator.');
  const src=cashSource(f,profile,temporal);
  if(!classified)return {s,params:src.params,base:src.sql,sql:`SELECT s.*,NULL::text AS classification,NULL::int AS category_matches,'Categoria sem nome'::text AS category_name FROM (${src.sql}) s WHERE s.standalone AND s.valor IS NOT NULL AND s.payment_date::timestamptz<=CURRENT_TIMESTAMP AND s.tipo IN ('Entrada','Saída')`};
  const name=s.columns.some(c=>c.schema==='core'&&c.table==='financial_categories'&&c.column==='name')?"max(nullif(btrim(name::text),''))":'NULL::text';
  return {s,params:src.params,base:src.sql,sql:`WITH source AS (${src.sql}), categories AS (
    SELECT iclips_id::text AS category_key,count(*)::int AS category_matches,
      CASE WHEN count(*)=1 THEN max(dre_indicator::text) END AS classification,
      CASE WHEN count(*)=1 THEN ${name} END AS category_name FROM core.financial_categories GROUP BY iclips_id::text
  ) SELECT s.*,c.classification,c.category_matches,coalesce(c.category_name,'Categoria sem nome') AS category_name
    FROM source s LEFT JOIN categories c ON c.category_key=s.category_id::text
    WHERE s.standalone AND s.valor IS NOT NULL AND s.payment_date::timestamptz<=CURRENT_TIMESTAMP AND s.tipo IN ('Entrada','Saída') ${temporal==='competence_date'?'AND s.competence_date::timestamptz<=CURRENT_TIMESTAMP':''}`};
}
const revenue="tipo='Entrada' AND classification='RECEITAS OPERACIONAIS'";
const expense="tipo='Saída' AND classification IN ('DESPESAS OPERACIONAIS CUSTO FIXO','DESPESAS OPERACIONAIS CUSTO VARIÁVEL')";
const unclassified="classification IS NULL OR classification='NENHUM' OR classification NOT IN ('RECEITAS OPERACIONAIS','RECEITAS NÃO OPERACIONAIS','DESPESAS OPERACIONAIS CUSTO FIXO','DESPESAS OPERACIONAIS CUSTO VARIÁVEL','DESPESAS NÃO OPERACIONAIS','IMPOSTOS','PARTICIPAÇÃO NOS LUCROS')";
export async function dreMetric(id:string,f:Filters,reader:Reader=q):Promise<Computed> {
  const temporal=id==='receita_competencia'?'competence_date':'payment_date';
  const src=await dreSource(f,reader,true,temporal),definition=DRE_GROUPS[id];
  const params=[...src.params];let predicate='TRUE';
  if(definition){params.push(definition.type,definition.labels);predicate=`tipo=$${params.length-1} AND classification=ANY($${params.length}::text[])`;}
  else if(id==='movimentacoes_sem_classificacao')predicate=unclassified;
  else predicate=`(${revenue}) OR (${expense})`;
  const [r]=await reader(`WITH source AS (${src.sql}) SELECT sum(valor) FILTER (WHERE ${predicate})::float8 AS amount,
    coalesce(sum(valor) FILTER (WHERE ${revenue}),0)::float8 AS revenue,coalesce(sum(valor) FILTER (WHERE ${expense}),0)::float8 AS expense,
    count(*) FILTER (WHERE ${predicate})::int AS used,count(*)::int AS eligible,
    count(*) FILTER (WHERE (${unclassified}) ${definition?`AND tipo=$${params.length-1}`:''})::int AS unknown,
    count(*) FILTER (WHERE ((${revenue}) OR (${expense})) AND valor<0)::int AS negatives,
    (SELECT count(*)::int FROM (${src.base}) b) AS total FROM source`,params);
  let value:number|null=Number(r.eligible)>0?Number(r.amount??0):null;
  const result=['resultado_operacional','margem_operacional'].includes(id);
  if(!result&&id!=='movimentacoes_sem_classificacao'&&!Number(r.used)&&Number(r.unknown)>0)value=null;
  if(result)value=Number(r.used)>0?Number(r.revenue)-Number(r.expense):null;
  if(id==='margem_operacional')value=value!=null&&Number(r.revenue)>0?value/Number(r.revenue):null;
  const signAmbiguous=result&&Number(r.negatives)>0;
  return {value,reliability:'EM_RECONCILIACAO',recordsUsed:Number(r.used),recordsExcluded:Number(r.total)-Number(r.used),temporalField:temporal,reason:(temporal==='competence_date'?'Competência de movimentos já realizados e não futuros, sem títulos abertos; não é reconhecimento contábil completo. ':'')+note,
    coverage:`${r.used}/${r.eligible} movimentos elegíveis no grupo; ${r.total-r.eligible} fora da base realizada isolada.`,
    exclusions:[{reason:'Fora da base realizada: outros tipos, famílias, valor ausente/inválido ou data futura',count:Number(r.total)-Number(r.eligible)},{reason:'Outros grupos DRE ou classificação não comprovada para este indicador',count:Number(r.eligible)-Number(r.used)}],
    insufficient:signAmbiguous?'Convenção de sinais pendente: valores negativos nos componentes impedem resultado/margem preliminares.':value==null?'Sem base comparável ou denominador positivo para esta métrica.':undefined};
}
export async function dreMonthly(f:Filters,reader:Reader=q) {
  const src=await dreSource(f,reader);
  const rows=await reader(`WITH source AS (${src.sql}) SELECT to_char(payment_date::timestamptz AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') AS label,
    coalesce(sum(valor) FILTER (WHERE ${revenue}),0)::float8 AS receita_operacional,
    coalesce(sum(valor) FILTER (WHERE tipo='Saída' AND classification='DESPESAS OPERACIONAIS CUSTO FIXO'),0)::float8 AS despesas_fixas,
    coalesce(sum(valor) FILTER (WHERE tipo='Saída' AND classification='DESPESAS OPERACIONAIS CUSTO VARIÁVEL'),0)::float8 AS despesas_variaveis
    FROM source GROUP BY 1 ORDER BY 1`,src.params);
  return {series:['receita_operacional','despesas_fixas','despesas_variaveis'],points:rows,reliability:'EM_RECONCILIACAO' as const,reason:note};
}
export async function billingVersusReceipts(f:Filters,reader:Reader=q){
  validateFilters('invoices',f);
  const schema=await schemaFor(reader);
  const invoiceReader:Reader=(sql,params)=>reader(prepareStatement(schema,sql),params);
  const [billing,cash]=await Promise.all([invoiceChart(f,invoiceReader),dreMonthly(f,reader)]);
  const months=[...new Set([...billing.points,...cash.points].map(r=>String(r.label)))].sort();
  return {series:['faturado_emitido','receita_operacional_recebida'],points:months.map(label=>({label,
    faturado_emitido:billing.points.find(r=>r.label===label)?.faturado??null,
    receita_operacional_recebida:cash.points.find(r=>r.label===label)?.receita_operacional??null})),reliability:'EM_RECONCILIACAO' as const,
    reason:'Comparação de bases distintas: emissão de notas vs pagamento de receita operacional classificada. Não soma os valores nem identifica contas em aberto; coberturas e vínculos são diferentes. Ausência de série no mês permanece ausente.'};
}
export async function dreMonthlyTable(f:Filters,p:Page,reader:Reader=q){
  const src=await dreSource(f,reader),sort=p.sort??'mes';
  if(!['mes','receita','despesas','resultado','margem'].includes(sort))throw new SourceLimitation('Coluna mensal indisponível.');
  return {...await paginate(`WITH source AS (${src.sql}), months AS (SELECT to_char(payment_date::timestamptz AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') AS mes,
    coalesce(sum(valor) FILTER (WHERE ${revenue}),0)::numeric AS receita,coalesce(sum(valor) FILTER (WHERE ${expense}),0)::numeric AS despesas,
    count(*) FILTER (WHERE ((${revenue}) OR (${expense})) AND valor<0)::int AS negatives FROM source GROUP BY 1)
    SELECT mes,receita,despesas,CASE WHEN negatives=0 THEN receita-despesas END AS resultado,
      CASE WHEN negatives=0 AND receita>0 THEN (receita-despesas)/receita END AS margem FROM months`,src.params,p,`${sort} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,mes`,reader),reliability:'EM_RECONCILIACAO' as const,reason:note};
}
export async function dreDimensionTable(dim:'category'|'account'|'client'|'project',f:Filters,p:Page,reader:Reader=q) {
  const src=await dreSource(f,reader,dim==='category'),sort=p.sort??'entrada';
  const field=dim==='account'?'account_id':'job_id';
  if(dim!=='category'&&!src.s.columns.some(c=>c.schema==='core'&&c.table==='financial_entries'&&c.column===field))throw new SourceLimitation(`Campo ausente: financial_entries.${field}.`);
  if(!['nome','entrada','saida','movimentos'].includes(sort))throw new SourceLimitation('Coluna DRE indisponível.');
  let sql:string;
  if(dim==='category')sql=`SELECT category_id::text AS entity_id,max(category_name) AS nome,classification AS classificacao,
    sum(valor) FILTER (WHERE tipo='Entrada')::numeric AS entrada,sum(valor) FILTER (WHERE tipo='Saída')::numeric AS saida,count(*)::int AS movimentos FROM source GROUP BY category_id,classification`;
  else {
    const key=dim==='account'?'s.account_id':dim==='project'?'s.job_id':'j.client_id';
    const table=dim==='account'?'financial_accounts':dim==='project'?'jobs':'clients';
    let join='';
    if(dim==='client'){
      if(!['iclips_id','client_id'].every(column=>src.s.columns.some(c=>c.schema==='core'&&c.table==='jobs'&&c.column===column)))throw new SourceLimitation('Campo ausente: vínculo de cliente no projeto.');
      join='LEFT JOIN (SELECT iclips_id,CASE WHEN count(*)=1 THEN max(client_id) END AS client_id FROM core.jobs GROUP BY iclips_id) j ON j.iclips_id::text=s.job_id::text';
    }
    sql=`SELECT ${key}::text AS entity_id,${nameSQL(src.s,table,'iclips_id',key,'Cadastro sem vínculo/nome')} AS nome,
      sum(s.valor) FILTER (WHERE s.tipo='Entrada')::numeric AS entrada,sum(s.valor) FILTER (WHERE s.tipo='Saída')::numeric AS saida,
      count(*)::int AS movimentos FROM source s ${join} GROUP BY ${key}`;
  }
  return {...await paginate(`WITH source AS (${src.sql}) ${sql}`,src.params,p,`${sort} ${p.dir==='asc'?'ASC':'DESC'} NULLS LAST,entity_id`,reader),reliability:'EM_RECONCILIACAO' as const,reason:note+' Entradas/saídas são movimentos, não receita/despesa automaticamente. Grupos sem vínculo permanecem separados.'};
}
