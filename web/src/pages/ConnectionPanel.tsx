import { useQuery } from "@tanstack/react-query";
import { api, fmt, useHealth } from "../lib";
import { DbDot, EmptyState, ErrorState, Panel, SectionTitle, Skeleton } from "../components/ui";

interface Coverage {
  database: string;
  schemas: Record<string, string>;
  tables: { schema: string; table: string; kind: string; estimated_rows: string; last_analyze: string | null }[];
}

const KIND: Record<string, string> = { r: "tabela", p: "tabela particionada", v: "view", m: "view materializada" };

/** Saúde da conexão + inventário real das tabelas (catálogo do PostgreSQL). Funciona sem nenhum mapeamento. */
export function ConnectionPanel() {
  const health = useHealth();
  const cov = useQuery({ queryKey: ["coverage"], queryFn: () => api<Coverage>("/metadata/coverage") });
  const h = health.data;

  return (
    <section>
      <SectionTitle>Conexão e cobertura</SectionTitle>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <Panel title="Conexão com o PostgreSQL">
          {health.isError ? (
            <ErrorState error={health.error} onRetry={() => health.refetch()} />
          ) : !h ? (
            <Skeleton className="m-4 h-24" />
          ) : (
            <dl className="divide-y divide-q-line px-4 text-sm">
              {[
                ["Estado", <DbDot state={h.database} />],
                ["Banco", h.session?.database ?? "—"],
                ["Usuário", h.session?.user ?? "—"],
                ["Somente leitura", h.session ? (h.session.read_only === "on" ? "Sim" : "NÃO — revisar role") : "—"],
                ["Hora do servidor", h.session ? fmt(h.session.server_time, "datetime") : "—"],
                ["Schemas", h.schemas ? Object.values(h.schemas).join(", ") : "—"],
                ["Fuso", h.timezone],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4 py-2">
                  <dt className="text-q-mid">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
        <Panel title="Tabelas disponíveis" subtitle="Volume estimado pelas estatísticas do PostgreSQL (sem varredura completa)">
          {cov.isError ? (
            <ErrorState error={cov.error} onRetry={() => cov.refetch()} />
          ) : !cov.data ? (
            <Skeleton className="m-4 h-24" />
          ) : !cov.data.tables.length ? (
            <EmptyState compact title="Inventário indisponível" reason="O inventário de core, ingest e audit aparece assim que o backend se conectar ao banco." />
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-q-line text-left text-[11px] uppercase tracking-wide text-q-mid">
                    <th className="px-4 py-2">Relação</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2 text-right">Linhas (est.)</th>
                    <th className="px-4 py-2">Estatística em</th>
                  </tr>
                </thead>
                <tbody>
                  {cov.data.tables.map((t) => (
                    <tr key={t.schema + t.table} className="border-b border-q-line/70">
                      <td className="px-4 py-1.5 font-mono text-xs">{t.schema}.{t.table}</td>
                      <td className="px-4 py-1.5 text-xs text-q-mid">{KIND[t.kind] ?? t.kind}</td>
                      <td className="num px-4 py-1.5 text-right">{fmt(t.estimated_rows, "count")}</td>
                      <td className="px-4 py-1.5 text-xs text-q-mid">{t.last_analyze ? fmt(t.last_analyze, "datetime") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
