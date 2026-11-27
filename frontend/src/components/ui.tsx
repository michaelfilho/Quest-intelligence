import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Basis, DbState, Reliability } from "../../../shared/contracts";
import { ApiError, BASIS_LABEL, DB_LABEL, RELIABILITY_LABEL } from "../lib";

const RELIABILITY_STYLE: Record<Reliability, string> = {
  VALIDADO: "bg-q-ink text-white",
  PARCIAL: "border border-q-orange text-q-ink",
  DESATUALIZADO: "border border-dashed border-q-orange text-q-ink",
  PENDENTE: "bg-q-line text-q-graphite",
  EM_RECONCILIACAO: "bg-q-orange text-q-ink",
  INDISPONIVEL: "border border-q-line text-q-mid",
};

export function ReliabilityBadge({ value }: { value: Reliability }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${RELIABILITY_STYLE[value]}`} title="Confiabilidade da fonte">
      {RELIABILITY_LABEL[value]}
    </span>
  );
}

export function BasisTag({ value }: { value: Basis }) {
  return <span className="text-[10px] font-medium uppercase tracking-wide text-q-mid" title="Base temporal do número">{BASIS_LABEL[value]}</span>;
}

export function DbDot({ state }: { state?: DbState }) {
  // Conectado: laranja cheio · indisponível: anel laranja · verificando: cinza.
  const color = state === "CONNECTED" ? "bg-q-orange" : state ? "border border-q-orange" : "bg-q-mid";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden />
      <span>{state ? DB_LABEL[state] : "Verificando…"}</span>
    </span>
  );
}

export function Panel({ title, subtitle, actions, children, className = "" }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel panel-flush ${className}`}>
      <header className="panel-heading">
        <div className="min-w-0">
          <h3>{title}</h3>
          {subtitle && <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-q-mid">{subtitle}</div>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, back, right }: { icon?: LucideIcon; title: ReactNode; subtitle?: ReactNode; back?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-title flex-wrap">
      <div>
        {back}
        <h1><span className="title-mark" aria-hidden />{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right && <div className="title-actions">{right}</div>}
    </div>
  );
}

export function CountPill({ children }: { children: ReactNode }) {
  return <span className="num rounded-full border border-q-line bg-white px-3 py-1.5 text-xs font-semibold text-q-ink">{children}</span>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-q-mid">
      <span className="h-3 w-1 rounded-sm bg-q-orange" aria-hidden />
      {children}
    </h2>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-q-line/70 ${className}`} aria-hidden />;
}

/** Estado vazio: deixa claro que NÃO é zero. */
export function EmptyState({ title, reason, compact }: { title: string; reason?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "gap-1 px-4 py-6" : "gap-2 px-6 py-12"}`}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-q-line" aria-hidden>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" strokeDasharray="2 2" />
      </svg>
      <p className="text-sm font-medium text-q-graphite">{title}</p>
      {reason && <p className="max-w-md text-xs text-q-mid">{reason}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className="m-4 rounded-md border border-q-line border-l-4 border-l-q-orange bg-white px-4 py-3 text-sm text-q-ink">
      <p className="font-medium">{e?.message ?? "Erro inesperado ao carregar os dados."}</p>
      {e?.details?.length ? (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {e.details.map((d) => (
            <li key={d.campo + d.erro}>
              {d.campo || "parâmetro"}: {d.erro}
            </li>
          ))}
        </ul>
      ) : null}
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-xs font-semibold underline">
          Tentar novamente
        </button>
      )}
    </div>
  );
}
