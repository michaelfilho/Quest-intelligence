import { useQuery } from "@tanstack/react-query";
import { DatabaseZap, Lock } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CHARTS, INDICATORS, TABLES, moduleById } from "../../../shared/catalog";
import type { Filters, ModuleResult } from "../../../shared/contracts";
import { ChartPanel } from "../components/ChartPanel";
import { DataTable } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { KpiCard } from "../components/KpiCard";
import { TraceDrawer } from "../components/TraceDrawer";
import { CountPill, EmptyState, ErrorState, PageHeader } from "../components/ui";
import { itemPermission, MODULE_PERMISSION } from "../../../shared/permissions";
import { api, filterParams, fmtDate, useCan, useFilters } from "../lib";
import { MODULE_ICON } from "../nav";
import { ConnectionPanel } from "./ConnectionPanel";

export function DbBanner({ database }: { database?: string }) {
  if (!database || database === "CONNECTED") return null;
  return (
    <div role="status" className="flex items-start gap-4 rounded-xl bg-q-ink px-6 py-5 text-sm text-white">
      <DatabaseZap size={22} className="mt-0.5 shrink-0 text-q-orange" aria-hidden />
      <div>
        <p className="font-bold">
          Banco de dados {database === "NOT_CONFIGURED" ? "não configurado" : "indisponível"} <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-q-orange">DATABASE_UNAVAILABLE</span>
        </p>
        <p className="mt-1 text-white/65">Nenhum valor é exibido nem simulado. Os indicadores mostram sua definição e origem e serão preenchidos quando o backend se conectar ao PostgreSQL quest_rinne e os mapeamentos do schema real forem validados.</p>
      </div>
    </div>
  );
}

export function NoAccess({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-[900px] rounded-xl border border-q-line bg-white">
      <div className="flex justify-center pt-10"><Lock size={28} className="text-q-orange" /></div>
      <EmptyState title={`Sem permissão para ${title}`} reason="Seu perfil não inclui esta área. Solicite a liberação a um administrador." />
    </div>
  );
}

export function ModulePage({ moduleId }: { moduleId: string }) {
  const can = useCan();
  const m = moduleById(moduleId)!;
  if (!can(MODULE_PERMISSION[m.id])) return <NoAccess title={m.label} />;
  return <ModuleContent moduleId={moduleId} />;
}

function ModuleContent({ moduleId }: { moduleId: string }) {
  const can = useCan();
  const m = moduleById(moduleId)!;
  // Itens sem permissão nem são exibidos (o backend também os devolve como FORBIDDEN, sem dados).
  const indicators = m.indicators.filter((i) => can(itemPermission(i, INDICATORS[i].basis)));
  const charts = m.charts.filter((c) => can(itemPermission(c, CHARTS[c].basis)));
  const { id } = useParams();
  const { filters: global, search } = useFilters();
  // Páginas de detalhe fixam o escopo (cliente/projeto) por cima dos filtros globais.
  const filters: Filters = m.detailOf === "client" ? { ...global, client: id } : m.detailOf === "project" ? { ...global, project: id } : global;
  const [open, setOpen] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["module", m.id, filters], queryFn: () => api<ModuleResult>(`/modules/${m.id}`, filterParams(filters)) });
  const data = q.data;
  const byId = <T extends { id: string }>(list?: T[]) => Object.fromEntries((list ?? []).map((x) => [x.id, x]));
  const ind = byId(data?.indicators);
  const chs = byId(data?.charts);
  const pending = data?.database === "CONNECTED" && data.indicators.every((i) => i.status === "NOT_IMPLEMENTED");
  const tables = m.tables.filter((t) => can(itemPermission(t))).map((t) => TABLES[t]);
  const table = (t: (typeof tables)[number]) => <DataTable key={t.id} def={t} filters={filters} search={search} />;

  return (
    <div className="mx-auto max-w-[1480px] space-y-6">
      <PageHeader
        icon={MODULE_ICON[m.id]}
        title={<>{m.label}{id && <span className="font-medium text-q-mid">· {id}</span>}</>}
        subtitle={m.question}
        back={m.detailOf && (
          <Link to={{ pathname: m.detailOf === "client" ? "/clientes" : "/projetos", search }} className="mb-1 inline-block text-xs font-medium text-q-mid hover:text-q-orange">
            ← {m.detailOf === "client" ? "Clientes" : "Projetos / Jobs"}
          </Link>
        )}
        right={
          <CountPill>
            {fmtDate(filters.start)} – {fmtDate(filters.end)}
            {data?.previousPeriod && <span className="font-normal text-q-mid"> · vs. {fmtDate(data.previousPeriod.start)} – {fmtDate(data.previousPeriod.end)}</span>}
          </CountPill>
        }
      />

      <DbBanner database={data?.database} />
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {pending && (
        <div role="status" className="rounded-xl border border-q-line border-l-4 border-l-q-orange bg-white px-6 py-4 text-sm">
          <p className="font-bold">Banco conectado — aguardando mapeamento do schema real</p>
          <p className="mt-1 text-q-mid">Rode <code>npm run introspect</code> no backend e implemente os cálculos em <code>server/src/mappings.ts</code>.</p>
        </div>
      )}

      <FilterBar />
      {m.id === "qualidade" && <ConnectionPanel />}

      {indicators.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {indicators.map((i) => (
            <KpiCard key={i} def={INDICATORS[i]} result={q.isError ? undefined : ind[i]} onOpen={() => setOpen(i)} />
          ))}
        </div>
      )}

      {tables.filter((t) => t.display === "alerts").map(table)}

      {charts.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {charts.map((c) => (
            <ChartPanel key={c} def={CHARTS[c]} result={chs[c]} />
          ))}
        </div>
      )}

      {tables.some((t) => t.display === "list") && <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{tables.filter((t) => t.display === "list").map(table)}</div>}
      {tables.filter((t) => !t.display || t.display === "table" || t.display === "cards").map(table)}

      {open && <TraceDrawer id={open} filters={filters} onClose={() => setOpen(null)} />}
    </div>
  );
}
