import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Fragment,useEffect,useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Column, Filters, TableDef, TableResult } from "../../../shared/contracts";
import { columnPermission } from "../../../shared/permissions";
import {SEARCH_COLUMNS} from '../../../shared/management';
import {TABLES} from '../../../shared/catalog';
import {HoursCalendar} from './HoursCalendar';
import { api, filterParams, fmt, useCan,analyticsRefresh,downloadFrom,shortState,humanLimitation,managementText } from "../lib";
import { CountPill, EmptyState, ErrorState, Panel, ReliabilityBadge, Skeleton } from "./ui";

type Def = Pick<TableDef, "id" | "label"> & Partial<TableDef>;
type Row = Record<string, unknown>;

const isNum = (c: Column) => !["text", "date", "datetime"].includes(c.type);
const PILL_KEYS = new Set(["status", "situacao", "severidade", "retrabalho"]);
const initials = (s: unknown) => String(s ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Cell({ c, v }: { c: Column; v: unknown }) {
  if (v == null || v === "") return <span className="text-q-mid">—</span>;
  if(c.key==='retrabalho'||c.key==='is_rework')return <span>{v===true?'Sim':v===false?'Não':String(v)}</span>;
  if (c.type === "percent") return <span className="num inline-block rounded-full border border-q-orange/50 px-2.5 py-0.5 text-xs font-semibold">{fmt(v, "percent")}</span>;
  if (PILL_KEYS.has(c.key)) return <span className="inline-block rounded-md bg-q-bg px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-q-graphite">{String(v)}</span>;
  return <>{fmt(v, c.type)}</>;
}

/**
 * Tabela paginada no servidor (`/tables/:id`, ou `endpoint` para registros de origem de um KPI).
 * Sem `def.columns`, as colunas vêm das chaves retornadas.
 */
export function DataTable({ def, filters, endpoint, title, search, actions,active=true,extraParams={} }: { def: Def; filters: Filters; endpoint?: string; title?: string; search?: string; actions?: ReactNode;active?:boolean;extraParams?:Record<string,string> }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null); // ordenação no servidor
  const [text,setText]=useState(''),[term,setTerm]=useState(''),[expanded,setExpanded]=useState<string|null>(null),[exportError,setExportError]=useState<string|null>(null);
  useEffect(()=>{const t=setTimeout(()=>{setTerm(text);setPage(1);},300);return ()=>clearTimeout(t);},[text]);
  const context=JSON.stringify([{...filters,compare:false},extraParams]);
  useEffect(()=>{setPage(1);setExpanded(null);},[context]);
  const pageSize = def.pageSize ?? (def.id==='timesheet_calendario'?200:def.display === "cards" ? 24 : 25);
  const path = endpoint ?? `/tables/${def.id}`;
  const tableFilters = { ...filters, compare: false }; // comparação só altera cards, não as linhas atuais
  const q = useQuery<TableResult & {columns?:string[]}>({
    refetchInterval: q=>active?analyticsRefresh(q.state.status==='error'?'error':q.state.data?.status,q.state.data?.refreshAfterMs,q.state.dataUpdatedAt):false,
    enabled:active,
    queryKey: [path, tableFilters, page, pageSize, sort,term,extraParams],
    queryFn: ({signal}) => api<TableResult & { columns?: string[] }>(path, { ...filterParams(tableFilters), page, pageSize, search:term||undefined,sort: endpoint ? undefined : sort?.key, dir: endpoint ? undefined : sort?.dir,...extraParams },signal),
    placeholderData: keepPreviousData,
  });
  const navigate = useNavigate();
  const r = q.data;
  const can = useCan();
  // Colunas: as que o servidor liberou (r.columns) ∩ as que o perfil pode ver — dados bloqueados já não vêm do servidor.
  const recordLabels:Record<string,string>={nome:'Nome',projeto:'Projeto',cliente:'Cliente',colaborador:'Colaborador',departamento:'Departamento',atividade:'Atividade',horas:'Horas',custo_registrado:'Custo registrado',is_rework:'Retrabalho',started_at:'Data do registro',issued_at:'Emissão',competence_date:'Competência',service_amount:'Valor faturado',net_amount:'Valor líquido',invoice_number:'Nota',status:'Situação',valor:'Valor',tipo:'Tipo',payment_date:'Pagamento',numero:'Nota',data:'Data',recebido:'Recebido'};
  const recordTypes:Record<string,Column['type']>={horas:'hours',custo_registrado:'BRL',service_amount:'BRL',net_amount:'BRL',valor:'BRL',recebido:'BRL',started_at:'datetime',issued_at:'date',competence_date:'date',payment_date:'date',data:'datetime'};
  const columns: Column[] = (def.columns ?? Object.keys(r?.rows[0] ?? {}).filter(key=>!!recordLabels[key]).map((key) => ({ key, label:recordLabels[key], type:recordTypes[key]??'text' }))).filter((c) => can(columnPermission(c.key)) && (!r?.columns || r.columns.includes(c.key)));
  const pages = r ? Math.max(1, Math.ceil(r.total / r.pageSize)) : 1;
  const display = def.display ?? "table";
  const go = (row: Row) => {
    const params=new URLSearchParams(search);for(const [k,v]of Object.entries(filterParams(filters)))if(v!==undefined)params.set(k,String(v));
    const route=(pathname:string,tab?:string)=>{if(tab)params.set('aba',tab);return ()=>navigate({pathname,search:params.toString()});};
    if(['departamentos','timesheet_departamentos'].includes(def.id)&&row.entity_id!=null)return route(`/departamentos/${encodeURIComponent(String(row.entity_id))}`,'equipe');
    if(def.id==='colaboradores'&&row.entity_id!=null)return route(`/colaboradores/${encodeURIComponent(String(row.entity_id))}`,'projetos');
    if(def.id==='timesheet_calendario'&&row.data){params.set('start',String(row.data).slice(0,10));params.set('end',String(row.data).slice(0,10));return route('/timesheet','registros');}
    if((def.id==='caixa_diario'||def.id==='caixa_mensal')&&row.periodo){
      const period=String(row.periodo),start=period.length===7?period+'-01':period,last=new Date(start+'T00:00:00Z');
      if(period.length===7)last.setUTCMonth(last.getUTCMonth()+1,0);
      params.set('start',start);params.set('end',last.toISOString().slice(0,10));return route('/financeiro','lancamentos');
    }
    if(def.id==='dre_categorias'&&row.entity_id!=null){params.set('category',String(row.entity_id));return route('/financeiro','lancamentos');}
    if(def.id==='projetos_por_cliente'&&row.cliente_id!=null)return route(`/clientes/${encodeURIComponent(String(row.cliente_id))}`,'projetos');
    if(def.id==='timesheet_projetos'&&row.projeto_id!=null)return route(`/projetos/${encodeURIComponent(String(row.projeto_id))}`,'atividades');
    const v = def.link && row[def.link.column];
    return v != null && v !== false ? () => navigate({ pathname: `/${def.link!.to}/${encodeURIComponent(String(v))}`, search }) : undefined;
  };

  const empty = r && !r.rows.length && (r.status !== "OK" ? <EmptyState compact title={shortState(r)} reason={r.status==='NOT_IMPLEMENTED'?'Esta informação depende da integração e validação da fonte.':humanLimitation(r.reasonCode)} /> : <EmptyState compact title="Sem registros para os filtros aplicados" />);
  const loading = !r && !q.isError;

  let body: ReactNode;
  if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else if(empty&&(display!=='table'||!columns.length))body=empty;
  else if(def.id==='timesheet_calendario'&&!loading&&!empty&&r)body=<HoursCalendar rows={r.rows} onSelect={row=>go(row)?.()}/>;
  else if (display === "table") {
    body = (
      <div className="overflow-x-auto border-t border-q-line">
        <table className="w-full min-w-max text-sm">
          {columns.length > 0 && (
            <thead>
              <tr className="border-b border-q-line text-left text-[11px] font-semibold uppercase tracking-wide text-q-graphite">
                {columns.map((c) => (
                  <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-2.5 ${isNum(c) ? "text-right" : ""}`}>
                    {endpoint ? c.label : (
                      <button className="inline-flex items-center gap-1 uppercase hover:text-q-orange" onClick={() => (setSort(sort?.key === c.key ? { key: c.key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "asc" }), setPage(1))}>
                        {c.label}<span aria-hidden className={sort?.key === c.key ? "text-q-orange" : "text-q-line"}>{sort?.key === c.key && sort.dir === "desc" ? "▼" : "▲"}</span>
                      </button>
                    )}
                  </th>
                ))}
                {def.link && <th className="w-10" aria-label="Ação" />}
              </tr>
            </thead>
          )}
          <tbody>
            {empty ? (
              <tr><td colSpan={Math.max(columns.length, 1) + 1}>{empty}</td></tr>
            ) : loading ? (
              [0, 1, 2].map((i) => (
                <tr key={i}><td colSpan={Math.max(columns.length, 1)} className="px-6 py-3"><Skeleton className="h-4 w-full" /></td></tr>
              ))
            ) : empty ? (
              <tr><td colSpan={Math.max(columns.length + (def.link ? 1 : 0), 1)}>{empty}</td></tr>
            ) : (
              r!.rows.map((row, i) => {
                const onClick = go(row);
                const expand=def.id==='atividades'&&row.activity_parent!=null&&row.activity_child!=null;
                const unitKey=JSON.stringify([row.origem,row.activity_parent,row.activity_child]);
                return (
                  <Fragment key={expand?unitKey:String(row.id??i)}><tr onClick={onClick} tabIndex={onClick?0:undefined} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onClick?.();}}} className={`border-b border-q-line/70 last:border-0 ${onClick ? "cursor-pointer hover:bg-q-orange/[0.04]" : ""}`}>
                    {columns.map((c, ci) => (
                      <td key={c.key} className={`whitespace-nowrap px-4 py-2.5 ${isNum(c) ? "num text-right" : ""} ${ci === 0 ? "font-semibold" : ""}`}><Cell c={c} v={row[c.key]} />{expand&&ci===0&&<button onClick={e=>{e.stopPropagation();setExpanded(expanded===unitKey?null:unitKey);}} aria-expanded={expanded===unitKey} className="ml-3 text-xs font-medium text-q-orange">{expanded===unitKey?'Recolher':'Ver apontamentos'}</button>}</td>
                    ))}
                    {def.link && <td className="pr-4 text-q-mid">{onClick && <ChevronRight size={16} />}</td>}
                  </tr>{expand&&expanded===unitKey&&<tr><td colSpan={columns.length+1} className="bg-q-bg p-4">{row.descricao!=null&&<p className="mb-3 text-sm">{String(row.descricao)}</p>}<p className="mb-3 text-xs text-q-mid">Primeiro registro: {fmt(row.primeiro_registro,'datetime')} · Último: {fmt(row.ultimo_registro,'datetime')} · Retrabalho: {fmt(row.horas_retrabalho,'hours')}</p><DataTable def={{...TABLES.apontamentos,id:'activity-records'}} endpoint={`/activities/${encodeURIComponent(String(row.origem))}/${encodeURIComponent(String(row.activity_parent))}/${encodeURIComponent(String(row.activity_child))}/records`} filters={filters}/></td></tr>}</Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  } else if (loading) body = <div className="space-y-3 px-6 pb-6"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  else if (display === "cards") {
    const [titleCol, subCol, ...rest] = columns;
    const bar = rest.find((c) => c.type === "percent");
    const stats = rest.filter((c) => c !== bar);
    body = (
      <div className="grid grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-2 2xl:grid-cols-3">
        {r!.rows.map((row, i) => (
          <article key={i} onClick={go(row)} className={`rounded-xl border border-q-line p-5 ${go(row) ? "cursor-pointer hover:border-q-orange/60" : ""}`}>
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-q-ink text-xs font-bold text-white">{initials(row[titleCol.key])}</div>
              <div className="min-w-0">
                <div className="truncate font-bold">{fmt(row[titleCol.key], titleCol.type)}</div>
                {subCol && <div className="truncate text-xs text-q-mid">{fmt(row[subCol.key], subCol.type)}</div>}
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              {stats.map((c, ci) => (
                <div key={c.key}>
                  <dt className="text-[11px] text-q-mid">{c.label}</dt>
                  <dd className={`num text-sm font-bold ${ci === 0 ? "text-q-orange" : ""}`}>{fmt(row[c.key], c.type)}</dd>
                </div>
              ))}
            </dl>
            {bar && row[bar.key] != null && Number.isFinite(Number(row[bar.key])) && (
              <div className="mt-4 border-t border-q-line pt-3">
                <div className="flex justify-between text-[11px] text-q-mid"><span>{bar.label}</span><span className="num font-semibold text-q-ink">{fmt(row[bar.key], "percent")}</span></div>
                <div className="mt-1.5 h-1.5 rounded-full bg-q-bg"><div className="h-full rounded-full bg-q-ink" style={{ width: `${Math.min(100, Math.max(0, Number(row[bar.key]) * 100))}%` }} /></div>
              </div>
            )}
          </article>
        ))}
      </div>
    );
  } else if (display === "list") {
    const [titleCol, subCol, valueCol, extraCol] = columns;
    body = (
      <ol className="border-t border-q-line">
        {r!.rows.map((row, i) => (
          <li key={i} onClick={go(row)} className={`flex items-center gap-4 border-b border-q-line/70 px-6 py-3.5 last:border-0 ${go(row) ? "cursor-pointer hover:bg-q-orange/[0.04]" : ""}`}>
            <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-q-bg text-xs font-bold">{(page - 1) * pageSize + i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{fmt(row[titleCol.key], titleCol.type)}</div>
              {subCol && <div className="truncate text-xs text-q-mid">{fmt(row[subCol.key], subCol.type)}</div>}
            </div>
            <div className="text-right">
              {valueCol && <div className="num text-sm font-bold">{fmt(row[valueCol.key], valueCol.type)}</div>}
              {extraCol && <div className="num text-xs text-q-mid">{extraCol.label} {fmt(row[extraCol.key], extraCol.type)}</div>}
            </div>
          </li>
        ))}
      </ol>
    );
  } else {
    body = (
      <div className="grid grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-2 xl:grid-cols-4">
        {r!.rows.map((row, i) => (
          <article key={i} className="rounded-lg border border-q-line border-l-4 border-l-q-orange p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-bold">{String(row.tipo ?? "Alerta")}</span>
              {row.severidade != null && <span className="rounded-full border border-q-orange/60 px-2 py-0.5 text-[10px] font-semibold text-q-orange">{String(row.severidade)}</span>}
            </div>
            {row.entidade != null && <div className="mt-1.5 text-sm font-semibold">{String(row.entidade)}</div>}
            {row.descricao != null && <p className="mt-1 text-xs leading-relaxed text-q-mid">{String(row.descricao)}</p>}
          </article>
        ))}
      </div>
    );
  }

  return (
    <Panel
      title={title ?? def.label}
      subtitle={<>{def.description}{r && r.reliability !== "INDISPONIVEL" && <ReliabilityBadge value={r.reliability} />}</>}
      actions={<div className="flex flex-wrap items-center gap-2">{actions}{SEARCH_COLUMNS[def.id]&&!endpoint&&<input aria-label={`Pesquisar em ${def.label}`} placeholder="Pesquisar…" value={text} onChange={e=>setText(e.target.value)} className="h-9 w-44 rounded border border-q-line px-3 text-xs"/>}{can('relatorios.export')&&!endpoint&&<button disabled={r?.status!=='OK'} onClick={async()=>{try{setExportError(null);await downloadFrom(`/tables/${def.id}/export`,{...filterParams(tableFilters),page,pageSize,search:term||undefined,sort:sort?.key,dir:sort?.dir,...extraParams},`rinne_${def.id}.csv`);}catch{setExportError('Não foi possível exportar esta página.');}}} className="rounded border border-q-line px-3 py-2 text-xs disabled:opacity-40">Exportar página</button>}{r?.status === "OK" && <CountPill>{fmt(r.total, "count")} registros</CountPill>}{display === "alerts" && !r?.rows.length && <AlertTriangle size={16} className="text-q-orange" aria-hidden />}</div>}
    >
      {body}
      {exportError&&<p role="alert" className="px-6 py-2 text-xs text-q-orange">{exportError}</p>}
      {r?.reason && <details className="border-t border-q-line bg-q-bg px-6 py-3 text-xs text-q-mid"><summary className="cursor-pointer">Cobertura e limitações</summary><p className="pt-2 leading-relaxed">{managementText(r.reason)}</p></details>}
      {r && r.total > r.pageSize && display !== "list" && (
        <div className="flex items-center justify-end gap-3 border-t border-q-line px-6 py-3 text-xs text-q-mid">
          <span className="num">Página {page} de {pages}</span>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-q-line px-3 py-1.5 disabled:opacity-40">Anterior</button>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-q-line px-3 py-1.5 disabled:opacity-40">Próxima</button>
        </div>
      )}
    </Panel>
  );
}
