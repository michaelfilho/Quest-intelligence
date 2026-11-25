// Autorização de dados: módulo → item (indicador/gráfico/tabela) → coluna → escopo de departamento.
// Aplicada no backend; o frontend apenas reflete o resultado.
import { CHARTS, INDICATORS, MODULES, TABLES } from "../../shared/catalog.js";
import type { Filters, ModuleDef, TableDef } from "../../shared/contracts.js";
import { columnPermission, itemPermission, MODULE_PERMISSION, type Permission } from "../../shared/permissions.js";
import type { SessionUser } from "./auth.js";

const has = (u: SessionUser, p: Permission | null | undefined) => !p || u.permissions.has(p);

export const moduleAllowed = (u: SessionUser, m: ModuleDef) => !!MODULE_PERMISSION[m.id] && u.permissions.has(MODULE_PERMISSION[m.id]);

export const indicatorAllowed = (u: SessionUser, id: string) =>
  !!INDICATORS[id] && has(u, itemPermission(id, INDICATORS[id].basis)) && MODULES.some((m) => m.indicators.includes(id) && moduleAllowed(u, m));

export const chartAllowed = (u: SessionUser, id: string) =>
  !!CHARTS[id] && has(u, itemPermission(id, CHARTS[id].basis)) && MODULES.some((m) => m.charts.includes(id) && moduleAllowed(u, m));

export const tableAllowed = (u: SessionUser, id: string) =>
  !!TABLES[id] && has(u, itemPermission(id)) && MODULES.some((m) => m.tables.includes(id) && moduleAllowed(u, m));

/** Colunas que o usuário pode ver (as demais são removidas das linhas no servidor). */
export const allowedColumns = (u: SessionUser, def: TableDef) => def.columns.filter((c) => has(u, columnPermission(c.key)));

export function stripRows(u: SessionUser, def: TableDef, rows: Record<string, unknown>[]) {
  return stripRecordFields(u,rows);
}
export function stripRecordFields(u:SessionUser,rows:Record<string,unknown>[]) {
  // Também protege campos auxiliares e de drill-down que não apareçam no catálogo visual.
  return rows.map(r => Object.fromEntries(Object.entries(r).filter(([key]) => has(u,columnPermission(key)))));
}

/** Gestor com escopo de departamento: o filtro de departamento é imposto e não pode ser trocado. */
export const scopeFilters = (u: SessionUser, f: Filters): Filters => (u.scopeDepartment ? { ...f, department: u.scopeDepartment } : f);
