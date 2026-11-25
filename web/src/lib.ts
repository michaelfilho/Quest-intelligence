// Cliente da API, filtros globais (na URL) e formatação. O frontend nunca fala com o banco.
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { defaultPeriod } from "../../shared/contracts";
import type { Basis, ColumnType, DbState, Filters, Reliability, ResultStatus } from "../../shared/contracts";
import type { Permission } from "../../shared/permissions";

// ---------------- API ----------------
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: { campo: string; erro: string }[], public code?: string) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | undefined>;
export const toQuery = (params: Params) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== false) qs.set(k, v === true ? "1" : String(v));
  return qs.size ? "?" + qs : "";
};

async function request<T>(method: string, path: string, params: Params, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${import.meta.env.BASE_URL}api${path}${toQuery(params)}`, {
      method,
      credentials: "same-origin",
      // Header próprio = proteção CSRF exigida pela API em métodos que alteram estado.
      headers: method === "GET" ? undefined : { "X-Requested-With": "rinne", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "API do QUEST RINNE inacessível. Verifique se o backend está em execução.");
  }
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, data?.error ?? (r.status >= 500 ? "API do QUEST RINNE inacessível." : `HTTP ${r.status}`), data?.details, data?.code);
  return data as T;
}

export const api = <T>(path: string, params: Params = {}) => request<T>("GET", path, params);
export const send = <T = null>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown, params: Params = {}) => request<T>(method, path, params, body);

// ---------------- Sessão do usuário ----------------
export interface Me {
  id: number;
  username: string;
  name: string;
  role: string | null;
  roleId: string | null;
  permissions: Permission[];
  scopeDepartment: string | null;
  mustChangePassword: boolean;
}
export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), retry: false, staleTime: 5 * 60000 });

/** Só para esconder elementos: a permissão é SEMPRE verificada no backend. */
export function useCan() {
  const perms = new Set(useMe().data?.permissions ?? []);
  return (p: Permission | null | undefined) => !p || perms.has(p);
}

export interface Health {
  status: string;
  database: DbState;
  session: { database: string; user: string; read_only: string; server_time: string } | null;
  schemas?: Record<string, string>; // só para quem tem config.view
  timezone: string;
}
export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/health"), refetchInterval: 30000 });

// ---------------- Filtros globais ----------------
export const FILTER_KEYS = ["start", "end", "compare", "client", "group", "project", "department", "employee", "service", "status"] as const;

export function useFilters() {
  const [sp, setSp] = useSearchParams();
  const d = defaultPeriod();
  const filters: Filters = { start: sp.get("start") ?? d.start, end: sp.get("end") ?? d.end, compare: sp.get("compare") === "1" };
  for (const k of ["client", "group", "project", "department", "employee", "service", "status"] as const) {
    const v = sp.get(k);
    if (v) filters[k] = v;
  }
  const set = (patch: Partial<Record<(typeof FILTER_KEYS)[number], string | undefined>>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
  };
  const clear = () => setSp(new URLSearchParams(), { replace: true });
  const active = FILTER_KEYS.filter((k) => sp.has(k)).length;
  return { filters, set, clear, active, search: sp.toString() };
}

export const filterParams = (f: Filters): Params => ({ ...f, compare: f.compare || undefined });

// ---------------- Formatação (pt-BR, America/Sao_Paulo) ----------------
const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat("pt-BR", o);

export function fmt(v: unknown, type: ColumnType): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  switch (type) {
    case "BRL":
      return nf({ style: "currency", currency: "BRL" }).format(n);
    case "count":
      return nf({ maximumFractionDigits: 0 }).format(n);
    case "hours":
      return nf({ maximumFractionDigits: 1 }).format(n) + " h";
    case "days":
      return nf({ maximumFractionDigits: 1 }).format(n) + " dias";
    case "percent": // fração 0..1
      return nf({ style: "percent", maximumFractionDigits: 1 }).format(n);
    case "ratio":
      return nf({ maximumFractionDigits: 2 }).format(n);
    case "datetime":
      return new Date(String(v)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    case "date":
      return fmtDate(String(v));
    default:
      return String(v);
  }
}

export const fmtDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Variação relativa; null quando não há base de comparação. */
export const delta = (cur: unknown, prev: number | null) =>
  typeof cur === "number" && prev !== null && prev !== 0 ? (cur - prev) / Math.abs(prev) : null;

export const STATUS_LABEL: Record<ResultStatus, string> = {
  OK: "",
  NOT_IMPLEMENTED: "Aguardando mapeamento",
  DATABASE_UNAVAILABLE: "Sem conexão com o banco",
  INSUFFICIENT_DATA: "DADOS INSUFICIENTES",
  ERROR: "Erro na consulta",
  FORBIDDEN: "Sem permissão",
};

export const RELIABILITY_LABEL: Record<Reliability, string> = {
  VALIDADO: "Validado",
  PARCIAL: "Parcial",
  DESATUALIZADO: "Desatualizado",
  PENDENTE: "Pendente",
  EM_RECONCILIACAO: "Em reconciliação",
  INDISPONIVEL: "Indisponível",
};

export const BASIS_LABEL: Record<Basis, string> = {
  faturamento: "Faturamento",
  recebimento: "Caixa",
  competencia: "Competência",
  operacional: "Operacional",
  ingestao: "Ingestão",
};

export const DB_LABEL: Record<DbState, string> = {
  CONNECTED: "PostgreSQL conectado",
  DATABASE_UNAVAILABLE: "Banco indisponível",
  NOT_CONFIGURED: "Banco não configurado",
};

/** Baixa um arquivo gerado pela API (mantém o cookie de sessão; nada fica em cache local). */
export async function downloadFrom(path: string, params: Params, fallbackName: string) {
  const r = await fetch(`${import.meta.env.BASE_URL}api${path}${toQuery(params)}`, { credentials: "same-origin" });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new ApiError(r.status, j?.error ?? `HTTP ${r.status}`);
  }
  const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await r.blob());
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
