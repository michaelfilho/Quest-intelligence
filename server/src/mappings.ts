// ÚNICO ponto onde o SQL de negócio será escrito — após `npm run introspect` contra o banco real.
//
// Tudo que não está registrado aqui é devolvido como NOT_IMPLEMENTED ("aguardando mapeamento do schema real").
// Nenhuma coluna, tabela ou fórmula é presumida.
//
// Regras para cada implementação:
//  - SQL parametrizado ($1, $2...) com os valores de `f` — nunca interpolar filtros na string.
//  - Agregar no PostgreSQL; nada de SELECT * nem carregar tabelas inteiras.
//  - Informar recordsUsed/recordsExcluded/exclusions para a rastreabilidade.
//  - Reliability honesta: PARCIAL/EM_RECONCILIACAO quando houver conflitos ou coletas pendentes no período.
//  - Respeitar a base temporal (faturamento × recebimento × competência) do catálogo.
//
// Exemplo (ilustrativo — colunas a confirmar):
//   receita_faturada: {
//     async compute(f) {
//       const [r] = await q(`select sum(<valor>)::float as v, count(*)::int as n from core.invoices
//                             where <emissao> between $1 and $2 and <cancelada> is not true`, [f.start, f.end]);
//       return { value: r.v, recordsUsed: r.n, reliability: "VALIDADO" };
//     },
//     records: (f, page) => ...,
//   },
import type { Dimension, Filters, IndicatorResult, Reliability, TableResult } from "../../shared/contracts.js";

export type Computed = Pick<IndicatorResult, "value" | "recordsUsed" | "recordsExcluded" | "exclusions" | "updatedAt"> & {
  reliability: Reliability;
  insufficient?: string; // preenchido quando a fonte não permite calcular → DADOS INSUFICIENTES
};
export type Page = { page: number; pageSize: number; sort?: string; dir?: "asc" | "desc" };
export type Rows = Pick<TableResult, "rows" | "total"> & { reliability: Reliability };

export interface IndicatorImpl {
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
  (): Promise<{ value: string; label: string }[]>;
}

export const indicatorImpls: Partial<Record<string, IndicatorImpl>> = {};
export const chartImpls: Partial<Record<string, ChartImpl>> = {};
export const tableImpls: Partial<Record<string, TableImpl>> = {};
export const dimensionImpls: Partial<Record<Dimension, DimensionImpl>> = {};
