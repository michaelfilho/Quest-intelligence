import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import type { Filters, IndicatorDetail } from "../../../shared/contracts";
import { api, BASIS_LABEL, DB_LABEL, filterParams, fmt, fmtDate, STATUS_LABEL } from "../lib";
import { DataTable } from "./DataTable";
import { ErrorState, ReliabilityBadge, Skeleton } from "./ui";

const FILTER_LABEL: Record<string, string> = { client: "Cliente", group: "Grupo", project: "Projeto", department: "Departamento", employee: "Colaborador", service: "Serviço", status: "Status" };

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
  const q = useQuery({ queryKey: ["indicator", id, filters], queryFn: () => api<IndicatorDetail>(`/indicators/${id}`, filterParams(filters)) });
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const d = q.data;
  const r = d?.result;
  const applied = Object.entries(filters).filter(([k, v]) => FILTER_LABEL[k] && v);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalhamento do indicador">
      <button className="absolute inset-0 bg-black/40" aria-label="Fechar" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-q-bg shadow-2xl">
        <header className="sticky top-0 z-10 border-b border-q-line bg-q-ink px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-q-orange">Rastreabilidade do indicador</div>
              <h2 className="mt-1 text-lg font-semibold">{d?.definition.label ?? "…"}</h2>
            </div>
            <button onClick={onClose} className="rounded px-2 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white">
              Fechar ✕
            </button>
          </div>
          {r && (
            <div className="mt-3 flex items-end gap-3">
              <span className="num text-3xl font-semibold">{r.status === "OK" ? fmt(r.value, d.definition.unit) : "—"}</span>
              {r.status !== "OK" && <span className="pb-1 text-xs font-semibold uppercase tracking-wide text-q-orange">{STATUS_LABEL[r.status]}</span>}
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
            {r.reason && <p className="rounded-md border-l-4 border-q-orange bg-white px-4 py-3 text-sm text-q-graphite">{r.reason}</p>}
            <dl className="rounded-lg border border-q-line bg-white px-4">
              <Row label="Confiabilidade"><ReliabilityBadge value={r.reliability} /></Row>
              <Row label="Fórmula">{d.definition.formula}</Row>
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
              <Row label="Tabelas de origem">
                <div className="flex flex-wrap gap-1">
                  {d.definition.sources.map((s) => (
                    <code key={s} className="rounded bg-q-bg px-1.5 py-0.5 text-xs">{s}</code>
                  ))}
                </div>
                {r.status !== "OK" && <span className="mt-1 block text-xs text-q-mid">Candidatas — a confirmar na inspeção do schema real.</span>}
              </Row>
              {d.definition.requires && <Row label="Requisito na fonte">{d.definition.requires}</Row>}
              <Row label="Registros">
                <span className="num">{fmt(r.recordsUsed, "count")} considerados · {fmt(r.recordsExcluded, "count")} excluídos</span>
                {r.exclusions?.map((e) => (
                  <span key={e.reason} className="num block text-xs text-q-mid">{fmt(e.count, "count")} — {e.reason}</span>
                ))}
              </Row>
              <Row label="Última atualização">{r.updatedAt ? fmt(r.updatedAt, "datetime") : "—"}</Row>
              <Row label="Banco">{DB_LABEL[d.database]}</Row>
            </dl>
            <DataTable def={{ id: `records-${id}`, label: "Registros de origem" }} endpoint={`/indicators/${id}/records`} filters={filters} />
          </div>
        )}
      </aside>
    </div>
  );
}
