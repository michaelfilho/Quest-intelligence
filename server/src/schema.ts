// Introspecção leve em memória. A aplicação nunca persiste cópias dos dados analíticos.
import { q, SCHEMAS } from "./db.js";
import { SourceLimitation } from "./source-errors.js";
import { integer } from './performance.js';

export type Reader = <T extends Record<string, any>>(sql: string, params: unknown[]) => Promise<T[]>;
export interface ColumnInfo { schema: string; table: string; column: string; type: string; nullable: string }
export interface ConstraintInfo { schema: string; table: string; name: string; type: string; def: string }
export interface SchemaSnapshot { discoveredAt: string; columns: ColumnInfo[]; constraints: ConstraintInfo[] }
export const numericTypes = new Set(["smallint", "integer", "bigint", "numeric", "decimal", "real", "double precision"]);
export const temporalTypes = new Set(["date", "timestamp without time zone", "timestamp with time zone"]);
let cached: { value: SchemaSnapshot; at: number } | undefined;
let pending: Promise<SchemaSnapshot> | undefined;
const ttl = integer('SCHEMA_CACHE_TTL_MS',300000,1000,3600000);

export async function discoverSchema(reader: Reader = q): Promise<SchemaSnapshot> {
  const schemas = Object.values(SCHEMAS);
  const columns = await reader<ColumnInfo>(`SELECT table_schema AS schema, table_name AS table,
    column_name AS column, data_type AS type, is_nullable AS nullable
    FROM information_schema.columns WHERE table_schema = ANY($1) ORDER BY 1,2,ordinal_position`, [schemas]);
  const constraints = await reader<ConstraintInfo>(`SELECT n.nspname AS schema, c.relname AS table,
    k.conname AS name, k.contype AS type, pg_get_constraintdef(k.oid) AS def
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname = ANY($1) AND k.contype IN ('p','u','f') ORDER BY 1,2,3`, [schemas]);
  return { discoveredAt: new Date().toISOString(), columns, constraints };
}
export async function runtimeSchema(): Promise<SchemaSnapshot> {
  if (cached && Date.now() - cached.at < ttl) return cached.value;
  if (!pending) pending = discoverSchema().then(value => { cached = { value, at: Date.now() }; return value; }).finally(() => { pending = undefined; });
  return pending;
}

const requirements: Record<string, string[]> = {
  time_entries: ["id", "job_id", "employee_id", "department_id", "started_at", "finished_at", "completed_at", "duration_seconds", "duration_minutes", "is_rework"],
  jobs: ["iclips_id", "client_id", "client_group_id", "principal_employee_id", "auxiliary_employee_id", "status_text", "entered_at", "completed_at", "expected_end_at"],
  invoices: ["iclips_id", "invoice_number", "status", "issued_at", "competence_date", "service_amount", "net_amount", "iss_amount", "client_name", "last_seen_at"],
};
export const DECLARED_RELATIONSHIPS = [
  ["jobs", "client_id", "clients", "iclips_id"], ["jobs", "client_group_id", "client_groups", "iclips_id"],
  ["jobs", "principal_employee_id", "employees", "iclips_id"], ["jobs", "auxiliary_employee_id", "employees", "iclips_id"],
  ["time_entries", "job_id", "jobs", "iclips_id"], ["time_entries", "employee_id", "employees", "iclips_id"],
  ["time_entries", "department_id", "departments", "id"], ["financial_entries", "job_id", "jobs", "iclips_id"],
  ["employees", "main_department_id", "departments", "id"],
  ["financial_entries", "category_id", "financial_categories", "iclips_id"], ["financial_entries", "account_id", "financial_accounts", "iclips_id"],
  ["financial_entry_cost_centers", "financial_entry_id", "financial_entries", "iclips_id"],
  ["job_pieces", "job_id", "jobs", "iclips_id"], ["job_pieces", "catalog_piece_id", "piece_catalog", "iclips_id"],
  ["job_tasks", "job_id", "jobs", "iclips_id"], ["workflow_steps", "job_piece_id", "job_pieces", "iclips_id"],
] as const;

export function mappingCapabilities(s: SchemaSnapshot) {
  const available = new Set(s.columns.filter(c => c.schema === SCHEMAS.core).map(c => `${c.table}.${c.column}`));
  return {
    domains: Object.fromEntries(Object.entries(requirements).map(([table, cols]) => {
      let reason: string | null = null;
      try { validateStatement(s, `FROM core.${table}`); } catch (e) { reason = (e as Error).message; }
      return [table, { available: reason === null, reason, missing: cols.filter(col => !available.has(`${table}.${col}`)), note: "Perfil completo de referência. Consultas individuais exigem somente campos efetivamente usados." }];
    })),
    relationships: DECLARED_RELATIONSHIPS.map(([from, field, to, target]) => ({ from: `core.${from}.${field}`, to: `core.${to}.${target}`,
      declared: from!=='financial_entry_cost_centers', columnsPresent: available.has(`${from}.${field}`) && available.has(`${to}.${target}`),
      ...(from==='financial_entry_cost_centers'?{candidateTargets:['id','iclips_id'].filter(key=>available.has(`financial_entries.${key}`)).map(key=>`core.financial_entries.${key}`)}:{}),
      note: from==='financial_entry_cost_centers'?'Identidade financeira candidata; o perfil de rateio valida id/iclips_id por FK ou dados unívocos antes de consultar valores.':'Relação explícita do contrato; presença de colunas não comprova integridade dos dados. Constraints declaradas são listadas separadamente.' })),
  };
}

export function validateStatement(s: SchemaSnapshot, sql: string) {
  if (sql.includes("t.labor_cost") && !s.columns.some(c => c.schema === SCHEMAS.core && c.table === "time_entries" && c.column === "labor_cost" && numericTypes.has(c.type))) {
    throw new SourceLimitation("Custo labor_cost não confirmado como numérico; nenhuma taxa ou salário é presumido.");
  }
  for (const [table, columns] of Object.entries(requirements)) {
    if (!sql.includes(`core.${table}`)) continue;
    const actual = s.columns.filter(c => c.schema === SCHEMAS.core && c.table === table);
    const alias = { time_entries: "t", jobs: "j", invoices: "i" }[table];
    const referenced = alias ? [...sql.matchAll(new RegExp(`\\b${alias}\\.([a-z_]+)`, "g"))].map(m => m[1]) : [];
    // Perfis/SELECT * são conservadores; SQL explícito exige só o que realmente utiliza.
    for (const name of new Set(referenced.length ? referenced : columns)) {
      const c = actual.find(c => c.column === name);
      if (!c) throw new SourceLimitation(`Mapeamento ${table} indisponível: coluna ${name} não encontrada pela introspecção.`);
      if (["duration_seconds", "duration_minutes", "service_amount", "net_amount", "iss_amount"].includes(name) && !numericTypes.has(c.type)) {
        throw new SourceLimitation(`Tipo numérico não confirmado para ${table}.${name}.`);
      }
      if (["started_at", "finished_at", "completed_at", "entered_at", "expected_end_at", "issued_at", "competence_date", "last_seen_at"].includes(name) && !temporalTypes.has(c.type)) {
        throw new SourceLimitation(`Tipo temporal não confirmado para ${table}.${name}.`);
      }
      if (name === "is_rework" && c.type !== "boolean") throw new SourceLimitation("Marcação de retrabalho sem tipo booleano comprovado.");
    }
  }
}

export function prepareStatement(s: SchemaSnapshot, sql: string) {
  // Projeções opcionais usam a coluna descoberta, sem serializar a linha inteira.
  const tables:Record<string,string>={t:'time_entries',i:'invoices',f:'financial_entries'};
  sql=sql.replace(/to_jsonb\(([tif])\)->>'([a-z_][a-z0-9_]*)'/g,(_all,alias:string,field:string)=>
    s.columns.some(c=>c.schema===SCHEMAS.core&&c.table===tables[alias]&&c.column===field)?`${alias}.${field}::text`:'NULL::text');
  if(sql.includes('/* invoice_document_link */')) {
    for(const [table,fields]of [['clients',['iclips_id','document']],['invoices',['client_document']]] as const) {
      for(const field of fields)if(!s.columns.some(c=>c.schema==='core'&&c.table===table&&c.column===field))throw new SourceLimitation(`Campo ausente: ${table}.${field} para vínculo por documento.`);
    }
  }
  const has = (table: string, column: string) => s.columns.some(c => c.schema === SCHEMAS.core && c.table === table && c.column === column);
  if (sql.includes("core.time_entries")) {
    if (!has("time_entries", "duration_seconds") && !has("time_entries", "duration_minutes")) throw new SourceLimitation("Nenhuma duração comprovada no timesheet.");
    for (const field of ["duration_seconds", "duration_minutes"]) if (!has("time_entries", field)) sql = sql.replaceAll(`t.${field}`, "NULL::numeric");
  }
  // Campos apenas descritivos/medidas independentes podem faltar. NULL explícito não vira zero.
  for (const [table, alias, column, type] of [
    ["invoices", "i", "invoice_number", "text"], ["invoices", "i", "client_name", "text"],
    ["invoices", "i", "net_amount", "numeric"], ["invoices", "i", "iss_amount", "numeric"],
    ["invoices", "i", "last_seen_at", "timestamptz"], ["invoices", "i", "competence_date", "date"],
    ["time_entries", "t", "completed_at", "timestamptz"],
    ["jobs", "j", "expected_end_at", "timestamptz"],
  ]) {
    if (has(table, column)) continue;
    // Substitui só a projeção; se usado no WHERE, a validação continua exigindo o campo.
    sql = sql.replace(new RegExp(`\\b${alias}\\.${column}(?=\\s*(?:,|\\n|FROM\\b))`), `NULL::${type} AS ${column}`);
  }
  validateStatement(s, sql);
  return sql;
}

export async function validateJobIdentity(schema: SchemaSnapshot, reader: Reader = q) {
  const uniqueJobs = schema.constraints.some(c => c.schema === SCHEMAS.core && c.table === "jobs" && ["p", "u"].includes(c.type)
    && /^(?:PRIMARY KEY|UNIQUE(?: NULLS NOT DISTINCT)?)\s*\(iclips_id\)/.test(c.def.replaceAll('"', '')));
  if (!uniqueJobs) {
      const [r] = await reader(`SELECT EXISTS(SELECT 1 FROM core.jobs WHERE iclips_id IS NOT NULL GROUP BY iclips_id HAVING count(*) > 1 LIMIT 1) AS duplicate`, []);
      if (r.duplicate) throw new SourceLimitation("iclips_id duplicado em jobs: join bloqueado para impedir multiplicação de horas.");
  }
}
export async function analyticsQuery<T extends Record<string, any>>(sql: string, params: unknown[]): Promise<T[]> {
  const schema = await runtimeSchema();
  sql = prepareStatement(schema, sql);
  if (sql.includes("core.jobs")) await validateJobIdentity(schema);
  return q<T>(sql, params);
}
