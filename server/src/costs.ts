import type { Filters } from '../../shared/contracts.js';
import { sourceStatement,eligibleTime,paginate,type Query } from './analytics.js';
import { analyticsQuery,numericTypes } from './schema.js';
import { labelledTime,schemaFor } from './presentation.js';
import { SourceLimitation } from './source-errors.js';
import type { Page } from './mappings.js';

const valid="labor_cost IS NOT NULL AND labor_cost::text NOT IN ('NaN','Infinity','-Infinity')";
const reason='Custo labor_cost registrado uma vez por apontamento válido. Não adiciona duração × hourly_rate. Cobertura mede preenchimento finito, incluindo zero; custo zero com duração positiva exige revisão. Não representa custo completo nem rentabilidade.';
export const COST_CHARTS:Record<string,[string,string]>={
  custo_por_colaborador:['employee_id','employee_name'],custo_por_departamento:['department_id','department_name'],
  custo_por_cliente:['client_id','client_name'],custo_por_projeto:['job_id','job_name'],
};
export async function costSource(f:Filters,reader:Query=analyticsQuery) {
  const s=await schemaFor(reader);
  if (!s.columns.some(c=>c.schema==='core'&&c.table==='time_entries'&&c.column==='labor_cost'&&numericTypes.has(c.type))) throw new SourceLimitation('Campo ausente ou incompatível: labor_cost numérico.');
  const src=sourceStatement('time',f,undefined,true);
  return {...src,sql:labelledTime(src.sql,s)};
}
export async function costChart(id:string,f:Filters,reader:Query=analyticsQuery) {
  const [key,label]=COST_CHARTS[id],src=await costSource(f,reader);
  const rows=await reader(`WITH source AS (${src.sql}) SELECT ${key}::text AS entity_id,max(${label}) AS label,
    sum(labor_cost) FILTER (WHERE ${valid})::float8 AS custo_registrado FROM source WHERE ${eligibleTime}
    GROUP BY ${key} ORDER BY custo_registrado DESC NULLS LAST,entity_id LIMIT 50`,src.params);
  return {series:['custo_registrado'],points:rows,reliability:'PARCIAL' as const,reason};
}
export async function costTable(f:Filters,p:Page,reader:Query=analyticsQuery) {
  const src=await costSource(f,reader),sort=p.sort??'data';
  if (!['data','colaborador','departamento','cliente','projeto','horas','custo_registrado'].includes(sort)) throw new SourceLimitation('Coluna de custo indisponível para ordenação.');
  const r=await paginate(`WITH source AS (${src.sql}) SELECT id,started_at AS data,employee_name AS colaborador,
    department_name AS departamento,client_name AS cliente,job_name AS projeto,job_id AS projeto_id,seconds/3600.0 AS horas,
    CASE WHEN ${valid} THEN labor_cost END AS custo_registrado,
    CASE WHEN ${valid} AND labor_cost=0 AND seconds>0 THEN 'Duração positiva com custo zero'
      WHEN NOT (${valid}) THEN 'Custo ausente ou inválido' ELSE 'Custo registrado' END AS situacao
    FROM source WHERE ${eligibleTime}`,src.params,p,`${sort} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,id`,reader);
  return {...r,reason};
}
export async function costCoverage(id:string,f:Filters,reader:Query=analyticsQuery) {
  const src=await costSource(f,reader);
  const [r]=await reader(`WITH source AS (${src.sql}) SELECT count(*)::int AS total,
    count(*) FILTER (WHERE ${valid})::int AS covered,count(*) FILTER (WHERE ${valid} AND labor_cost=0 AND seconds>0)::int AS zero
    FROM source WHERE ${eligibleTime}`,src.params);
  return {value:id==='apontamentos_custo_zero'?Number(r.zero):Number(r.total)>0?Number(r.covered)/Number(r.total):null,
    reliability:'PARCIAL' as const,recordsUsed:Number(r.covered),recordsExcluded:Number(r.total)-Number(r.covered),reason,temporalField:'started_at',
    insufficient:!Number(r.total)?'Nenhum apontamento válido no período.':undefined};
}
