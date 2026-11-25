// Apenas campos e relações explicitamente confirmados no pedido de integração.
// SELECTs PostgreSQL; nenhum dado ou estrutura é criado pela aplicação.
import type { Dimension, Filters } from "../../shared/contracts.js";
import { TABLES } from "../../shared/catalog.js";
import { analyticsQuery as q, numericTypes } from "./schema.js";
import { SourceLimitation } from "./source-errors.js";
export { SourceLimitation } from "./source-errors.js";
import type { Computed, Page, Rows } from "./mappings.js";
import { descriptiveName, labelledTime, nameSQL, registryJoin, schemaFor } from "./presentation.js";
import { activityKeys,projectActivityKeys } from './activity-profile.js';
import { documentClientsCTE,normalizedDocument } from './documents.js';
import { activitySource } from './activities.js';


export type Query = <T extends Record<string, any>>(sql: string, params: unknown[]) => Promise<T[]>;
export interface Statement { sql: string; params: unknown[] }
type Domain = "time" | "jobs" | "invoices" | "clients" | "employees" | "departments";
export interface Metric {
  domain: Domain; expression: string; temporal: string; condition?: string;
  amount?: string; limitation: string; sources: string[];
}
const timeNote = "Atribuição integral ao início do apontamento em America/Sao_Paulo; sem rateio entre dias. Sobreposições WORKFLOW/TASK não reconciliadas. Sem certificação de cobertura de publicação.";
const jobNote = "Datas de cadastro/conclusão observadas; não reconstrói status histórico. Códigos de status exigem classificação gerencial explícita.";
const invoiceNote = "Notas issued; cancelled e status desconhecidos excluídos. Valores nulos excluídos, sinais preservados. Sem vínculo de cliente por nome nem certificação de cobertura da coleta.";
const tm = (expression: string, extra: Partial<Metric> = {}): Metric => ({ domain: "time", expression, temporal: "started_at", limitation: timeNote, sources: ["core.time_entries", "core.jobs"], ...extra });
const im = (expression: string, extra: Partial<Metric> = {}): Metric => ({ domain: "invoices", expression, temporal: "issued_at", amount: "service_amount", limitation: invoiceNote, sources: ["core.invoices"], ...extra });

export const METRICS: Record<string, Metric> = {
  horas_registradas: tm("sum(seconds) / 3600.0"),
  custo_mao_de_obra: tm("sum(labor_cost)", { amount: "labor_cost", condition: "labor_cost IS NOT NULL AND labor_cost::text NOT IN ('NaN','Infinity','-Infinity')", limitation: "Soma apenas labor_cost registrado em apontamentos válidos; não adiciona duração × hourly_rate nem despesas de pessoal. Custo ausente reduz cobertura; não certifica custo total ou margem. " + timeNote }),
  horas_retrabalho: tm("sum(seconds) / 3600.0",{condition:'is_rework IS TRUE'}),
  retrabalho: tm("count(*)", { condition: "is_rework IS TRUE", limitation: "Quantidade de apontamentos válidos marcados is_rework; não equivale a tarefas distintas ou alterações de workflow. " + timeNote }),
  percentual_retrabalho: tm("coalesce(sum(seconds) FILTER (WHERE is_rework IS TRUE),0) / nullif(sum(seconds), 0)",{condition:'is_rework IS NOT NULL',limitation:'Percentual no subconjunto de apontamentos válidos com marcação de retrabalho preenchida; marcações ausentes excluídas do numerador e denominador. '+timeNote}),
  colaboradores_ativos: tm("count(DISTINCT employee_id)", { condition: "employee_id IS NOT NULL" }),
  projetos_atendidos:tm('count(DISTINCT job_id)',{condition:'job_id IS NOT NULL'}),
  clientes_ativos: tm("count(DISTINCT client_id)", { condition: "client_id IS NOT NULL", limitation: "Clientes com apontamentos válidos no período; não representa todo cliente com movimentação financeira ou cadastro ativo. " + timeNote }),
  receita_faturada: im("sum(service_amount)", { condition: "status = 'issued' AND service_amount IS NOT NULL AND service_amount::text NOT IN ('NaN','Infinity','-Infinity')" }),
  faturamento_liquido: im("sum(net_amount)", { amount: "net_amount", condition: "status = 'issued' AND net_amount IS NOT NULL AND net_amount::text NOT IN ('NaN','Infinity','-Infinity')" }),
  faturamento_competencia: im("sum(service_amount)", { temporal: "competence_date", condition: "status = 'issued' AND service_amount IS NOT NULL AND service_amount::text NOT IN ('NaN','Infinity','-Infinity')" }),
  notas_emitidas: im("count(*)", { condition: "status = 'issued'", amount: undefined }),
  notas_canceladas: im("count(*)", { condition: "status = 'cancelled'", amount: undefined }),
  projetos_iniciados: { domain: "jobs", expression: "count(*)", temporal: "entered_at", limitation: jobNote, sources: ["core.jobs"] },
  tempo_medio_execucao: { domain: "jobs", expression: "avg(extract(epoch FROM (completed_at::timestamptz - entered_at::timestamptz))) / 86400.0", temporal: "completed_at", condition: "completed_at::timestamptz >= entered_at::timestamptz AND entered_at IS NOT NULL", limitation: "Tempo de calendário; não mede esforço trabalhado. Não certifica entrega nem status de conclusão. " + jobNote, sources: ["core.jobs"] },
};

const domainSupported: Record<Domain, (keyof Filters)[]> = {
  time: ["client", "group", "project", "department", "employee", "status"],
  jobs: ["client", "group", "project", "employee", "status"],
  invoices: ["status","client"], clients: [], employees: [], departments: [],
};
export function validateFilters(domain: Domain, f: Filters) {
  if(f.status&&f.statusSource&&((domain==='invoices'&&f.statusSource!=='invoices')||(['time','jobs'].includes(domain)&&f.statusSource!=='projects')))
    throw new SourceLimitation('Filtro não aplicável: status de projetos e de notas fiscais possuem significados diferentes. Ajuste ou remova o filtro.');
  for (const k of ["client", "group", "project", "department", "employee", "service", "status"] as const) {
    if (f[k] && !domainSupported[domain].includes(k)) throw new SourceLimitation(`Filtro ${k} sem relacionamento comprovado para ${domain}. Consulta não executada.`);
  }
}

export function sourceStatement(domain: Domain, f: Filters, temporal?: string, includeLabor = false): Statement {
  if(f.category)throw new SourceLimitation('Filtro de categoria financeira sem vínculo comprovado nesta visão.');
  validateFilters(domain, f);
  const params: unknown[] = [f.start, f.end];
  const where: string[] = [];
  const bind = (value: string) => { params.push(value); return `$${params.length}`; };
  const time = (column: string) => {
    where.push(`${column} >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')`);
    where.push(`${column} < (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`);
  };
  let sql: string;
  if (domain === "time") {
    time("t.started_at");
    if (f.client) where.push(`j.client_id::text = ${bind(f.client)}`);
    if (f.group) where.push(`j.client_group_id::text = ${bind(f.group)}`);
    if (f.project) where.push(`t.job_id::text = ${bind(f.project)}`);
    if (f.employee) where.push(`t.employee_id::text = ${bind(f.employee)}`);
    if (f.department) where.push(`t.department_id::text = ${bind(f.department)}`);
    if (f.status) where.push(`j.status_text = ${bind(f.status)}`);
    sql = `SELECT t.id, t.job_id, t.employee_id, t.department_id, t.started_at, t.finished_at,
      t.completed_at, t.is_rework, ${includeLabor ? "t.labor_cost," : ""} j.client_id, j.client_group_id, j.status_text,
      to_jsonb(t)->>'department_name_snapshot' AS department_name_snapshot,
      to_jsonb(t)->>'source_kind' AS source_kind, to_jsonb(t)->>'task_id' AS task_id,
      to_jsonb(t)->>'workflow_step_id' AS workflow_step_id, to_jsonb(t)->>'job_piece_id' AS job_piece_id,
      to_jsonb(t)->>'source_path' AS source_path,
      CASE WHEN t.duration_seconds >= 0 AND t.duration_seconds::text NOT IN ('NaN','Infinity','-Infinity') AND (t.duration_minutes IS NULL OR
          (t.duration_minutes >= 0 AND t.duration_minutes::text NOT IN ('NaN','Infinity','-Infinity') AND abs(t.duration_seconds - t.duration_minutes * 60) <= 1))
          THEN t.duration_seconds::numeric
        WHEN t.duration_seconds IS NULL AND t.duration_minutes >= 0 AND t.duration_minutes::text NOT IN ('NaN','Infinity','-Infinity') THEN t.duration_minutes::numeric * 60
        ELSE NULL END AS seconds
      FROM core.time_entries t LEFT JOIN core.jobs j ON j.iclips_id = t.job_id
      WHERE ${where.join(" AND ")}`;
  } else if (domain === "jobs") {
    time(`j.${temporal ?? "entered_at"}`);
    if (f.client) where.push(`j.client_id::text = ${bind(f.client)}`);
    if (f.group) where.push(`j.client_group_id::text = ${bind(f.group)}`);
    if (f.project) where.push(`j.iclips_id::text = ${bind(f.project)}`);
    if (f.employee) { const p = bind(f.employee); where.push(`(j.principal_employee_id::text = ${p} OR j.auxiliary_employee_id::text = ${p})`); }
    if (f.status) where.push(`j.status_text = ${bind(f.status)}`);
    sql = `SELECT j.iclips_id, j.client_id, j.client_group_id, j.status_text, j.entered_at, j.completed_at, j.expected_end_at FROM core.jobs j WHERE ${where.join(" AND ")}`;
  } else if (domain === "invoices") {
    time(`i.${temporal ?? "issued_at"}`);
    if (f.status) where.push(`i.status = ${bind(f.status)}`);
    const linked=!!f.client;
    if(f.client)where.push(`d.client_id::text=${bind(f.client)}`);
    sql = `${linked?'WITH '+documentClientsCTE():''} SELECT i.iclips_id, i.invoice_number, i.status, i.issued_at, i.competence_date,
      i.service_amount, i.net_amount, i.iss_amount, i.client_name, i.last_seen_at
      ,to_jsonb(i)->>'client_document' AS client_document
      FROM core.invoices i ${linked?`LEFT JOIN document_clients d ON d.doc=${normalizedDocument('i.client_document')} AND d.candidates=1`:''} WHERE ${where.join(" AND ")}`;
  } else {
    // Contagens de cadastro são fotografias atuais, não séries históricas.
    sql = `SELECT ${domain === "departments" ? "id" : "iclips_id"} FROM core.${domain} WHERE $1::date <= $2::date`;
  }
  return { sql, params };
}

export const eligibleTime = "seconds IS NOT NULL AND started_at::timestamptz <= CURRENT_TIMESTAMP AND (finished_at IS NULL OR (finished_at::timestamptz <= CURRENT_TIMESTAMP AND finished_at::timestamptz >= started_at::timestamptz))";
export function metricStatement(id: string, f: Filters): Statement {
  const spec = METRICS[id];
  if (!spec) throw new SourceLimitation("Sem semântica suficiente para este indicador.");
  const src = sourceStatement(spec.domain, f, spec.temporal, spec.amount === "labor_cost");
  const condition = [spec.domain === "time" ? eligibleTime : `${spec.temporal}::timestamptz <= CURRENT_TIMESTAMP`, spec.condition ?? "TRUE"].join(" AND ");
  return { params: src.params, sql: `WITH source AS (${src.sql}), eligible AS (SELECT * FROM source WHERE ${condition})
    SELECT (${spec.expression})::double precision AS value, count(*)::int AS used,
      (SELECT count(*)::int FROM source) - count(*)::int AS excluded,
      ${spec.domain === "invoices" ? "max(last_seen_at)::text" : "NULL::text"} AS updated
      ${id==='horas_retrabalho'?`, (SELECT count(*)::int FROM source WHERE ${eligibleTime}) AS base_used, (SELECT count(*)::int FROM source WHERE ${eligibleTime} AND is_rework IS NULL) AS missing_flags`:''}
      ${id==='tempo_medio_execucao' ? ", min(extract(epoch FROM (completed_at::timestamptz-entered_at::timestamptz))/86400.0)::float8 AS minimum_days, max(extract(epoch FROM (completed_at::timestamptz-entered_at::timestamptz))/86400.0)::float8 AS maximum_days, percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (completed_at::timestamptz-entered_at::timestamptz))/86400.0)::float8 AS median_days" : ''}
    FROM eligible` };
}

export async function computeMetric(id: string, f: Filters, query: Query = q): Promise<Computed> {
  const spec = METRICS[id];
  const stmt = metricStatement(id, f);
  let r:Record<string,any>;
  if(spec.domain==='time'&&id!=='custo_mao_de_obra'){
    const specs=Object.entries(METRICS).filter(([key,m])=>m.domain==='time'&&key!=='custo_mao_de_obra');
    const fields=specs.flatMap(([key,m])=>{
      const condition=m.condition??'TRUE';
      const expression=key==='percentual_retrabalho'?"coalesce(sum(seconds) FILTER (WHERE is_rework IS TRUE),0) / nullif(sum(seconds) FILTER (WHERE is_rework IS NOT NULL),0)":m.expression.replace(/\b(sum|count)\(([^()]*)\)/g,`$1($2) FILTER (WHERE ${condition})`);
      return [`(${expression})::float8 AS v_${key}`,`count(*) FILTER (WHERE ${condition})::int AS u_${key}`];
    });
    const src=sourceStatement('time',f);
    const [row]=await query(`WITH source AS (${src.sql}), eligible AS (SELECT * FROM source WHERE ${eligibleTime})
      SELECT ${fields.join(',')},count(*)::int AS base_used,count(*) FILTER(WHERE is_rework IS NULL)::int AS missing_flags,
      (SELECT count(*)::int FROM source) AS total FROM eligible`,src.params);
    r={...row,value:row[`v_${id}`],used:row[`u_${id}`],excluded:Number(row.total)-Number(row[`u_${id}`])};
  }else [r]=await query(stmt.sql, stmt.params);
  const knownZero=id==='horas_retrabalho'&&r.value==null&&Number(r.base_used)>0&&Number(r.missing_flags)===0;
  return { value: knownZero?0:r.value == null ? null : Number(r.value), reliability: "PARCIAL",
    recordsUsed: Number(r.used), recordsExcluded: Number(r.excluded),
    exclusions: [{ reason: "Nulos, inconsistências de duração, término futuro ou condição específica do indicador", count: Number(r.excluded) }],
    updatedAt: r.updated ?? null, temporalField: spec.temporal,
    coverage: "Não certificada. Registros sem data não são atribuídos ao período e não entram nas contagens de exclusão temporal.",
    reason: spec.limitation + (id==='tempo_medio_execucao' ? ` Coorte: conclusões informadas no período; denominador ${r.used}. Mínimo ${r.minimum_days ?? '—'}, mediana ${r.median_days ?? '—'}, máximo ${r.maximum_days ?? '—'} dias. Sem corte arbitrário de outliers; datas inválidas/futuras excluídas.` : ''),
    insufficient: r.value == null&&!knownZero ? "Nenhum valor válido no período; ausência de valor não equivale a zero. " + spec.limitation : undefined } as Computed;
}

export async function metricRecords(id: string, f: Filters, p: Page, query: Query = q): Promise<Rows> {
  const spec = METRICS[id];
  const src = sourceStatement(spec.domain, f, spec.temporal, spec.amount === "labor_cost");
  const schema=spec.domain==='time'||spec.domain==='jobs'?await schemaFor(query):undefined;
  const condition = [spec.domain === "time" ? eligibleTime : `${spec.temporal}::timestamptz <= CURRENT_TIMESTAMP`, spec.condition ?? "TRUE"].join(" AND ");
  const fields = spec.domain === "time" ? `id, job_id, employee_id, department_id, job_name AS projeto, employee_name AS colaborador, department_name AS departamento, started_at, seconds / 3600.0 AS horas, is_rework${spec.amount === "labor_cost" ? ", labor_cost AS custo_registrado" : ""}`
    : spec.domain === "invoices" ? "iclips_id, invoice_number, status, issued_at, competence_date, service_amount, net_amount"
    : `iclips_id, client_id, ${nameSQL(schema!,'jobs','iclips_id','source.iclips_id','Projeto sem nome')} AS projeto, ${nameSQL(schema!,'clients','iclips_id','source.client_id','Cliente sem nome')} AS cliente,status_text, entered_at, completed_at`;
  return paginate(`WITH source AS (${schema&&spec.domain==='time'?labelledTime(src.sql,schema):src.sql}) SELECT ${fields} FROM source WHERE ${condition}`, src.params, p, spec.domain === "time" ? "id" : "iclips_id", query);
}

export async function paginate(sql: string, params: unknown[], p: Page, order: string, query: Query = q): Promise<Rows> {
  const args = [...params];let searched=sql;
  if(p.search){
    const columns=p.searchColumns??[];
    if(!columns.length||columns.some(c=>!/^[_a-z]+$/.test(c)))throw new SourceLimitation('Pesquisa indisponível para esta tabela.');
    args.push('%'+p.search.replace(/[\\%_]/g,'\\$&')+'%');
    searched=`SELECT * FROM (${sql}) searched WHERE concat_ws(' ',${columns.map(c=>`searched.${c}::text`).join(',')}) ILIKE $${args.length}`;
  }
  args.push(p.pageSize,(p.page-1)*p.pageSize);
  const [r] = await query(`WITH rows AS (${searched}), page AS (SELECT * FROM rows ORDER BY ${order} LIMIT $${args.length - 1} OFFSET $${args.length})
    SELECT (SELECT count(*)::int FROM rows) AS total, coalesce((SELECT json_agg(page) FROM page), '[]'::json) AS rows`, args);
  return { rows: r.rows, total: Number(r.total), reliability: "PARCIAL" };
}

const groups: Record<string, { key: string; label: string; value: string }> = {
  horas_por_cliente: { key: "client_id", label: "Cliente", value: "sum(seconds) / 3600.0" },
  horas_por_departamento: { key: "department_id", label: "Departamento", value: "sum(seconds) / 3600.0" },
  horas_por_colaborador: { key: "employee_id", label: "Colaborador", value: "sum(seconds) / 3600.0" },
  horas_por_projeto: { key: "job_id", label: "Projeto", value: "sum(seconds) / 3600.0" },
  retrabalho_por_colaborador: { key: "employee_id", label: "Colaborador", value: "sum(seconds) FILTER (WHERE is_rework IS TRUE) / 3600.0" },
};
export const TIME_CHARTS = Object.keys(groups);
export async function timeChart(id: string, f: Filters, query: Query = q) {
  const g = groups[id]; const src = sourceStatement("time", f);
  const schema=await schemaFor(query); const label=({client_id:"client_name",department_id:"department_name",employee_id:"employee_name",job_id:"job_name"} as Record<string,string>)[g.key];
  const absent=['employee_id','department_id','job_id','client_id','client_group_id'].filter(k=>k!==g.key).map(k=>`NULL::text AS ${k}`).join(',');
  const aggregate=`WITH source AS (${src.sql}) SELECT ${g.key},${absent},
    max(${descriptiveName('department_name_snapshot')}) AS department_name_snapshot,(${g.value})::float8 AS horas
    FROM source WHERE ${eligibleTime} GROUP BY ${g.key}`;
  const rows = await query(`SELECT ${g.key}::text AS entity_id,${label} AS label,horas
    FROM (${labelledTime(aggregate,schema)}) named ORDER BY horas DESC NULLS LAST,label LIMIT 50`,src.params);
  return { series: ["horas"], points: rows.map(r => ({ label: r.label, horas: r.horas == null ? null : Number(r.horas) })), reliability: "PARCIAL" as const, reason: timeNote };
}

export async function invoiceChart(f: Filters, query: Query = q) {
  const src = sourceStatement("invoices", f);
  const rows = await query(`WITH source AS (${src.sql}) SELECT to_char(issued_at::timestamptz AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS label,
    sum(service_amount)::float8 AS faturado FROM source WHERE status = 'issued' AND service_amount IS NOT NULL AND service_amount::text NOT IN ('NaN','Infinity','-Infinity') AND issued_at::timestamptz <= CURRENT_TIMESTAMP
    GROUP BY 1 ORDER BY 1`, src.params);
  return { series: ["faturado"], points: rows, reliability: "PARCIAL" as const, reason: invoiceNote };
}

export const TIME_TABLES = ["apontamentos", "timesheet_departamentos", "departamentos", "colaboradores", "capacidade_colaboradores", "retrabalho","timesheet_projetos","timesheet_calendario"];
export async function timeTable(id: string, f: Filters, p: Page, query: Query = q): Promise<Rows> {
  const schema=await schemaFor(query);
  const hasCost=schema.columns.some(c=>c.schema==='core'&&c.table==='time_entries'&&c.column==='labor_cost'&&numericTypes.has(c.type));
  const src = sourceStatement("time", f,undefined,hasCost);
  let activityProfile:ReturnType<typeof activityKeys>|undefined;
  try {activityProfile=activityKeys(schema);src.sql=projectActivityKeys(src.sql,activityProfile.keys);}catch { /* Horas independem da identidade de atividade. */ }
  const key = ["departamentos", "timesheet_departamentos"].includes(id) ? "department_id" : "employee_id";
  const hasActivities=activityProfile&&(activityProfile.task||activityProfile.workflow);
  if(p.activity){
    if(!activityProfile||(p.activity.kind==='TASK'?!activityProfile.task:!activityProfile.workflow))throw new SourceLimitation('Identidade composta da atividade não comprovada.');
    const start=src.params.length;
    src.params.push(p.activity.kind,p.activity.parent,p.activity.child);
    src.sql=`SELECT * FROM (${src.sql}) activity_filtered WHERE source_kind=$${start+1} AND ${p.activity.kind==='TASK'?'job_id::text':'job_piece_id'}=$${start+2} AND ${p.activity.kind==='TASK'?'task_id':'workflow_step_id'}=$${start+3}`;
  }
  let prefix=`WITH source AS (${labelledTime(src.sql,schema)})`;
  let sql: string;
  if (id === "apontamentos") {
    let join='',name='NULL::text';
    if(hasActivities){
      const units=await activitySource(f,query,{sql:'SELECT * FROM raw_time',params:src.params});
      prefix=`WITH raw_time AS (${src.sql}),source AS (${labelledTime('SELECT * FROM raw_time',schema)}), units AS (${units.sql} SELECT kind,parent_key,child_key,project_id,name FROM activities)`;
      join=`LEFT JOIN units u ON u.kind=source.source_kind AND u.parent_key=CASE WHEN source.source_kind='TASK' THEN source.job_id::text ELSE source.job_piece_id END AND u.child_key=CASE WHEN source.source_kind='TASK' THEN source.task_id ELSE source.workflow_step_id END AND u.project_id::text=source.job_id::text`;
      name='u.name';
    }
    sql = `SELECT id, started_at AS data, employee_name AS colaborador, department_name AS departamento,
      job_name AS projeto,job_id AS projeto_id,${name} AS atividade,seconds / 3600.0 AS horas, is_rework AS retrabalho,${hasCost?'labor_cost':'NULL::numeric'} AS custo_registrado FROM source ${join} WHERE ${eligibleTime}`;
  } else if(id==='timesheet_calendario'){
    sql=`SELECT (started_at::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date AS data,sum(seconds)/3600.0 AS horas,
      sum(seconds) FILTER(WHERE is_rework IS TRUE)/3600.0 AS horas_retrabalho,count(*)::int AS apontamentos FROM source WHERE ${eligibleTime} GROUP BY 1`;
  } else if(id==='timesheet_projetos'){
    sql=`SELECT job_id::text AS projeto_id,max(job_name) AS projeto,string_agg(DISTINCT department_name,', ') AS departamento,
      count(DISTINCT employee_id)::int AS colaboradores,sum(seconds)/3600.0 AS horas,sum(seconds) FILTER(WHERE is_rework IS TRUE)/3600.0 AS horas_retrabalho,
      ${hasCost?"sum(labor_cost) FILTER(WHERE labor_cost::text NOT IN ('NaN','Infinity','-Infinity'))":'NULL::numeric'} AS custo_registrado FROM source WHERE ${eligibleTime} GROUP BY job_id`;
  } else {
    sql = `SELECT ${key}::text AS entity_id, max(${key === "department_id" ? "department_name" : "employee_name"}) AS ${key === "department_id" ? "departamento" : "colaborador"}, string_agg(DISTINCT department_name, ', ') AS cargo,
      ${key==='employee_id'?"string_agg(DISTINCT department_name, ', ') AS departamento,":''}
      ${hasCost ? "sum(labor_cost) FILTER (WHERE labor_cost::text NOT IN ('NaN','Infinity','-Infinity'))" : 'NULL::numeric'} AS custo_registrado,
      ${hasCost ? "count(*) FILTER (WHERE labor_cost IS NOT NULL AND labor_cost::text NOT IN ('NaN','Infinity','-Infinity'))::numeric/nullif(count(*),0)" : 'NULL::numeric'} AS cobertura_custos,
      ${hasActivities ? "count(DISTINCT CASE WHEN source_kind='TASK' AND job_id IS NOT NULL AND task_id IS NOT NULL THEN jsonb_build_array(source_kind,job_id::text,task_id) WHEN source_kind='WORKFLOW' AND job_piece_id IS NOT NULL AND workflow_step_id IS NOT NULL THEN jsonb_build_array(source_kind,job_piece_id,workflow_step_id) END)::int" : 'NULL::int'} AS atividades,
      count(*)::int AS apontamentos, count(DISTINCT employee_id)::int AS colaboradores,
      count(DISTINCT job_id)::int AS projetos, sum(seconds) / 3600.0 AS horas,
      sum(seconds) / 3600.0 AS registradas,
      sum(seconds) FILTER (WHERE is_rework IS TRUE) / 3600.0 AS horas_retrabalho,
      count(*) FILTER (WHERE is_rework IS TRUE)::int AS ocorrencias
      FROM source WHERE ${eligibleTime} ${id === "retrabalho" ? "AND is_rework IS TRUE" : ""} GROUP BY ${key}`;
  }
  const columns = TABLES[id]?.columns.map(c => c.key) ?? [];
  const present = ["data", "colaborador", "departamento", "projeto", "atividade", "horas", "retrabalho", "colaboradores", "projetos", "horas_retrabalho", "apontamentos", "registradas", "ocorrencias", "custo_registrado", "atividades", "cargo"];
  if (p.sort && (!columns.includes(p.sort) || !present.includes(p.sort))) throw new SourceLimitation("Ordenação indisponível para coluna sem fonte comprovada.");
  const primary=id==='apontamentos'||id==='timesheet_calendario'?'data':id==='timesheet_projetos'?'projeto':key==='department_id'?'departamento':'colaborador';
  const tie=id==='apontamentos'?'id':id==='timesheet_calendario'?'data':id==='timesheet_projetos'?'projeto_id':'entity_id';
  const result=await paginate(`${prefix} ${sql}`, src.params, p, `${p.sort??primary} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,${tie}`,query);
  return {...result,reason:'Agrupamento por identificador; nomes ausentes/duplicados sinalizados sem multiplicar fatos. Departamento histórico do apontamento. Atividades contam chaves de origem com apontamento; campos ausentes ficam sem valor. Previsão individual e aproveitamento exigem atribuição comprovada da estimativa; capacidade e ocupação exigem disponibilidade contratada. Custo registrado é parcial e não inclui duração × taxa.'};
}

export async function operationalDimension(dim: Dimension, f: Filters, query: Query = q) {
  const keys: Partial<Record<Dimension, string>> = { clients: "client_id", groups: "client_group_id", projects: "job_id", departments: "department_id", employees: "employee_id", statuses: "status_text" };
  const key = keys[dim];
  if (!key) throw new SourceLimitation("Dimensão sem semântica confirmada; nenhum valor é presumido.");
  const src = sourceStatement("time", f); const schema=await schemaFor(query); const label=({clients:"client_name",groups:"group_name",projects:"job_name",departments:"department_name",employees:"employee_name",statuses:"status_text"} as Record<string,string>)[dim];
  const rows = await query(`WITH source AS (${labelledTime(src.sql,schema)}) SELECT ${key}::text AS value,
    max(${label}) AS label FROM source WHERE ${eligibleTime} AND ${key} IS NOT NULL GROUP BY ${key} ORDER BY 2,1 LIMIT 500`, src.params);
  return rows.map(r => ({ value: String(r.value), label: String(r.label) }));
}

export async function clientTable(f: Filters, p: Page, query: Query = q) {
  const src = sourceStatement("time", f); const schema=await schemaFor(query);
  const linked=!f.department&&!f.employee&&!f.project&&!f.group&&!f.status&&!f.service&&[['clients','document'],['invoices','client_document']].every(([table,column])=>schema.columns.some(c=>c.schema==='core'&&c.table===table&&c.column===column));
  const sort = p.sort ?? "cliente";
  if (!["cliente", "grupo", "projetos", "horas",...(linked?['faturado']:[])].includes(sort)) throw new SourceLimitation("Coluna sem fonte comprovada para ordenação de clientes.");
  const invoiceSQL=linked?`,${documentClientsCTE()}, invoice_totals AS (
    SELECT d.client_id,sum(i.service_amount)::numeric AS faturado FROM core.invoices i JOIN document_clients d ON d.doc=${normalizedDocument('i.client_document')} AND d.candidates=1
    WHERE i.status='issued' AND i.service_amount IS NOT NULL AND i.service_amount::text NOT IN ('NaN','Infinity','-Infinity') AND i.issued_at::timestamptz<=CURRENT_TIMESTAMP
      AND i.issued_at::timestamptz>=($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND i.issued_at::timestamptz<(($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') GROUP BY d.client_id
  )`:'';
  return {...await paginate(`WITH source AS (${labelledTime(src.sql,schema)}), worked AS (SELECT client_id AS id,
    max(client_name) AS cliente, string_agg(DISTINCT group_name, ', ') AS grupo,
    count(DISTINCT job_id)::int AS projetos, sum(seconds) / 3600.0 AS horas FROM source
    WHERE ${eligibleTime} GROUP BY client_id) ${invoiceSQL}
    SELECT w.*,${linked?'it.faturado':'NULL::numeric AS faturado'} FROM worked w ${linked?'LEFT JOIN invoice_totals it ON it.client_id::text=w.id::text':''}`, src.params, p, `${sort} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, id`, query),reason:'Clientes com apontamento no período. Faturamento documental unívoco aparece somente quando pode ser filtrado no mesmo escopo; ausências e associações ambíguas não viram zero. Demais clientes faturados estão na análise de faturamento por cliente.'};
}

export async function jobTable(f: Filters, p: Page, query: Query = q) {
  const src = sourceStatement("jobs", f, "entered_at"); const schema=await schemaFor(query);
  const sort = p.sort ?? "codigo";
  if (!["codigo", "titulo", "cliente", "status", "abertura", "prazo"].includes(sort)) throw new SourceLimitation("Coluna sem fonte comprovada para ordenação de projetos.");
  const job=registryJoin(schema,'jobs','iclips_id','source.iclips_id','jn','Projeto sem nome');
  const client=registryJoin(schema,'clients','iclips_id','source.client_id','cn','Cliente sem nome');
  return paginate(`WITH source AS (${src.sql}) SELECT iclips_id AS id, NULL::text AS codigo,
    ${job.value} AS titulo, ${client.value} AS cliente, status_text AS status,
    entered_at AS abertura, expected_end_at AS prazo FROM source ${job.join} ${client.join} WHERE entered_at::timestamptz <= CURRENT_TIMESTAMP`,
    src.params, p, `${sort} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, id`, query);
}
