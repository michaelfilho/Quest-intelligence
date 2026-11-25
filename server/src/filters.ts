import { z } from "zod";
import { defaultPeriod } from "../../shared/contracts.js";
import type { Filters } from "../../shared/contracts.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD").refine((s) => !Number.isNaN(Date.parse(s)), "data inválida");
// IDs de origem (iClips) e nomes (ex.: departamento "Criação", "Mídia & Dados"). Sem ; aspas ou "--".
// Sempre passados como parâmetro SQL, nunca concatenados.
const id = z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N}_.:\- &]+$/u, "identificador inválido").refine((s) => !s.includes("--"), "identificador inválido").optional();

export const filtersSchema = z
  .object({
    start: isoDate.optional(),
    end: isoDate.optional(),
    compare: z.enum(["0", "1", "true", "false"]).optional(),
    client: id,
    group: id,
    project: id,
    department: id,
    employee: id,
    service: id,
    status: id,
    statusSource:z.enum(['projects','invoices']).optional(),
    category:id,
  })
  .transform((f): Filters => {
    const d = defaultPeriod();
    return { ...f, start: f.start ?? d.start, end: f.end ?? d.end, compare: f.compare === "1" || f.compare === "true" };
  })
  .refine((f) => f.start <= f.end, { message: "data inicial maior que a final", path: ["start"] })
  .refine((f) => Date.parse(f.end) - Date.parse(f.start) <= 6 * 366 * 86400000, { message: "período máximo de 6 anos", path: ["end"] });

export const pageSchema = z.object({
  search:z.string().trim().max(100).optional(),
  dreGroup:z.enum(['receita_recebida','despesas_fixas','despesas_variaveis','receitas_nao_operacionais','despesas_nao_operacionais','impostos_pagos','participacao_lucros_paga']).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  // Ordenação no servidor (a coluna é validada contra as colunas permitidas da tabela).
  sort: z.string().regex(/^[a-z_]{1,40}$/).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
