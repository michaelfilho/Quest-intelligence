import type { Filters } from "../../shared/contracts.js";
import { q, SCHEMAS } from "./db.js";
import { runtimeSchema, temporalTypes, type Reader, type SchemaSnapshot } from "./schema.js";
import { SourceLimitation } from "./source-errors.js";
import type { Computed } from "./mappings.js";

const states: Record<string, string[]> = {
  tarefas_pendentes: ["PENDING", "QUEUED"], tarefas_em_execucao: ["RUNNING", "PROCESSING"],
  tarefas_em_reconciliacao: ["RECONCILE_REQUIRED"], tarefas_com_falhas: ["FAILED", "ERROR"],
};
export const QUALITY_METRICS = ["tarefas_recebidas", "ultima_sincronizacao", ...Object.keys(states)];
export async function qualityMetric(id: string, f: Filters, reader: Reader = q, snapshot?: SchemaSnapshot): Promise<Computed> {
  for (const key of ["client", "group", "project", "department", "employee", "service", "status"] as const) if (f[key]) throw new SourceLimitation(`Monitoramento global: relacionamento de ${key} não comprovado.`);
  const s = snapshot ?? await runtimeSchema();
  const cols = s.columns.filter(c => c.schema === SCHEMAS.ingest && c.table === "qpf11_tasks");
  if (!cols.length) throw new SourceLimitation("Tabela de monitoramento não disponível à role da aplicação.");
  let sql: string; let params: unknown[] = [];
  if (id === "ultima_sincronizacao") {
    if (!cols.some(c => c.column === "updated_at" && temporalTypes.has(c.type))) throw new SourceLimitation("Timestamp updated_at das tarefas não confirmado.");
    sql = "SELECT max(updated_at)::text AS value, count(updated_at)::int AS used FROM ingest.qpf11_tasks";
  } else if (id === "tarefas_recebidas") {
    sql = "SELECT count(*)::int AS value, count(*)::int AS used FROM ingest.qpf11_tasks";
  } else {
    if (!cols.some(c => c.column === "status" && ["text", "character varying", "USER-DEFINED"].includes(c.type))) throw new SourceLimitation("Campo status das tarefas não confirmado.");
    params = [states[id]];
    sql = "SELECT count(*) FILTER (WHERE status::text = ANY($1))::int AS value, count(*)::int AS used FROM ingest.qpf11_tasks";
  }
  const [r] = await reader(sql, params);
  return { value: r.value, recordsUsed: Number(r.used), reliability: "PARCIAL", recordsExcluded: 0,
    temporalField: id === "ultima_sincronizacao" ? "updated_at (fotografia atual)" : "fotografia atual, sem recorte temporal", coverage: "Contagem de tarefas não comprova cobertura nem publicação.",
    reason: `Fotografia atual do monitoramento, sem recorte por período nem comprovação de publicação integral no CORE.${states[id] ? " Contagem literal dos estados: " + states[id].join(", ") + ". Outros estados não são interpretados." : ""}`,
    insufficient: r.value == null || !Number(r.used) ? "Sem tarefas/timestamp disponível; não comprova cobertura." : undefined };
}
