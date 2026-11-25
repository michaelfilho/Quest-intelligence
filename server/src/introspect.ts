// FASE 1 — Introspecção somente leitura do banco real. Gera docs/schema-snapshot.json e docs/DICIONARIO_DADOS.md.
// Uso: npm run introspect
import { writeFileSync } from "node:fs";
import { closePool, getPool, q, SCHEMAS } from "./db.js";

if (!getPool()) throw new Error("DATABASE_URL não configurado (veja .env.example)");

const schemas = Object.values(SCHEMAS);
const ident = (s: string) => '"' + s.replace(/"/g, '""') + '"';

const columns = await q<{ schema: string; table: string; column: string; type: string; nullable: string }>(
  `select table_schema as schema, table_name as table, column_name as column, data_type as type, is_nullable as nullable
     from information_schema.columns where table_schema = any($1) order by 1, 2, ordinal_position`,
  [schemas]
);
const constraints = await q<{ schema: string; table: string; name: string; type: string; def: string }>(
  `select n.nspname as schema, c.relname as table, k.conname as name, k.contype as type, pg_get_constraintdef(k.oid) as def
     from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = any($1) and k.contype in ('p','f','u') order by 1, 2, 4`,
  [schemas]
);
const indexes = await q(`select schemaname as schema, tablename as table, indexname as name, indexdef as def
                           from pg_indexes where schemaname = any($1) order by 1, 2`, [schemas]);
const relations = await q<{ schema: string; table: string; kind: string }>(
  `select n.nspname as schema, c.relname as table, c.relkind as kind from pg_class c
     join pg_namespace n on n.oid = c.relnamespace where n.nspname = any($1) and c.relkind in ('r','v','m','p') order by 1, 2`,
  [schemas]
);
const functions = await q(
  `select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
          md5(pg_get_functiondef(p.oid)) as def_md5
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = any($1) and p.prokind = 'f' order by 1, 2`,
  [schemas]
);

// Contagem exata + faixa temporal de cada coluna de data (tabelas, não views). Statement timeout de 15s protege o banco.
const dateTypes = new Set(["date", "timestamp without time zone", "timestamp with time zone"]);
const stats: Record<string, unknown> = {};
for (const r of relations.filter((r) => r.kind === "r" || r.kind === "p")) {
  const key = `${r.schema}.${r.table}`;
  const fq = `${ident(r.schema)}.${ident(r.table)}`;
  const dates = columns.filter((c) => c.schema === r.schema && c.table === r.table && dateTypes.has(c.type));
  try {
    const sel = ["count(*)::bigint as rows", ...dates.flatMap((d) => [
      `min(${ident(d.column)})::text as ${ident("min_" + d.column)}`,
      `max(${ident(d.column)})::text as ${ident("max_" + d.column)}`,
      `count(${ident(d.column)})::bigint as ${ident("nn_" + d.column)}`,
    ])];
    [stats[key]] = await q(`select ${sel.join(", ")} from ${fq}`);
  } catch (e) {
    stats[key] = { error: (e as Error).message };
  }
}

writeFileSync("../docs/schema-snapshot.json", JSON.stringify({ generatedAt: new Date().toISOString(), relations, columns, constraints, indexes, functions, stats }, null, 2));

let md = `# Dicionário de dados (gerado automaticamente)\n\nGerado em ${new Date().toISOString()} por \`npm run introspect\`. Não editar à mão.\n`;
for (const r of relations) {
  const key = `${r.schema}.${r.table}`;
  md += `\n## ${key}${r.kind === "v" ? " (view)" : r.kind === "m" ? " (materialized view)" : ""}\n\n`;
  if (stats[key]) md += "```\n" + JSON.stringify(stats[key]) + "\n```\n\n";
  md += "| coluna | tipo | null |\n|---|---|---|\n";
  for (const c of columns.filter((c) => c.schema === r.schema && c.table === r.table)) md += `| ${c.column} | ${c.type} | ${c.nullable} |\n`;
  const k = constraints.filter((c) => c.schema === r.schema && c.table === r.table);
  if (k.length) md += "\n" + k.map((c) => `- \`${c.name}\`: ${c.def}`).join("\n") + "\n";
}
writeFileSync("../docs/DICIONARIO_DADOS.md", md);
console.log(`OK: ${relations.length} relações, ${columns.length} colunas, ${constraints.length} constraints, ${functions.length} funções.`);
await closePool();
