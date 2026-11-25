// Máquina de estados do Modo Reunião — DETERMINÍSTICA (regras, sem IA).
// IDLE → CONSENT → DEPARTMENT_SELECTION → PERIOD_SELECTION → ANALYSIS → DEPARTMENT_COMPLETED → NEXT_DEPARTMENT → … → MEETING_COMPLETED
// + PAUSED (retoma o estado anterior), ERROR (recupera o estado anterior), CANCELLED.
import { resolvePeriod } from "../../../shared/rinne.js";

export const MEETING_STATES = ["IDLE", "CONSENT", "DEPARTMENT_SELECTION", "PERIOD_SELECTION", "ANALYSIS", "DEPARTMENT_COMPLETED", "NEXT_DEPARTMENT", "MEETING_COMPLETED", "PAUSED", "CANCELLED", "ERROR"] as const;
export type MeetingState = (typeof MEETING_STATES)[number];

export const MEETING_EVENTS = ["START", "CONSENT", "SELECT_DEPARTMENT", "SELECT_PERIOD", "RECORD_ITEM", "ASK", "AUDIO_SEGMENT", "COMPLETE_DEPARTMENT", "NEXT_DEPARTMENT", "COMPLETE_MEETING", "PAUSE", "RESUME", "CANCEL", "FAIL", "RECOVER"] as const;
export type MeetingEvent = (typeof MEETING_EVENTS)[number];

export const TERMINAL: MeetingState[] = ["MEETING_COMPLETED", "CANCELLED"];

const T: Partial<Record<MeetingState, Partial<Record<MeetingEvent, MeetingState>>>> = {
  IDLE: { START: "CONSENT" },
  CONSENT: { CONSENT: "DEPARTMENT_SELECTION" },
  DEPARTMENT_SELECTION: { SELECT_DEPARTMENT: "PERIOD_SELECTION", COMPLETE_MEETING: "MEETING_COMPLETED" },
  PERIOD_SELECTION: { SELECT_PERIOD: "ANALYSIS", SELECT_DEPARTMENT: "PERIOD_SELECTION" },
  ANALYSIS: { RECORD_ITEM: "ANALYSIS", ASK: "ANALYSIS", AUDIO_SEGMENT: "ANALYSIS", SELECT_PERIOD: "ANALYSIS", COMPLETE_DEPARTMENT: "DEPARTMENT_COMPLETED", COMPLETE_MEETING: "MEETING_COMPLETED" },
  DEPARTMENT_COMPLETED: { NEXT_DEPARTMENT: "NEXT_DEPARTMENT", SELECT_DEPARTMENT: "PERIOD_SELECTION", COMPLETE_MEETING: "MEETING_COMPLETED" },
  NEXT_DEPARTMENT: { SELECT_DEPARTMENT: "PERIOD_SELECTION", COMPLETE_MEETING: "MEETING_COMPLETED" },
};

/** Próximo estado ou null se a transição não é permitida. `pausedFrom` é o estado guardado na pausa/erro. */
export function transition(state: MeetingState, event: MeetingEvent, pausedFrom: MeetingState | null = null): MeetingState | null {
  if (TERMINAL.includes(state)) return null;
  if (event === "CANCEL") return "CANCELLED";
  if (state === "PAUSED") return event === "RESUME" && pausedFrom ? pausedFrom : null;
  if (state === "ERROR") return event === "RECOVER" && pausedFrom ? pausedFrom : null;
  if (event === "PAUSE") return state === "IDLE" ? null : "PAUSED";
  if (event === "FAIL") return "ERROR";
  return T[state]?.[event] ?? null;
}

export function allowedEvents(state: MeetingState, pausedFrom: MeetingState | null) {
  return MEETING_EVENTS.filter((e) => transition(state, e, pausedFrom) !== null);
}

export function promptFor(state: MeetingState, ctx: { department?: string | null; period?: string | null } = {}) {
  switch (state) {
    case "IDLE":
      return "Diga “RINNE, iniciar modo reunião” para começar.";
    case "CONSENT":
      return "Autoriza o uso do microfone e a eventual gravação nesta reunião? Você pode seguir apenas com texto.";
    case "DEPARTMENT_SELECTION":
      return "Qual departamento você deseja analisar?";
    case "PERIOD_SELECTION":
      return `Qual período deseja analisar${ctx.department ? ` para ${ctx.department}` : ""}? (hoje, ontem, esta semana, este mês, mês anterior, últimos 30 dias, últimos três meses, este ano ou dd/mm/aaaa a dd/mm/aaaa)`;
    case "ANALYSIS":
      return `Analisando ${ctx.department ?? "o departamento"}${ctx.period ? ` (${ctx.period})` : ""}. Registre observações, decisões, problemas, oportunidades e encaminhamentos, ou faça perguntas. Diga “departamento finalizado” para consolidar.`;
    case "DEPARTMENT_COMPLETED":
      return `Departamento ${ctx.department ?? ""} finalizado. Qual é o próximo departamento? Ou diga “encerrar reunião”.`.replace("  ", " ");
    case "NEXT_DEPARTMENT":
      return "Qual é o próximo departamento?";
    case "MEETING_COMPLETED":
      return "Reunião encerrada. O relatório está disponível para consulta e exportação.";
    case "PAUSED":
      return "Reunião pausada. Diga “retomar reunião” para continuar.";
    case "CANCELLED":
      return "Reunião cancelada.";
    case "ERROR":
      return "Ocorreu um erro. Use “recuperar” para voltar ao último estado válido.";
  }
}

// ---------------- Comandos (regras de linguagem; sem IA) ----------------
export type ItemKind = "observation" | "decision" | "problem" | "opportunity" | "action";
export type Command =
  | { event: "START" | "COMPLETE_DEPARTMENT" | "COMPLETE_MEETING" | "PAUSE" | "RESUME" | "CANCEL" | "NEXT_DEPARTMENT" | "RECOVER" }
  | { event: "SELECT_DEPARTMENT"; department: string }
  | { event: "SELECT_PERIOD"; label: string; start: string; end: string }
  | { event: "RECORD_ITEM"; kind: ItemKind; text: string; responsible: string | null; dueDate: string | null }
  | { event: "ASK"; message: string }
  | { event: null; error: string };

const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const KIND_PREFIX: [RegExp, ItemKind][] = [
  [/^(observacao|obs)\s*[:\-]/, "observation"],
  [/^decisao\s*[:\-]/, "decision"],
  [/^problema\s*[:\-]/, "problem"],
  [/^oportunidade\s*[:\-]/, "opportunity"],
  [/^(encaminhamento|acao|tarefa)\s*[:\-]/, "action"],
];

/** Extrai responsável e prazo SOMENTE quando explicitamente informados ("responsável: X", "prazo: dd/mm/aaaa"). */
function extractItem(raw: string) {
  let text = raw;
  let responsible: string | null = null;
  let dueDate: string | null = null;
  const r = /resp(?:onsavel|onsável)\s*[:\-]\s*([^;,.]+?)(?=\s*(?:[;,.]|prazo\s*[:\-]|$))/i.exec(text);
  if (r) {
    responsible = r[1].trim();
    text = text.replace(r[0], "");
  }
  const p = /prazo\s*[:\-]\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(text);
  if (p && !Number.isNaN(Date.parse(`${p[3]}-${p[2]}-${p[1]}`))) {
    dueDate = `${p[3]}-${p[2]}-${p[1]}`;
    text = text.replace(p[0], "");
  }
  return { text: text.replace(/[\s;,.]+$/, "").trim(), responsible, dueDate };
}

export function parseCommand(input: string, state: MeetingState, today: string): Command {
  const raw = input.trim().replace(/^rinne[,:]?\s*/i, "");
  const t = n(raw);
  if (!t) return { event: null, error: "Comando vazio." };
  if (/iniciar (o )?modo reuniao/.test(t)) return { event: "START" };
  if (/(departamento finalizado|finalizar (o )?departamento|concluir (o )?departamento)/.test(t)) return { event: "COMPLETE_DEPARTMENT" };
  if (/(encerrar|finalizar|concluir) (a )?reuniao/.test(t)) return { event: "COMPLETE_MEETING" };
  if (/^(pausar|pausa)( a reuniao)?$/.test(t)) return { event: "PAUSE" };
  if (/^(retomar|continuar)( a reuniao)?$/.test(t)) return { event: "RESUME" };
  if (/^cancelar (a )?reuniao$/.test(t)) return { event: "CANCEL" };
  if (/^recuperar$/.test(t)) return { event: "RECOVER" };
  if (/^proximo departamento$/.test(t)) return { event: "NEXT_DEPARTMENT" };

  for (const [re, kind] of KIND_PREFIX) {
    if (re.test(t)) {
      const body = raw.replace(/^[^:\-]+[:\-]\s*/, "");
      const item = extractItem(body);
      if (!item.text) return { event: null, error: "Informe o conteúdo do registro." };
      return { event: "RECORD_ITEM", kind, ...item };
    }
  }

  if (state === "PERIOD_SELECTION" || (state === "ANALYSIS" && /^periodo\b/.test(t))) {
    const p = resolvePeriod(raw, today);
    return p ? { event: "SELECT_PERIOD", ...p } : { event: null, error: "Período não reconhecido. Use: hoje, ontem, esta semana, este mês, mês anterior, últimos 30 dias, últimos três meses, este ano ou dd/mm/aaaa a dd/mm/aaaa." };
  }
  if (state === "DEPARTMENT_SELECTION" || state === "NEXT_DEPARTMENT" || state === "DEPARTMENT_COMPLETED") {
    const department = raw.replace(/^(o |a )?(departamento|depto\.?|area|área)\s+(de |da |do )?/i, "").replace(/[.!?]+$/, "").trim();
    if (department.length < 2 || department.length > 64) return { event: null, error: "Nome de departamento inválido." };
    return { event: "SELECT_DEPARTMENT", department };
  }
  if (state === "ANALYSIS") return { event: "ASK", message: raw.slice(0, 4000) };
  return { event: null, error: "Comando não reconhecido neste momento da reunião." };
}
