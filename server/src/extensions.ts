import type { Filters } from "../../shared/contracts.js";
import { sourceStatement, eligibleTime, paginate, type Query } from "./analytics.js";
import { analyticsQuery, runtimeSchema, temporalTypes, type SchemaSnapshot } from "./schema.js";
import { q } from "./db.js";
import { SourceLimitation } from "./source-errors.js";
import type { Computed, Page } from "./mappings.js";
import { nameSQL } from './presentation.js';

export async function jobChart(kind: "status" | "opened", f: Filters, reader: Query = analyticsQuery) {
  const src = sourceStatement("jobs", f, "entered_at");
  const group = kind === "status" ? "coalesce(status_text::text, 'Sem status')" : "to_char(entered_at::timestamptz AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')";
  const rows = await reader(`WITH source AS (${src.sql}) SELECT ${group} AS label, count(*)::int AS projetos
    FROM source WHERE entered_at::timestamptz <= CURRENT_TIMESTAMP GROUP BY 1 ORDER BY 1`, src.params);
  return { series: ["projetos"], points: rows, reliability: "PARCIAL" as const,
    reason: "Projetos cadastrados no período por entered_at. Status é o estado textual atual, sem reconstrução histórica ou certificação de entrega." };
}
export async function invoiceEvolution(f: Filters, reader: Query = analyticsQuery) {
  const src = sourceStatement("invoices", f);
  const rows = await reader(`WITH source AS (${src.sql}) SELECT to_char(issued_at::timestamptz AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') AS label,
    sum(service_amount) FILTER (WHERE service_amount::text NOT IN ('NaN','Infinity','-Infinity'))::float8 AS bruto,
    sum(net_amount) FILTER (WHERE net_amount::text NOT IN ('NaN','Infinity','-Infinity'))::float8 AS liquido
    FROM source WHERE status='issued' AND issued_at::timestamptz <= CURRENT_TIMESTAMP GROUP BY 1 ORDER BY 1`, src.params);
  return { series: ["bruto", "liquido"], points: rows, reliability: "PARCIAL" as const,
    reason: "Valores bruto e líquido das notas emitidas. Não inclui recebimento nem soma perspectivas financeiras diferentes." };
}
function globalMonitor(f: Filters) {
  for (const key of ["client", "group", "project", "department", "employee", "service", "status"] as const) if (f[key]) throw new SourceLimitation(`Monitoramento global sem vínculo comprovado com ${key}.`);
}
export async function ingestChart(f: Filters, reader: Query = q, snapshot?: SchemaSnapshot) {
  globalMonitor(f);
  const s = snapshot ?? await runtimeSchema();
  if (!s.columns.some(c => c.schema === "ingest" && c.table === "qpf11_tasks" && c.column === "status")) throw new SourceLimitation("Status das tarefas não comprovado.");
  const rows = await reader("SELECT coalesce(status::text,'Sem status') AS label, count(*)::int AS tarefas FROM ingest.qpf11_tasks GROUP BY 1 ORDER BY 1", []);
  return { series: ["tarefas"], points: rows, reliability: "PARCIAL" as const, reason: "Fotografia atual dos estados literais, sem recorte temporal ou inferência de publicação integral." };
}
export async function ingestTable(f: Filters, p: Page, reader: Query = q, snapshot?: SchemaSnapshot) {
  globalMonitor(f);
  const s = snapshot ?? await runtimeSchema();
  const cols = s.columns.filter(c => c.schema === "ingest" && c.table === "qpf11_tasks");
  const keys = ["id", "task_id"].filter(name => cols.some(c => c.column === name));
  if (keys.length !== 1 || !cols.some(c => c.column === "status")) throw new SourceLimitation("Identidade unívoca da tarefa ou status não comprovados.");
  const update = cols.some(c => c.column === "updated_at" && temporalTypes.has(c.type)) ? "updated_at" : "NULL::timestamptz";
  const resource = cols.some(c => c.column === "resource") ? "resource::text" : "NULL::text";
  const sort = p.sort ?? "tarefa";
  if (!["tarefa", "status", "atualizado_em"].includes(sort)) throw new SourceLimitation("Ordenação de campo de coleta não mapeado.");
  const r = await paginate(`SELECT ${keys[0]}::text AS tarefa, status::text AS status, ${update} AS atualizado_em,
    ${resource} AS recurso FROM ingest.qpf11_tasks`, [], p, `${sort} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, tarefa`, reader);
  return { ...r, reason: "Estado atual do monitoramento, sem recorte temporal. Páginas e registros não são inferidos." };
}
export async function futureEntries(f: Filters, reader: Query = q, snapshot?: SchemaSnapshot): Promise<Computed> {
  for (const key of ["client", "group", "department", "employee", "service", "status"] as const) if (f[key]) throw new SourceLimitation(`Filtro ${key} não comprovado para cadastro financeiro futuro.`);
  const s = snapshot ?? await runtimeSchema();
  if (!s.columns.some(c => c.schema === "core" && c.table === "financial_entries" && c.column === "entry_date" && temporalTypes.has(c.type))) throw new SourceLimitation("entry_date temporal não comprovado.");
  if (f.project && !s.columns.some(c => c.schema === "core" && c.table === "financial_entries" && c.column === "job_id")) throw new SourceLimitation("Vínculo com projeto não comprovado.");
  const params: unknown[] = [f.start, f.end];
  if (f.project) params.push(f.project);
  const [r] = await reader(`SELECT count(*)::int AS n FROM core.financial_entries WHERE entry_date::timestamptz >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND entry_date::timestamptz < (($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND entry_date::timestamptz >= ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
    ${f.project ? "AND job_id::text = $3" : ""}`, params);
  return { value: Number(r.n), recordsUsed: Number(r.n), reliability: "PARCIAL", temporalField: "entry_date",
    reason: "Cadastros com entry_date em dia futuro; podem ter pagamento passado. Não são excluídos das movimentações realizadas por esse motivo." };
}
export async function timeAlerts(f: Filters, p: Page, reader: Query = analyticsQuery) {
  const src = sourceStatement("time", f);
  if (p.sort && !["tipo", "severidade", "entidade", "descricao"].includes(p.sort)) throw new SourceLimitation("Ordenação inválida de alertas.");
  return paginate(`WITH source AS (${src.sql}), anomalies AS (SELECT count(*)::int AS n FROM source WHERE NOT (${eligibleTime}))
    SELECT 'Qualidade do apontamento'::text AS tipo, 'REVISAR'::text AS severidade,
      'Apontamentos do período/escopo'::text AS entidade, n::text || ' registros sem duração válida ou com limites temporais inconsistentes/futuros.' AS descricao
    FROM anomalies WHERE n > 0`, src.params, p, "tipo", reader);
}
export async function taskTable(f: Filters, p: Page, reader: Query = analyticsQuery, snapshot?: SchemaSnapshot) {
  const src = sourceStatement("jobs", f, "entered_at");
  const s = snapshot ?? await runtimeSchema();
  if (!["job_id", "iclips_id"].every(name => s.columns.some(c => c.schema === "core" && c.table === "job_tasks" && c.column === name))) throw new SourceLimitation("Chave composta de tarefas não comprovada.");
  const [check] = await reader("SELECT EXISTS(SELECT 1 FROM core.job_tasks GROUP BY job_id,iclips_id HAVING count(*)>1 LIMIT 1) AS duplicate", []);
  if (check.duplicate) throw new SourceLimitation("Chave composta de tarefas duplicada; detalhamento bloqueado.");
  const sort = p.sort ?? "id";
  if (!["id", "projeto", "atividade"].includes(sort)) throw new SourceLimitation("Campo da tarefa sem mapeamento para ordenar.");
  const r = await paginate(`WITH source AS (${src.sql}) SELECT task.job_id::text || ':' || task.iclips_id::text AS id,
    task.job_id AS projeto_id, ${nameSQL(s,'jobs','iclips_id','task.job_id','Projeto sem nome')} AS projeto,
    ${s.columns.some(c=>c.schema==='core'&&c.table==='job_tasks'&&c.column==='name')?"coalesce(nullif(btrim(task.name::text),''),'Atividade sem nome')":"'Atividade sem nome'::text"} AS atividade FROM core.job_tasks task
    JOIN source j ON j.iclips_id = task.job_id WHERE j.entered_at::timestamptz <= CURRENT_TIMESTAMP`, src.params, p, `${sort} ${p.dir === "desc" ? "DESC" : "ASC"}, id`, reader);
  return { ...r, reason: "Tarefas cadastradas dos projetos abertos no período; não são tarefas comprovadamente executadas no período. Sem atribuir responsável/departamento da tarefa pelo cadastro do job." };
}
