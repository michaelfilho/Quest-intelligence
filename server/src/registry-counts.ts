import type { Filters } from "../../shared/contracts.js";
import { q, SCHEMAS } from "./db.js";
import { runtimeSchema, type Reader, type SchemaSnapshot } from "./schema.js";
import { SourceLimitation } from "./source-errors.js";
import type { Computed } from "./mappings.js";
import type { Page } from "./mappings.js";
import { paginate } from "./analytics.js";

// Identificadores exclusivamente deste catálogo fechado, nunca da requisição HTTP.
export const REGISTRY_COUNTS: Record<string, string> = {
  clientes_cadastrados: "clients", colaboradores_cadastrados: "employees", departamentos_cadastrados: "departments",
  projetos_cadastrados: "jobs", pecas_cadastradas: "job_pieces", tarefas_cadastradas: "job_tasks", etapas_cadastradas: "workflow_steps",
  marcas_cadastradas: "brands", contratos_cadastrados: "contracts", fees_cadastrados: "fees", metas_cadastradas: "goals", regras_rateio_cadastradas: "allocation_rules",
};
export async function registryCount(id: string, f: Filters, reader: Reader = q, snapshot?: SchemaSnapshot): Promise<Computed> {
  const table = REGISTRY_COUNTS[id];
  if (!table) throw new SourceLimitation("Contagem de cadastro sem mapeamento explícito.");
  for (const key of ["client", "group", "project", "department", "employee", "service", "status","category"] as const) {
    if (f[key]) throw new SourceLimitation(`Contagem global de cadastro sem vínculo validado com o filtro ${key}.`);
  }
  const schema = snapshot ?? await runtimeSchema();
  if (!schema.columns.some(c => c.schema === SCHEMAS.core && c.table === table)) throw new SourceLimitation(`core.${table} não disponível à role da aplicação.`);
  const [r] = await reader(`SELECT count(*)::int AS value FROM core.${table}`, []);
  return { value: Number(r.value), recordsUsed: Number(r.value), recordsExcluded: 0, reliability: "PARCIAL",
    temporalField: "fotografia atual, sem recorte temporal", coverage: "Contagem física atual não comprova atividade, status ou cobertura histórica.",
    reason: "Cadastro atual completo da tabela, sem aplicar o período e sem reconstrução histórica; comparação temporal não disponível." };
}

export async function registryRecords(id: string, f: Filters, p: Page, reader: Reader = q, snapshot?: SchemaSnapshot) {
  const schema = snapshot ?? await runtimeSchema();
  await registryCount(id, f, reader, schema);
  const table = REGISTRY_COUNTS[id];
  const keys = table === "departments" ? ["id"] : table === "job_tasks" ? ["job_id", "iclips_id"] : table === "workflow_steps" ? ["job_piece_id", "iclips_id"] : ["brands", "contracts", "fees", "goals", "allocation_rules"].includes(table) ? ["id"] : ["iclips_id"];
  if (!keys.every(key => schema.columns.some(c => c.schema === SCHEMAS.core && c.table === table && c.column === key))) throw new SourceLimitation("Chaves de origem não comprovadas para detalhamento.");
  const name=schema.columns.some(c=>c.schema===SCHEMAS.core&&c.table===table&&c.column==='name') ? ",coalesce(nullif(btrim(name::text),''),'Cadastro sem nome') AS nome" : ",'Cadastro sem nome'::text AS nome";
  return paginate(`SELECT ${keys.join(", ")}${name} FROM core.${table}`, [], p, keys.join(", "), reader);
}
