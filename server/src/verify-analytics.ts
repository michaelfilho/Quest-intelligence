// Executar MANUALMENTE no ambiente já atualizado; somente SELECTs, sem acesso por esta tarefa à VPS.
import { parseArgs } from "node:util";
import { closePool, dbState, q } from "./db.js";
import { filtersSchema } from "./filters.js";
import { resolveIndicator } from "./services.js";
const { values } = parseArgs({ options: { start: { type: "string" }, end: { type: "string" } } });
const f = filtersSchema.parse(values);
try {
  if ((await dbState()).state !== "CONNECTED") throw new Error("PostgreSQL indisponível.");
  const [session] = await q("SELECT current_user AS role, current_setting('transaction_read_only') AS readonly");
  if (session.role !== "quest_rinne_app_ro" || session.readonly !== "on") throw new Error("Verificação exige quest_rinne_app_ro e sessão somente leitura.");
  const reference = [
    { id: "receita_faturada", sql: `SELECT sum(service_amount)::float8 AS expected FROM core.invoices
      WHERE status = 'issued' AND service_amount::text NOT IN ('NaN','Infinity','-Infinity') AND issued_at::timestamptz >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND issued_at::timestamptz < (($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AND issued_at::timestamptz <= CURRENT_TIMESTAMP` },
    { id: "horas_registradas", sql: `SELECT sum(CASE WHEN duration_seconds >= 0 AND duration_seconds::text NOT IN ('NaN','Infinity','-Infinity') AND (duration_minutes IS NULL OR
        (duration_minutes >= 0 AND duration_minutes::text NOT IN ('NaN','Infinity','-Infinity') AND abs(duration_seconds-duration_minutes*60) <= 1)) THEN duration_seconds
        WHEN duration_seconds IS NULL AND duration_minutes >= 0 AND duration_minutes::text NOT IN ('NaN','Infinity','-Infinity') THEN duration_minutes*60 ELSE NULL END)::float8 / 3600 AS expected
      FROM core.time_entries WHERE started_at::timestamptz >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND started_at::timestamptz < (($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AND started_at::timestamptz <= CURRENT_TIMESTAMP
      AND (finished_at IS NULL OR (finished_at::timestamptz <= CURRENT_TIMESTAMP AND finished_at::timestamptz >= started_at::timestamptz))` },
  ];
  let failures = 0;
  for (const spec of reference) {
    const [r] = await q(spec.sql, [f.start, f.end]);
    const indicator = await resolveIndicator(spec.id, f, "CONNECTED");
    const equal = indicator.status !== "ERROR" && (r.expected == null ? indicator.value == null : typeof indicator.value === "number" && Math.abs(Number(r.expected) - indicator.value) < 1e-6);
    if (!equal) failures++;
    // Não grava valores financeiros ou registros individuais em logs.
    console.log(JSON.stringify({ indicator: spec.id, match: equal, status: indicator.status }));
  }
  process.exitCode = failures ? 1 : 0;
} finally { await closePool(); }
