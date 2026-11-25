// Mapeamentos determinísticos. Cada fonte é validada pela introspecção em tempo de execução.
import type { Dimension, Filters, IndicatorResult, Reliability, TableResult } from "../../shared/contracts.js";
import { computeMetric, METRICS, metricRecords, TIME_CHARTS, timeChart, invoiceChart, TIME_TABLES, timeTable, sourceStatement, paginate, operationalDimension, clientTable, jobTable } from "./analytics.js";
import { CASH_METRICS, computeCash, cashRecords, cashChart, CASH_DIMENSION_CHARTS, cashDimensionChart, cashClientTable, costCenterLinks } from "./cash.js";
import { QUALITY_METRICS, qualityMetric, conflictsTable } from "./quality.js";
import { REGISTRY_COUNTS, registryCount, registryRecords } from "./registry-counts.js";
import { jobChart, invoiceEvolution, ingestChart, ingestTable, futureEntries, timeAlerts } from "./extensions.js";
import { activityMetric, activityChart, workedActivities } from './activities.js';
import { projectMetric } from './policies.js';
import { COST_CHARTS,costChart,costTable,costCoverage } from './costs.js';
import {DRE_METRICS,dreMetric,dreMonthly,dreDimensionTable,billingVersusReceipts,dreMonthlyTable} from './dre.js';
import {ALLOCATION_METRICS,allocationMetric,allocationChart,allocationTable} from './allocations.js';
import {INVOICE_LINK_METRICS,invoiceLinkMetric,invoiceClientTable,invoiceLinkTable} from './invoice-links.js';
import {workedPiecesMetric,pieceChart,pieceTable} from './production.js';
import {STATUS_OBSERVATIONS,observedStatusMetric,observedStatusChart,calendarMetric,calendarTable} from './project-observations.js';
import {publicationMetric,publicationsTable,conflictDetails} from './publications.js';
import {runtimeSchema} from './schema.js';

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
for (const id of ['cobertura_custos','apontamentos_custo_zero']) indicatorImpls[id]={compute:f=>costCoverage(id,f)};
for(const id of DRE_METRICS)indicatorImpls[id]={compute:f=>dreMetric(id,f)};
for(const id of ALLOCATION_METRICS)indicatorImpls[id]={compute:f=>allocationMetric(id,f)};
for(const id of INVOICE_LINK_METRICS)indicatorImpls[id]={compute:f=>invoiceLinkMetric(id,f),records:invoiceLinkTable};
for(const id of Object.keys(STATUS_OBSERVATIONS))indicatorImpls[id]={comparable:false,compute:f=>observedStatusMetric(id,f)};
for(const id of ['tempo_medio_execucao','projetos_finalizados_periodo'])indicatorImpls[id]={compute:f=>calendarMetric(id,f),records:calendarTable};
for(const id of ['tarefas_trabalhadas','etapas_trabalhadas','unidades_sem_estimativa'])indicatorImpls[id]={compute:f=>activityMetric(id,f),records:workedActivities};
for(const id of ['horas_com_custo_positivo','horas_sem_custo_positivo','cobertura_custo_positivo_horas'])indicatorImpls[id]={compute:f=>costCoverage(id,f)};
indicatorImpls.pecas_trabalhadas={compute:workedPiecesMetric,records:pieceTable};
indicatorImpls.estados_publicacao={comparable:false,compute:publicationMetric};
export const chartImpls: Partial<Record<string, ChartImpl>> = Object.fromEntries(TIME_CHARTS.map(id => [id, (f: Filters) => timeChart(id, f)]));
chartImpls.evolucao_faturamento = invoiceChart;
chartImpls.movimentacoes_realizadas = f => cashChart(f);
chartImpls.projetos_por_status = f => jobChart("status", f);
chartImpls.evolucao_producao = f => jobChart("opened", f);
chartImpls.evolucao_financeira = invoiceEvolution;
chartImpls.ingest_por_status = f => ingestChart(f);
chartImpls.previstas_vs_realizadas = activityChart;
chartImpls.dre_mensal=dreMonthly;
chartImpls.receitas_vs_despesas=async f=>{const r=await dreMonthly(f);return {...r,series:['receita_operacional','despesas_operacionais'],points:r.points.map(p=>({label:p.label,receita_operacional:p.receita_operacional,despesas_operacionais:Number(p.despesas_fixas)+Number(p.despesas_variaveis)}))};};
chartImpls.faturado_vs_recebido=billingVersusReceipts;
chartImpls.despesas_por_centro_custo=allocationChart;
chartImpls.status_atual_projetos=observedStatusChart;
chartImpls.pecas_por_cliente=f=>pieceChart('client',f);
chartImpls.pecas_por_departamento=f=>pieceChart('department',f);
for (const id of Object.keys(COST_CHARTS)) chartImpls[id]=f=>costChart(id,f);
for (const id of CASH_DIMENSION_CHARTS) chartImpls[id] = f => cashDimensionChart(id,f);
export const tableImpls: Partial<Record<string, TableImpl>> = Object.fromEntries(TIME_TABLES.map(id => [id, (f: Filters, p: Page) => timeTable(id, f, p)]));
tableImpls.clientes = clientTable;
tableImpls.conflitos=conflictsTable;
tableImpls.vinculos_centros_custo=async(f,p)=>{
  const s=await runtimeSchema();
  return s.columns.some(c=>c.schema==='core'&&c.table==='financial_entry_cost_centers'&&c.column==='source_center_id')?allocationTable(f,p):costCenterLinks(f,p,undefined,s);
};
tableImpls.projetos = jobTable;
tableImpls.lancamentos_financeiros = (f, p) => cashRecords("movimentos", f, p);
tableImpls.alertas = timeAlerts;
tableImpls.atividades = workedActivities;
tableImpls.custos_registrados = costTable;
tableImpls.rateios_financeiros=allocationTable;
tableImpls.resultado_mensal=dreMonthlyTable;
tableImpls.faturamento_por_cliente=invoiceClientTable;
tableImpls.notas_vinculos=invoiceLinkTable;
tableImpls.notas_ambiguas_detalhes=(f,p)=>invoiceLinkTable(f,p,undefined,'Documento ambíguo');
tableImpls.notas_sem_vinculo_detalhes=(f,p)=>invoiceLinkTable(f,p,undefined,'Sem vínculo válido');
tableImpls.pecas_trabalhadas=pieceTable;
tableImpls.coorte_calendario=calendarTable;
tableImpls.estados_publicacao=publicationsTable;
tableImpls.conflitos_detalhes=conflictDetails;
for(const [id,dim]of [['dre_categorias','category'],['dre_contas','account'],['movimentos_clientes','client'],['movimentos_projetos','project']] as const)tableImpls[id]=(f,p)=>dreDimensionTable(dim,f,p);
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
const rawInvoices=tableImpls.notas_fiscais!;
tableImpls.notas_fiscais=async(f,p)=>{
  const s=await runtimeSchema();
  if([['clients','document'],['invoices','client_document']].every(([table,column])=>s.columns.some(c=>c.schema==='core'&&c.table===table&&c.column===column)))return invoiceLinkTable(f,p);
  return {...await rawInvoices(f,p),reason:'Documento não integrado para validar a associação; nomes originais das notas sem atribuir cadastro por nome. Faturamento global permanece disponível.'};
};
