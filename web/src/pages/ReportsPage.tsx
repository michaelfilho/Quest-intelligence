import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ColumnType, Reliability, ResultStatus, Unit } from "../../../shared/contracts";
import { FilterBar } from "../components/FilterBar";
import { CountPill, EmptyState, ErrorState, PageHeader, Panel, ReliabilityBadge, Skeleton } from "../components/ui";
import { api, BASIS_LABEL, downloadFrom, filterParams, fmt, fmtDate, STATUS_LABEL, toQuery, useCan, useFilters } from "../lib";
import { NoAccess } from "./ModulePage";

export interface ReportIndicator { id: string; label: string; unit: Unit; basis: keyof typeof BASIS_LABEL; formula: string; sources: string[]; status: ResultStatus; value: unknown; previous: number | null; reliability: Reliability; reason: string | null }
export interface ReportTable { id: string; label: string; columns: { key: string; label: string; type: ColumnType }[]; rows: Record<string, unknown>[]; total: number; status: ResultStatus; reason?: string | null }
export interface Report {
  id: string; title: string; description: string; period: { start: string; end: string }; previousPeriod: { start: string; end: string } | null; generatedAt: string; generatedBy: string;
  filters: Record<string, string>; database: string; dataAvailable: boolean; indicators: ReportIndicator[]; tables: ReportTable[]; limitations: string[];
}

/** Corpo do relatório — usado na tela e na versão de impressão (PDF). */
export function ReportBody({ r }: { r: Report }) {
  return (
    <div className="space-y-5">
      {!r.dataAvailable && (
        <div role="status" className="rounded-xl bg-q-ink px-5 py-4 text-sm text-white">
          <p className="font-bold">DADOS INDISPONÍVEIS</p>
          <p className="mt-1 text-white/70">Este relatório não contém valores calculados e não deve ser usado como demonstrativo. Ele documenta a estrutura, as fontes e as limitações.</p>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        {[["Período", `${fmtDate(r.period.start)} a ${fmtDate(r.period.end)}`], ["Gerado em", fmt(r.generatedAt, "datetime")], ["Gerado por", r.generatedBy], ["Filtros", Object.entries(r.filters).map(([k, v]) => `${k}: ${v}`).join(" · ") || "Somente o período"]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-q-line bg-white px-3 py-2 print:border-q-mid"><dt className="text-[11px] text-q-mid">{k}</dt><dd className="font-semibold">{v}</dd></div>
        ))}
      </dl>
      {r.indicators.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold">Indicadores</h3>
          <div className="overflow-x-auto rounded-xl border border-q-line bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-q-line text-left text-[11px] font-semibold uppercase tracking-wide text-q-graphite"><th className="px-4 py-2.5">Indicador</th><th className="px-4 py-2.5 text-right">Valor</th><th className="px-4 py-2.5">Confiabilidade</th><th className="px-4 py-2.5">Base</th><th className="px-4 py-2.5">Origem</th></tr></thead>
              <tbody>
                {r.indicators.map((i) => (
                  <tr key={i.id} className="border-b border-q-line/70 last:border-0 align-top">
                    <td className="px-4 py-2.5"><div className="font-semibold">{i.label}</div><div className="text-[11px] text-q-mid">{i.formula}</div></td>
                    <td className="num px-4 py-2.5 text-right font-bold">{i.status === "OK" ? fmt(i.value, i.unit) : <span className="text-[11px] uppercase text-q-mid">{STATUS_LABEL[i.status]}</span>}</td>
                    <td className="px-4 py-2.5"><ReliabilityBadge value={i.reliability} /></td>
                    <td className="px-4 py-2.5 text-xs">{BASIS_LABEL[i.basis]}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{i.sources.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {r.tables.map((t) => (
        <section key={t.id}>
          <h3 className="mb-2 text-sm font-bold">{t.label} <span className="font-normal text-q-mid">({fmt(t.total, "count")} registros)</span></h3>
          <div className="overflow-x-auto rounded-xl border border-q-line bg-white">
            <table className="w-full min-w-max text-sm">
              <thead><tr className="border-b border-q-line text-left text-[11px] font-semibold uppercase tracking-wide text-q-graphite">{t.columns.map((c) => <th key={c.key} className="px-4 py-2">{c.label}</th>)}</tr></thead>
              <tbody>
                {t.rows.slice(0, 200).map((row, i) => <tr key={i} className="border-b border-q-line/70 last:border-0">{t.columns.map((c) => <td key={c.key} className="px-4 py-2">{fmt(row[c.key], c.type)}</td>)}</tr>)}
                {!t.rows.length && <tr><td colSpan={t.columns.length} className="px-4 py-4 text-center text-xs text-q-mid">{t.status === "OK" ? "Nenhum registro no período." : `${STATUS_LABEL[t.status]}.`}</td></tr>}
              </tbody>
            </table>
          </div>
          {t.rows.length > 200 && <p className="mt-1 text-xs text-q-mid">Mostrando 200 de {t.rows.length}. A exportação CSV/XLSX contém todas as linhas.</p>}
        </section>
      ))}
      <section>
        <h3 className="mb-2 text-sm font-bold">Limitações</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-q-graphite">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>
    </div>
  );
}

export function ReportsPage() {
  const can = useCan();
  const { filters } = useFilters();
  const catalog = useQuery({ queryKey: ["reports"], queryFn: () => api<{ id: string; title: string; description: string }[]>("/reports"), enabled: can("relatorios.view") });
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const id = sel ?? catalog.data?.[0]?.id ?? null;
  const params = filterParams(filters);
  const rep = useQuery({ refetchInterval: 60000, queryKey: ["report", id, params], queryFn: () => api<Report>(`/reports/${id}`, params), enabled: !!id });
  if (!can("relatorios.view")) return <NoAccess title="Relatórios" />;

  const exportAs = async (format: "csv" | "xlsx" | "md") => {
    setMsg(null);
    try {
      await downloadFrom(`/reports/${id}`, { ...filterParams(filters), format }, `rinne_${id}.${format}`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-[1480px] space-y-6">
      <PageHeader icon={FileText} title="Central de relatórios" subtitle="Cálculos e documentos gerados pelo sistema. Sem dados reais, os relatórios são marcados como indisponíveis e não exibem valores." right={catalog.data && <CountPill>{catalog.data.length} relatórios disponíveis</CountPill>} />
      <FilterBar />
      {catalog.isError && <ErrorState error={catalog.error} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {catalog.data?.map((r) => (
          <button key={r.id} onClick={() => (setSel(r.id), setMsg(null))} aria-pressed={r.id === id} className={`rounded-xl border bg-white p-4 text-left transition ${r.id === id ? "border-q-orange shadow-[0_0_0_3px_rgba(245,130,32,0.15)]" : "border-q-line hover:border-q-mid"}`}>
            <div className={`text-sm font-bold ${r.id === id ? "text-q-orange" : ""}`}>{r.title}</div>
            <div className="mt-1 line-clamp-2 text-xs text-q-mid">{r.description}</div>
          </button>
        ))}
      </div>
      {id && (
        <Panel
          title={rep.data?.title ?? "Relatório"}
          subtitle={rep.data?.description}
          actions={
            can("relatorios.export") ? (
              <div className="flex flex-wrap gap-2">
                <Link to={`/relatorios/${id}/imprimir${toQuery(filterParams(filters))}`} target="_blank" className="flex h-9 items-center gap-1.5 rounded-lg bg-q-orange px-3 text-xs font-semibold text-white"><Printer size={14} /> PDF</Link>
                <button onClick={() => exportAs("xlsx")} className="flex h-9 items-center gap-1.5 rounded-lg border border-q-line px-3 text-xs font-semibold"><FileSpreadsheet size={14} /> XLSX</button>
                <button onClick={() => exportAs("csv")} className="flex h-9 items-center gap-1.5 rounded-lg border border-q-line px-3 text-xs font-semibold"><Download size={14} /> CSV</button>
                <button onClick={() => exportAs("md")} className="flex h-9 items-center gap-1.5 rounded-lg border border-q-line px-3 text-xs font-semibold"><Download size={14} /> Markdown</button>
              </div>
            ) : (
              <span className="text-xs text-q-mid">Exportação não liberada ao seu perfil.</span>
            )
          }
        >
          <div className="border-t border-q-line bg-q-bg/40 p-5">
            {msg && <p role="alert" className="mb-3 rounded-lg border-l-4 border-q-orange bg-white px-3 py-2 text-sm">{msg}</p>}
            {rep.isError ? <ErrorState error={rep.error} onRetry={() => rep.refetch()} /> : !rep.data ? <Skeleton className="h-40 w-full" /> : (
              <ReportBody r={rep.data} />
            )}
          </div>
        </Panel>
      )}
      {catalog.data && !catalog.data.length && <EmptyState title="Nenhum relatório liberado" reason="Seu perfil não inclui as áreas necessárias." />}
    </div>
  );
}
