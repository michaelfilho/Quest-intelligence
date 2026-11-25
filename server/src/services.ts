// Camada de serviços: decide, para cada item do catálogo, se há banco, se há mapeamento e então calcula.
import { previousPeriod } from "../../shared/contracts.js";
import type { ChartResult, DbState, Dimension, DimensionResult, Filters, IndicatorResult, ModuleDef, ModuleResult, ResultStatus, TableResult } from "../../shared/contracts.js";
import { dbState } from "./db.js";
import { chartImpls, dimensionImpls, indicatorImpls, tableImpls, type Page } from "./mappings.js";

const REASONS: Record<Exclude<ResultStatus, "OK" | "INSUFFICIENT_DATA">, string> = {
  DATABASE_UNAVAILABLE: "Banco de dados indisponível. Configure DATABASE_URL e verifique a conexão com o PostgreSQL quest_rinne.",
  NOT_IMPLEMENTED: "Aguardando mapeamento do schema real do PostgreSQL. Nenhuma fórmula é presumida antes da inspeção.",
  ERROR: "Falha ao consultar a fonte. Detalhes registrados no log do servidor.",
  FORBIDDEN: "Seu perfil não tem permissão para este item.",
};

const unavailable = (id: string, status: Exclude<ResultStatus, "OK" | "INSUFFICIENT_DATA">) =>
  ({ id, status, reliability: "INDISPONIVEL" as const, reason: REASONS[status] });

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
    if (cur.insufficient) return { id, status: "INSUFFICIENT_DATA", reliability: "INDISPONIVEL", reason: cur.insufficient, ...empty };
    let previous: number | null = null;
    if (f.compare) {
      const prev = await impl.compute({ ...f, ...previousPeriod(f.start, f.end) });
      previous = typeof prev.value === "number" && !prev.insufficient ? prev.value : null;
    }
    const { insufficient: _, ...rest } = cur;
    return { id, status: "OK", previous, ...rest };
  } catch (e) {
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
  return {
    module: m.id,
    generatedAt: new Date().toISOString(),
    database: state,
    filters: f,
    previousPeriod: f.compare ? previousPeriod(f.start, f.end) : null,
    indicators,
    charts,
  };
}

export async function resolveDimension(dim: Dimension): Promise<DimensionResult> {
  const { state } = await dbState();
  if (state !== "CONNECTED") return { status: "DATABASE_UNAVAILABLE", reason: REASONS.DATABASE_UNAVAILABLE, options: [] };
  const impl = dimensionImpls[dim];
  if (!impl) return { status: "NOT_IMPLEMENTED", reason: REASONS.NOT_IMPLEMENTED, options: [] };
  try {
    return { status: "OK", options: await impl() };
  } catch (e) {
    logError("dimension", dim, e);
    return { status: "ERROR", reason: REASONS.ERROR, options: [] };
  }
}

