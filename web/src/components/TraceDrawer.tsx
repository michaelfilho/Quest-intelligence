import { useQuery } from "@tanstack/react-query";
import { useEffect,useRef, type ReactNode } from "react";
import type { Filters, IndicatorDetail } from "../../../shared/contracts";
import { api, BASIS_LABEL, DB_LABEL, filterParams, fmt, fmtDate, shortState,managementText,sourceLabel,useCan,humanLimitation } from "../lib";
import { DataTable } from "./DataTable";
import { ErrorState, ReliabilityBadge, Skeleton } from "./ui";

const FILTER_LABEL: Record<string, string> = { client: "Cliente", group: "Grupo", project: "Projeto", department: "Departamento", employee: "Colaborador", service: "Serviço", status: "Status",category:'Categoria financeira' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 border-b border-q-line py-2.5 text-sm last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-q-mid">{label}</dt>
      <dd className="min-w-0 text-q-ink">{children}</dd>
    </div>
  );
}

/** Rastreabilidade: de onde veio o número. */
export function TraceDrawer({ id, filters, onClose }: { id: string; filters: Filters; onClose: () => void }) {
  const can=useCan(),technical=can('config.view')||can('qualidade.view');
  const aside=useRef<HTMLElement>(null);
  const q = useQuery({ queryKey: ["indicator", id, filters], queryFn: ({signal}) => api<IndicatorDetail>(`/indicators/${id}`, filterParams(filters),signal) });
  useEffect(() => {
    const previous=document.activeElement as HTMLElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';aside.current?.focus();
    const k = (e: KeyboardEvent) => {
      if(e.key==='Escape')onClose();
      if(e.key==='Tab'){
        const controls=aside.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]');
        const first=controls?.[0],last=controls?.[controls.length-1];
        if(first&&last&&((e.shiftKey&&(document.activeElement===first||document.activeElement===aside.current))||(!e.shiftKey&&document.activeElement===last))){e.preventDefault();(e.shiftKey?last:first).focus();}
      }
    };
    window.addEventListener("keydown", k);
    return () => {window.removeEventListener("keydown", k);document.body.style.overflow=overflow;previous?.focus();};
  }, [onClose]);

  const d = q.data;
  const r = d?.result;
  const applied = Object.entries(filters).filter(([k, v]) => FILTER_LABEL[k] && v);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalhamento do indicador">
      <button className="absolute inset-0 bg-black/40" aria-label="Fechar" onClick={onClose} />
      <aside ref={aside} tabIndex={-1} className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-q-bg shadow-2xl">
        <header className="sticky top-0 z-10 border-b border-q-line bg-q-ink px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-q-orange">Sobre o indicador</div>
              <h2 className="mt-1 text-lg font-semibold">{d?.definition.label ?? "…"}</h2>
            </div>
            <button onClick={onClose} className="rounded px-2 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white">
              Fechar ✕
            </button>
          </div>
          {r && (
            <div className="mt-3 flex items-end gap-3">
              <span className="num text-3xl font-semibold">{r.status === "OK" ? fmt(r.value, d.definition.unit) : "—"}</span>
              {r.status !== "OK" && <span className="pb-1 text-xs font-semibold tracking-wide text-q-orange">{shortState(r)}</span>}
            </div>
          )}
        </header>

        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !d || !r ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ) : (
          <div className="space-y-5 p-6">
            {r.reason && <p className="rounded-md border-l-4 border-q-orange bg-white px-4 py-3 text-sm text-q-graphite">{r.status==='OK'?managementText(r.reason):humanLimitation(r.reasonCode)}</p>}
            <dl className="rounded-lg border border-q-line bg-white px-4">
              <Row label="Confiabilidade"><ReliabilityBadge value={r.reliability} /></Row>
              <Row label="O que significa">{d.definition.label}</Row>
              <Row label="Como é calculado">{managementText(d.definition.formula)}</Row>
              <Row label="Base temporal">{BASIS_LABEL[d.definition.basis]}</Row>
              <Row label="Período">
                <span className="num">{fmtDate(d.filters.start)} a {fmtDate(d.filters.end)}</span>
                {d.previousPeriod && (
                  <span className="num block text-xs text-q-mid">
                    Comparação: {fmtDate(d.previousPeriod.start)} a {fmtDate(d.previousPeriod.end)} · anterior: {fmt(r.previous, d.definition.unit)}
                  </span>
                )}
              </Row>
              <Row label="Filtros aplicados">{applied.length ? applied.map(([k, v]) => `${FILTER_LABEL[k]}: ${v}`).join(" · ") : "Nenhum além do período"}</Row>
              <Row label="Fonte">
                <div className="flex flex-wrap gap-1">
                  {d.definition.sources.map((s) => (
                    <span key={s} className="rounded bg-q-bg px-1.5 py-0.5 text-xs">{sourceLabel(s)}</span>
                  ))}
                </div>
                {r.status !== "OK" && <span className="mt-1 block text-xs text-q-mid">Integração ou critérios ainda pendentes de validação.</span>}
              </Row>
              {d.definition.requires && <Row label="Informação necessária">{managementText(d.definition.requires)}</Row>}
              <Row label="Registros">
                <span className="num">{fmt(r.recordsUsed, "count")} considerados · {fmt(r.recordsExcluded, "count")} excluídos</span>
                {r.exclusions?.map((e) => (
                  <span key={e.reason} className="num block text-xs text-q-mid">{fmt(e.count, "count")} — {e.reason}</span>
                ))}
              </Row>
              <Row label="Atualização na fonte">{r.updatedAt ? fmt(r.updatedAt, "datetime") : "Data não informada pela origem"}</Row>
              <Row label="Consultado em">{r.calculatedAt?fmt(r.calculatedAt,'datetime'):'—'}</Row>
              {r.temporalField && <Row label="Data considerada">{managementText(r.temporalField)}</Row>}
              {r.coverage && <Row label="Cobertura">{managementText(r.coverage)}</Row>}
              <Row label="Disponibilidade">{DB_LABEL[d.database]}</Row>
            </dl>
            {technical&&<details className="rounded-lg border border-q-line bg-white p-4 text-xs"><summary className="cursor-pointer font-semibold">Detalhes técnicos · acesso restrito</summary><p className="mt-3">{r.reason}</p><p className="mt-2">{d.definition.formula}</p><code className="mt-2 block break-all">{d.definition.sources.join(', ')}</code></details>}
            <DataTable def={{ id: `records-${id}`, label: "Registros de origem" }} endpoint={`/indicators/${id}/records`} filters={filters} />
          </div>
        )}
      </aside>
    </div>
  );
}
