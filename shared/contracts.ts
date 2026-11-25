// Contratos de dados compartilhados entre backend e frontend. Sem dependências externas.

export type Unit = "BRL" | "count" | "hours" | "days" | "percent" | "ratio" | "datetime";
export type ColumnType = Unit | "text" | "date";

/** Base temporal do indicador. Nunca misturar bases no mesmo número. */
export type Basis = "faturamento" | "recebimento" | "competencia" | "operacional" | "ingestao";

/** DESATUALIZADO: a fonte não sincroniza há mais tempo que o esperado (definido no mapeamento real). */
export type Reliability = "VALIDADO" | "PARCIAL" | "DESATUALIZADO" | "PENDENTE" | "EM_RECONCILIACAO" | "INDISPONIVEL";

/**
 * OK                   — valor calculado a partir do PostgreSQL.
 * NOT_IMPLEMENTED      — aguardando mapeamento do schema real (nenhuma fórmula inventada).
 * DATABASE_UNAVAILABLE — banco não configurado ou inacessível.
 * INSUFFICIENT_DATA    — consulta mapeada, mas a fonte não permite calcular ("DADOS INSUFICIENTES").
 * ERROR                — falha inesperada na consulta.
 * FORBIDDEN            — o usuário não tem permissão para este item (nenhum dado é enviado).
 */
export type ResultStatus = "OK" | "NOT_IMPLEMENTED" | "DATABASE_UNAVAILABLE" | "INSUFFICIENT_DATA" | "ERROR" | "FORBIDDEN";

export type DbState = "CONNECTED" | "DATABASE_UNAVAILABLE" | "NOT_CONFIGURED";

export interface IndicatorDef {
  id: string;
  label: string;
  unit: Unit;
  basis: Basis;
  /** Definição de negócio. A fórmula SQL só é escrita após inspecionar o schema real. */
  formula: string;
  /** Tabelas candidatas — a confirmar na inspeção. */
  sources: string[];
  /** O que precisa existir na fonte para o indicador ser calculável. */
  requires?: string;
  higherIsBetter?: boolean;
}

export interface ChartDef {
  id: string;
  label: string;
  kind: "line" | "bar" | "ranking";
  unit: Unit;
  basis: Basis;
  sources: string[];
}

export interface Column {
  key: string;
  label: string;
  type: ColumnType;
}

export interface TableDef {
  id: string;
  label: string;
  columns: Column[];
  sources: string[];
  /** Coluna cujo valor leva à página de detalhe. */
  link?: { column: string; to: "clientes" | "projetos" };
  /** Apresentação: tabela (padrão), cards, lista ranqueada (Top N) ou painel de alertas. */
  display?: "table" | "cards" | "list" | "alerts";
  pageSize?: number;
  description?: string;
}

export interface ModuleDef {
  id: string;
  path: string;
  label: string;
  group: string;
  question: string;
  indicators: string[];
  charts: string[];
  tables: string[];
  /** Módulos de detalhe (cliente/projeto) não aparecem no menu. */
  detailOf?: "client" | "project";
}

export interface Filters {
  start: string; // YYYY-MM-DD (America/Sao_Paulo)
  end: string;
  compare: boolean;
  client?: string;
  group?: string;
  project?: string;
  department?: string;
  employee?: string;
  service?: string;
  status?: string;
}

interface ResultBase {
  id: string;
  status: ResultStatus;
  reliability: Reliability;
  reason?: string;
}

export interface IndicatorResult extends ResultBase {
  temporalField?: string;
  coverage?: string;
  value: number | string | null;
  previous: number | null;
  recordsUsed?: number;
  recordsExcluded?: number;
  exclusions?: { reason: string; count: number }[];
  updatedAt?: string | null;
}

export interface ChartResult extends ResultBase {
  series: string[];
  points: Record<string, string | number | null>[];
}

export interface TableResult extends ResultBase {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ModuleResult {
  module: string;
  generatedAt: string;
  database: DbState;
  filters: Filters;
  previousPeriod: { start: string; end: string } | null;
  indicators: IndicatorResult[];
  charts: ChartResult[];
}

export interface IndicatorDetail {
  definition: IndicatorDef;
  result: IndicatorResult;
  filters: Filters;
  previousPeriod: { start: string; end: string } | null;
  database: DbState;
}

export interface DimensionResult {
  status: ResultStatus;
  reason?: string;
  options: { value: string; label: string }[];
}

export const DIMENSIONS = ["clients", "groups", "projects", "departments", "employees", "services", "statuses"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

// ---- Datas (America/Sao_Paulo) ----

const TZ = "America/Sao_Paulo";
export const todaySP = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

const toUTC = (iso: string) => new Date(iso + "T00:00:00Z");
const toISO = (d: Date) => d.toISOString().slice(0, 10);

export function defaultPeriod(today = todaySP()) {
  return { start: today.slice(0, 8) + "01", end: today };
}

/** Período imediatamente anterior, com o mesmo número de dias. */
export function previousPeriod(start: string, end: string) {
  const days = Math.round((toUTC(end).getTime() - toUTC(start).getTime()) / 86400000) + 1;
  const prevEnd = new Date(toUTC(start).getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  return { start: toISO(prevStart), end: toISO(prevEnd) };
}

export function monthPeriod(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const m = String(month).padStart(2, "0");
  return { start: `${year}-${m}-01`, end: `${year}-${m}-${last}` };
}
