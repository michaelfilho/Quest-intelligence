// Cadastros comerciais e gerenciais (marcas, contratos, versões, fees, metas, regras de rateio).
// Apenas listagem do que estiver publicado: nenhuma regra de negócio é presumida.
import type { Filters } from "../../shared/contracts.js";
import { paginate } from "./analytics.js";
import { q } from "./db.js";
import type { Page } from "./mappings.js";
import { runtimeSchema, type Reader, type SchemaSnapshot } from "./schema.js";
import { SourceLimitation } from "./source-errors.js";

// Catálogo fechado: nenhum identificador vem da requisição.
const REGISTRIES: Record<string, { tables: string[]; columns: string[]; sql: string }> = {
  marcas: {
    tables: ["brands", "clients"], columns: ["marca", "cliente", "situacao"],
    sql: "SELECT b.id, b.name AS marca, c.name AS cliente, b.status AS situacao FROM core.brands b LEFT JOIN core.clients c ON c.iclips_id = b.client_id",
  },
  contratos_cadastro: {
    tables: ["contracts", "clients", "brands"], columns: ["contrato", "cliente", "marca", "tipo", "situacao", "inicio", "fim"],
    sql: "SELECT k.id, k.name AS contrato, c.name AS cliente, b.name AS marca, k.contract_type AS tipo, k.status AS situacao, k.starts_on AS inicio, k.ends_on AS fim FROM core.contracts k LEFT JOIN core.clients c ON c.iclips_id = k.client_id LEFT JOIN core.brands b ON b.id = k.brand_id",
  },
  versoes_contrato: {
    tables: ["contract_versions", "contracts"], columns: ["contrato", "versao", "vigencia", "valor", "descricao"],
    sql: "SELECT v.id, k.name AS contrato, v.version AS versao, v.effective_on AS vigencia, v.amount AS valor, v.description AS descricao FROM core.contract_versions v JOIN core.contracts k ON k.id = v.contract_id",
  },
  fees_jobs_extras: {
    tables: ["fees", "contracts", "jobs"], columns: ["tipo", "contrato", "projeto", "competencia", "valor", "descricao"],
    sql: "SELECT f.id, CASE f.kind WHEN 'FEE' THEN 'Fee' ELSE 'Job extra' END AS tipo, k.name AS contrato, j.name AS projeto, f.competence AS competencia, f.amount AS valor, f.description AS descricao FROM core.fees f LEFT JOIN core.contracts k ON k.id = f.contract_id LEFT JOIN core.jobs j ON j.iclips_id = f.job_id",
  },
  metas: {
    tables: ["goals"], columns: ["indicador", "inicio", "fim", "meta", "sentido", "aprovada_em"],
    sql: "SELECT g.id, g.indicator_id AS indicador, g.period_start AS inicio, g.period_end AS fim, g.target AS meta, CASE g.direction WHEN 'above' THEN 'Acima de' ELSE 'Abaixo de' END AS sentido, g.approved_at AS aprovada_em FROM core.goals g",
  },
  regras_rateio: {
    tables: ["allocation_rules"], columns: ["regra", "criterio", "inicio", "fim", "situacao"],
    sql: "SELECT r.id, r.name AS regra, r.criterion AS criterio, r.effective_from AS inicio, r.effective_to AS fim, CASE WHEN r.active THEN 'Ativa' ELSE 'Inativa' END AS situacao FROM core.allocation_rules r",
  },
};
export const REGISTRY_TABLES = Object.keys(REGISTRIES);

export async function managementRegistry(id: string, f: Filters, p: Page, reader: Reader = q, snapshot?: SchemaSnapshot) {
  const registry = REGISTRIES[id];
  for (const key of ["client", "group", "project", "department", "employee", "service", "status", "category"] as const) {
    if (f[key]) throw new SourceLimitation(`Filtro não aplicável: cadastro sem vínculo validado com ${key}.`);
  }
  const schema = snapshot ?? await runtimeSchema();
  for (const table of registry.tables) {
    if (!schema.columns.some((c) => c.schema === "core" && c.table === table)) throw new SourceLimitation(`core.${table} não disponível à role da aplicação.`);
  }
  const sort = p.sort ?? registry.columns[0];
  if (!registry.columns.includes(sort)) throw new SourceLimitation("Coluna de ordenação indisponível.");
  const rows = await paginate(registry.sql, [], p, `${sort} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, id`, reader);
  return { ...rows, reliability: "PARCIAL" as const, reason: "Cadastro atual completo, sem recorte de período." };
}
