import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDef, ChartResult } from "../../../shared/contracts";
import { fmt, shortState,humanLimitation,managementText } from "../lib";
import { BasisTag, EmptyState, Panel, ReliabilityBadge, Skeleton } from "./ui";

// Laranja destaca a série principal; demais em escala de cinza.
const COLORS = ["#F58220", "#292929", "#777777", "#B8B8B8"];
const axis = { fontSize: 11, fill: "#777777" };
const SERIES:Record<string,string>={horas:'Horas',projetos:'Projetos',pecas:'Peças',receita_operacional:'Receita operacional recebida',despesas_fixas:'Despesas fixas',despesas_variaveis:'Despesas variáveis',despesas_operacionais:'Despesas operacionais',receita:'Receita',despesas:'Despesas',resultado:'Resultado operacional preliminar',margem:'Margem operacional preliminar',entradas:'Entradas',saidas:'Saídas',faturado:'Faturamento',faturamento:'Faturamento',previstas:'Horas previstas',realizadas:'Horas realizadas',faturado_emitido:'Faturamento',receita_operacional_recebida:'Receita operacional recebida',custo_registrado:'Custo registrado'};

export function ChartPanel({ def, result }: { def: ChartDef; result?: ChartResult }) {
  const tick = (v: unknown) => fmt(v, def.unit === "BRL" ? "count" : def.unit);
  const tip = (v: unknown) => fmt(v, def.unit);
  const monthly=['dre_mensal','evolucao_resultado','receitas_vs_despesas','faturado_vs_recebido','movimentacoes_realizadas','evolucao_faturamento','evolucao_financeira','evolucao_producao'].includes(def.id);
  const points = (def.kind === "ranking" ? result?.points.slice(0, 10) : result?.points)?.map(p=>({...p,label:def.id==='previstas_vs_realizadas'?(p.label==='TASK'?'Tarefas':p.label==='WORKFLOW'?'Etapas':p.label):monthly&&/^\d{4}-\d{2}$/.test(String(p.label))?String(p.label).split('-').reverse().join('/'):p.label}));

  return (
    <Panel title={def.label} subtitle={<><BasisTag value={def.basis} />{result && <ReliabilityBadge value={result.reliability} />}</>}>
      <div className="h-72 px-4 pb-5">
        {!result ? (
          <Skeleton className="h-full w-full" />
        ) : result.status !== "OK" ? (
          <EmptyState title={shortState(result)} reason={humanLimitation(result.reasonCode)} />
        ) : !points?.length ? (
          <EmptyState title="Sem registros no período" reason="Nenhum registro atende aos filtros. Isso não significa valor zero." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {def.kind === "line" ? (
              <LineChart data={points} margin={{ left: 8, right: 16, top: 8 }}>
                <CartesianGrid stroke="#E6E6E6" vertical={false} />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#E6E6E6" }} />
                <YAxis tick={axis} tickFormatter={tick} tickLine={false} axisLine={false} width={72} />
                <Tooltip formatter={tip} />
                {result.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                {result.series.map((s, i) => (
                  <Line key={s} name={SERIES[s]??s.replaceAll('_',' ')} dataKey={s} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls={false} />
                ))}
              </LineChart>
            ) : def.kind === "bar" ? (
              <BarChart data={points} margin={{ left: 8, right: 16, top: 8 }}>
                <CartesianGrid stroke="#E6E6E6" vertical={false} />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#E6E6E6" }} />
                <YAxis tick={axis} tickFormatter={tick} tickLine={false} axisLine={false} width={72} />
                <Tooltip formatter={tip} cursor={{ fill: "#F4F4F4" }} />
                {result.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                {result.series.map((s, i) => (
                  <Bar key={s} name={SERIES[s]??s.replaceAll('_',' ')} dataKey={s} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={36} />
                ))}
              </BarChart>
            ) : (
              <BarChart data={points} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" tick={axis} tickFormatter={tick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" tick={axis} tickLine={false} axisLine={false} width={130} />
                <Tooltip formatter={tip} cursor={{ fill: "#F4F4F4" }} />
                <Bar dataKey={result.series[0]} fill="#F58220" radius={[0, 3, 3, 0]} maxBarSize={18} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      {result?.reason && <details className="border-t border-q-line px-6 py-3 text-xs text-q-mid"><summary className="cursor-pointer">Cobertura e limitações</summary><p className="pt-2 leading-relaxed">{managementText(result.reason)}</p></details>}
    </Panel>
  );
}
