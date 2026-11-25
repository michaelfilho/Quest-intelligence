import { CalendarClock, ChevronRight, Clock, DollarSign, Gauge, Hash, PieChart, RefreshCw, type LucideIcon } from "lucide-react";
import type { IndicatorDef, IndicatorResult, Unit } from "../../../shared/contracts";
import { BASIS_LABEL, delta, fmt, STATUS_LABEL } from "../lib";
import { ReliabilityBadge, Skeleton } from "./ui";

const UNIT_ICON: Record<Unit, LucideIcon> = { BRL: DollarSign, count: Hash, hours: Clock, days: CalendarClock, percent: PieChart, ratio: Gauge, datetime: RefreshCw };

export function KpiCard({ def, result, onOpen }: { def: IndicatorDef; result?: IndicatorResult; onOpen: () => void }) {
  const ok = result?.status === "OK";
  const d = ok ? delta(result.value, result.previous) : null;
  const good = d === null || def.higherIsBetter === undefined ? null : (d >= 0) === def.higherIsBetter;
  const Icon = UNIT_ICON[def.unit];

  return (
    <button
      onClick={onOpen}
      className="group flex min-h-[132px] flex-col rounded-xl border border-q-line bg-white p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-q-orange/60 hover:shadow-md"
      title="Ver origem, fórmula e registros"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium leading-snug text-q-graphite">{def.label}</span>
        <Icon size={17} strokeWidth={1.8} className="shrink-0 text-q-orange" aria-hidden />
      </div>

      <div className="flex-1 py-2">
        {!result ? (
          <Skeleton className="mt-1 h-8 w-2/3" />
        ) : ok ? (
          <div className="num text-[26px] font-extrabold leading-tight tracking-tight text-q-ink">{fmt(result.value, def.unit)}</div>
        ) : (
          <>
            <div className="text-[26px] font-extrabold leading-tight text-q-line">—</div>
            <div className={`text-[11px] font-bold uppercase tracking-wide ${result.status === "INSUFFICIENT_DATA" ? "text-q-orange" : "text-q-mid"}`}>{STATUS_LABEL[result.status]}</div>
            {result.reason && <p className="mt-1 line-clamp-3 text-xs font-normal normal-case tracking-normal text-q-mid" title={result.reason}>{result.reason}</p>}
          </>
        )}
      </div>

      {ok && result.coverage && <p className="mb-2 line-clamp-2 text-xs font-normal text-q-mid" title={result.coverage}>{result.coverage}</p>}
      <div className="flex items-center gap-2 text-xs text-q-mid">
        {d !== null ? (
          <span className={`num font-semibold ${good === null ? "text-q-mid" : good ? "text-q-ink" : "text-q-orange"}`} title="Variação sobre o período anterior">
            {d >= 0 ? "▲" : "▼"} {fmt(Math.abs(d), "percent")}
          </span>
        ) : (
          <span>{BASIS_LABEL[def.basis]}</span>
        )}
        {result && result.reliability !== "INDISPONIVEL" && <ReliabilityBadge value={result.reliability} />}
        <ChevronRight size={15} className="ml-auto text-q-mid transition group-hover:translate-x-0.5 group-hover:text-q-orange" aria-hidden />
      </div>
    </button>
  );
}
