// Central de relatórios: cálculo e documento por código tradicional (determinístico).
// Todos os cálculos, filtros e documentos são determinísticos.
import express, { type Request, type Response } from "express";
import { INDICATORS, moduleById, TABLES } from "../../shared/catalog.js";
import type { Filters, Unit } from "../../shared/contracts.js";
import { previousPeriod } from "../../shared/contracts.js";
import type { Permission } from "../../shared/permissions.js";
import type { SessionUser } from "./auth.js";
import { allowedColumns, chartAllowed, indicatorAllowed, moduleAllowed, scopeFilters, stripRows, tableAllowed } from "./authz.js";
import { dbState } from "./db.js";
import { filtersSchema } from "./filters.js";
import { resolveModule, resolveTable } from "./services.js";
import { audit } from "./store.js";
import { xlsx, type Cell } from "./xlsx.js";
import {MANAGEMENT_VIEWS} from '../../shared/management.js';

export interface ReportDef {
  id: string;
  title: string;
  description: string;
  module?: string;
  indicators?: string[];
  tables?: string[];
  requires: Permission[];
}

export const REPORT_DEFS: ReportDef[] = [
  {id:'projetos',title:'Relatório de projetos',description:'Projetos, clientes, prazos, horas e componentes financeiros disponíveis.',module:'projetos',tables:['gestao_projetos'],requires:['projetos.view']},
  {id:'colaboradores',title:'Relatório de colaboradores',description:'Horas, projetos atendidos e retrabalho por colaborador.',module:'colaboradores',tables:['colaboradores'],requires:['departamentos.view']},
  { id: "executivo", title: "Relatório executivo", description: "Receitas, despesas, resultado, produção e clientes ativos.", module: "executivo", tables: ["top_clientes_resultado", "top_projetos_menor_margem"], requires: ["estrategicos.view"] },
  { id: "financeiro", title: "Relatório financeiro", description: "Faturamento, recebimento e competência separados; despesas e custos.", module: "financeiro", tables: ["receita_por_cliente", "resultado_mensal"], requires: ["financeiro.view"] },
  { id: "rentabilidade", title: "Relatório de rentabilidade", description: "Resultado e margens por cliente, projeto e serviço.", module: "rentabilidade", tables: ["rentabilidade_clientes", "rentabilidade_projetos", "custo_por_servico"], requires: ["rentabilidade.view"] },
  { id: "producao", title: "Relatório de produção", description: "Projetos, peças, atividades, entregas, atrasos e refações.", module: "producao", tables: ["entregas_colaboradores"], requires: ["producao.view"] },
  { id: "clientes", title: "Relatório de clientes", description: "Carteira, receita, horas e produção por cliente.", module: "clientes", tables: ["clientes"], requires: ["clientes.view"] },
  { id: "contratos", title: "Relatório de contratos", description: "Contratado × executado e desvios.", module: "contratado", tables: ["contratado_executado"], requires: ["contratos.view"] },
  { id: "departamentos", title: "Relatório de departamentos", description: "Carga, horas, retrabalho e colaboradores.", module: "departamentos", tables: ["departamentos", "colaboradores"], requires: ["departamentos.view"] },
  { id: "eficiencia", title: "Relatório de eficiência", description: "Produtividade, tempos, atrasos, refações e desvios.", module: "produtividade", indicators: ["produtividade", "tempo_medio_atividade", "projetos_atrasados", "horas_retrabalho", "desvio_horas", "horas_previstas", "horas_registradas"], requires: ["capacidade.view"] },
  { id: "capacidade", title: "Relatório de capacidade", description: "Capacidade, ocupação e distribuição da carga.", module: "produtividade", indicators: ["capacidade_disponivel", "horas_registradas", "horas_produtivas", "horas_improdutivas", "ocupacao"], tables: ["capacidade_colaboradores"], requires: ["capacidade.view"] },
  { id: "qualidade", title: "Relatório de qualidade dos dados", description: "Sincronização, pendências, conflitos e cobertura.", module: "qualidade", tables: ["conflitos", "tarefas_ingest", "periodos_incompletos"], requires: ["qualidade.view"] },
];

export const reportAllowed = (u: SessionUser, d: ReportDef) => u.permissions.has("relatorios.view") && d.requires.every((p) => u.permissions.has(p)) && (!d.module || moduleAllowed(u, moduleById(d.module)!));

const order=['executivo','financeiro','rentabilidade','clientes','projetos','colaboradores','departamentos','producao','eficiencia','capacidade','contratos','qualidade'];
REPORT_DEFS.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
REPORT_DEFS.find(d=>d.id==='executivo')!.indicators=MANAGEMENT_VIEWS.executivo[0].indicators;
const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat("pt-BR", o);
export function fmtValue(v: unknown, unit: Unit | string) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  switch (unit) {
    case "BRL": return nf({ style: "currency", currency: "BRL" }).format(n);
    case "count": return nf({ maximumFractionDigits: 0 }).format(n);
    case "hours": return nf({ maximumFractionDigits: 1 }).format(n) + " h";
    case "days": return nf({ maximumFractionDigits: 1 }).format(n) + " dias";
    case "percent": return nf({ style: "percent", maximumFractionDigits: 1 }).format(n);
    case "ratio": return nf({ maximumFractionDigits: 2 }).format(n);
    default: return String(v);
  }
}

export function csvCell(v: unknown) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v).replace(".", ","); // decimal pt-BR
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita injeção de fórmula no Excel
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function buildReport(u: SessionUser, d: ReportDef, f: Filters) {
  const { state } = await dbState();
  const base = { id: d.id, title: d.title, description: d.description, period: { start: f.start, end: f.end }, previousPeriod: f.compare ? previousPeriod(f.start, f.end) : null, generatedAt: new Date().toISOString(), generatedBy: u.name, filters: Object.fromEntries(Object.entries(f).filter(([k, v]) => v && !["start", "end"].includes(k))), database: state };
  const indicators: Record<string, unknown>[] = [];
  const tables: Record<string, unknown>[] = [];

  const m = moduleById(d.module!)!;
  // O documento retorna indicadores e tabelas, não gráficos: não executar agregações descartadas.
  const r = await resolveModule(m, f, { indicator: (x) => indicatorAllowed(u, x) && (!d.indicators || d.indicators.includes(x)), chart: () => false });
  for (const i of r.indicators) {
    if (i.status === "FORBIDDEN") continue;
    const def = INDICATORS[i.id];
    indicators.push({ id: i.id, label: def.label, unit: def.unit, basis: def.basis, formula: def.formula, sources: def.sources, status: i.status, value: i.value, previous: i.previous, reliability: i.reliability, reason: i.reason ?? null, recordsUsed: i.recordsUsed ?? null, recordsExcluded: i.recordsExcluded ?? null, updatedAt: i.updatedAt ?? null, temporalField: i.temporalField ?? null, coverage: i.coverage ?? null });
  }
  for (const t of d.tables ?? []) {
    if (!tableAllowed(u, t)) continue;
    const def = TABLES[t];
    const res = await resolveTable(t, f, { page: 1, pageSize: 1000 }, state);
    tables.push({ id: t, label: def.label, columns: allowedColumns(u, def), rows: stripRows(u, def, res.rows), total: res.total, status: res.status, reason: res.reason ?? null });
  }
  const dataAvailable = indicators.some((i) => i.status === "OK");
  const limitations = [
    ...tables.filter(t=>(t.rows as unknown[]).length<Number(t.total)).map(t=>`${t.label}: esta exportação contém ${(t.rows as unknown[]).length} de ${t.total} registros; refine os filtros para reduzir o volume.`),
    ...(state !== "CONNECTED" ? ["Banco de dados indisponível: este relatório NÃO contém valores calculados."] : []),
    ...(indicators.some((i) => i.status === "NOT_IMPLEMENTED" || i.status === "INSUFFICIENT_DATA") ? ["Há indicadores sem fonte, vínculo ou semântica gerencial suficiente; observe o motivo individual."] : []),
    ...indicators.filter(i => i.reason).map(i => `${i.label}: ${i.reason}`),
    "Dados do CORE podem conter divergências históricas da API iClips e conflitos financeiros em auditoria; observe a confiabilidade de cada indicador.",
    "Ausência de informação não equivale a zero. Bases temporais (faturamento, caixa, competência) não são somadas entre si.",
  ];

  return { ...base, dataAvailable, indicators, tables, limitations };
}

type Report = Awaited<ReturnType<typeof buildReport>>;
type Col = { key: string; label: string; type: string };

function header(r: Report): string[][] {
  return [
    ["QUEST INTELLIGENCE — " + r.title],
    ["Período", `${r.period.start} a ${r.period.end}`],
    ["Gerado em", new Date(r.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })],
    ["Gerado por", r.generatedBy],
    ["Filtros", Object.entries(r.filters).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhum além do período"],
    ["Situação dos dados", r.dataAvailable ? "Com dados calculados" : "DADOS INDISPONÍVEIS — sem valores calculados"],
  ];
}

const indRow = (i: Record<string, unknown>) => [String(i.label), i.status === "OK" ? (i.value as Cell) : null, i.status === "OK" ? fmtValue(i.value, String(i.unit)) : `Indisponível (${i.status})`, String(i.unit), String(i.reliability), String(i.basis), (i.sources as string[]).join(", ")];
const IND_HEAD = ["Indicador", "Valor", "Valor formatado", "Unidade", "Confiabilidade", "Base temporal", "Origem"];

export function toCsv(r: Report) {
  const lines: Cell[][] = [...header(r), [], IND_HEAD, ...r.indicators.map(indRow)];
  for (const t of r.tables) {
    const cols = t.columns as Col[];
    lines.push([], [String(t.label)], cols.map((c) => c.label), ...(t.rows as Record<string, Cell>[]).map((row) => cols.map((c) => row[c.key])));
    if (!(t.rows as unknown[]).length) lines.push([t.status === "OK" ? "Nenhum registro" : `Indisponível (${t.status})`]);
  }
  lines.push([], ["Limitações"], ...r.limitations.map((l) => [l]));
  return "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n");
}

export function toXlsx(r: Report) {
  return xlsx([
    { name: "Resumo", rows: [...header(r), [], ["Limitações"], ...r.limitations.map((l) => [l])] },
    { name: "Indicadores", rows: [IND_HEAD, ...r.indicators.map(indRow)] },
    ...r.tables.map((t) => {
      const cols = t.columns as Col[];
      return { name: String(t.label), rows: [cols.map((c) => c.label), ...(t.rows as Record<string, Cell>[]).map((row) => cols.map((c) => row[c.key]))] };
    }),
  ]);
}

export function toMarkdown(r: Report) {
  const L = [`# QUEST INTELLIGENCE — ${r.title}`, "", ...header(r).slice(1).map(([k, v]) => `- **${k}:** ${v}`), ""];
  if (!r.dataAvailable) L.push("> **DADOS INDISPONÍVEIS.** Este relatório não contém valores calculados e não deve ser usado como demonstrativo.", "");
  if (r.indicators.length) {
    L.push("## Indicadores", "", "| Indicador | Valor | Confiabilidade | Base | Origem |", "|---|---|---|---|---|");
    for (const i of r.indicators) L.push(`| ${i.label} | ${i.status === "OK" ? fmtValue(i.value, String(i.unit)) : `indisponível (${i.status})`} | ${i.reliability} | ${i.basis} | ${(i.sources as string[]).join(", ")} |`);
    L.push("");
  }
  for (const t of r.tables) {
    const cols = t.columns as Col[];
    L.push(`## ${t.label}`, "");
    if (!(t.rows as unknown[]).length) L.push(t.status === "OK" ? "Nenhum registro no período." : `Indisponível (${t.status}).`, "");
    else L.push(`| ${cols.map((c) => c.label).join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`, ...(t.rows as Record<string, unknown>[]).map((row) => `| ${cols.map((c) => String(fmtValue(row[c.key], c.type)).replace(/\|/g, "\\|")).join(" | ")} |`), "");
  }
  L.push("## Limitações", "", ...r.limitations.map((l) => `- ${l}`));
  return L.join("\n");
}

export function reportsRouter() {
  const r = express.Router();
  r.get("/", (req, res) => res.json(REPORT_DEFS.filter((d) => reportAllowed(req.user!, d)).map(({ id, title, description }) => ({ id, title, description }))));

  r.get("/:id", async (req: Request, res: Response) => {
    const d = REPORT_DEFS.find((x) => x.id === req.params.id);
    if (!d) return res.status(404).json({ error: "Relatório inexistente" });
    if (!reportAllowed(req.user!, d)) return res.status(403).json({ error: "Você não tem permissão para este relatório." });
    const format = String(req.query.format ?? "json");
    if (!["json", "csv", "xlsx", "md"].includes(format)) return res.status(400).json({ error: "Formato inválido (json, csv, xlsx, md)." });
    if (format !== "json" && !req.user!.permissions.has("relatorios.export")) return res.status(403).json({ error: "Você não tem permissão para exportar relatórios." });
    const { format: _f, ...q } = req.query;
    const p = filtersSchema.safeParse(q);
    if (!p.success) return res.status(400).json({ error: "Filtros inválidos" });
    try {
      const rep = await buildReport(req.user!, d, scopeFilters(req.user!, p.data));
      if (format === "json") return res.json(rep);
      audit({ event: "report.export", actorId: req.user!.id, actor: req.user!.username, target: d.id, details: { format, dataAvailable: rep.dataAvailable } });
      const name = `rinne_${d.id}_${rep.period.start}_${rep.period.end}`;
      if (format === "csv") return res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` }).send(toCsv(rep));
      if (format === "md") return res.set({ "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.md"` }).send(toMarkdown(rep));
      return res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` }).send(toXlsx(rep));
    } catch (e) {
      console.error(JSON.stringify({ level: "error", scope: "reports", code:'REPORT_FAILURE' }));
      res.status(500).json({ error: "Erro ao gerar o relatório" });
    }
  });
  return r;
}

