// Central de relatórios: permissões, formatos (JSON, CSV, XLSX, Markdown), honestidade sem dados e
// conclusões por IA somente via n8n e somente com dados reais. Ordenação de tabelas validada.
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { after, before, test } from "node:test";
import { Client, createUser, startServer } from "./helpers.js";
import { enableN8n, startMock } from "./n8nmock.js";

const { sign } = await import("../src/integrations/n8n.js");
const { xlsx } = await import("../src/xlsx.js");

let srv: Awaited<ReturnType<typeof startServer>>;
let mock: Awaited<ReturnType<typeof startMock>>;
const c: Record<string, Client> = {};
before(async () => {
  srv = await startServer();
  mock = await startMock(sign);
  await createUser("fin", "financeiro");
  await createUser("ana", "analista");
  await createUser("dir", "diretoria");
  for (const u of ["fin", "ana", "dir"]) (c[u] = new Client(srv.base)), await c[u].login(u);
});
after(() => (mock.stop(), srv.stop()));

/** Lê as entradas de um ZIP (formato do xlsx) e devolve { nome → conteúdo }. */
function unzip(buf: Buffer) {
  const out: Record<string, string> = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString();
    const data = buf.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    out[name] = inflateRawSync(data).toString();
    p += 30 + nameLen + size;
  }
  return out;
}

test("XLSX gerado sem dependências é um pacote válido e não interpreta fórmulas", () => {
  const z = unzip(xlsx([{ name: "Teste/1", rows: [["Coluna", "Valor"], ["=HYPERLINK(\"x\")", 10.5], ["<b>", null]] }]));
  assert.ok(z["[Content_Types].xml"] && z["xl/workbook.xml"] && z["xl/worksheets/sheet1.xml"]);
  assert.match(z["xl/workbook.xml"], /name="Teste 1"/); // caractere inválido de aba removido
  const sheet = z["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /<v>10.5<\/v>/);
  assert.match(sheet, /t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;x&quot;\)/); // texto, nunca <f>
  assert.ok(!sheet.includes("<f>"));
  assert.match(sheet, /&lt;b&gt;/);
});

test("catálogo de relatórios respeita permissões", async () => {
  const fin = (await c.fin.req("/api/reports")).body.map((r: any) => r.id);
  const ana = (await c.ana.req("/api/reports")).body.map((r: any) => r.id);
  assert.ok(fin.includes("financeiro") && fin.includes("rentabilidade") && !fin.includes("producao"));
  assert.ok(!ana.includes("financeiro") && ana.includes("producao") && ana.includes("qualidade"));
  assert.equal((await c.ana.req("/api/reports/financeiro")).status, 403);
  assert.equal((await c.ana.req("/api/reports/producao?format=csv")).status, 403); // analista sem relatorios.export
  assert.equal((await c.fin.req("/api/reports/financeiro?format=pdf")).status, 400);
  assert.equal((await c.fin.req("/api/reports/inexistente")).status, 404);
});

test("sem banco: relatório explicitamente marcado como DADOS INDISPONÍVEIS, sem valores", async () => {
  const r = (await c.fin.req("/api/reports/financeiro?start=2026-11-01&end=2026-11-25")).body;
  assert.equal(r.dataAvailable, false);
  assert.ok(r.indicators.length > 0 && r.indicators.every((i: any) => i.value === null));
  assert.ok(r.limitations.some((l: string) => /NÃO contém valores/.test(l)));
  assert.deepEqual(r.period, { start: "2026-11-01", end: "2026-11-25" });

  const csv = await c.fin.req("/api/reports/financeiro?format=csv");
  assert.match(csv.headers.get("content-disposition")!, /rinne_financeiro_.*\.csv/);
  assert.match(csv.body, /DADOS INDISPONÍVEIS/);
  assert.match(csv.body, /Receita recebida;;Indisponível/);
  const md = await c.fin.req("/api/reports/financeiro?format=md");
  assert.match(md.body, /> \*\*DADOS INDISPONÍVEIS\.\*\*/);
  const bin = Buffer.from(await (await fetch(srv.base + "/api/reports/financeiro?format=xlsx", { headers: { cookie: c.fin.cookie, "x-forwarded-for": c.fin.ip } })).arrayBuffer());
  const z = unzip(bin);
  assert.match(z["xl/workbook.xml"], /name="Resumo".*name="Indicadores"/);
  assert.match(z["xl/worksheets/sheet1.xml"], /DADOS INDISPONÍVEIS/);
});

test("conclusões por IA: nunca chamadas sem dados reais (sem custo desnecessário)", async () => {
  enableN8n(mock.url);
  const before = mock.received.length;
  const r = (await c.fin.req("/api/reports/financeiro?conclusions=1")).body;
  assert.equal(r.conclusions.status, "skipped");
  assert.equal(mock.received.length, before);
});

test("escopo e colunas também valem nos relatórios; relatório de reuniões usa dados da aplicação", async () => {
  const fin = (await c.fin.req("/api/reports/clientes")).body;
  const cols = fin.tables.find((t: any) => t.id === "clientes").columns.map((x: any) => x.key);
  assert.ok(cols.includes("faturado"));
  const ana = (await c.ana.req("/api/reports/clientes")).body;
  assert.ok(!ana.tables.find((t: any) => t.id === "clientes").columns.some((x: any) => x.key === "faturado"));
  assert.ok(!ana.indicators.some((i: any) => i.id === "receita_faturada"));
  const reun = (await c.dir.req("/api/reports/reunioes")).body;
  assert.equal(reun.tables[0].id, "reunioes");
});

test("ordenação no servidor: coluna validada contra as permitidas", async () => {
  assert.equal((await c.ana.req("/api/tables/clientes?sort=cliente&dir=desc")).status, 200);
  assert.equal((await c.ana.req("/api/tables/clientes?sort=faturado")).status, 400); // coluna sem permissão
  assert.equal((await c.ana.req("/api/tables/clientes?sort=nome;drop")).status, 400);
  assert.equal((await c.ana.req("/api/tables/clientes?dir=up")).status, 400);
});
