// Gera docs/DICIONARIO_BANCO.md a partir do catálogo de um PostgreSQL temporário com as migrations reais.
// Uso: npm run docs:database
import { readFileSync, writeFileSync } from 'node:fs';
import { bootstrapScript, runMigrations, startPostgres } from './pg-temp.mjs';

const pg = await startPostgres();
try {
  const must = (r) => { if (r.status !== 0) throw new Error(r.err); return r.out; };
  must(pg.psql('postgres', 'CREATE DATABASE quest_rinne'));
  must(pg.psql('postgres', bootstrapScript(readFileSync(new URL('../server/db/bootstrap.sql', import.meta.url), 'utf8'))));
  runMigrations(pg.port);
  const query = (sql) => JSON.parse(must(pg.psql('quest_rinne', `SELECT coalesce(json_agg(t), '[]') FROM (${sql}) t`)));
  const schemas = "('app','core','ingest','audit')";
  const tables = query(`SELECT n.nspname AS schema, c.relname AS name, coalesce(obj_description(c.oid), '') AS comment, c.oid::int AS oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ${schemas} AND c.relkind = 'r' ORDER BY 1, 2`);
  const columns = query(`SELECT a.attrelid::int AS oid, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS required, coalesce(pg_get_expr(d.adbin, d.adrelid), CASE WHEN a.attidentity <> '' THEN 'identity' END, '') AS def, coalesce(col_description(a.attrelid, a.attnum), '') AS comment FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE n.nspname IN ${schemas} AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attrelid, a.attnum`);
  const constraints = query(`SELECT k.conrelid::int AS oid, k.contype AS type, pg_get_constraintdef(k.oid) AS def FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname IN ${schemas} AND k.contype IN ('p','u','f','c') ORDER BY k.conrelid, k.contype, k.conname`);
  const indexes = query(`SELECT (quote_ident(i.schemaname) || '.' || quote_ident(i.tablename)) AS table, i.indexname AS name, i.indexdef AS def FROM pg_indexes i WHERE i.schemaname IN ${schemas} AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conname = i.indexname) ORDER BY 1, 2`);
  const grants = query(`SELECT table_schema || '.' || table_name AS table, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges FROM information_schema.role_table_grants WHERE table_schema IN ${schemas} AND grantee IN ('qi_app','qi_reader','qi_ingest') GROUP BY 1, 2 ORDER BY 1, 2`);

  const cell = (v) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const out = ['# Dicionário de dados — PostgreSQL `quest_rinne`', '', '> Gerado por `npm run docs:database` a partir das migrations em `server/db/migrations`. Não editar à mão.', ''];
  const relations = [];
  for (const schema of ['app', 'core', 'ingest', 'audit']) {
    out.push(`## Schema \`${schema}\``, '');
    for (const t of tables.filter((t) => t.schema === schema)) {
      const full = `${schema}.${t.name}`;
      out.push(`### ${full}`, '', t.comment, '', '| coluna | tipo | obrigatória | padrão | observação |', '|---|---|---|---|---|');
      for (const c of columns.filter((c) => c.oid === t.oid)) out.push(`| ${c.name} | ${c.type} | ${c.required ? 'sim' : ''} | ${cell(c.def)} | ${cell(c.comment)} |`);
      out.push('');
      for (const k of constraints.filter((k) => k.oid === t.oid)) {
        out.push(`- ${({ p: 'Chave primária', u: 'Único', f: 'Referência', c: 'Regra' })[k.type]}: \`${k.def}\``);
        const ref = k.type === 'f' && /REFERENCES ([a-z_.]+)\(/.exec(k.def);
        if (ref) relations.push([full, ref[1].includes('.') ? ref[1] : `${schema}.${ref[1]}`]);
      }
      for (const i of indexes.filter((i) => i.table === full)) out.push(`- Índice \`${i.name}\`: \`${i.def.replace(/^.* USING /, '')}\``);
      for (const g of grants.filter((g) => g.table === full)) out.push(`- ${g.grantee}: ${g.privileges}`);
      out.push('');
    }
  }
  writeFileSync(new URL('../docs/DICIONARIO_BANCO.md', import.meta.url), out.join('\n'));

  // Diagrama de relacionamentos dos dados empresariais (sem as chaves repetidas de rastreio).
  const edges = [...new Set(relations.filter(([a, b]) => a.startsWith('core.') && b.startsWith('core.')).map(([a, b]) => `  ${b.replace('core.', '')} ||--o{ ${a.replace('core.', '')} : ""`))];
  const model = readFileSync(new URL('../docs/MODELAGEM_POSTGRESQL.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  writeFileSync(new URL('../docs/MODELAGEM_POSTGRESQL.md', import.meta.url), model.replace(/<!-- er:inicio -->[\s\S]*<!-- er:fim -->/, `<!-- er:inicio -->\n\`\`\`mermaid\nerDiagram\n${edges.join('\n')}\n\`\`\`\n<!-- er:fim -->`));
  console.log(`${tables.length} tabelas, ${columns.length} colunas, ${relations.length} referências documentadas.`);
} finally {
  pg.stop();
}
