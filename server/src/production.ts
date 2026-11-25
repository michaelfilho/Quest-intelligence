import type {Filters} from '../../shared/contracts.js';
import {sourceStatement,eligibleTime,paginate,type Query} from './analytics.js';
import {analyticsQuery} from './schema.js';
import {schemaFor,labelledTime,registryJoin} from './presentation.js';
import {SourceLimitation} from './source-errors.js';
import type {Page,Computed} from './mappings.js';
const note='Peças com apontamento válido no período, vínculo unívoco peça/projeto e nome de cadastro; não são peças entregues. Contagens por departamento/cliente são distintas dentro de cada grupo e não devem ser somadas como únicos globais. Códigos de status de peça não são interpretados.';
export async function pieceSource(f:Filters,reader:Query=analyticsQuery) {
  const s=await schemaFor(reader);
  if(!['iclips_id','job_id'].every(column=>s.columns.some(c=>c.schema==='core'&&c.table==='job_pieces'&&c.column===column))||!s.columns.some(c=>c.schema==='core'&&c.table==='time_entries'&&c.column==='job_piece_id'))throw new SourceLimitation('Campo ausente: vínculo de peça no apontamento e no cadastro.');
  const src=sourceStatement('time',f);
  return {s,base:src.sql,params:src.params,sql:`WITH source AS (${labelledTime(src.sql,s)}), pieces AS (
    SELECT iclips_id::text AS piece_key,CASE WHEN count(*)=1 THEN max(job_id::text) END AS project_key,count(*)::int AS matches
    FROM core.job_pieces GROUP BY iclips_id::text
  ) SELECT t.* FROM source t JOIN pieces p ON p.piece_key=t.job_piece_id AND p.project_key=t.job_id::text AND p.matches=1 WHERE ${eligibleTime}`};
}
export async function workedPiecesMetric(f:Filters,reader:Query=analyticsQuery):Promise<Computed> {
  const src=await pieceSource(f,reader);
  const [r]=await reader(`WITH source AS (${src.sql}) SELECT count(DISTINCT job_piece_id)::int AS value,count(*)::int AS used,
    (SELECT count(*)::int FROM (${src.base}) base WHERE ${eligibleTime}) AS total FROM source`,src.params);
  return {value:Number(r.value),recordsUsed:Number(r.used),recordsExcluded:Number(r.total)-Number(r.used),coverage:`${r.used}/${r.total} apontamentos válidos com peça e vínculo unívoco; demais registros não são atribuídos a peças.`,reliability:'PARCIAL',reason:note,temporalField:'started_at'};
}
export async function pieceChart(dim:'client'|'department',f:Filters,reader:Query=analyticsQuery) {
  const src=await pieceSource(f,reader),key=dim==='client'?'client_id':'department_id',label=dim==='client'?'client_name':'department_name';
  const rows=await reader(`WITH source AS (${src.sql}) SELECT ${key}::text AS entity_id,max(${label}) AS label,count(DISTINCT job_piece_id)::int AS pecas
    FROM source GROUP BY ${key} ORDER BY pecas DESC,entity_id LIMIT 50`,src.params);
  return {series:['pecas'],points:rows,reliability:'PARCIAL' as const,reason:note};
}
export async function pieceTable(f:Filters,p:Page,reader:Query=analyticsQuery) {
  const src=await pieceSource(f,reader),sort=p.sort??'peca';
  if(!['peca','projeto','cliente','horas','apontamentos'].includes(sort))throw new SourceLimitation('Coluna de peça indisponível.');
  const piece=registryJoin(src.s,'job_pieces','iclips_id','g.job_piece_id','pn','Peça sem nome',['catalog_piece_id']);
  const catalog=registryJoin(src.s,'piece_catalog','iclips_id',piece.extras.catalog_piece_id,'pcn','Catálogo sem vínculo/nome');
  return {...await paginate(`WITH source AS (${src.sql}), grouped AS (SELECT job_piece_id,max(job_name) AS projeto,max(client_name) AS cliente,
    string_agg(DISTINCT department_name,', ') AS departamentos,sum(seconds)/3600.0 AS horas,count(*)::int AS apontamentos FROM source GROUP BY job_piece_id)
    SELECT job_piece_id AS id,${piece.value} AS peca,
    ${catalog.value} AS catalogo,projeto,cliente,departamentos,horas,apontamentos FROM grouped g ${piece.join} ${catalog.join}`,src.params,p,`${sort} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,id`,reader),reason:note};
}
