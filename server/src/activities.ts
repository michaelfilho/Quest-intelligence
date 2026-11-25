import type { Filters } from '../../shared/contracts.js';
import { sourceStatement, eligibleTime, paginate, type Query } from './analytics.js';
import { analyticsQuery, numericTypes } from './schema.js';
import { schemaFor, labelledTime } from './presentation.js';
import { SourceLimitation } from './source-errors.js';
import type { Computed, Page } from './mappings.js';
import { activityKeys,projectActivityKeys } from './activity-profile.js';

// Chaves fechadas do contrato. Nunca extrair identificadores de texto livre/source_path.
export async function activitySource(f: Filters, reader: Query = analyticsQuery) {
  const s = await schemaFor(reader);
  const profile=activityKeys(s);
  const has = (table: string, column: string) => s.columns.some(c => c.schema === 'core' && c.table === table && c.column === column);
  const numeric = (table: string, column: string) => s.columns.some(c => c.schema === 'core' && c.table === table && c.column === column && numericTypes.has(c.type));
  if (!profile.task&&!profile.workflow) throw new SourceLimitation('Campo ausente: origem e chaves de atividade não comprovadas; exige perfil explícito de tarefa ou etapa.');
  const arms: string[] = [];
  for (const [kind, table, parent, child] of [
    ['TASK','job_tasks','job_id','task_id'], ['WORKFLOW','workflow_steps','job_piece_id','workflow_step_id'],
  ]) {
    if (!(kind==='TASK'?profile.task:profile.workflow) || ![parent,'iclips_id'].every(c => has(table,c))) continue;
    if (kind==='WORKFLOW' && !['iclips_id','job_id'].every(c=>has('job_pieces',c))) continue;
    const estimate = numeric(table,'estimated_minutes') ? 'estimated_minutes::numeric' : 'NULL::numeric';
    const name = has(table,'name') ? "max(nullif(btrim(name::text),''))" : 'NULL::text';
    const jobKey=kind==='TASK'?'a.job_id::text':"(SELECT CASE WHEN count(*)=1 THEN max(p.job_id::text) END FROM core.job_pieces p WHERE p.iclips_id::text=a.job_piece_id::text)";
    arms.push(`SELECT '${kind}'::text AS kind, ${parent}::text AS parent_key, iclips_id::text AS child_key,
      ${jobKey} AS job_key,
      CASE WHEN count(*)=1 THEN max(${estimate}) END AS minutes, ${name} AS name, count(*)::int AS matches
      FROM core.${table} a GROUP BY ${parent},iclips_id`);
  }
  if (!arms.length) throw new SourceLimitation('Relacionamento de atividade ausente: exige chaves compostas explícitas de tarefa ou etapa.');
  const includeCost=numeric('time_entries','labor_cost');
  const src = sourceStatement('time',f,undefined,includeCost);
  return { kinds:arms.map(a=>a.includes("'WORKFLOW'")?'WORKFLOW':'TASK'),params: src.params, sql: `WITH source AS (${labelledTime(projectActivityKeys(src.sql,profile.keys),s)}), valid_time AS (
    SELECT *, CASE WHEN source_kind='TASK' THEN job_id::text WHEN source_kind='WORKFLOW' THEN job_piece_id END AS parent_key,
      CASE WHEN source_kind='TASK' THEN task_id WHEN source_kind='WORKFLOW' THEN workflow_step_id END AS child_key
    FROM source WHERE ${eligibleTime}
  ), work AS (
    SELECT source_kind AS kind,parent_key,child_key, sum(seconds)/3600.0 AS hours, count(*)::int AS entries,
      ${includeCost ? "sum(labor_cost) FILTER (WHERE labor_cost::text NOT IN ('NaN','Infinity','-Infinity'))" : 'NULL::numeric'} AS cost,
      string_agg(DISTINCT employee_name, ', ') AS employees, string_agg(DISTINCT department_name, ', ') AS departments,
      max(job_name) AS project, CASE WHEN count(DISTINCT job_id)=1 THEN max(job_id) END AS project_id
    FROM valid_time WHERE source_kind IN ('TASK','WORKFLOW') AND parent_key IS NOT NULL AND child_key IS NOT NULL
    GROUP BY source_kind,parent_key,child_key
  ), estimates AS (${arms.join(' UNION ALL ')}), activities AS (
    SELECT w.*, e.matches, CASE WHEN e.matches=1 THEN coalesce(e.name,'Atividade sem nome') WHEN e.matches>1 THEN 'Atividade com chave duplicada' ELSE 'Atividade sem cadastro' END AS name,
      CASE WHEN ${f.employee||f.department?'FALSE':'TRUE'} AND e.matches=1 AND e.minutes>0 AND e.minutes::text NOT IN ('NaN','Infinity','-Infinity') THEN e.minutes/60.0 END AS planned
    FROM work w LEFT JOIN estimates e ON e.kind=w.kind AND e.parent_key=w.parent_key AND e.child_key=w.child_key AND e.job_key=w.project_id::text
  )` };
}
export const ACTIVITY_METRICS = ['horas_previstas','desvio_horas','horas_vs_previstas','atividades_trabalhadas','pecas_trabalhadas'];
const note = 'Horas realizadas apenas no período confrontadas com estimativa integral da unidade, contada uma única vez por chave composta/origem. Não é desvio do ciclo completo nem orçamento mensal. Subconjunto com estimativa positiva, com cobertura explícita; sem ratear por pessoa/departamento. Não comprova entrega ou capacidade.';
export async function activityMetric(id: string, f: Filters, reader: Query = analyticsQuery): Promise<Computed> {
  if (['horas_previstas','desvio_horas','horas_vs_previstas'].includes(id) && (f.employee||f.department)) throw new SourceLimitation('Critério gerencial pendente: estimativa da atividade sem atribuição individual ou departamental comprovada; orçamento compartilhado não é rateado.');
  const src=await activitySource(f,reader);
  if (id==='pecas_trabalhadas'&&!src.kinds.includes('WORKFLOW')) throw new SourceLimitation('Campo ou relacionamento ausente: peças com etapa e apontamento não comprovadas.');
  const [r]=await reader(`${src.sql} SELECT count(*) FILTER (WHERE matches=1)::int AS activities,
    count(*) FILTER (WHERE matches=1 AND kind='TASK')::int AS tasks,
    count(*) FILTER (WHERE matches=1 AND kind='WORKFLOW')::int AS steps,
    count(*) FILTER (WHERE matches=1 AND planned IS NULL)::int AS unestimated,
    count(DISTINCT parent_key) FILTER (WHERE kind='WORKFLOW' AND matches=1)::int AS pieces,
    count(planned)::int AS matched, sum(planned)::float8 AS planned,
    coalesce(sum(entries) FILTER (WHERE matches=1),0)::int AS linked_entries,
    coalesce(sum(entries) FILTER (WHERE kind='WORKFLOW' AND matches=1),0)::int AS piece_entries,
    sum(hours) FILTER (WHERE planned IS NOT NULL)::float8 AS actual,
    (SELECT count(*)::int FROM valid_time) AS total_entries,
    coalesce(sum(entries) FILTER (WHERE planned IS NOT NULL),0)::int AS covered_entries FROM activities`,src.params);
  const matched=Number(r.matched), total=Number(r.total_entries);
  if(id==='unidades_sem_estimativa'&&(f.employee||f.department))throw new SourceLimitation('Atribuição de estimativas não comprovada no escopo individual/departamental.');
  const value = id==='tarefas_trabalhadas'?Number(r.tasks):id==='etapas_trabalhadas'?Number(r.steps):id==='unidades_sem_estimativa'?Number(r.unestimated):id==='atividades_trabalhadas' ? Number(r.activities) : id==='pecas_trabalhadas' ? Number(r.pieces) : !matched ? null : id==='horas_previstas' ? Number(r.planned) : id==='desvio_horas' ? Number(r.actual)-Number(r.planned) : Number(r.planned)>0 ? Number(r.actual)/Number(r.planned) : null;
  const countMetric=['atividades_trabalhadas','pecas_trabalhadas','tarefas_trabalhadas','etapas_trabalhadas','unidades_sem_estimativa'].includes(id);
  const used=Number(countMetric?id==='pecas_trabalhadas'?r.piece_entries:r.linked_entries:r.covered_entries);
  return {value,reliability:'PARCIAL',recordsUsed:used,recordsExcluded:total-used,temporalField:'started_at',
    coverage:countMetric?`${used}/${total} apontamentos válidos com vínculo unívoco para esta contagem; não comprova entrega.`:`${matched}/${r.activities} atividades com estimativa; ${total ? (100*used/total).toFixed(1) : '0'}% dos apontamentos válidos cobertos.`,
    reason:note,insufficient:value==null ? 'Cobertura insuficiente: nenhuma estimativa válida ou denominador positivo no subconjunto.' : undefined};
}
export async function activityChart(f: Filters, reader: Query = analyticsQuery) {
  if (f.employee||f.department) throw new SourceLimitation('Critério gerencial pendente: comparação de estimativas exige atribuição individual/departamental, sem rateio presumido.');
  const src=await activitySource(f,reader);
  const rows=await reader(`${src.sql} SELECT kind AS label,sum(planned)::float8 AS previstas,
    sum(hours)::float8 AS realizadas FROM activities WHERE planned IS NOT NULL GROUP BY kind ORDER BY kind`,src.params);
  return {series:['previstas','realizadas'],points:rows,reliability:'PARCIAL' as const,reason:note};
}
export async function workedActivities(f: Filters,p:Page,reader:Query=analyticsQuery) {
  const src=await activitySource(f,reader); const sort=p.sort??'atividade';
  if (!['atividade','projeto','departamento','responsavel','horas','horas_previstas'].includes(sort)) throw new SourceLimitation('Campo de atividade indisponível para ordenação.');
  const r=await paginate(`${src.sql} SELECT kind||':'||parent_key||':'||child_key AS id,kind AS origem,
    project AS projeto,project_id AS projeto_id,name AS atividade,departments AS departamento,employees AS responsavel,
    hours AS horas,planned AS horas_previstas,cost AS custo_registrado,CASE WHEN planned IS NOT NULL THEN hours-planned END AS desvio FROM activities`,src.params,p,`${sort} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,id`,reader);
  return {...r,reason:note};
}
