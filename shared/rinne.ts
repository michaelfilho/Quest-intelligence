// Contrato da inteligência RINNE (uma única inteligência; o modo diferencia o contexto).
// Toda IA é orquestrada no n8n. Estes nomes são um CONTRATO PROPOSTO: os workflows ainda não existem.
import type { Permission } from "./permissions.js";

export const RINNE_CONTRACT_VERSION = "1.0";

export const RINNE_MODES = ["CHAT", "VOICE", "MEETING"] as const;
export type RinneMode = (typeof RINNE_MODES)[number];

export const RINNE_OPERATIONS = [
  "ASK",
  "ANALYZE",
  "SUMMARIZE",
  "TRANSCRIBE",
  "SYNTHESIZE",
  "MEETING_START",
  "DEPARTMENT_ANALYSIS",
  "DEPARTMENT_SUMMARY",
  "MEETING_REPORT",
  "PING", // teste de conectividade: o workflow deve responder SEM acionar modelos (sem custo)
] as const;
export type RinneOperation = (typeof RINNE_OPERATIONS)[number];

/** Envelope enviado pelo backend ao n8n (o navegador nunca monta este objeto). */
export interface RinneRequest {
  version: string;
  requestId: string;
  correlationId: string;
  sessionId: string | null;
  mode: RinneMode;
  operation: RinneOperation;
  userId: string; // da sessão autenticada; nunca do navegador
  message: string | null;
  context: {
    departmentId: string | null; // escopo imposto pelo backend quando o usuário é restrito
    period: { from: string; to: string } | null;
    meetingId?: string | null;
    allowedTools: string[]; // ferramentas que ESTE usuário pode usar (derivado das permissões)
    executionToken: string | null; // contexto de curta duração para chamar as ferramentas
    toolsBaseUrl: string | null;
    data?: Record<string, unknown>; // dados determinísticos de apoio (ex.: itens da reunião)
  };
  locale: "pt-BR";
  timezone: "America/Sao_Paulo";
}

export interface RinneSource {
  type: "indicator" | "table" | "tool" | "document" | "meeting";
  id: string;
  label?: string;
}

export interface RinneTable {
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
}

export interface RinneChart {
  title: string;
  kind: "line" | "bar";
  unit: string;
  series: string[];
  points: Record<string, string | number | null>[];
}

/** Resposta normalizada entregue ao navegador (já validada pelo backend). */
export interface RinneResponseBody {
  text: string;
  summary: string | null;
  sources: RinneSource[];
  indicators: { id: string }[]; // valores são SEMPRE recalculados pelo backend, nunca vindos da IA
  warnings: string[];
  suggestions: string[];
  tables: RinneTable[];
  charts: RinneChart[];
  audio: { mimeType: string; data: string } | null; // base64 curto; o navegador gera blob: URL
}

export type RinneReplyStatus = "done" | "pending" | "error" | "unavailable" | "cancelled";

export interface RinneMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  status: RinneReplyStatus;
  content: string;
  payload: Partial<RinneResponseBody> & {
    origin?: "n8n" | "deterministico" | "sistema";
    requestId?: string | null;
    correlationId?: string | null;
    resolvedIndicators?: unknown[];
    transcript?: string | null;
    period?: { from: string; to: string };
    database?: string;
  };
  createdAt: string;
}

export interface RinneSessionSummary {
  id: string;
  mode: RinneMode;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: number;
}

// ---------------- Ferramentas para os agentes do n8n ----------------
export interface ToolDef {
  name: string;
  description: string;
  /** Permissões exigidas (todas). Avaliadas no backend com o usuário da sessão original. */
  requires: Permission[];
}

export const RINNE_TOOLS: ToolDef[] = [
  { name: "consultar_resumo_executivo", description: "Indicadores da visão executiva no período.", requires: ["estrategicos.view"] },
  { name: "consultar_receitas", description: "Receitas faturada, recebida e por competência (bases separadas).", requires: ["financeiro.view"] },
  { name: "consultar_despesas", description: "Despesas e custos diretos/indiretos.", requires: ["financeiro.view"] },
  { name: "consultar_resultado", description: "Resultado operacional e margens.", requires: ["rentabilidade.view"] },
  { name: "consultar_rentabilidade", description: "Rentabilidade por cliente, projeto e serviço.", requires: ["rentabilidade.view"] },
  { name: "consultar_cliente", description: "Visão individual de um cliente.", requires: ["clientes.view"] },
  { name: "consultar_projeto", description: "Visão individual de um projeto.", requires: ["projetos.view"] },
  { name: "consultar_contrato", description: "Escopo contratado e execução.", requires: ["contratos.view"] },
  { name: "consultar_departamento", description: "Indicadores de um departamento.", requires: ["departamentos.view"] },
  { name: "consultar_producao", description: "Projetos, peças, atividades e entregas.", requires: ["producao.view"] },
  { name: "consultar_colaboradores", description: "Horas e produção por colaborador.", requires: ["departamentos.view"] },
  { name: "consultar_capacidade", description: "Capacidade, ocupação e carga.", requires: ["capacidade.view"] },
  { name: "consultar_eficiencia", description: "Produtividade, atrasos, refações e tempos.", requires: ["capacidade.view"] },
  { name: "consultar_contratado_versus_executado", description: "Desvios entre contratado e realizado.", requires: ["contratos.view"] },
  { name: "consultar_qualidade_dados", description: "Sincronização, pendências e conflitos da base.", requires: ["qualidade.view"] },
  { name: "detalhar_indicador", description: "Definição, fórmula, origem e registros de um indicador.", requires: [] },
  { name: "comparar_periodos", description: "Um indicador no período atual e no anterior.", requires: [] },
];

/** Período em linguagem natural → datas (America/Sao_Paulo). Usado pelo Modo Reunião (regra determinística). */
export const PERIOD_PRESETS = ["Hoje", "Ontem", "Esta semana", "Este mês", "Mês anterior", "Últimos 30 dias", "Últimos três meses", "Este ano"] as const;

const utc = (iso: string) => new Date(iso + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(utc(s).getTime() + n * 86400000));
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Período em linguagem natural → { label, start, end }. Regra determinística (não usa IA). */
export function resolvePeriod(text: string, today: string): { label: string; start: string; end: string } | null {
  const t = norm(text);
  const [y, m, d] = today.split("-").map(Number);
  const custom = /(\d{2})\/(\d{2})\/(\d{4})\s*(?:a|ate|-)\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  if (custom) {
    const start = `${custom[3]}-${custom[2]}-${custom[1]}`;
    const end = `${custom[6]}-${custom[5]}-${custom[4]}`;
    if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || start > end) return null;
    return { label: "Período personalizado", start, end };
  }
  if (/\bhoje\b/.test(t)) return { label: "Hoje", start: today, end: today };
  if (/\bontem\b/.test(t)) return { label: "Ontem", start: addDays(today, -1), end: addDays(today, -1) };
  if (/esta semana|nesta semana|semana atual/.test(t)) {
    const dow = (utc(today).getUTCDay() + 6) % 7; // segunda = 0
    return { label: "Esta semana", start: addDays(today, -dow), end: today };
  }
  if (/mes anterior|mes passado|ultimo mes/.test(t)) {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return { label: "Mês anterior", start: `${py}-${String(pm).padStart(2, "0")}-01`, end: `${py}-${String(pm).padStart(2, "0")}-${last}` };
  }
  if (/este mes|neste mes|mes atual/.test(t)) return { label: "Este mês", start: today.slice(0, 8) + "01", end: today };
  if (/ultimos 30 dias/.test(t)) return { label: "Últimos 30 dias", start: addDays(today, -29), end: today };
  if (/ultimos (3|tres) meses/.test(t)) return { label: "Últimos três meses", start: iso(new Date(Date.UTC(y, m - 4, d + 1))), end: today };
  if (/este ano|neste ano|ano atual/.test(t)) return { label: "Este ano", start: `${y}-01-01`, end: today };
  return null;
}
