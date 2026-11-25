import type {Filters} from '../../shared/contracts.js';
import {q} from './db.js';
import {temporalTypes,type Reader} from './schema.js';
import {schemaFor} from './presentation.js';
import {paginate} from './analytics.js';
import {SourceLimitation} from './source-errors.js';
import type {Computed,Page} from './mappings.js';
async function profile(f:Filters,table:string,fields:string[],reader:Reader){
  for(const key of ['client','group','project','department','employee','service','status'] as const)if(f[key])throw new SourceLimitation(`Monitoramento global sem vínculo comprovado com ${key}.`);
  const s=await schemaFor(reader);
  if(!fields.every(column=>s.columns.some(c=>c.schema==='audit'&&c.table===table&&c.column===column)))throw new SourceLimitation(`Campo ausente: audit.${table} (${fields.join(', ')}).`);
  for(const field of fields.filter(f=>f.endsWith('_at')))if(!s.columns.some(c=>c.schema==='audit'&&c.table===table&&c.column===field&&temporalTypes.has(c.type)))throw new SourceLimitation('Tipo temporal de publicação/conflito incompatível.');
}
export async function publicationMetric(f:Filters,reader:Reader=q):Promise<Computed>{
  await profile(f,'qpf11_publication_state',['resource','source_id'],reader);
  const [r]=await reader('SELECT count(*)::int AS value FROM audit.qpf11_publication_state',[]);
  return {value:Number(r.value),recordsUsed:Number(r.value),reliability:'PARCIAL',temporalField:'fotografia atual',reason:'Linhas armazenadas com estado de publicação; não comprova registros únicos publicados ou cobertura histórica integral.'};
}
export async function publicationsTable(f:Filters,p:Page,reader:Reader=q){
  await profile(f,'qpf11_publication_state',['resource','source_id','published_at'],reader);const sort=p.sort??'recurso';
  if(!['recurso','estados','identidades','ultima_publicacao'].includes(sort))throw new SourceLimitation('Coluna de publicação indisponível.');
  return {...await paginate(`SELECT coalesce(resource::text,'Recurso ausente') AS recurso,count(*)::int AS estados,
    count(DISTINCT source_id) FILTER (WHERE source_id IS NOT NULL)::int AS identidades,
    max(published_at) FILTER (WHERE published_at<=CURRENT_TIMESTAMP) AS ultima_publicacao FROM audit.qpf11_publication_state GROUP BY resource::text`,[],p,`${sort} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,recurso`,reader),reason:'Fotografia por recurso. Identidades distintas no estado armazenado não certificam a cobertura da coleta nem a unicidade de todos os registros recebidos.'};
}
export async function conflictDetails(f:Filters,p:Page,reader:Reader=q){
  await profile(f,'qpf11_publication_conflicts',['resource','source_id','reason','resolved_at'],reader);const sort=p.sort??'recurso';
  if(!['recurso','situacao','motivo','resolvido_em'].includes(sort))throw new SourceLimitation('Coluna de conflito indisponível.');
  return {...await paginate(`SELECT resource::text AS recurso,source_id::text AS id_origem,reason::text AS motivo,resolved_at AS resolvido_em,
    CASE WHEN resolved_at IS NULL THEN 'Aberto' WHEN resolved_at<=CURRENT_TIMESTAMP THEN 'Resolvido' ELSE 'Resolução futura: revisar' END AS situacao,count(*)::int AS ocorrencias
    FROM audit.qpf11_publication_conflicts GROUP BY resource::text,source_id::text,reason::text,resolved_at`,[],p,`${sort} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,id_origem,motivo,resolvido_em`,reader),reason:'Detalhes de conflitos restritos também à permissão financeira, pois razões livres podem conter informações financeiras. Sem expor payloads de auditoria.'};
}
