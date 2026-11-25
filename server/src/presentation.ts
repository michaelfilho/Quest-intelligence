import { analyticsQuery, discoverSchema, runtimeSchema, type Reader, type SchemaSnapshot } from "./schema.js";

export const schemaFor = (reader: Reader, provided?: SchemaSnapshot) => provided ? Promise.resolve(provided) : reader === analyticsQuery ? runtimeSchema() : discoverSchema(reader);
const text = (value: string) => "'" + value.replaceAll("'", "''") + "'";
export function nameSQL(s: SchemaSnapshot, table: string, key: string, id: string, fallback: string) {
  const cols = s.columns.filter(c => c.schema === 'core' && c.table === table);
  if (![key,'name'].every(name => cols.some(c => c.column === name))) return text(fallback);
  // Um registro apenas: não multiplicar fatos nem escolher um nome arbitrário em chave duplicada.
  return `(SELECT CASE WHEN count(*)>1 THEN 'Cadastro com chave duplicada'
    WHEN count(*)=0 THEN ${text(fallback)} ELSE coalesce(max(nullif(btrim(n.name::text),'')),${text(fallback)}) END
    FROM core.${table} n WHERE n.${key}::text=(${id})::text)`;
}
export function labelledTime(sql: string, s: SchemaSnapshot) {
  const joins:string[]=[];
  const lookup=(table:string,key:string,id:string,alias:string,fallback:string)=>{
    if (![key,'name'].every(column=>s.columns.some(c=>c.schema==='core'&&c.table===table&&c.column===column))) return text(fallback);
    // Agrega cada cadastro uma vez. Nunca executar cinco buscas correlacionadas por apontamento.
    joins.push(`LEFT JOIN (SELECT ${key}::text AS entity_key, CASE WHEN count(*)>1 THEN 'Cadastro com chave duplicada'
      ELSE max(nullif(btrim(name::text),'')) END AS entity_name FROM core.${table} GROUP BY ${key}::text) ${alias} ON ${alias}.entity_key=(${id})::text`);
    return `coalesce(${alias}.entity_name,${text(fallback)})`;
  };
  const employee=lookup('employees','iclips_id','b.employee_id','en','Colaborador sem nome');
  const department=lookup('departments','id','b.department_id','dn','');
  const job=lookup('jobs','iclips_id','b.job_id','jn','Projeto sem nome');
  const client=lookup('clients','iclips_id','b.client_id','cn','Cliente sem nome');
  const group=lookup('client_groups','iclips_id','b.client_group_id','gn','Grupo sem nome');
  return `SELECT b.*,
    ${employee} AS employee_name,
    coalesce(nullif(${department},''),nullif(b.department_name_snapshot,''),'Departamento sem nome') AS department_name,
    ${job} AS job_name,${client} AS client_name,${group} AS group_name
    FROM (${sql}) b ${joins.join('\n')}`;
}
