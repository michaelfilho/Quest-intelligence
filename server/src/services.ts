// Camada de serviços: decide, para cada item do catálogo, se há banco, se há mapeamento e então calcula.
import { previousPeriod } from "../../shared/contracts.js";
import type { ChartResult, DbState, Dimension, DimensionResult, Filters, IndicatorResult, ModuleDef, ModuleResult, ResultStatus, TableResult } from "../../shared/contracts.js";
import { dbState } from "./db.js";
import {q} from './db.js';
import {runtimeSchema} from './schema.js';
import { chartImpls, dimensionImpls, indicatorImpls, tableImpls, type Page } from "./mappings.js";
import { SourceLimitation } from "./analytics.js";
import { mappingLimitation } from "./mapping-limitations.js";

const REASONS: Record<Exclude<ResultStatus, "OK" | "INSUFFICIENT_DATA">, string> = {
  DATABASE_UNAVAILABLE: "Banco de dados indisponível. Configure DATABASE_URL e verifique a conexão com o PostgreSQL quest_rinne.",
  NOT_IMPLEMENTED: "Fonte ou critério ainda não comprovado. Consulte a limitação individual; nenhuma associação é presumida.",
  ERROR: "Falha ao consultar a fonte. Detalhes registrados no log do servidor.",
  FORBIDDEN: "Seu perfil não tem permissão para este item.",
};

export function limitationCode(reason:string):NonNullable<IndicatorResult['reasonCode']> {
  if (/critério gerencial|classificação|jornadas|capacidade contratada|critério.*entrega|rateio.*aprovad/i.test(reason)) return 'BUSINESS_POLICY_PENDING';
  if (/campo ausente|coluna .*não encontrada|tipo.*incompatível|timestamp.*não confirmado/i.test(reason)) return 'MISSING_FIELD';
  if (/cadastro.*nome|cadastro incompleto/i.test(reason)) return 'INCOMPLETE_REGISTRY';
  if (/vínculo|chave.*duplicad|relacionamento|namespace|órfã|referência/i.test(reason)) return 'INVALID_RELATIONSHIP';
  if (/cobertura|subconjunto/i.test(reason)) return 'PARTIAL_COVERAGE';
  if (/nenhum|sem registros|sem tarefas|sem valores|sem timestamp/i.test(reason)) return 'NO_RECORDS';
  return 'SOURCE_NOT_INTEGRATED';
}
const unavailable = (id: string, status: Exclude<ResultStatus, "OK" | "INSUFFICIENT_DATA">) => {
  const reason=status==='NOT_IMPLEMENTED'?mappingLimitation(id):REASONS[status];
  return {id,status,reliability:'INDISPONIVEL' as const,reason,reasonCode:status==='ERROR'?'QUERY_FAILURE' as const:limitationCode(reason)};
};

function logError(scope: string, id: string, e: unknown) {
  console.error(JSON.stringify({ level: "error", scope, id, error: (e as Error).message }));
}

export async function resolveIndicator(id: string, f: Filters, db: DbState): Promise<IndicatorResult> {
  const empty = { value: null, previous: null };
  if (db !== "CONNECTED") return { ...unavailable(id, "DATABASE_UNAVAILABLE"), ...empty };
  const impl = indicatorImpls[id];
  if (!impl) return { ...unavailable(id, "NOT_IMPLEMENTED"), ...empty };
  try {
    const cur = await impl.compute(f);
    if (cur.insufficient) return { ...cur, id, status: "INSUFFICIENT_DATA", reliability: "INDISPONIVEL", reason: cur.insufficient,reasonCode:limitationCode(cur.insufficient), ...empty };
    let previous: number | null = null;
    if (f.compare && impl.comparable !== false) {
      const prev = await impl.compute({ ...f, ...previousPeriod(f.start, f.end) });
      previous = typeof prev.value === "number" && !prev.insufficient ? prev.value : null;
    }
    const { insufficient: _, ...rest } = cur;
    return { id, status: "OK", previous, ...rest };
  } catch (e) {
    if (e instanceof SourceLimitation) return { id, status: "INSUFFICIENT_DATA", reliability: "INDISPONIVEL", reason: e.message, reasonCode:limitationCode(e.message), ...empty };
    logError("indicator", id, e);
    return { ...unavailable(id, "ERROR"), ...empty };
  }
}

export async function resolveChart(id: string, f: Filters, db: DbState): Promise<ChartResult> {
  const empty = { series: [], points: [] };
  if (db !== "CONNECTED") return { ...unavailable(id, "DATABASE_UNAVAILABLE"), ...empty };
  const impl = chartImpls[id];
  if (!impl) return { ...unavailable(id, "NOT_IMPLEMENTED"), ...empty };
  try {
    return { id, status: "OK", ...(await impl(f)) };
  } catch (e) {
    if (e instanceof SourceLimitation) return { id, status: "INSUFFICIENT_DATA", reliability: "INDISPONIVEL", reason: e.message, reasonCode:limitationCode(e.message), ...empty };
    logError("chart", id, e);
    return { ...unavailable(id, "ERROR"), ...empty };
  }
}

export async function resolveTable(id: string, f: Filters, p: Page, db: DbState): Promise<TableResult> {
  const empty = { rows: [], total: 0, ...p };
  if (db !== "CONNECTED") return { ...unavailable(id, "DATABASE_UNAVAILABLE"), ...empty };
  const impl = tableImpls[id];
  if (!impl) return { ...unavailable(id, "NOT_IMPLEMENTED"), ...empty };
  try {
    return { id, status: "OK", ...p, ...(await impl(f, p)) };
  } catch (e) {
    if (e instanceof SourceLimitation) return { id, status: "INSUFFICIENT_DATA", reliability: "INDISPONIVEL", reason: e.message, reasonCode:limitationCode(e.message), ...empty };
    logError("table", id, e);
    return { ...unavailable(id, "ERROR"), ...empty };
  }
}

export async function resolveRecords(id: string, f: Filters, p: Page, db: DbState): Promise<TableResult> {
  const empty = { rows: [], total: 0, ...p };
  if (db !== "CONNECTED") return { ...unavailable(id, "DATABASE_UNAVAILABLE"), ...empty };
  const impl = indicatorImpls[id]?.records;
  if (!impl) return { ...unavailable(id, "NOT_IMPLEMENTED"), ...empty };
  try {
    return { id, status: "OK", ...p, ...(await impl(f, p)) };
  } catch (e) {
    if (e instanceof SourceLimitation) return { id, status: "INSUFFICIENT_DATA", reliability: "INDISPONIVEL", reason: e.message, reasonCode:limitationCode(e.message), ...empty };
    logError("records", id, e);
    return { ...unavailable(id, "ERROR"), ...empty };
  }
}

/** `allow` decide item a item; itens negados voltam como FORBIDDEN, sem consulta e sem dados. */
export async function resolveModule(m: ModuleDef, f: Filters, allow: { indicator: (id: string) => boolean; chart: (id: string) => boolean }): Promise<ModuleResult> {
  const { state } = await dbState();
  const [indicators, charts] = await Promise.all([
    Promise.all(m.indicators.map((id) => (allow.indicator(id) ? resolveIndicator(id, f, state) : { ...unavailable(id, "FORBIDDEN"), value: null, previous: null }))),
    Promise.all(m.charts.map((id) => (allow.chart(id) ? resolveChart(id, f, state) : { ...unavailable(id, "FORBIDDEN"), series: [], points: [] }))),
  ]);
  let entityName:string|undefined;
  if(m.detailOf&&state==='CONNECTED') {
    const dim=m.detailOf==='client'?'clients':'projects';
    entityName=(await dimensionImpls[dim]?.(f).catch(()=>[]))?.[0]?.label;
    if(!entityName&&!f.department) {
      const id=m.detailOf==='client'?f.client:f.project,table=m.detailOf==='client'?'clients':'jobs',schema=await runtimeSchema();
      if(id&&['iclips_id','name'].every(column=>schema.columns.some(c=>c.schema==='core'&&c.table===table&&c.column===column))) {
        const [r]=await q(`SELECT CASE WHEN count(*)=1 THEN max(nullif(btrim(name::text),'')) WHEN count(*)>1 THEN 'Cadastro com chave duplicada' END AS name FROM core.${table} WHERE iclips_id::text=$1`,[id]);
        entityName=r.name??undefined;
      }
    }
  }
  return {
    module: m.id,
    ...(m.detailOf ? {entityName:entityName??(m.detailOf==='client'?'Cliente sem vínculo/nome no escopo':'Projeto sem vínculo/nome no escopo')} : {}),
    generatedAt: new Date().toISOString(),
    database: state,
    filters: f,
    previousPeriod: f.compare ? previousPeriod(f.start, f.end) : null,
    indicators,
    charts,
  };
}

export async function resolveDimension(dim: Dimension, f: Filters): Promise<DimensionResult> {
  const { state } = await dbState();
  if (state !== "CONNECTED") return { status: "DATABASE_UNAVAILABLE", reason: REASONS.DATABASE_UNAVAILABLE, options: [] };
  const impl = dimensionImpls[dim];
  if (!impl) return { status: "NOT_IMPLEMENTED", reason: REASONS.NOT_IMPLEMENTED, options: [] };
  try {
    return { status: "OK", reason: "IDs com apontamentos válidos no período/escopo; limite de 500 opções. Nomes não são inferidos.", options: await impl(f) };
  } catch (e) {
    if (e instanceof SourceLimitation) return { status: "INSUFFICIENT_DATA", reason: e.message, options: [] };
    logError("dimension", dim, e);
    return { status: "ERROR", reason: REASONS.ERROR, options: [] };
  }
}

