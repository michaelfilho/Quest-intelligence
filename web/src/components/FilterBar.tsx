import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { monthPeriod, type Dimension, type DimensionResult } from "../../../shared/contracts";
import { api, useFilters } from "../lib";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const DIMS: { key: "client" | "group" | "project" | "department" | "employee" | "service" | "status"; dim: Dimension; label: string }[] = [
  { key: "client", dim: "clients", label: "Cliente" },
  { key: "group", dim: "groups", label: "Grupo empresarial" },
  { key: "project", dim: "projects", label: "Projeto" },
  { key: "department", dim: "departments", label: "Departamento" },
  { key: "employee", dim: "employees", label: "Colaborador" },
  { key: "service", dim: "services", label: "Serviço" },
  { key: "status", dim: "statuses", label: "Status" },
];

const field = "flex flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-q-mid";
const input = "h-10 rounded-lg border border-q-line bg-white px-3 text-sm font-normal normal-case tracking-normal text-q-ink hover:border-q-mid focus:border-q-orange focus:outline-none";

function DimSelect({ dim, label, value, onChange }: { dim: Dimension; label: string; value?: string; onChange: (v?: string) => void }) {
  const { filters } = useFilters();
  const q = useQuery({ queryKey: ["dim", dim, filters], queryFn: () => api<DimensionResult>(`/dimensions/${dim}`, { ...filters, compare: undefined }), staleTime: 60000 });
  const options = q.data?.options ?? [];
  const disabled = !options.length && !value;
  return (
    <label className={field}>
      {label}
      <select className={`${input} min-w-40 disabled:cursor-not-allowed disabled:bg-q-bg disabled:text-q-mid`} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || undefined)} title={disabled ? (q.data?.reason ?? "Carregando…") : undefined}>
        <option value="">{disabled ? "Indisponível" : "Todos"}</option>
        {value && !options.some((o) => o.value === value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Filtros globais (compartilhados por todos os módulos, guardados na URL). O período rápido fica no cabeçalho. */
export function FilterBar() {
  const { filters, set, clear, active } = useFilters();
  const [more, setMore] = useState(false);
  const year = Number(filters.start.slice(0, 4));
  const isMonth = filters.start.slice(0, 7) === filters.end.slice(0, 7) && filters.start.endsWith("-01");
  const dimCount = DIMS.filter((d) => filters[d.key]).length;

  return (
    <section className="rounded-xl border border-q-line bg-white px-6 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold">
        <SlidersHorizontal size={16} className="text-q-orange" aria-hidden /> Filtros
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={field}>
          Data inicial
          <input type="date" className={input} value={filters.start} max={filters.end} onChange={(e) => e.target.value && set({ start: e.target.value })} />
        </label>
        <label className={field}>
          Data final
          <input type="date" className={input} value={filters.end} min={filters.start} onChange={(e) => e.target.value && set({ end: e.target.value })} />
        </label>
        <label className={field}>
          Mês
          <select className={input} value={isMonth ? Number(filters.start.slice(5, 7)) : ""} onChange={(e) => e.target.value && set(monthPeriod(year, Number(e.target.value)))}>
            <option value="">—</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
        <label className={field}>
          Ano
          <input type="number" className={`${input} w-24`} min={2000} max={2100} value={year} onChange={(e) => {
            const y = Number(e.target.value);
            if (y >= 2000 && y <= 2100) set(isMonth ? monthPeriod(y, Number(filters.start.slice(5, 7))) : { start: `${y}-01-01`, end: `${y}-12-31` });
          }} />
        </label>
        <label className="flex h-10 items-center gap-2 rounded-lg border border-q-line px-3 text-sm text-q-graphite">
          <input type="checkbox" className="accent-q-orange" checked={filters.compare} onChange={(e) => set({ compare: e.target.checked ? "1" : undefined })} />
          Comparar com período anterior
        </label>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => setMore(!more)} aria-expanded={more} className="h-10 rounded-lg border border-q-line px-4 text-sm font-medium hover:border-q-mid">
            Mais filtros{dimCount ? <span className="ml-2 rounded bg-q-orange px-1.5 py-0.5 text-[10px] font-bold text-white">{dimCount}</span> : null}
          </button>
          {active > 0 && (
            <button onClick={clear} className="text-xs font-medium text-q-mid underline underline-offset-2 hover:text-q-orange">
              Limpar filtros
            </button>
          )}
        </div>
      </div>
      {more && (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-q-line pt-4">
          {DIMS.map((d) => (
            <DimSelect key={d.key} dim={d.dim} label={d.label} value={filters[d.key]} onChange={(v) => set({ [d.key]: v })} />
          ))}
        </div>
      )}
    </section>
  );
}
