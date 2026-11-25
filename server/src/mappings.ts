// Mapeamentos determinísticos. Cada fonte é validada pela introspecção em tempo de execução.
import type { Dimension, Filters, IndicatorResult, Reliability, TableResult } from "../../shared/contracts.js";
import { computeMetric, METRICS, metricRecords, TIME_CHARTS, timeChart, invoiceChart, TIME_TABLES, timeTable, sourceStatement, paginate, operationalDimension, clientTable, jobTable } from "./analytics.js";
import { CASH_METRICS, computeCash, cashRecords, cashChart, CASH_DIMENSION_CHARTS, cashDimensionChart, cashClientTable, classifiedCash, costCenterLinks } from "./cash.js";
import { QUALITY_METRICS, qualityMetric, conflictsTable } from "./quality.js";
import { REGISTRY_COUNTS, registryCount, registryRecords } from "./registry-counts.js";
import { jobChart, invoiceEvolution, ingestChart, ingestTable, futureEntries, timeAlerts } from "./extensions.js";
import { activityMetric, activityChart, workedActivities } from './activities.js';
import { projectMetric } from './policies.js';
import { COST_CHARTS,costChart,costTable,costCoverage } from './costs.js';

export type Computed = Pick<IndicatorResult, "value" | "recordsUsed" | "recordsExcluded" | "exclusions" | "updatedAt" | "reason" | "temporalField" | "coverage"> & {
  reliability: Reliability;
  insufficient?: string; // preenchido quando a fonte não permite calcular → DADOS INSUFICIENTES
};
export type Page = { page: number; pageSize: number; sort?: string; dir?: "asc" | "desc" };
export type Rows = Pick<TableResult, "rows" | "total" | "reason"> & { reliability: Reliability };

export interface IndicatorImpl {
  comparable?: boolean;
  compute(f: Filters): Promise<Computed>;
  /** Registros de origem que formam o valor (drill-down). */
  records?(f: Filters, p: Page): Promise<Rows>;
}
export interface ChartImpl {
  (f: Filters): Promise<{ series: string[]; points: Record<string, string | number | null>[]; reliability: Reliability }>;
}
export interface TableImpl {
  (f: Filters, p: Page): Promise<Rows>;
}
export interface DimensionImpl {
  (f: Filters): Promise<{ value: string; label: string }[]>;
}

export const indicatorImpls: Partial<Record<string, IndicatorImpl>> = Object.fromEntries(Object.keys(METRICS).map(id => [id, {
  compute: (f: Filters) => computeMetric(id, f), records: (f: Filters, p: Page) => metricRecords(id, f, p),
}]));
for (const id of CASH_METRICS) indicatorImpls[id] = { compute: f => computeCash(id, f), records: (f, p) => cashRecords(id, f, p) };
for (const id of QUALITY_METRICS) indicatorImpls[id] = { comparable: false, compute: f => qualityMetric(id, f) };
for (const id of Object.keys(REGISTRY_COUNTS)) indicatorImpls[id] = { comparable: false, compute: f => registryCount(id, f), records: (f, p) => registryRecords(id, f, p) };
indicatorImpls.lancamentos_futuros = { compute: f => futureEntries(f) };
for (const id of ['horas_previstas','desvio_horas','horas_vs_previstas','atividades_trabalhadas','pecas_trabalhadas']) indicatorImpls[id]={compute:f=>activityMetric(id,f),records:workedActivities};
for (const id of ['projetos_ativos','projetos_suspensos','projetos_concluidos','projetos_atrasados']) indicatorImpls[id]={comparable:id==='projetos_concluidos',compute:f=>projectMetric(id,f)};
for (const id of ['receita_recebida','despesas']) indicatorImpls[id]={compute:f=>classifiedCash(id,f)};
for (const id of ['cobertura_custos','apontamentos_custo_zero']) indicatorImpls[id]={compute:f=>costCoverage(id,f)};
export const chartImpls: Partial<Record<string, ChartImpl>> = Object.fromEntries(TIME_CHARTS.map(id => [id, (f: Filters) => timeChart(id, f)]));
chartImpls.evolucao_faturamento = invoiceChart;
chartImpls.movimentacoes_realizadas = f => cashChart(f);
chartImpls.projetos_por_status = f => jobChart("status", f);
chartImpls.evolucao_producao = f => jobChart("opened", f);
chartImpls.evolucao_financeira = invoiceEvolution;
chartImpls.ingest_por_status = f => ingestChart(f);
chartImpls.previstas_vs_realizadas = activityChart;
for (const id of Object.keys(COST_CHARTS)) chartImpls[id]=f=>costChart(id,f);
for (const id of CASH_DIMENSION_CHARTS) chartImpls[id] = f => cashDimensionChart(id,f);
export const tableImpls: Partial<Record<string, TableImpl>> = Object.fromEntries(TIME_TABLES.map(id => [id, (f: Filters, p: Page) => timeTable(id, f, p)]));
tableImpls.clientes = clientTable;
tableImpls.conflitos=conflictsTable;
tableImpls.vinculos_centros_custo=costCenterLinks;
tableImpls.projetos = jobTable;
tableImpls.lancamentos_financeiros = (f, p) => cashRecords("movimentos", f, p);
tableImpls.alertas = timeAlerts;
tableImpls.atividades = workedActivities;
tableImpls.custos_registrados = costTable;
tableImpls.tarefas_ingest = (f, p) => ingestTable(f, p);
tableImpls.receita_por_cliente = (f,p) => cashClientTable(f,p);
tableImpls.notas_fiscais = async (f, p) => {
  const src = sourceStatement("invoices", f);
  const sort = p.sort ?? "emissao";
  const fields = ["numero", "emissao", "cliente", "valor", "situacao"];
  if (!fields.includes(sort)) throw new Error("Coluna inválida");
  return paginate(`WITH source AS (${src.sql}) SELECT iclips_id AS id, invoice_number AS numero,
    issued_at AS emissao, client_name AS cliente, service_amount AS valor, status AS situacao FROM source`,
    src.params, p, `${sort} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, id`);
};
export const dimensionImpls: Partial<Record<Dimension, DimensionImpl>> = Object.fromEntries(
  (["clients", "groups", "projects", "departments", "employees", "statuses"] as Dimension[]).map(dim => [dim, (f: Filters) => operationalDimension(dim, f)]));
