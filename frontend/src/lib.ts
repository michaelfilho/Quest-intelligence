// Cliente da API, filtros globais (na URL) e formatação. O frontend nunca fala com o banco.
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from 'react';
import {ACCESS_MODULES,CHARTS,INDICATORS,TABLES} from '../../shared/catalog';
import {itemPermission,MODULE_PERMISSION} from '../../shared/permissions';
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

async function request<T>(method: string, path: string, params: Params, body?: unknown, signal?:AbortSignal): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${import.meta.env.BASE_URL}api${path}${toQuery(params)}`, {
      method,
      signal,
      credentials: "same-origin",
      // Header próprio = proteção CSRF exigida pela API em métodos que alteram estado.
      headers: method === "GET" ? undefined : { "X-Requested-With": "rinne", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if(signal?.aborted)throw e;
    throw new ApiError(0, "API do QUEST INTELLIGENCE inacessível. Verifique se o backend está em execução.");
  }
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, data?.error ?? (r.status >= 500 ? "API do QUEST INTELLIGENCE inacessível." : `HTTP ${r.status}`), data?.details, data?.code);
  return data as T;
}

export const api = <T>(path: string, params: Params = {},signal?:AbortSignal) => request<T>("GET", path, params,undefined,signal);
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
export function useCatalogCan(){
  const permissions=new Set(useMe().data?.permissions??[]);
  return (kind:'indicators'|'charts'|'tables',id:string)=>{
    const def=kind==='indicators'?INDICATORS[id]:kind==='charts'?CHARTS[id]:TABLES[id];
    if(!def)return false;
    const required=itemPermission(id,'basis' in def?def.basis:undefined);
    return (!required||permissions.has(required))&&(ACCESS_MODULES[kind][id]??[]).some(m=>!!MODULE_PERMISSION[m]&&permissions.has(MODULE_PERMISSION[m]));
  };
}
export function shortState(result:{status:ResultStatus;reasonCode?:string}){
  if(result.status==='INSUFFICIENT_DATA')return result.reasonCode==='UNSUPPORTED_FILTER'?'Filtro não aplicável':result.reasonCode==='BUSINESS_POLICY_PENDING'?'Configuração necessária':result.reasonCode==='NO_RECORDS'?'Sem registros':result.reasonCode==='PARTIAL_COVERAGE'?'Dados parciais':result.reasonCode==='INVALID_RELATIONSHIP'?'Dados em revisão':'Integração pendente';
  return STATUS_LABEL[result.status];
}
export const humanLimitation=(code?:string)=>({UNSUPPORTED_FILTER:'Ajuste ou remova o filtro: ele não possui o mesmo significado nesta área.',BUSINESS_POLICY_PENDING:'É necessário definir e aprovar o critério de gestão antes de calcular este resultado.',NO_RECORDS:'Nenhum registro atende ao período e aos filtros selecionados. Isso não significa valor zero.',PARTIAL_COVERAGE:'Os dados disponíveis cobrem somente parte da informação necessária.',INVALID_RELATIONSHIP:'A associação entre os registros precisa de revisão para evitar atribuição incorreta ou duplicidade.',MISSING_FIELD:'Uma informação necessária ainda não está disponível na integração.',INCOMPLETE_REGISTRY:'O cadastro precisa ser complementado para identificar esta informação.',QUERY_FAILURE:'Não foi possível consultar os dados. Tente novamente ou consulte o administrador.'} as Record<string,string>)[code??'']??'Os dados ou critérios necessários ainda não estão disponíveis para calcular este indicador com segurança.';
const TERMS:Record<string,string>={payment_date:'data de pagamento',competence_date:'data de competência',issued_at:'data de emissão',service_amount:'valor dos serviços',net_amount:'valor líquido',iss_amount:'impostos da nota',labor_cost:'custo registrado',duration_seconds:'duração em segundos',duration_minutes:'duração em minutos',started_at:'início do registro',finished_at:'fim do registro',completed_at:'data de conclusão',entered_at:'data de abertura',expected_end_at:'prazo',last_seen_at:'atualização na origem',is_rework:'marcação de retrabalho',job_id:'projeto',task_id:'tarefa',workflow_id:'etapa',workflow_step_id:'etapa',job_piece_id:'peça do projeto',employee_id:'colaborador',department_id:'departamento',iclips_id:'identificador do cadastro',source_kind:'tipo de atividade',dre_indicator:'classificação financeira',updated_at:'data de atualização',published_at:'data de publicação',entry_type:'tipo de movimentação',amount:'valor',received_records:'registros recebidos',expected_total:'quantidade esperada',record_count:'quantidade de registros',hourly_rate:'taxa por hora',client_id:'cliente',TASK:'tarefa',WORKFLOW:'etapa',issued:'emitida',cancelled:'cancelada'};
export const managementText=(text:string)=>text.replace(/\b(?:core|ingest|audit)\.[a-z_]+\b/g,'dados de origem').replace(/\b[A-Za-z_]+\b/g,word=>TERMS[word]??(word.includes('_')?/^[A-Z_]+$/.test(word)?'configuração da integração':'informação de origem':word));
export const sourceLabel=(source:string)=>({'time_entries':'Apontamentos de horas','jobs':'Projetos','clients':'Cadastro de clientes','employees':'Cadastro de colaboradores','departments':'Cadastro de departamentos','invoices':'Notas fiscais','financial_entries':'Movimentações financeiras','financial_categories':'Categorias financeiras','financial_entry_cost_centers':'Centros de custo','job_tasks':'Tarefas dos projetos','workflow_steps':'Etapas das peças','job_pieces':'Peças dos projetos'} as Record<string,string>)[source.split('.').at(-1)??'']??'Dados da agência';

export interface Health {
  status: string;
  database: DbState;
  session: { database: string; user: string; read_only: string; server_time: string } | null;
  schemas?: Record<string, string>; // só para quem tem config.view
  timezone: string;
}
export const useHealth = (poll = false) => useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/health"), refetchInterval: poll ? 60000 : false });

// ---------------- Filtros globais ----------------
export const FILTER_KEYS = ["start", "end", "compare", "client", "group", "project", "department", "employee", "service", "status","category","statusSource"] as const;

export function useFilters() {
  const [sp, setSp] = useSearchParams();
  const d = defaultPeriod();
  const filters: Filters = { start: sp.get("start") ?? d.start, end: sp.get("end") ?? d.end, compare: sp.get("compare") === "1" };
  for (const k of ["client", "group", "project", "department", "employee", "service", "status","category"] as const) {
    const v = sp.get(k);
    if (v) filters[k] = v;
  }
  const statusSource=sp.get('statusSource');
  if(statusSource==='projects'||statusSource==='invoices')filters.statusSource=statusSource;
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
export const refreshDelay=(remaining:number|undefined,receivedAt:number,now=Date.now())=>!receivedAt?60000:Math.max(1000,(remaining??60000)-Math.max(0,now-receivedAt));
export const analyticsRefresh=(status:string|undefined,remaining:number|undefined,receivedAt:number)=>status==='ERROR'||status==='error'?false:refreshDelay(remaining,receivedAt);
export function useDebouncedFilters(filters:Filters){
  const [value,setValue]=useState(filters),key=JSON.stringify(filters);
  useEffect(()=>{const timer=setTimeout(()=>setValue(JSON.parse(key)),300);return ()=>clearTimeout(timer);},[key]);
  return value;
}

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
  NOT_IMPLEMENTED: "Integração pendente",
  DATABASE_UNAVAILABLE: "Integração indisponível",
  INSUFFICIENT_DATA: "Dados insuficientes",
  ERROR: "Falha na consulta",
  FORBIDDEN: "Sem permissão",
};

export const RELIABILITY_LABEL: Record<Reliability, string> = {
  VALIDADO: "Validado",
  PARCIAL: "Dados parciais",
  DESATUALIZADO: "Desatualizado",
  PENDENTE: "Pendente",
  EM_RECONCILIACAO: "Preliminar",
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
  CONNECTED: "Fonte disponível",
  DATABASE_UNAVAILABLE: "Dados indisponíveis",
  NOT_CONFIGURED: "Integração pendente",
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
