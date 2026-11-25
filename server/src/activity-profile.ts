import { z } from 'zod';
import type { SchemaSnapshot } from './schema.js';
import { SourceLimitation } from './source-errors.js';
const field=z.string().regex(/^[a-z_][a-z0-9_]*$/).max(63);
const configured=z.object({approved:z.literal(true),kind:field,taskId:field,stepId:field,pieceId:field}).strict();
export function activityKeys(s:SchemaSnapshot) {
  let keys={kind:'source_kind',taskId:'task_id',stepId:'workflow_step_id',pieceId:'job_piece_id'};
  if (process.env.TIME_ACTIVITY_KEYS) {
    try {keys=configured.parse(JSON.parse(process.env.TIME_ACTIVITY_KEYS));}
    catch {throw new SourceLimitation('Relacionamento inválido: perfil explícito TIME_ACTIVITY_KEYS deve conter identificadores válidos e aprovação.');}
  }
  const has=(column:string)=>s.columns.some(c=>c.schema==='core'&&c.table==='time_entries'&&c.column===column&&['smallint','integer','bigint','numeric','text','character varying','uuid','USER-DEFINED'].includes(c.type));
  return {keys,task:has(keys.kind)&&has(keys.taskId)&&has('job_id'),workflow:has(keys.kind)&&has(keys.stepId)&&has(keys.pieceId)};
}
export function projectActivityKeys(sql:string,keys:ReturnType<typeof activityKeys>['keys']) {
  // Todas as chaves passaram pelo schema fechado acima; nenhum identificador vem do HTTP.
  for(const [native,selected] of [['source_kind',keys.kind],['task_id',keys.taskId],['workflow_step_id',keys.stepId],['job_piece_id',keys.pieceId]]) sql=sql.replace(`to_jsonb(t)->>'${native}' AS ${native}`,`to_jsonb(t)->>'${selected}' AS ${native}`);
  return sql;
}
