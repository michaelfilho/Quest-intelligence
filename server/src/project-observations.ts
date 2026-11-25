import type {Filters} from '../../shared/contracts.js';
import {q} from './db.js';
import {analyticsQuery,validateJobIdentity,type Reader} from './schema.js';
import {sourceStatement,paginate} from './analytics.js';
import {schemaFor,nameSQL} from './presentation.js';
import {SourceLimitation} from './source-errors.js';
import type {Computed,Page} from './mappings.js';
export const STATUS_OBSERVATIONS:Record<string,string>={projetos_status_finalizado:'Finalizado',projetos_status_autorizado:'Autorizado',projetos_status_standby:'Stand By',projetos_status_cancelado:'Cancelado',projetos_status_proposta:'Proposta Comercial',projetos_status_concorrencia:'Concorrência'};
export async function statusSnapshot(f:Filters,reader:Reader=q) {
  if(f.status&&f.statusSource==='invoices')throw new SourceLimitation('Filtro não aplicável: situação de nota fiscal não representa status de projeto.');
  const s=await schemaFor(reader),params:unknown[]=[],where:string[]=[];
  const required=['iclips_id','status_text'];
  for(const key of ['department','service','category'] as const)if(f[key])throw new SourceLimitation(`Filtro ${key} sem relacionamento comprovado no estado atual do projeto.`);
  for(const [key,column]of [['client','client_id'],['group','client_group_id'],['project','iclips_id'],['status','status_text']] as const)if(f[key]){required.push(column);params.push(f[key]);where.push(`j.${column}::text=$${params.length}`);}
  if(f.employee){required.push('principal_employee_id','auxiliary_employee_id');params.push(f.employee);where.push(`(j.principal_employee_id::text=$${params.length} OR j.auxiliary_employee_id::text=$${params.length})`);}
  if(!required.every(column=>s.columns.some(c=>c.schema==='core'&&c.table==='jobs'&&c.column===column)))throw new SourceLimitation('Campo ausente no estado atual do projeto ou filtro selecionado.');
  await validateJobIdentity(s,reader);
  return {params,sql:`SELECT j.iclips_id,j.status_text FROM core.jobs j ${where.length?'WHERE '+where.join(' AND '):''}`};
}
export async function observedStatusMetric(id:string,f:Filters,reader:Reader=q):Promise<Computed> {
  const src=await statusSnapshot(f,reader),status=STATUS_OBSERVATIONS[id],params=[...src.params];
  const fields=Object.entries(STATUS_OBSERVATIONS).map(([key,label])=>{params.push(label);return `count(*) FILTER(WHERE status_text=$${params.length})::int AS ${key}`;});
  const [summary]=await reader(`WITH source AS (${src.sql}) SELECT ${fields.join(',')},count(*)::int AS total FROM source`,params);
  const r={value:summary[id],total:summary.total};
  return {value:Number(r.value),recordsUsed:Number(r.value),recordsExcluded:Number(r.total)-Number(r.value),reliability:'PARCIAL',temporalField:'estado atual, sem recorte temporal',reason:`Contagem literal do status ${status}. Não reconstrói histórico nem certifica entrega. Autorizado é candidato a ativo; Stand By é a proposta de suspenso. Classificações gerenciais permanecem pendentes de aprovação.`};
}
export async function observedStatusChart(f:Filters,reader:Reader=q){const src=await statusSnapshot(f,reader);return {series:['projetos'],points:await reader(`WITH source AS (${src.sql}) SELECT coalesce(status_text,'Sem status') AS label,count(*)::int AS projetos FROM source GROUP BY 1 ORDER BY 1`,src.params),reliability:'PARCIAL' as const,reason:'Estado textual atual de todos os projetos no escopo, independentemente do período; sem inferir status histórico.'};}
const valid="entered_at IS NOT NULL AND completed_at::timestamptz>=entered_at::timestamptz AND completed_at::timestamptz<=CURRENT_TIMESTAMP";
export async function calendarMetric(id:string,f:Filters,reader:Reader=analyticsQuery):Promise<Computed>{
  const src=sourceStatement('jobs',f,'completed_at');
  const [r]=await reader(`WITH source AS (${src.sql}), cohort AS (SELECT *,extract(epoch FROM (completed_at::timestamptz-entered_at::timestamptz))/86400.0 AS days FROM source WHERE status_text='Finalizado'),valid AS (SELECT * FROM cohort WHERE ${valid})
    SELECT count(*)::int AS used,avg(days)::float8 AS average,min(days)::float8 AS minimum,max(days)::float8 AS maximum,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY days)::float8 AS median,(SELECT count(*)::int FROM cohort) AS total FROM valid`,src.params);
  const value=id==='projetos_finalizados_periodo'?Number(r.used):r.average;
  return {value,recordsUsed:Number(r.used),recordsExcluded:Number(r.total)-Number(r.used),reliability:'PARCIAL',temporalField:'completed_at',
    reason:`Coorte de status atual Finalizado com conclusão informada no período e datas válidas, sem previsão/conclusão futura. Dias corridos, não horas trabalhadas. Denominador ${r.used}; mínimo ${r.minimum??'—'}, mediana ${r.median??'—'}, máximo ${r.maximum??'—'} dias. Sem corte arbitrário de extremos; registros sem conclusão não são atribuídos ao período. Estado atual não comprova aprovação/entrega histórica.`,
    insufficient:value==null?'Sem projetos marcados Finalizado com datas comparáveis no período.':undefined};
}
export async function calendarTable(f:Filters,p:Page,reader:Reader=analyticsQuery){
  const src=sourceStatement('jobs',f,'completed_at'),s=await schemaFor(reader),sort=p.sort??'dias';
  if(!['projeto','abertura','conclusao','dias','situacao'].includes(sort))throw new SourceLimitation('Coluna da coorte indisponível.');
  return {...await paginate(`WITH source AS (${src.sql}) SELECT iclips_id AS id,${nameSQL(s,'jobs','iclips_id','source.iclips_id','Projeto sem nome')} AS projeto,entered_at AS abertura,completed_at AS conclusao,
    CASE WHEN ${valid} THEN extract(epoch FROM (completed_at::timestamptz-entered_at::timestamptz))/86400.0 END AS dias,
    CASE WHEN ${valid} THEN 'Data válida' WHEN completed_at::timestamptz>CURRENT_TIMESTAMP THEN 'Conclusão futura: excluída' ELSE 'Abertura ausente ou conclusão anterior: excluída' END AS situacao FROM source WHERE status_text='Finalizado'`,src.params,p,`${sort} ${p.dir==='asc'?'ASC':'DESC'} NULLS LAST,id`,reader),reason:'Coorte auditável de calendário; extremos válidos permanecem no cálculo. Conclusões sem data não entram no recorte temporal.'};
}
