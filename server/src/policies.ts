import { z } from 'zod';
import type { Filters } from '../../shared/contracts.js';
import { sourceStatement, type Query } from './analytics.js';
import { analyticsQuery } from './schema.js';
import { SourceLimitation } from './source-errors.js';
import type { Computed } from './mappings.js';

const statuses=z.array(z.string().trim().min(1).max(100)).min(1).max(100);
const policy=z.object({approved:z.literal(true),active:statuses.optional(),suspended:statuses.optional(),completed:statuses.optional(),overdue:statuses.optional()}).strict();
export function jobPolicy() {
  const raw=process.env.JOB_STATUS_POLICY;
  if (!raw) throw new SourceLimitation('Critério gerencial pendente: classificação dos status ativos, suspensos, concluídos e atrasados ainda não aprovada.');
  try {
    const p=policy.parse(JSON.parse(raw));
    const partition=[...(p.active??[]),...(p.suspended??[]),...(p.completed??[])];
    if (new Set(partition).size!==partition.length || p.overdue?.some(v=>!p.active?.includes(v))) throw new Error();
    return p;
  } catch {throw new SourceLimitation('Critério gerencial inválido: política deve ser explícita, aprovada e sem sobreposição; atraso atual usa somente status ativos.');}
}
export async function projectMetric(id:string,f:Filters,reader:Query=analyticsQuery):Promise<Computed> {
  const policy=jobPolicy(), completed=id==='projetos_concluidos';
  const src=sourceStatement('jobs',completed?f:{...f,start:'0001-01-01',end:'9999-12-31'},completed?'completed_at':'entered_at');
  const values=completed?policy.completed:id==='projetos_suspensos'?policy.suspended:id==='projetos_atrasados'?policy.overdue:policy.active;
  if (!values) throw new SourceLimitation('Critério gerencial pendente: a classificação específica deste indicador não foi aprovada.');
  const [r]=await reader(`WITH source AS (${src.sql}) SELECT count(*)::int AS value FROM source
    WHERE entered_at::timestamptz<=CURRENT_TIMESTAMP AND status_text=ANY($${src.params.length+1}::text[])
    ${completed?'AND completed_at::timestamptz<=CURRENT_TIMESTAMP AND completed_at::timestamptz>=entered_at::timestamptz':''}
    ${id==='projetos_atrasados'?'AND expected_end_at::timestamptz<CURRENT_TIMESTAMP AND completed_at IS NULL':''}`, [...src.params,values]);
  return {value:Number(r.value),recordsUsed:Number(r.value),reliability:'PARCIAL',temporalField:completed?'completed_at':'fotografia atual, sem recorte temporal',
    reason:completed?'Conclusões no período com status textual aprovado e datas válidas.':'Estado atual segundo política gerencial configurada; sem reconstrução histórica. Atraso: prazo anterior ao instante atual e ausência de conclusão.'};
}
