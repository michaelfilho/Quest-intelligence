import type { Filters } from "../../shared/contracts.js";
import { q, SCHEMAS } from "./db.js";
import { runtimeSchema, temporalTypes,numericTypes, type Reader, type SchemaSnapshot } from "./schema.js";
import { SourceLimitation } from "./source-errors.js";
import type { Computed,Page } from "./mappings.js";
import { paginate } from './analytics.js';

const states: Record<string, string[]> = {
  tarefas_pendentes: ["PENDING", "QUEUED"], tarefas_em_execucao: ["RUNNING", "PROCESSING"],
  tarefas_em_reconciliacao: ["RECONCILE_REQUIRED"], tarefas_com_falhas: ["FAILED", "ERROR"],
};
const comparableCounts="expected_total>=0 AND received_records>=0 AND expected_total::text NOT IN ('NaN','Infinity','-Infinity') AND received_records::text NOT IN ('NaN','Infinity','-Infinity')";
export const QUALITY_METRICS = ["tarefas_recebidas", "ultima_sincronizacao", "ultima_publicacao_core", "paginas_recebidas", "registros_recebidos", "conflitos_abertos", "conflitos_resolvidos", "divergencias_contagem", "registros_reportados_tarefas", "conflitos_financeiros", "divergencias_projetos", ...Object.keys(states)];
export async function qualityMetric(id: string, f: Filters, reader: Reader = q, snapshot?: SchemaSnapshot): Promise<Computed> {
  for (const key of ["client", "group", "project", "department", "employee", "service", "status","category"] as const) if (f[key]) throw new SourceLimitation(`Monitoramento global: relacionamento de ${key} não comprovado.`);
  const s = snapshot ?? await runtimeSchema();
  if (id==='conflitos_financeiros'||id==='divergencias_projetos') {
    const financial=id==='conflitos_financeiros', resource=process.env[financial?'QUALITY_FINANCIAL_RESOURCE':'QUALITY_PROJECT_RESOURCE'];
    const schema=financial?'audit':'ingest',table=financial?'publication_conflicts':'tasks';
    if (!resource) throw new SourceLimitation('Critério gerencial pendente: discriminador literal de recurso não configurado; contagens globais estão disponíveis separadamente.');
    const fields=financial?['resource','resolved_at']:['resource','expected_total','received_records'];
    if (!fields.every(column=>s.columns.some(c=>c.schema===schema&&c.table===table&&c.column===column))) throw new SourceLimitation('Campo ausente: recurso ou contagens/estado do monitoramento.');
    for(const field of fields.filter(field=>field!=='resource')) {
      const type=s.columns.find(c=>c.schema===schema&&c.table===table&&c.column===field)!.type;
      if (!(field==='resolved_at'?temporalTypes:numericTypes).has(type)) throw new SourceLimitation(`Tipo incompatível: ${table}.${field}.`);
    }
    const [r]=await reader(`SELECT count(*) FILTER (WHERE ${financial?'resolved_at IS NULL':comparableCounts+' AND expected_total<>received_records'})::int AS value,
      count(*) ${financial?'':`FILTER (WHERE ${comparableCounts})`}::int AS used FROM ${schema}.${table} WHERE resource::text=$1`,[resource]);
    return {value:Number(r.value),recordsUsed:Number(r.used),reliability:'PARCIAL',temporalField:'fotografia atual, sem recorte temporal',reason:'Contagem pontual para o recurso literal configurado explicitamente; não certifica cobertura histórica ou unicidade de registros publicados.',insufficient:!financial&&!Number(r.used)?'Nenhuma tarefa com contagens comparáveis disponíveis.':undefined};
  }
  const specs: Record<string, [string,string,string,string,string[]]> = {
    ultima_publicacao_core: ['audit','publication_state','max(published_at) FILTER (WHERE published_at<=CURRENT_TIMESTAMP)::text','count(published_at) FILTER (WHERE published_at<=CURRENT_TIMESTAMP)',['published_at']],
    paginas_recebidas: ['ingest','pages','count(*)::int','count(*)',[]],
    registros_recebidos: ['ingest','pages',"sum(record_count) FILTER (WHERE record_count>=0 AND record_count::text NOT IN ('NaN','Infinity','-Infinity'))::float8","count(*) FILTER (WHERE record_count>=0 AND record_count::text NOT IN ('NaN','Infinity','-Infinity'))",['record_count']],
    conflitos_abertos: ['audit','publication_conflicts','count(*) FILTER (WHERE resolved_at IS NULL)::int','count(*)',['resolved_at']],
    conflitos_resolvidos: ['audit','publication_conflicts','count(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at<=CURRENT_TIMESTAMP)::int','count(*)',['resolved_at']],
    divergencias_contagem: ['ingest','tasks',`count(*) FILTER (WHERE ${comparableCounts} AND expected_total<>received_records)::int`,`count(*) FILTER (WHERE ${comparableCounts})`,['expected_total','received_records']],
    registros_reportados_tarefas: ['ingest','tasks',"sum(received_records) FILTER (WHERE received_records>=0 AND received_records::text NOT IN ('NaN','Infinity','-Infinity'))::float8",'count(received_records)',['received_records']],
  };
  if (specs[id]) {
    const [schema,table,expression,used,fields]=specs[id];
    const columns=s.columns.filter(c=>c.schema===schema&&c.table===table);
    if (!columns.length || !fields.every(field=>columns.some(c=>c.column===field))) throw new SourceLimitation(`Campo ausente: ${schema}.${table} (${fields.join(', ')}).`);
    for (const field of fields) {
      const type=columns.find(c=>c.column===field)!.type;
      if (field.endsWith('_at') ? !temporalTypes.has(type) : !['smallint','integer','bigint','numeric','decimal','real','double precision'].includes(type)) throw new SourceLimitation(`Tipo incompatível: ${table}.${field}.`);
    }
    const [r]=await reader(`SELECT ${expression} AS value,(${used})::int AS used FROM ${schema}.${table}`,[]);
    return {value:r.value,recordsUsed:Number(r.used),reliability:'PARCIAL',temporalField:'fotografia atual, sem recorte temporal',
      reason:'Contagem pontual global. Recebidos de páginas e reportados em tarefas podem incluir repetições; não representam registros únicos publicados nem cobertura histórica. Divergências são de todas as tarefas com contagens disponíveis, sem inferir recurso de projeto.',
      insufficient:r.value==null?'Nenhum valor disponível na fonte.':id==='divergencias_contagem'&&!Number(r.used)?'Nenhuma tarefa com contagens comparáveis disponíveis.':undefined};
  }
  const cols = s.columns.filter(c => c.schema === SCHEMAS.ingest && c.table === "tasks");
  if (!cols.length) throw new SourceLimitation("Tabela de monitoramento não disponível à role da aplicação.");
  const timestamp=cols.some(c=>c.column==='updated_at'&&temporalTypes.has(c.type));
  const status=cols.some(c=>c.column==='status'&&['text','character varying','USER-DEFINED'].includes(c.type));
  if(id==='ultima_sincronizacao'&&!timestamp)throw new SourceLimitation('Timestamp updated_at das tarefas não confirmado.');
  if(states[id]&&!status)throw new SourceLimitation('Campo status das tarefas não confirmado.');
  const params:unknown[]=[],fields=status?Object.entries(states).map(([key,values])=>{params.push(values);return `count(*) FILTER(WHERE status::text=ANY($${params.length}))::int AS ${key}`;}):[];
  const [summary]=await reader(`SELECT count(*)::int AS total,${timestamp?'max(updated_at)::text':'NULL::text'} AS last,
    ${timestamp?'count(updated_at)::int':'0::int'} AS timestamps${fields.length?','+fields.join(','):''} FROM ingest.tasks`,params);
  const r={value:id==='ultima_sincronizacao'?summary.last:id==='tarefas_recebidas'?summary.total:summary[id],used:id==='ultima_sincronizacao'?summary.timestamps:summary.total};
  return { value: r.value, recordsUsed: Number(r.used), reliability: "PARCIAL", recordsExcluded: 0,
    temporalField: id === "ultima_sincronizacao" ? "updated_at (fotografia atual)" : "fotografia atual, sem recorte temporal", coverage: "Contagem de tarefas não comprova cobertura nem publicação.",
    reason: `Fotografia atual do monitoramento, sem recorte por período nem comprovação de publicação integral no CORE.${states[id] ? " Contagem literal dos estados: " + states[id].join(", ") + ". Outros estados não são interpretados." : ""}`,
    insufficient: r.value == null ? "Sem timestamp disponível; não comprova cobertura." : undefined };
}
export async function conflictsTable(f:Filters,p:Page,reader:Reader=q,snapshot?:SchemaSnapshot) {
  const s=snapshot??await runtimeSchema();await qualityMetric('conflitos_abertos',f,reader,s);
  const sort=p.sort??'situacao';
  if (!['situacao','quantidade'].includes(sort)) throw new SourceLimitation('Coluna de conflito indisponível.');
  const r=await paginate(`SELECT CASE WHEN resolved_at IS NULL THEN 'Aberto' WHEN resolved_at<=CURRENT_TIMESTAMP THEN 'Resolvido' ELSE 'Resolução futura: revisar' END AS situacao,
    count(*)::int AS quantidade FROM audit.publication_conflicts GROUP BY 1`,[],p,`${sort} ${p.dir==='desc'?'DESC':'ASC'}`,reader);
  return {...r,reason:'Fotografia global de conflitos por estado de resolução; não atribui recursos ou identificadores ausentes e não expõe payloads de auditoria.'};
}
