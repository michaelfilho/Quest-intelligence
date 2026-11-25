// Ferramentas de consulta para os agentes da RINNE no n8n. Somente leitura, sem SQL livre.
// Cada chamada é autorizada com as permissões ATUAIS do usuário da sessão original (nunca com o que o agente afirma).
import { z } from "zod";
import { INDICATORS, moduleById, TABLES } from "../../shared/catalog.js";
import { defaultPeriod, previousPeriod, type Filters } from "../../shared/contracts.js";
import { RINNE_TOOLS } from "../../shared/rinne.js";
import type { SessionUser } from "./auth.js";
import { allowedColumns, chartAllowed, indicatorAllowed, moduleAllowed, scopeFilters, stripRows, tableAllowed } from "./authz.js";
import { dbState } from "./db.js";
import { filtersSchema } from "./filters.js";
import { resolveIndicator, resolveModule, resolveTable } from "./services.js";

const id = z.string().trim().min(1).max(64).regex(/^[\w.\-:À-ú ]+$/, "identificador inválido");
export const toolInputSchema = z
  .object({
    period: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).optional(),
    compare: z.boolean().optional(),
    department: id.optional(),
    clientId: id.optional(),
    projectId: id.optional(),
    indicatorId: z.string().max(64).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export type ToolInput = z.infer<typeof toolInputSchema>;

export interface ToolOutput {
  tool: string;
  period: { from: string; to: string };
  filters: Filters;
  database: string;
  reliability: string;
  items: unknown[];
  tables: { id: string; label: string; columns: string[]; rows: unknown[]; total: number; status: string }[];
  limitations: string[];
}

export class ToolError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function filtersFor(u: SessionUser, i: ToolInput): Filters {
  const d = defaultPeriod();
  const f = filtersSchema.parse({ start: i.period?.from ?? d.start, end: i.period?.to ?? d.end, compare: i.compare ? "1" : undefined, department: i.department, client: i.clientId, project: i.projectId });
  return scopeFilters(u, f); // escopo departamental imposto, independentemente do que o agente pediu
}

async function moduleTool(u: SessionUser, moduleId: string, i: ToolInput, opts: { indicators?: string[]; tables?: string[] } = {}) {
  const m = moduleById(moduleId)!;
  if (!moduleAllowed(u, m)) throw new ToolError(403, "Sem permissão para este conteúdo.");
  const f = filtersFor(u, i);
  const r = await resolveModule(m, f, { indicator: (x) => indicatorAllowed(u, x) && (!opts.indicators || opts.indicators.includes(x)), chart: (x) => chartAllowed(u, x) });
  const items = r.indicators.filter((x) => x.status !== "FORBIDDEN").map((x) => ({ ...x, label: INDICATORS[x.id].label, unit: INDICATORS[x.id].unit, basis: INDICATORS[x.id].basis, sources: INDICATORS[x.id].sources }));
  const tables = [];
  for (const t of opts.tables ?? []) {
    if (!tableAllowed(u, t)) continue;
    const res = await resolveTable(t, f, { page: 1, pageSize: i.limit }, r.database);
    tables.push({ id: t, label: TABLES[t].label, columns: allowedColumns(u, TABLES[t]).map((c) => c.key), rows: stripRows(u, TABLES[t], res.rows), total: res.total, status: res.status });
  }
  return { f, database: r.database, items, tables };
}

function limitations(database: string, items: { status?: string }[]) {
  const l: string[] = [];
  if (database !== "CONNECTED") l.push("Banco de dados indisponível: nenhum valor foi calculado.");
  if (items.some((x) => x.status === "NOT_IMPLEMENTED")) l.push("Há indicadores aguardando o mapeamento do schema real do PostgreSQL.");
  l.push("Dados do CORE podem conter divergências históricas da API iClips e conflitos financeiros em auditoria; consulte a confiabilidade de cada indicador.");
  l.push("Ausência de informação não equivale a zero.");
  return l;
}

const MODULE_TOOLS: Record<string, { module: string; indicators?: string[]; tables?: string[] }> = {
  consultar_resumo_executivo: { module: "executivo" },
  consultar_receitas: { module: "financeiro", indicators: ["receita_faturada", "receita_recebida", "receita_competencia", "valores_em_aberto"], tables: ["receita_por_cliente"] },
  consultar_despesas: { module: "financeiro", indicators: ["despesas", "custos_diretos", "custos_indiretos"] },
  consultar_resultado: { module: "rentabilidade", indicators: ["resultado_operacional", "margem_bruta", "margem_contribuicao", "margem_operacional"] },
  consultar_rentabilidade: { module: "rentabilidade", tables: ["rentabilidade_clientes", "rentabilidade_projetos", "custo_por_servico"] },
  consultar_cliente: { module: "cliente", tables: ["projetos"] },
  consultar_projeto: { module: "projeto", tables: ["atividades"] },
  consultar_contrato: { module: "contratado", tables: ["contratado_executado"] },
  consultar_departamento: { module: "departamentos", tables: ["departamentos"] },
  consultar_producao: { module: "producao", tables: ["entregas_colaboradores"] },
  consultar_colaboradores: { module: "colaboradores", tables: ["colaboradores"] },
  consultar_capacidade: { module: "produtividade", indicators: ["capacidade_disponivel", "horas_registradas", "horas_produtivas", "horas_improdutivas", "ocupacao"], tables: ["capacidade_colaboradores"] },
  consultar_eficiencia: { module: "produtividade", indicators: ["produtividade", "tempo_medio_atividade", "projetos_atrasados", "horas_retrabalho", "desvio_horas"] },
  consultar_contratado_versus_executado: { module: "contratado", tables: ["contratado_executado"] },
  consultar_qualidade_dados: { module: "qualidade", tables: ["conflitos", "tarefas_ingest"] },
};

export async function runTool(u: SessionUser, name: string, rawInput: unknown): Promise<ToolOutput> {
  const def = RINNE_TOOLS.find((t) => t.name === name);
  if (!def) throw new ToolError(404, "Ferramenta inexistente.");
  if (!def.requires.every((p) => u.permissions.has(p))) throw new ToolError(403, "O usuário desta sessão não tem permissão para esta ferramenta.");
  const p = toolInputSchema.safeParse(rawInput ?? {});
  if (!p.success) throw new ToolError(400, "Parâmetros inválidos: " + p.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; "));
  const i = p.data;

  if (name === "consultar_cliente" && !i.clientId) throw new ToolError(400, "Informe clientId.");
  if (name === "consultar_projeto" && !i.projectId) throw new ToolError(400, "Informe projectId.");

  if (name === "detalhar_indicador" || name === "comparar_periodos") {
    if (!i.indicatorId || !INDICATORS[i.indicatorId]) throw new ToolError(400, "Informe um indicatorId existente.");
    if (!indicatorAllowed(u, i.indicatorId)) throw new ToolError(403, "Sem permissão para este indicador.");
    const f = { ...filtersFor(u, i), compare: name === "comparar_periodos" || !!i.compare };
    const { state } = await dbState();
    const r = await resolveIndicator(i.indicatorId, f, state);
    const d = INDICATORS[i.indicatorId];
    return { tool: name, period: { from: f.start, to: f.end }, filters: f, database: state, reliability: r.reliability, items: [{ ...r, label: d.label, unit: d.unit, basis: d.basis, formula: d.formula, sources: d.sources, requires: d.requires, previousPeriod: f.compare ? previousPeriod(f.start, f.end) : null }], tables: [], limitations: limitations(state, [r]) };
  }

  const spec = MODULE_TOOLS[name];
  const { f, database, items, tables } = await moduleTool(u, spec.module, i, spec);
  const worst = items.some((x) => x.reliability !== "VALIDADO") ? "PARCIAL_OU_INDISPONIVEL" : "VALIDADO";
  return { tool: name, period: { from: f.start, to: f.end }, filters: f, database, reliability: items.length ? worst : "INDISPONIVEL", items, tables, limitations: limitations(database, items) };
}
