// Versões para impressão / "Salvar como PDF" (recurso nativo do navegador, sem biblioteca de PDF).
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ErrorState, Skeleton } from "../components/ui";
import { api, fmt, fmtDate } from "../lib";
import { ReportBody, type Report } from "./ReportsPage";

function Sheet({ title, subtitle, ready, children }: { title: string; subtitle?: string; ready: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!ready) return;
    document.title = `QUEST RINNE — ${title}`;
    const t = setTimeout(() => window.print(), 400); // abre o diálogo de impressão/PDF uma vez
    return () => clearTimeout(t);
  }, [ready, title]);
  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between bg-q-ink px-8 py-5 text-white print:px-0">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-q-orange text-lg font-black">Q</div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-q-orange">Quest RINNE</div>
            <h1 className="text-lg font-bold">{title}</h1>
            {subtitle && <p className="text-xs text-white/70">{subtitle}</p>}
          </div>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-q-orange px-4 py-2 text-sm font-semibold print:hidden"><Printer size={15} /> Imprimir / salvar PDF</button>
      </header>
      <main className="mx-auto max-w-5xl px-8 py-6 print:max-w-none print:px-0">{children}</main>
      <footer className="border-t border-q-line px-8 py-3 text-center text-[10px] text-q-mid">QUEST RINNE · Quest Comunicação · documento gerado em {fmt(new Date().toISOString(), "datetime")} · valores indisponíveis não são estimados</footer>
    </div>
  );
}

export function ReportPrintPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const q = useQuery({ queryKey: ["report-print", id, sp.toString()], queryFn: () => api<Report>(`/reports/${id}`, Object.fromEntries(sp)) });
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <Sheet title={q.data?.title ?? "Relatório"} subtitle={q.data ? `Período ${fmtDate(q.data.period.start)} a ${fmtDate(q.data.period.end)}` : undefined} ready={!!q.data}>
      {q.data ? <ReportBody r={q.data} /> : <Skeleton className="h-64 w-full" />}
    </Sheet>
  );
}

interface MeetingPrint {
  title: string;
  state: string;
  startedAt: string;
  completedAt: string | null;
  report: { ai: { status: string; text: string | null } } | null;
  departments: { id: string; seq: number; department: string; period: { label: string; start: string; end: string } | null; indicators: { id: string; label: string; unit: string; status: string; value: unknown }[]; summary: { ai: { status: string; text: string | null } } | null; items: { id: string; kind: string; text: string; responsible: string | null; dueDate: string | null }[] }[];
}
const KIND: Record<string, string> = { observation: "Observações", decision: "Decisões", problem: "Problemas", opportunity: "Oportunidades", action: "Encaminhamentos" };

export function MeetingPrintPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["meeting-print", id], queryFn: () => api<MeetingPrint>(`/rinne/meetings/${id}/report`, { format: "json" }) });
  if (q.isError) return <ErrorState error={q.error} />;
  const m = q.data;
  return (
    <Sheet title={m?.title ?? "Reunião"} subtitle={m ? `Início ${fmt(m.startedAt, "datetime")}${m.completedAt ? ` · encerramento ${fmt(m.completedAt, "datetime")}` : ""}` : undefined} ready={!!m}>
      {!m ? <Skeleton className="h-64 w-full" /> : (
        <div className="space-y-6 text-sm">
          <section className="rounded-xl border-l-4 border-q-orange bg-q-bg px-4 py-3">
            <h2 className="font-bold">Análise da RINNE</h2>
            <p className="mt-1 whitespace-pre-wrap">{m.report?.ai.status === "done" && m.report.ai.text ? m.report.ai.text : "Análise inteligente indisponível (integração com o n8n). Abaixo estão os registros feitos durante a reunião e os indicadores calculados pelo sistema."}</p>
          </section>
          {m.departments.map((d) => (
            <section key={d.id} className="break-inside-avoid">
              <h2 className="border-b border-q-line pb-1 text-base font-bold">{d.seq}. {d.department}</h2>
              <p className="mt-1 text-xs text-q-mid">{d.period ? `${d.period.label} (${fmtDate(d.period.start)} a ${fmtDate(d.period.end)})` : "Período não definido"}</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-6 text-xs">{d.indicators.map((i) => <li key={i.id}>{i.label}: <strong>{i.status === "OK" ? fmt(i.value, i.unit as never) : "indisponível"}</strong></li>)}</ul>
              {Object.entries(KIND).map(([k, label]) => {
                const items = d.items.filter((i) => i.kind === k);
                return items.length ? (
                  <div key={k} className="mt-2"><h3 className="text-xs font-bold uppercase tracking-wide text-q-mid">{label}</h3><ul className="list-disc pl-5">{items.map((i) => <li key={i.id}>{i.text}{i.responsible && ` — responsável: ${i.responsible}`}{i.dueDate && ` — prazo: ${fmtDate(i.dueDate)}`}</li>)}</ul></div>
                ) : null;
              })}
              {d.summary?.ai.status === "done" && d.summary.ai.text && <p className="mt-2 rounded bg-q-bg px-3 py-2 text-xs whitespace-pre-wrap">{d.summary.ai.text}</p>}
            </section>
          ))}
          <p className="text-[11px] text-q-mid">Responsáveis e prazos aparecem somente quando informados. Áudio bruto não é armazenado.</p>
        </div>
      )}
    </Sheet>
  );
}
