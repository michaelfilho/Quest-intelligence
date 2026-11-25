// Gera docs/DICIONARIO_INDICADORES.md a partir do catálogo (fonte única). Uso: npm run docs:indicators
import { writeFileSync } from "node:fs";
import { CHARTS, INDICATORS, MODULES } from "../../shared/catalog.js";
import { chartImpls, indicatorImpls } from "./mappings.js";
import { mappingLimitation } from "./mapping-limitations.js";

const status = (ok: boolean) => (ok ? "SQL implementado; condicionado à introspecção e qualidade parcial" : "indisponível; sem fonte/semântica validada");
let md = "# Dicionário de indicadores\n\nGerado de `shared/catalog.ts` por `npm run docs:indicators`. Não editar à mão.\n\n";
md += "Percentuais são frações (0–1). Bases temporais nunca são misturadas no mesmo número.\n\n";
md += "| id | indicador | unidade | base | definição | fontes candidatas | requisito | módulos | situação |\n|---|---|---|---|---|---|---|---|---|\n";
for (const i of Object.values(INDICATORS)) {
  const mods = MODULES.filter((m) => m.indicators.includes(i.id)).map((m) => m.id).join(", ");
  md += `| \`${i.id}\` | ${i.label} | ${i.unit} | ${i.basis} | ${i.formula} | ${i.sources.join(", ")} | ${i.requires ?? ""} | ${mods} | ${status(!!indicatorImpls[i.id])} |\n`;
}
md += "\n## Limitações por indicador ainda indisponível\n\n";
for (const i of Object.values(INDICATORS).filter(i => !indicatorImpls[i.id])) md += `- \`${i.id}\`: ${mappingLimitation(i.id)}\n`;
md += "\n## Gráficos\n\n| id | gráfico | tipo | unidade | base | situação |\n|---|---|---|---|---|---|\n";
for (const c of Object.values(CHARTS)) md += `| \`${c.id}\` | ${c.label} | ${c.kind} | ${c.unit} | ${c.basis} | ${status(!!chartImpls[c.id])} |\n`;
writeFileSync(new URL("../../docs/DICIONARIO_INDICADORES.md", import.meta.url), md);
console.log(`OK: ${Object.keys(INDICATORS).length} indicadores, ${Object.keys(CHARTS).length} gráficos.`);
