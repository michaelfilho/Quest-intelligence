import type { Filters } from '../../shared/contracts.js';
import {q} from './db.js';
import {numericTypes,type Reader,type SchemaSnapshot} from './schema.js';
import {schemaFor} from './presentation.js';
import {cashSource,scopedProfile} from './cash.js';
import {paginate} from './analytics.js';
import {SourceLimitation} from './source-errors.js';
import type {Computed,Page} from './mappings.js';
const note='Rateio de Saídas isoladas por payment_date. Cada lançamento é validado conjuntamente: identidade de centro sem duplicidade, valores finitos não negativos, percentuais entre 0 e 100, soma monetária exata ao original e soma percentual exatamente 100; cada parcela deve corresponder ao percentual com arredondamento em centavos. Valores ausentes/divergentes não são redistribuídos. Não classifica custo direto/indireto.';
export async function allocationTarget(s:SchemaSnapshot,reader:Reader):Promise<'id'|'iclips_id'>{
  const candidates=(['iclips_id','id'] as const).filter(column=>s.columns.some(c=>c.schema==='core'&&c.table==='financial_entries'&&c.column===column));
  const declared=candidates.filter(target=>s.constraints.some(c=>c.schema==='core'&&c.table==='financial_entry_cost_centers'&&c.type==='f'&&new RegExp(`FOREIGN KEY \\(financial_entry_id\\).*REFERENCES (?:core\\.)?financial_entries\\(${target}\\)`).test(c.def.replaceAll('"',''))));
  const configured=process.env.FINANCIAL_ALLOCATION_TARGET;
  if(configured&&(!candidates.includes(configured as 'id')||(declared.length&&!declared.includes(configured as 'id'))))throw new SourceLimitation('Relacionamento inválido: namespace de rateio configurado ausente ou conflitante.');
  let selected=configured as 'id'|'iclips_id'|undefined;
  if(!selected&&declared.length===1)selected=declared[0];
  if(!selected&&candidates.length===1)selected=candidates[0];
  if(!selected){
    const matches=await Promise.all(candidates.map(async target=>{const [r]=await reader(`SELECT count(*)::int AS matched FROM core.financial_entry_cost_centers a WHERE EXISTS(SELECT 1 FROM core.financial_entries f WHERE f.${target}::text=a.financial_entry_id::text)`,[]);return {target,n:Number(r.matched)};}));
    const linked=matches.filter(m=>m.n>0);
    if(linked.length===1)selected=linked[0].target;
    else if(!linked.length){const [r]=await reader('SELECT count(*)::int AS n FROM core.financial_entry_cost_centers',[]);if(!Number(r.n))selected='iclips_id';}
    else {
      const [r]=await reader(`WITH keys AS (SELECT DISTINCT financial_entry_id::text AS key FROM core.financial_entry_cost_centers),
        internal AS (SELECT id::text AS key,array_agg(iclips_id::text ORDER BY iclips_id::text) AS refs FROM core.financial_entries GROUP BY id::text),
        source AS (SELECT iclips_id::text AS key,array_agg(iclips_id::text ORDER BY iclips_id::text) AS refs FROM core.financial_entries GROUP BY iclips_id::text)
        SELECT EXISTS(SELECT 1 FROM keys k LEFT JOIN internal i USING(key) LEFT JOIN source s USING(key) WHERE i.refs IS DISTINCT FROM s.refs) AS ambiguous`,[]);
      if(!r.ambiguous)selected='iclips_id';
    }
  }
  if(!selected)throw new SourceLimitation('Relacionamento de rateio ambíguo ou sem evidência: validar financial_entry_id em id/iclips_id; FK não é obrigatória.');
  if(selected==='id'){
    const [r]=await reader('SELECT EXISTS(SELECT 1 FROM core.financial_entries WHERE id IS NOT NULL GROUP BY id HAVING count(*)>1) AS duplicate',[]);
    if(r.duplicate)throw new SourceLimitation('Relacionamento de rateio inválido: identidade interna duplicada.');
  }
  return selected;
}
export async function allocationSource(f:Filters,reader:Reader=q) {
  const s=await schemaFor(reader),profile=await scopedProfile(f,reader,s);
  const cols=s.columns.filter(c=>c.schema==='core'&&c.table==='financial_entry_cost_centers');
  if(!['financial_entry_id','source_center_id'].every(column=>cols.some(c=>c.column===column)))throw new SourceLimitation('Campo ausente: financial_entry_id/source_center_id dos centros de custo.');
  const target=await allocationTarget(s,reader);
  const amount=cols.some(c=>c.column==='amount'&&numericTypes.has(c.type))?'a.amount::numeric':'NULL::numeric';
  const percentage=cols.some(c=>c.column==='percentage'&&numericTypes.has(c.type))?'a.percentage::numeric':'NULL::numeric';
  const name=cols.some(c=>c.column==='name')?"coalesce(nullif(btrim(a.name::text),''),'Centro sem nome')":"'Centro sem nome'::text";
  const links=`SELECT a.financial_entry_id::text AS entry_key,a.source_center_id::text AS center_key,${name} AS name,${amount} AS amount,${percentage} AS percentage FROM core.financial_entry_cost_centers a`;
  const src=cashSource(f,profile);
  return {params:src.params,links,sql:`WITH source AS (${src.sql}), paid AS (
    SELECT *,${target==='id'?'row_id':'iclips_id::text'} AS financial_key FROM source WHERE standalone AND tipo='Saída' AND valor IS NOT NULL AND payment_date::timestamptz<=CURRENT_TIMESTAMP
  ), links AS (${links}), checks AS (
    SELECT l.entry_key,count(*)::int AS links,count(DISTINCT center_key)::int AS centers,sum(amount) AS allocated,sum(percentage) AS percent,
      count(*) FILTER (WHERE center_key IS NULL OR btrim(center_key)='' OR amount IS NULL OR percentage IS NULL
        OR amount::text IN ('NaN','Infinity','-Infinity') OR percentage::text IN ('NaN','Infinity','-Infinity')
        OR amount<0 OR percentage<0 OR percentage>100)::int AS invalid,
      count(*) FILTER (WHERE round(amount,2)<>round(p.valor*percentage/100,2))::int AS mismatched
    FROM links l JOIN paid p ON p.financial_key=l.entry_key GROUP BY l.entry_key
  ) SELECT p.*,coalesce(c.links,0) AS links,coalesce(c.centers,0) AS centers,c.allocated,c.percent,
    CASE WHEN c.links IS NULL THEN 'Sem rateio'
      WHEN c.invalid>0 THEN 'Campos ausentes ou inválidos'
      WHEN c.centers<>c.links THEN 'Centro duplicado'
      WHEN p.valor<0 THEN 'Sinal monetário pendente'
      WHEN c.allocated<>p.valor THEN 'Soma monetária divergente'
      WHEN c.percent<>100 THEN 'Soma percentual divergente'
      WHEN c.mismatched>0 THEN 'Valor incompatível com percentual'
      ELSE 'Conciliado' END AS allocation_status
    FROM paid p LEFT JOIN checks c ON c.entry_key=p.financial_key`};
}
export const ALLOCATION_METRICS=['despesas_rateadas','despesas_sem_rateio','despesas_rateio_divergente'];
export async function allocationMetric(id:string,f:Filters,reader:Reader=q):Promise<Computed> {
  const src=await allocationSource(f,reader);
  const states={despesas_rateadas:"allocation_status='Conciliado'",despesas_sem_rateio:"allocation_status='Sem rateio'",rateios_divergentes:"allocation_status NOT IN ('Conciliado','Sem rateio')"};
  const key=id==='despesas_rateadas'||id==='despesas_sem_rateio'?id:'rateios_divergentes';
  const fields=Object.entries(states).flatMap(([key,predicate])=>[`sum(valor) FILTER(WHERE ${predicate})::float8 AS v_${key}`,`count(*) FILTER(WHERE ${predicate})::int AS n_${key}`]);
  const [summary]=await reader(`WITH source AS (${src.sql}) SELECT ${fields.join(',')},count(*)::int AS total FROM source`,src.params);
  const r={value:summary[`v_${key}`],used:summary[`n_${key}`],total:summary.total};
  return {value:Number(r.total)>0?Number(r.value??0):null,recordsUsed:Number(r.used),recordsExcluded:Number(r.total)-Number(r.used),reliability:'EM_RECONCILIACAO',reason:note,temporalField:'payment_date',coverage:`${r.used}/${r.total} lançamentos nesta situação.`,insufficient:!Number(r.total)?'Sem saídas elegíveis no período.':undefined};
}
export async function allocationChart(f:Filters,reader:Reader=q) {
  const src=await allocationSource(f,reader);
  const rows=await reader(`WITH entries AS (${src.sql}), links AS (${src.links}) SELECT l.center_key AS entity_id,
    string_agg(DISTINCT l.name,' / ') AS label,sum(l.amount)::float8 AS despesa FROM entries e JOIN links l ON l.entry_key=e.financial_key
    WHERE e.allocation_status='Conciliado' GROUP BY l.center_key ORDER BY despesa DESC,l.center_key LIMIT 50`,src.params);
  return {series:['despesa'],points:rows,reliability:'EM_RECONCILIACAO' as const,reason:note};
}
export async function allocationTable(f:Filters,p:Page,reader:Reader=q) {
  const src=await allocationSource(f,reader),sort=p.sort??'data';
  if(!['data','valor','rateado','percentual','centros','situacao'].includes(sort))throw new SourceLimitation('Coluna de rateio indisponível.');
  return {...await paginate(`WITH source AS (${src.sql}) SELECT iclips_id AS id,payment_date AS data,tipo,valor,allocated AS rateado,percent AS percentual,
    centers AS centros,allocation_status AS situacao FROM source`,src.params,p,`${sort} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,id`,reader),reliability:'EM_RECONCILIACAO' as const,reason:note};
}
