// Perfis explícitos: introspecção valida estrutura, valores de tipo são os descritos no contrato.
// Movimentações preliminares não são classificadas como receita, despesa operacional ou lucro.
import type { Filters } from "../../shared/contracts.js";
import { q, SCHEMAS } from "./db.js";
import { numericTypes, runtimeSchema, temporalTypes, validateJobIdentity, validateStatement, type SchemaSnapshot, type Reader } from "./schema.js";
import { SourceLimitation } from "./source-errors.js";
import { paginate } from "./analytics.js";
import type { Computed, Page } from "./mappings.js";
import { nameSQL } from "./presentation.js";
import { z } from 'zod';

type ParentField = "parent_entry_id" | "parent_id" | "parent_entry_source_id";
type ParentTarget = "iclips_id" | "source_id" | "entry_source_id";
export interface CashProfile {
  type: "entry_type" | "type"; parent: ParentField | null; target?: ParentTarget;
  candidates: ParentTarget[]; declaredTarget?: ParentTarget; hasCompetence: boolean; hasJob: boolean; hasCategory: boolean;hasAccount?:boolean;
}
export function cashProfile(s: SchemaSnapshot): CashProfile {
  const cols = s.columns.filter(c => c.schema === SCHEMAS.core && c.table === "financial_entries");
  const idTypes = new Set(["smallint", "integer", "bigint", "numeric", "text", "character varying", "uuid"]);
  const types = ["entry_type", "type"].filter(name => cols.some(c => c.column === name && ["text", "character varying", "USER-DEFINED"].includes(c.type)));
  let parents = ["parent_entry_id", "parent_id", "parent_entry_source_id"].filter(name => cols.some(c => c.column === name));
  const configured = process.env.FINANCIAL_PARENT_FIELD;
  if (configured) {
    if (!parents.includes(configured)) throw new SourceLimitation("FINANCIAL_PARENT_FIELD não corresponde a campo explícito disponível.");
    parents = [configured];
  }
  if (types.length !== 1 || parents.length > 1) throw new SourceLimitation("Perfil financeiro ausente ou ambíguo: exige um campo entry_type/type e um vínculo-pai não ambíguo.");
  if (parents.some(name => !cols.some(c => c.column === name && idTypes.has(c.type)))) throw new SourceLimitation("Tipo de identificador-pai não comprovado.");
  for (const name of ["amount", "payment_date", "iclips_id"]) {
    const c = cols.find(c => c.column === name);
    if (!c || (name === "amount" && !numericTypes.has(c.type)) || (["payment_date", "competence_date"].includes(name) && !temporalTypes.has(c.type))) {
      throw new SourceLimitation(`Perfil financeiro não confirmado: ${name}. Nenhum campo alternativo é presumido.`);
    }
  }
  const candidates = (["iclips_id", "source_id", "entry_source_id"] as ParentTarget[]).filter(name => cols.some(c => c.column === name && idTypes.has(c.type)));
  const declaredTargets = candidates.filter(target => s.constraints.some(c => c.schema === SCHEMAS.core && c.table === "financial_entries" && c.type === "f"
    && c.def.includes(`FOREIGN KEY (${parents[0]})`) && new RegExp(`REFERENCES (?:core\\.)?financial_entries\\(${target}\\)`).test(c.def)));
  let declaredTarget: ParentTarget | undefined = declaredTargets.length === 1 ? declaredTargets[0] : undefined;
  if (declaredTargets.length > 1 && !process.env.FINANCIAL_PARENT_TARGET) throw new SourceLimitation("Mais de um namespace declarado; exige escolha semântica explícita.");
  if (process.env.FINANCIAL_PARENT_TARGET) {
    const selected = process.env.FINANCIAL_PARENT_TARGET;
    if (!candidates.includes(selected as ParentTarget) || (declaredTargets.length && !declaredTargets.includes(selected as ParentTarget))) throw new SourceLimitation("Namespace financeiro configurado ausente ou em conflito com a constraint declarada.");
    declaredTarget = selected as ParentTarget;
  }
  return { type: types[0] as CashProfile["type"], parent: (parents[0] as ParentField) ?? null, candidates, declaredTarget,
    hasCompetence: cols.some(c => c.column === "competence_date"&&temporalTypes.has(c.type)), hasJob: cols.some(c => c.column === "job_id"),
    hasCategory: cols.some(c => c.column === "category_id" && idTypes.has(c.type)),hasAccount:cols.some(c=>c.column==='account_id'&&idTypes.has(c.type)) };
}

export async function validatedCashProfile(s: SchemaSnapshot, reader: Reader, filters?: Filters,temporal:'payment_date'|'competence_date'='payment_date'): Promise<CashProfile> {
  const profile = cashProfile(s);
  if (!profile.parent) throw new SourceLimitation("Vínculo-pai não mapeado: natureza econômica não é presumida.");
  const valid: ParentTarget[] = [];
  const isolated: ParentTarget[] = [];
  let incident = false;
  const targets = profile.declaredTarget ? [profile.declaredTarget] : profile.candidates;
  if (!targets.length) throw new SourceLimitation('Relacionamento inválido: nenhum namespace de identidade suportado.');
  const unique=s.constraints.some(c=>c.schema==='core'&&c.table==='financial_entries'&&['p','u'].includes(c.type)&&/^(?:PRIMARY KEY|UNIQUE(?: NULLS NOT DISTINCT)?)\s*\(iclips_id\)/.test(c.def.replaceAll('"','')));
  if (!unique) {
    const src=filters?cashSource(filters,{...profile,target:targets[0]},temporal):null;
    const [identity]=await reader(`WITH scoped AS (${src?src.sql:`SELECT iclips_id,${profile.type}::text AS tipo,payment_date FROM core.financial_entries`})
      SELECT EXISTS(SELECT 1 FROM scoped WHERE tipo IN ('Entrada','Saída') AND payment_date::timestamptz<=CURRENT_TIMESTAMP
        GROUP BY iclips_id HAVING iclips_id IS NULL OR count(*)>1) AS duplicate`,src?.params??[]);
    if(identity.duplicate)throw new SourceLimitation('Relacionamento inválido: identidade financeira ausente ou duplicada nas movimentações do escopo.');
  }
  for (const target of targets) {
    const scope = filters ? cashSource(filters, { ...profile, target },temporal) : null;
    const [r] = await reader(`WITH relevant AS (
      ${scope ? scope.sql : `SELECT * FROM core.financial_entries`}
    ), relevant_keys AS (
      SELECT f.${target}::text AS key, f.iclips_id FROM core.financial_entries f
      JOIN relevant r ON r.iclips_id=f.iclips_id
      WHERE ${scope ? 'r.tipo' : 'r.'+profile.type} IN ('Entrada','Saída')
        AND r.payment_date::timestamptz<=CURRENT_TIMESTAMP
    ), identities AS (
      SELECT ${target}::text AS key, count(*) AS n FROM core.financial_entries WHERE ${target} IS NOT NULL GROUP BY ${target}::text
    ), links AS (
      SELECT f.${profile.parent}::text AS parent, f.${target}::text AS self FROM core.financial_entries f
      WHERE f.${profile.parent} IS NOT NULL AND (EXISTS(SELECT 1 FROM relevant_keys r WHERE r.iclips_id=f.iclips_id)
        OR f.${profile.parent}::text IN (SELECT key FROM relevant_keys))
    ) SELECT (SELECT count(*)::int FROM identities WHERE n > 1
      AND (key IN (SELECT key FROM relevant_keys) OR key IN (SELECT parent FROM links))) AS duplicates,
      count(*)::int AS refs, count(*) FILTER (WHERE i.key IS NULL)::int AS orphans,
      count(*) FILTER (WHERE l.parent = l.self)::int AS self_refs
      FROM links l LEFT JOIN identities i ON i.key = l.parent`, scope?.params ?? []);
    if (Number(r.refs)>0 || Number(r.duplicates)>0) incident = true;
    if (Number(r.refs)===0 && Number(r.duplicates)===0) isolated.push(target);
    if (Number(r.duplicates) === 0 && Number(r.orphans) === 0 && Number(r.self_refs) === 0
      && (Number(r.refs) > 0 || profile.declaredTarget)) valid.push(target);
  }
  // Sem arestas incidentes em nenhum namespace candidato, as movimentações isoladas
  // não dependem da semântica dos pais órfãos de contas a pagar. Não valida esses pais.
  if (!incident && isolated.length) return { ...profile, target: profile.declaredTarget ?? isolated[0] };
  if (valid.length !== 1) throw new SourceLimitation("Vínculo-pai sem validação unívoca: namespace ambíguo, duplicidade, referência órfã, autorreferência ou ausência de evidência. FK física não é obrigatória; configuração explícita não dispensa validar os dados.");
  return { ...profile, target: valid[0] };
}
function assertCashFilters(f: Filters) {
  for (const k of ["department", "employee", "service", "status"] as const) if (f[k]) throw new SourceLimitation(`Filtro ${k} não comprovado para movimentações financeiras.`);
}
export async function scopedProfile(f: Filters, reader: Reader, provided?: SchemaSnapshot,temporal:'payment_date'|'competence_date'='payment_date') {
  assertCashFilters(f); // não consultar dados globais para um escopo que não pode ser aplicado
  const snapshot = provided ?? await runtimeSchema();
  if (f.client || f.group || f.project) {
    const fields = ['iclips_id', ...(f.client ? ['client_id'] : []), ...(f.group ? ['client_group_id'] : [])];
    validateStatement(snapshot, `SELECT ${fields.map(c => 'j.'+c).join(',')} FROM core.jobs j`);
    await validateJobIdentity(snapshot, reader);
  }
  return validatedCashProfile(snapshot, reader, f,temporal);
}
export function cashSource(f: Filters, profile: CashProfile,temporal:'payment_date'|'competence_date'='payment_date') {
  if (!profile.target) throw new SourceLimitation("O namespace do vínculo-pai ainda não foi validado.");
  assertCashFilters(f);
  if(temporal==='competence_date'&&!profile.hasCompetence)throw new SourceLimitation('Campo ausente/incompatível: competence_date temporal.');
  const params: unknown[] = [f.start, f.end];
  const predicates = [`f.${temporal}::timestamptz >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
    `f.${temporal}::timestamptz < (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`];
  for (const [key, field] of [["client", "client_id"], ["group", "client_group_id"], ["project", "iclips_id"]] as const) {
    if (f[key]) {
      if (!profile.hasJob) throw new SourceLimitation("Vínculo com projeto ausente no financeiro.");
      params.push(f[key]); predicates.push(`EXISTS(SELECT 1 FROM core.jobs j WHERE j.iclips_id = f.job_id AND j.${field}::text = $${params.length})`);
    }
  }
  const standalone = profile.parent ? `f.${profile.parent} IS NULL AND NOT EXISTS(SELECT 1 FROM core.financial_entries child WHERE child.${profile.parent}::text = f.${profile.target}::text)` : "FALSE";
  return { params, sql: `SELECT f.iclips_id, ${profile.hasJob ? "f.job_id" : "NULL::text AS job_id"}, ${profile.hasCategory ? "f.category_id" : "NULL::text AS category_id"}, f.payment_date, ${profile.hasCompetence ? "f.competence_date" : "NULL::date AS competence_date"},
    to_jsonb(f)->>'id' AS row_id,
    ${profile.hasAccount?'f.account_id':'NULL::text AS account_id'},
    f.${profile.type}::text AS tipo, CASE WHEN f.amount::text NOT IN ('NaN','Infinity','-Infinity') THEN f.amount::numeric ELSE NULL END AS valor, (${standalone}) AS standalone
    FROM core.financial_entries f WHERE ${predicates.join(" AND ")}` };
}
export const CASH_METRICS = ["entradas_realizadas", "saidas_realizadas", "saldo_movimentacoes"];
const note = "Movimentações preliminares, sem classificação operacional nem conciliação com conflitos de publicação. Famílias pai/filho excluídas integralmente. Valores assinados preservados. Não representa lucro, rentabilidade ou receita operacional validada.";
export async function computeCash(id: string, f: Filters, reader: Reader = q, schema?: SchemaSnapshot): Promise<Computed> {
  const profile = await scopedProfile(f, reader, schema);
  if (!profile.parent) throw new SourceLimitation("Movimentações indisponíveis: não há vínculo-pai reconhecido que permita excluir possíveis duplicidades econômicas com segurança.");
  const src = cashSource(f, profile);
  const [r] = await reader(`WITH source AS (${src.sql}), eligible AS (
    SELECT * FROM source WHERE standalone AND valor IS NOT NULL AND payment_date::timestamptz <= CURRENT_TIMESTAMP AND tipo IN ('Entrada','Saída'))
    SELECT sum(valor) FILTER (WHERE tipo = 'Entrada')::float8 AS entradas,
      sum(valor) FILTER (WHERE tipo = 'Saída')::float8 AS saidas,
      count(*) FILTER (WHERE tipo = 'Entrada')::int AS n_entrada,
      count(*) FILTER (WHERE tipo = 'Saída')::int AS n_saida,
      count(*) FILTER (WHERE valor < 0)::int AS negatives,
      (SELECT count(*)::int FROM source) AS total, count(*)::int AS used FROM eligible`, src.params);
  const kind = id === "entradas_realizadas" ? "entradas" : id === "saidas_realizadas" ? "saidas" : "saldo";
  const value = kind === "saldo" ? r.entradas == null || r.saidas == null ? null : Number(r.entradas) - Number(r.saidas) : r[kind] == null ? null : Number(r[kind]);
  const used = kind === "saldo" ? Number(r.used) : Number(r[kind === "entradas" ? "n_entrada" : "n_saida"]);
  return { value, reliability: "EM_RECONCILIACAO", recordsUsed: used, recordsExcluded: Number(r.total) - used,
    reason: note, temporalField: "payment_date", coverage: "Sem certificação de publicação ou conciliação econômica.",
    exclusions: [{ reason: "Outros tipos, datas futuras, nulos ou famílias pai/filho", count: Number(r.total) - used }],
    insufficient: kind === "saldo" && Number(r.negatives) > 0 ? "Saldo indisponível: convenção de sinais negativos exige conciliação; ABS não foi aplicado." : value == null ? "Sem valores suficientes na perspectiva de caixa. " + note : undefined };
}
export async function cashRecords(id: string, f: Filters, p: Page, reader: Reader = q, schema?: SchemaSnapshot) {
  const profile = await scopedProfile(f, reader, schema);
  if (!profile.parent) throw new SourceLimitation("Vínculo-pai financeiro não reconhecido.");
  const src = cashSource(f, profile);
  const type = id === "entradas_realizadas" ? "AND tipo = 'Entrada'" : id === "saidas_realizadas" ? "AND tipo = 'Saída'" : "";
  const sort = p.sort ?? "data";
  if (!["id", "data", "competencia", "tipo", "valor",'cliente','projeto','categoria','conta'].includes(sort)) throw new SourceLimitation("Ordenação financeira sem campo comprovado.");
  const snapshot=schema??await runtimeSchema();
  const jobClient=['iclips_id','client_id'].every(column=>snapshot.columns.some(c=>c.schema==='core'&&c.table==='jobs'&&c.column===column))?
    '(SELECT CASE WHEN count(*)=1 THEN max(j.client_id::text) END FROM core.jobs j WHERE j.iclips_id::text=source.job_id::text)':'NULL::text';
  const r = await paginate(`WITH source AS (${src.sql}) SELECT iclips_id AS id, job_id AS projeto_id, ${nameSQL(snapshot,'jobs','iclips_id','source.job_id','Projeto sem nome')} AS projeto,
    ${nameSQL(snapshot,'clients','iclips_id',jobClient,'Cliente sem nome')} AS cliente,
    ${nameSQL(snapshot,'financial_categories','iclips_id','source.category_id','Categoria sem nome')} AS categoria,
    ${nameSQL(snapshot,'financial_accounts','iclips_id','source.account_id','Conta sem nome')} AS conta,
    payment_date AS data, competence_date AS competencia, tipo, valor, 'Preliminar / em reconciliação'::text AS situacao FROM source
    WHERE standalone AND valor IS NOT NULL AND payment_date::timestamptz <= CURRENT_TIMESTAMP AND tipo IN ('Entrada','Saída') ${type}`,
    src.params, p, `${sort} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, id`, reader);
  return { ...r, reliability: "EM_RECONCILIACAO" as const, reason: note };
}

export async function cashChart(f: Filters, reader: Reader = q, schema?: SchemaSnapshot) {
  const profile = await scopedProfile(f, reader, schema);
  if (!profile.parent) throw new SourceLimitation("Vínculo-pai financeiro não reconhecido.");
  const src = cashSource(f, profile);
  const rows = await reader(`WITH source AS (${src.sql}) SELECT
    to_char(payment_date::timestamptz AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS label,
    sum(valor) FILTER (WHERE tipo = 'Entrada')::float8 AS entradas,
    sum(valor) FILTER (WHERE tipo = 'Saída')::float8 AS saidas FROM source
    WHERE standalone AND valor IS NOT NULL AND payment_date::timestamptz <= CURRENT_TIMESTAMP
      AND tipo IN ('Entrada','Saída') GROUP BY 1 ORDER BY 1`, src.params);
  return { series: ["entradas", "saidas"], points: rows, reliability: "EM_RECONCILIACAO" as const, reason: note };
}

type CashDimension = "client" | "group" | "category";
async function dimensionSource(f: Filters, dim: CashDimension, type: "Entrada" | "Saída", reader: Reader, provided?: SchemaSnapshot) {
  assertCashFilters(f);
  const snapshot = provided ?? await runtimeSchema();
  const profile = await scopedProfile(f, reader, snapshot);
  let join = "";
  let key = "s.category_id::text";
  if (dim === "category") {
    if (!profile.hasCategory) throw new SourceLimitation("Categoria financeira sem chave comprovada.");
  } else {
    if (!profile.hasJob) throw new SourceLimitation("Associação financeira ao job não comprovada.");
    const field = dim === "client" ? "client_id" : "client_group_id";
    validateStatement(snapshot, `SELECT j.iclips_id,j.${field} FROM core.jobs j`);
    await validateJobIdentity(snapshot, reader);
    join = "LEFT JOIN core.jobs j ON j.iclips_id=s.job_id";
    key = `j.${field}::text`;
  }
  const src = cashSource(f, profile);
  const table = dim === 'category' ? 'financial_categories' : dim === 'client' ? 'clients' : 'client_groups';
  return { params: [...src.params, type], sql: `WITH source AS (${src.sql}), grouped AS (
    SELECT ${key} AS entity_id, CASE WHEN ${key} IS NULL THEN 'Sem vínculo' ELSE ${nameSQL(snapshot,table,'iclips_id',key,'Cadastro sem nome')} END AS label, sum(s.valor)::numeric AS amount,
      count(*) FILTER (WHERE s.valor<0)::int AS negatives FROM source s ${join}
    WHERE s.standalone AND s.valor IS NOT NULL AND s.payment_date::timestamptz<=CURRENT_TIMESTAMP AND s.tipo=$${src.params.length+1}
    GROUP BY ${key}
  ) SELECT entity_id,label,amount::float8 AS amount, sum(amount) OVER()::float8 AS total_amount,
    sum(negatives) OVER()::int AS negatives FROM grouped` };
}
const dimensionCharts: Record<string, [CashDimension, "Entrada" | "Saída"]> = {
  top_clientes_receita: ["client","Entrada"], concentracao_receita: ["client","Entrada"],
  receita_por_grupo: ["group","Entrada"], receita_por_categoria: ["category","Entrada"], despesas_por_categoria: ["category","Saída"],
};
export const CASH_DIMENSION_CHARTS = Object.keys(dimensionCharts);
export async function cashDimensionChart(id: string, f: Filters, reader: Reader = q, snapshot?: SchemaSnapshot) {
  const [dim, type] = dimensionCharts[id];
  const src = await dimensionSource(f,dim,type,reader,snapshot);
  const rows = await reader(`SELECT * FROM (${src.sql}) grouped ORDER BY amount DESC NULLS LAST, label LIMIT 50`, src.params);
  const concentration = id === 'concentracao_receita';
  if (concentration && rows.some(r => Number(r.negatives)>0 || Number(r.total_amount)<=0)) throw new SourceLimitation("Participação indisponível com negativos ou total não positivo; sinais não são convertidos por ABS.");
  return { series: ["movimento"], points: rows.map(r => ({label:String(r.label), movimento:concentration ? Number(r.amount)/Number(r.total_amount) : Number(r.amount)})),
    reliability:"EM_RECONCILIACAO" as const, reason: note + " Associação atual pelas chaves do job ou categoria; sem vínculo fica em grupo separado. Participação considera todos os grupos, inclusive sem vínculo." };
}
export async function cashClientTable(f: Filters, p: Page, reader: Reader = q, snapshot?: SchemaSnapshot) {
  const src = await dimensionSource(f,"client","Entrada",reader,snapshot);
  const sort = p.sort ?? "recebido";
  if (!["cliente", "recebido", "participacao"].includes(sort)) throw new SourceLimitation("Coluna financeira sem mapeamento nesta tabela preliminar.");
  const r = await paginate(`SELECT entity_id AS cliente_id, label AS cliente, amount AS recebido,
    CASE WHEN negatives=0 AND total_amount>0 THEN amount/total_amount ELSE NULL END AS participacao FROM (${src.sql}) grouped`,
    src.params,p,`${sort} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST, cliente`,reader);
  return {...r,reliability:"EM_RECONCILIACAO" as const,reason:note + " Recebido representa somente Entradas isoladas. Faturamento, grupo e valores em aberto não foram atribuídos. Participação fica ausente se houver negativos."};
}
const drePolicy=z.object({approved:z.literal(true),revenue:z.array(z.string().min(1)).min(1).optional(),expense:z.array(z.string().min(1)).min(1).optional()}).strict();
export async function classifiedCash(id:string,f:Filters,reader:Reader=q,provided?:SchemaSnapshot):Promise<Computed> {
  let policy:z.infer<typeof drePolicy>;
  try {
    policy=drePolicy.parse(JSON.parse(process.env.FINANCIAL_DRE_POLICY??''));
    const labels=[...(policy.revenue??[]),...(policy.expense??[])];
    if (new Set(labels).size!==labels.length) throw new Error();
  } catch {throw new SourceLimitation('Critério gerencial pendente: dre_indicator exige classificação operacional explícita e aprovada, sem códigos presumidos.');}
  const snapshot=provided??await runtimeSchema(),profile=await scopedProfile(f,reader,snapshot);
  if (!profile.hasCategory || !['iclips_id','dre_indicator'].every(column=>snapshot.columns.some(c=>c.schema==='core'&&c.table==='financial_categories'&&c.column===column))) throw new SourceLimitation('Campo ausente: categoria financeira e dre_indicator não comprovados.');
  const src=cashSource(f,profile),revenue=id==='receita_recebida',labels=revenue?policy.revenue:policy.expense;
  if (!labels) throw new SourceLimitation('Critério gerencial pendente: classificação DRE específica não foi aprovada.');
  const [r]=await reader(`WITH source AS (${src.sql}), categories AS (
    SELECT iclips_id,CASE WHEN count(*)=1 THEN max(dre_indicator::text) END AS classification FROM core.financial_categories GROUP BY iclips_id
  ), eligible AS (SELECT s.*,c.classification FROM source s LEFT JOIN categories c ON c.iclips_id::text=s.category_id::text
    WHERE standalone AND valor IS NOT NULL AND payment_date::timestamptz<=CURRENT_TIMESTAMP AND tipo=$${src.params.length+1})
    SELECT sum(valor) FILTER (WHERE classification=ANY($${src.params.length+2}::text[]))::float8 AS value,
      count(*) FILTER (WHERE classification=ANY($${src.params.length+2}::text[]))::int AS used,count(*)::int AS total FROM eligible`,[...src.params,revenue?'Entrada':'Saída',labels]);
  return {value:r.value,recordsUsed:Number(r.used),recordsExcluded:Number(r.total)-Number(r.used),reliability:'EM_RECONCILIACAO',temporalField:'payment_date',
    reason:'Subconjunto de movimentações isoladas classificado pelo dre_indicator conforme política gerencial aprovada; categorias ausentes/ambíguas/não classificadas excluídas. Não certifica resultado operacional ou rentabilidade.',
    coverage:`${r.used}/${r.total} movimentações da direção financeira classificadas.`,insufficient:r.value==null?'Nenhuma movimentação com classificação operacional aprovada no período.':undefined};
}
export async function costCenterLinks(f:Filters,p:Page,reader:Reader=q,provided?:SchemaSnapshot) {
  const s=provided??await runtimeSchema(),profile=await scopedProfile(f,reader,s);
  const center=s.columns.some(c=>c.schema==='core'&&c.table==='financial_entry_cost_centers'&&c.column==='source_center_id')?'source_center_id':'cost_center_id';
  if (!['financial_entry_id',center].every(column=>s.columns.some(c=>c.schema==='core'&&c.table==='financial_entry_cost_centers'&&c.column===column))) throw new SourceLimitation('Campo ausente: chaves explícitas dos vínculos de centros de custo não disponíveis.');
  const src=cashSource(f,profile),sort=p.sort??'data';
  if (!['data','tipo','valor','centros'].includes(sort)) throw new SourceLimitation('Coluna de vínculo não disponível para ordenação.');
  const r=await paginate(`WITH source AS (${src.sql}), links AS (
    SELECT financial_entry_id::text AS entry_key,count(DISTINCT ${center})::int AS centros
    FROM core.financial_entry_cost_centers GROUP BY financial_entry_id::text
  ) SELECT s.iclips_id AS id,s.payment_date AS data,s.tipo,s.valor,coalesce(l.centros,0) AS centros,
    CASE WHEN l.centros>0 THEN 'Vínculos presentes; rateio monetário não comprovado' ELSE 'Sem vínculo disponível' END AS situacao
    FROM source s LEFT JOIN links l ON l.entry_key=s.iclips_id::text
    WHERE s.standalone AND s.valor IS NOT NULL AND s.payment_date::timestamptz<=CURRENT_TIMESTAMP AND s.tipo IN ('Entrada','Saída')`,src.params,p,`${sort} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,id`,reader);
  return {...r,reliability:'EM_RECONCILIACAO' as const,reason:'Uma linha por movimentação; amount não é repartido nem somado por centro. Quantidade de vínculos não comprova percentual/valor de rateio ou natureza direta/indireta.'};
}
