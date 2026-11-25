// Apenas campos e relações explicitamente confirmados no pedido de integração.
// SELECTs PostgreSQL; nenhum dado ou estrutura é criado pela aplicação.
import type { Dimension, Filters } from "../../shared/contracts.js";
import { TABLES } from "../../shared/catalog.js";
import { analyticsQuery as q } from "./schema.js";
import { SourceLimitation } from "./source-errors.js";
export { SourceLimitation } from "./source-errors.js";
import type { Computed, Page, Rows } from "./mappings.js";


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
  horas_retrabalho: tm("sum(seconds) / 3600.0", { condition: "is_rework IS TRUE" }),
  retrabalho: tm("count(*)", { condition: "is_rework IS TRUE", limitation: "Quantidade de apontamentos válidos marcados is_rework; não equivale a tarefas distintas ou alterações de workflow. " + timeNote }),
  percentual_retrabalho: tm("sum(seconds) FILTER (WHERE is_rework IS TRUE) / nullif(sum(seconds), 0)"),
  colaboradores_ativos: tm("count(DISTINCT employee_id)", { condition: "employee_id IS NOT NULL" }),
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
  invoices: ["status"], clients: [], employees: [], departments: [],
};
export function validateFilters(domain: Domain, f: Filters) {
  for (const k of ["client", "group", "project", "department", "employee", "service", "status"] as const) {
    if (f[k] && !domainSupported[domain].includes(k)) throw new SourceLimitation(`Filtro ${k} sem relacionamento comprovado para ${domain}. Consulta não executada.`);
  }
}

export function sourceStatement(domain: Domain, f: Filters, temporal?: string, includeLabor = false): Statement {
  validateFilters(domain, f);
  const params: unknown[] = [f.start, f.end];
  const where: string[] = [];
  const bind = (value: string) => { params.push(value); return `$${params.length}`; };
  const time = (column: string) => {
    where.push(`${column}::timestamptz >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')`);
    where.push(`${column}::timestamptz < (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`);
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
    sql = `SELECT i.iclips_id, i.invoice_number, i.status, i.issued_at, i.competence_date,
      i.service_amount, i.net_amount, i.iss_amount, i.client_name, i.last_seen_at
      FROM core.invoices i WHERE ${where.join(" AND ")}`;
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
    FROM eligible` };
}

export async function computeMetric(id: string, f: Filters, query: Query = q): Promise<Computed> {
  const spec = METRICS[id];
  const stmt = metricStatement(id, f);
  const [r] = await query(stmt.sql, stmt.params);
  return { value: r.value == null ? null : Number(r.value), reliability: "PARCIAL",
    recordsUsed: Number(r.used), recordsExcluded: Number(r.excluded),
    exclusions: [{ reason: "Nulos, inconsistências de duração, término futuro ou condição específica do indicador", count: Number(r.excluded) }],
    updatedAt: r.updated ?? null, temporalField: spec.temporal,
    coverage: "Não certificada. Registros sem data não são atribuídos ao período e não entram nas contagens de exclusão temporal.",
    reason: spec.limitation,
    insufficient: r.value == null ? "Nenhum valor válido no período; ausência de valor não equivale a zero. " + spec.limitation : undefined } as Computed;
}

export async function metricRecords(id: string, f: Filters, p: Page, query: Query = q): Promise<Rows> {
  const spec = METRICS[id];
  const src = sourceStatement(spec.domain, f, spec.temporal, spec.amount === "labor_cost");
  const condition = [spec.domain === "time" ? eligibleTime : `${spec.temporal}::timestamptz <= CURRENT_TIMESTAMP`, spec.condition ?? "TRUE"].join(" AND ");
  const fields = spec.domain === "time" ? `id, job_id, employee_id, department_id, started_at, seconds / 3600.0 AS horas, is_rework${spec.amount === "labor_cost" ? ", labor_cost AS custo_registrado" : ""}`
    : spec.domain === "invoices" ? "iclips_id, invoice_number, status, issued_at, competence_date, service_amount, net_amount"
    : "iclips_id, client_id, status_text, entered_at, completed_at";
  return paginate(`WITH source AS (${src.sql}) SELECT ${fields} FROM source WHERE ${condition}`, src.params, p, spec.domain === "time" ? "id" : "iclips_id", query);
}

export async function paginate(sql: string, params: unknown[], p: Page, order: string, query: Query = q): Promise<Rows> {
  const args = [...params, p.pageSize, (p.page - 1) * p.pageSize];
  const [r] = await query(`WITH rows AS (${sql}), page AS (SELECT * FROM rows ORDER BY ${order} LIMIT $${args.length - 1} OFFSET $${args.length})
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
  const rows = await query(`WITH source AS (${src.sql}) SELECT coalesce(${g.key}::text, 'Sem vínculo') AS label,
    (${g.value})::float8 AS horas FROM source WHERE ${eligibleTime}
    GROUP BY ${g.key} ORDER BY horas DESC NULLS LAST, label LIMIT 50`, src.params);
  return { series: ["horas"], points: rows.map(r => ({ label: r.label, horas: r.horas == null ? null : Number(r.horas) })), reliability: "PARCIAL" as const, reason: timeNote };
}

export async function invoiceChart(f: Filters, query: Query = q) {
  const src = sourceStatement("invoices", f);
  const rows = await query(`WITH source AS (${src.sql}) SELECT to_char(issued_at::timestamptz AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS label,
    sum(service_amount)::float8 AS faturado FROM source WHERE status = 'issued' AND service_amount IS NOT NULL AND service_amount::text NOT IN ('NaN','Infinity','-Infinity') AND issued_at::timestamptz <= CURRENT_TIMESTAMP
    GROUP BY 1 ORDER BY 1`, src.params);
  return { series: ["faturado"], points: rows, reliability: "PARCIAL" as const, reason: invoiceNote };
}

export const TIME_TABLES = ["apontamentos", "timesheet_departamentos", "departamentos", "colaboradores", "capacidade_colaboradores", "retrabalho"];
export async function timeTable(id: string, f: Filters, p: Page, query: Query = q): Promise<Rows> {
  const src = sourceStatement("time", f);
  const key = ["departamentos", "timesheet_departamentos"].includes(id) ? "department_id" : "employee_id";
  let sql: string;
  if (id === "apontamentos") {
    sql = `SELECT id, started_at AS data, employee_id::text AS colaborador, department_id::text AS departamento,
      job_id::text AS projeto, seconds / 3600.0 AS horas, is_rework AS retrabalho FROM source WHERE ${eligibleTime}`;
  } else {
    sql = `SELECT ${key}::text AS ${key === "department_id" ? "departamento" : "colaborador"},
      count(*)::int AS apontamentos, count(DISTINCT employee_id)::int AS colaboradores,
      count(DISTINCT job_id)::int AS projetos, sum(seconds) / 3600.0 AS horas,
      sum(seconds) / 3600.0 AS registradas,
      sum(seconds) FILTER (WHERE is_rework IS TRUE) / 3600.0 AS horas_retrabalho,
      count(*) FILTER (WHERE is_rework IS TRUE)::int AS ocorrencias
      FROM source WHERE ${eligibleTime} ${id === "retrabalho" ? "AND is_rework IS TRUE" : ""} GROUP BY ${key}`;
  }
  const columns = TABLES[id]?.columns.map(c => c.key) ?? [];
  const present = ["data", "colaborador", "departamento", "projeto", "horas", "retrabalho", "colaboradores", "projetos", "horas_retrabalho", "apontamentos", "registradas", "ocorrencias"];
  if (p.sort && (!columns.includes(p.sort) || !present.includes(p.sort))) throw new SourceLimitation("Ordenação indisponível para coluna sem fonte comprovada.");
  return paginate(`WITH source AS (${src.sql}) ${sql}`, src.params, p, `${p.sort ?? (id === "apontamentos" ? "data" : key === "department_id" ? "departamento" : "colaborador")} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`, query);
}

export async function operationalDimension(dim: Dimension, f: Filters, query: Query = q) {
  const keys: Partial<Record<Dimension, string>> = { clients: "client_id", groups: "client_group_id", projects: "job_id", departments: "department_id", employees: "employee_id", statuses: "status_text" };
  const key = keys[dim];
  if (!key) throw new SourceLimitation("Dimensão sem semântica confirmada; nenhum valor é presumido.");
  const src = sourceStatement("time", f);
  const rows = await query(`WITH source AS (${src.sql}) SELECT DISTINCT ${key}::text AS value,
    ${key}::text AS label FROM source WHERE ${eligibleTime} AND ${key} IS NOT NULL ORDER BY 1 LIMIT 500`, src.params);
  return rows.map(r => ({ value: String(r.value), label: String(r.label) }));
}

export async function clientTable(f: Filters, p: Page, query: Query = q) {
  const src = sourceStatement("time", f);
  const sort = p.sort ?? "cliente";
  if (!["cliente", "grupo", "projetos", "horas"].includes(sort)) throw new SourceLimitation("Coluna sem fonte comprovada para ordenação de clientes.");
  return paginate(`WITH source AS (${src.sql}) SELECT client_id AS id,
    coalesce(client_id::text, 'Sem vínculo') AS cliente, client_group_id::text AS grupo,
    count(DISTINCT job_id)::int AS projetos, sum(seconds) / 3600.0 AS horas FROM source
    WHERE ${eligibleTime} GROUP BY client_id, client_group_id`, src.params, p, `${sort} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, id`, query);
}

export async function jobTable(f: Filters, p: Page, query: Query = q) {
  const src = sourceStatement("jobs", f, "entered_at");
  const sort = p.sort ?? "codigo";
  if (!["codigo", "titulo", "cliente", "status", "abertura", "prazo"].includes(sort)) throw new SourceLimitation("Coluna sem fonte comprovada para ordenação de projetos.");
  return paginate(`WITH source AS (${src.sql}) SELECT iclips_id AS id, iclips_id::text AS codigo,
    iclips_id::text AS titulo, client_id::text AS cliente, status_text AS status,
    entered_at AS abertura, expected_end_at AS prazo FROM source WHERE entered_at::timestamptz <= CURRENT_TIMESTAMP`,
    src.params, p, `${sort} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, id`, query);
}
