// Perfis explícitos: introspecção valida estrutura, valores de tipo são os descritos no contrato.
// Movimentações preliminares não são classificadas como receita, despesa operacional ou lucro.
import type { Filters } from "../../shared/contracts.js";
import { q, SCHEMAS } from "./db.js";
import { numericTypes, runtimeSchema, temporalTypes, type SchemaSnapshot, type Reader } from "./schema.js";
import { SourceLimitation } from "./source-errors.js";
import { paginate } from "./analytics.js";
import type { Computed, Page } from "./mappings.js";

export interface CashProfile { type: "entry_type" | "type"; parent: "parent_entry_id" | "parent_id" | null }
export function cashProfile(s: SchemaSnapshot): CashProfile {
  const cols = s.columns.filter(c => c.schema === SCHEMAS.core && c.table === "financial_entries");
  const types = ["entry_type", "type"].filter(name => cols.some(c => c.column === name && ["text", "character varying", "USER-DEFINED"].includes(c.type)));
  const parents = ["parent_entry_id", "parent_id"].filter(name => cols.some(c => c.column === name));
  if (types.length !== 1 || parents.length > 1) throw new SourceLimitation("Perfil financeiro ausente ou ambíguo: exige um campo entry_type/type e um vínculo-pai não ambíguo.");
  if (parents.length && !s.constraints.some(c => c.schema === SCHEMAS.core && c.table === "financial_entries" && c.type === "f"
    && c.def.includes(`FOREIGN KEY (${parents[0]})`) && /REFERENCES (?:core\.)?financial_entries\(iclips_id\)/.test(c.def))) {
    throw new SourceLimitation("Associação de lançamento-pai não comprovada por foreign key; movimentos bloqueados para evitar duplicidade econômica.");
  }
  for (const name of ["amount", "payment_date", "competence_date", "iclips_id", "job_id"]) {
    const c = cols.find(c => c.column === name);
    if (!c || (name === "amount" && !numericTypes.has(c.type)) || (["payment_date", "competence_date"].includes(name) && !temporalTypes.has(c.type))) {
      throw new SourceLimitation(`Perfil financeiro não confirmado: ${name}. Nenhum campo alternativo é presumido.`);
    }
  }
  return { type: types[0] as CashProfile["type"], parent: (parents[0] as CashProfile["parent"]) ?? null };
}
export function cashSource(f: Filters, profile: CashProfile) {
  for (const k of ["department", "employee", "service", "status"] as const) if (f[k]) throw new SourceLimitation(`Filtro ${k} não comprovado para movimentações financeiras.`);
  const params: unknown[] = [f.start, f.end];
  const predicates = ["f.payment_date::timestamptz >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')",
    "f.payment_date::timestamptz < (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')"];
  for (const [key, field] of [["client", "client_id"], ["group", "client_group_id"], ["project", "iclips_id"]] as const) {
    if (f[key]) { params.push(f[key]); predicates.push(`EXISTS(SELECT 1 FROM core.jobs j WHERE j.iclips_id = f.job_id AND j.${field}::text = $${params.length})`); }
  }
  const standalone = profile.parent ? `f.${profile.parent} IS NULL AND NOT EXISTS(SELECT 1 FROM core.financial_entries child WHERE child.${profile.parent} = f.iclips_id)` : "FALSE";
  return { params, sql: `SELECT f.iclips_id, f.job_id, f.payment_date, f.competence_date,
    f.${profile.type}::text AS tipo, CASE WHEN f.amount::text NOT IN ('NaN','Infinity','-Infinity') THEN f.amount::numeric ELSE NULL END AS valor, (${standalone}) AS standalone
    FROM core.financial_entries f WHERE ${predicates.join(" AND ")}` };
}
export const CASH_METRICS = ["entradas_realizadas", "saidas_realizadas", "saldo_movimentacoes"];
const note = "Movimentações preliminares, sem classificação operacional nem conciliação com conflitos de publicação. Famílias pai/filho excluídas integralmente. Valores assinados preservados. Não representa lucro, rentabilidade ou receita operacional validada.";
export async function computeCash(id: string, f: Filters, reader: Reader = q, schema?: SchemaSnapshot): Promise<Computed> {
  const profile = cashProfile(schema ?? await runtimeSchema());
  if (!profile.parent) throw new SourceLimitation("Movimentações indisponíveis: não há vínculo-pai reconhecido que permita excluir possíveis duplicidades econômicas com segurança.");
  const src = cashSource(f, profile);
  const [r] = await reader(`WITH source AS (${src.sql}), eligible AS (
    SELECT * FROM source WHERE standalone AND valor IS NOT NULL AND payment_date::timestamptz <= CURRENT_TIMESTAMP AND tipo IN ('Entrada','Saída'))
    SELECT sum(valor) FILTER (WHERE tipo = 'Entrada')::float8 AS entradas,
      sum(valor) FILTER (WHERE tipo = 'Saída')::float8 AS saidas,
      count(*) FILTER (WHERE tipo = 'Entrada')::int AS n_entrada,
      count(*) FILTER (WHERE tipo = 'Saída')::int AS n_saida,
      count(*) FILTER (WHERE valor < 0)::int AS negatives,
      (SELECT count(*)::int FROM source) AS total, count(*)::int AS used FROM eligible`, src.params);
  const kind = id === "entradas_realizadas" ? "entradas" : id === "saidas_realizadas" ? "saidas" : "saldo";
  const value = kind === "saldo" ? r.entradas == null || r.saidas == null ? null : Number(r.entradas) - Number(r.saidas) : r[kind] == null ? null : Number(r[kind]);
  const used = kind === "saldo" ? Number(r.used) : Number(r[kind === "entradas" ? "n_entrada" : "n_saida"]);
  return { value, reliability: "EM_RECONCILIACAO", recordsUsed: used, recordsExcluded: Number(r.total) - used,
    reason: note, temporalField: "payment_date", coverage: "Sem certificação de publicação ou conciliação econômica.",
    exclusions: [{ reason: "Outros tipos, datas futuras, nulos ou famílias pai/filho", count: Number(r.total) - used }],
    insufficient: kind === "saldo" && Number(r.negatives) > 0 ? "Saldo indisponível: convenção de sinais negativos exige conciliação; ABS não foi aplicado." : value == null ? "Sem valores suficientes na perspectiva de caixa. " + note : undefined };
}
export async function cashRecords(id: string, f: Filters, p: Page, reader: Reader = q, schema?: SchemaSnapshot) {
  const profile = cashProfile(schema ?? await runtimeSchema());
  if (!profile.parent) throw new SourceLimitation("Vínculo-pai financeiro não reconhecido.");
  const src = cashSource(f, profile);
  const type = id === "entradas_realizadas" ? "AND tipo = 'Entrada'" : id === "saidas_realizadas" ? "AND tipo = 'Saída'" : "";
  const sort = p.sort ?? "data";
  if (!["id", "data", "competencia", "tipo", "valor"].includes(sort)) throw new SourceLimitation("Ordenação financeira sem campo comprovado.");
  const r = await paginate(`WITH source AS (${src.sql}) SELECT iclips_id AS id, job_id AS projeto,
    payment_date AS data, competence_date AS competencia, tipo, valor, 'Preliminar / em reconciliação'::text AS situacao FROM source
    WHERE standalone AND valor IS NOT NULL AND payment_date::timestamptz <= CURRENT_TIMESTAMP AND tipo IN ('Entrada','Saída') ${type}`,
    src.params, p, `${sort} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, id`, reader);
  return { ...r, reliability: "EM_RECONCILIACAO" as const, reason: note };
}

export async function cashChart(f: Filters, reader: Reader = q, schema?: SchemaSnapshot) {
  const profile = cashProfile(schema ?? await runtimeSchema());
  if (!profile.parent) throw new SourceLimitation("Vínculo-pai financeiro não reconhecido.");
  const src = cashSource(f, profile);
  const rows = await reader(`WITH source AS (${src.sql}) SELECT
    to_char(payment_date::timestamptz AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS label,
    sum(valor) FILTER (WHERE tipo = 'Entrada')::float8 AS entradas,
    sum(valor) FILTER (WHERE tipo = 'Saída')::float8 AS saidas FROM source
    WHERE standalone AND valor IS NOT NULL AND payment_date::timestamptz <= CURRENT_TIMESTAMP
      AND tipo IN ('Entrada','Saída') GROUP BY 1 ORDER BY 1`, src.params);
  return { series: ["entradas", "saidas"], points: rows, reliability: "EM_RECONCILIACAO" as const, reason: note };
}
