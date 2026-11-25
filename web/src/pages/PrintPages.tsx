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
