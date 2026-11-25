import type { Filters } from '../../shared/contracts.js';
import { analyticsQuery,prepareStatement,type Reader } from './schema.js';
import { schemaFor,nameSQL } from './presentation.js';
import { sourceStatement,paginate } from './analytics.js';
import { documentClientsCTE,normalizedDocument } from './documents.js';
import { SourceLimitation } from './source-errors.js';
import type { Page,Computed } from './mappings.js';

export async function invoiceLinkSource(f:Filters,reader:Reader=analyticsQuery) {
  const s=await schemaFor(reader),src=sourceStatement('invoices',{...f,client:undefined});
  if(f.client)src.params.push(f.client);
  const sql=`WITH ${documentClientsCTE()}, invoices AS (${src.sql}) SELECT i.*,d.client_id,
    CASE WHEN d.candidates=1 THEN 'Vínculo unívoco' WHEN d.candidates>1 THEN 'Documento ambíguo' ELSE 'Sem vínculo válido' END AS association
    FROM invoices i LEFT JOIN document_clients d ON d.doc=${normalizedDocument('i.client_document')} ${f.client?`WHERE d.candidates=1 AND d.client_id::text=$${src.params.length}`:''}`;
  return {s,params:src.params,sql:prepareStatement(s,sql)};
}
export const INVOICE_LINK_METRICS=['notas_vinculadas','notas_ambiguas','notas_sem_vinculo','faturamento_clientes_vinculados'];
const note='Associação exclusiva por CPF/CNPJ numérico normalizado com dígitos verificadores e um único cadastro candidato. Ambíguos, documentos inválidos/formatos não suportados e ausentes permanecem separados. Não distribui valores. Notas canceladas não integram faturamento.';
const eligible="status='issued' AND issued_at::timestamptz<=CURRENT_TIMESTAMP";
export async function invoiceLinkMetric(id:string,f:Filters,reader:Reader=analyticsQuery):Promise<Computed> {
  const src=await invoiceLinkSource(f,reader);
  const state=id==='notas_ambiguas'?'Documento ambíguo':id==='notas_sem_vinculo'?'Sem vínculo válido':'Vínculo unívoco';
  const monetary=id==='faturamento_clientes_vinculados';
  const [r]=await reader(`WITH source AS (${src.sql}) SELECT ${monetary?'sum(service_amount)::float8':'count(*)::int'} AS value,
    count(*)::int AS used,(SELECT count(*) FROM source WHERE ${eligible})::int AS total FROM source
    WHERE ${eligible} AND association=$${src.params.length+1} ${monetary?"AND service_amount IS NOT NULL AND service_amount::text NOT IN ('NaN','Infinity','-Infinity')":''}`,[...src.params,state]);
  return {value:r.value,recordsUsed:Number(r.used),recordsExcluded:Number(r.total)-Number(r.used),reliability:'PARCIAL',temporalField:'issued_at',reason:note,
    coverage:`${r.used}/${r.total} notas emitidas no subconjunto consultado.`,insufficient:r.value==null?'Sem valores de notas com vínculo unívoco.':undefined};
}
export async function invoiceClientTable(f:Filters,p:Page,reader:Reader=analyticsQuery) {
  const src=await invoiceLinkSource(f,reader),sort=p.sort??'faturado';
  if(!['cliente','faturado','notas'].includes(sort))throw new SourceLimitation('Coluna de faturamento não disponível.');
  return {...await paginate(`WITH source AS (${src.sql}), grouped AS (SELECT client_id,sum(service_amount)::numeric AS faturado,count(*)::int AS notas
    FROM source WHERE ${eligible} AND association='Vínculo unívoco' AND service_amount IS NOT NULL AND service_amount::text NOT IN ('NaN','Infinity','-Infinity') GROUP BY client_id)
    SELECT client_id AS cliente_id,${nameSQL(src.s,'clients','iclips_id','g.client_id','Cliente sem nome')} AS cliente,faturado,notas FROM grouped g`,src.params,p,`${sort} ${p.dir==='asc'?'ASC':'DESC'} NULLS LAST,cliente_id`,reader),reason:note};
}
export async function invoiceLinkTable(f:Filters,p:Page,reader:Reader=analyticsQuery,association?:'Documento ambíguo'|'Sem vínculo válido') {
  const src=await invoiceLinkSource(f,reader),sort=p.sort??'emissao';
  if(!['emissao','numero','cliente','valor','situacao','vinculo'].includes(sort))throw new SourceLimitation('Coluna de nota não disponível.');
  if(association)src.params.push(association);
  return {...await paginate(`WITH source AS (${src.sql}) SELECT iclips_id AS id,invoice_number AS numero,issued_at AS emissao,
    CASE WHEN association='Vínculo unívoco' THEN ${nameSQL(src.s,'clients','iclips_id','source.client_id','Cliente sem nome')} WHEN nullif(btrim(client_name),'') IS NOT NULL AND btrim(client_name)!~'^[0-9]+$' THEN client_name ELSE 'Cliente da nota sem nome' END AS cliente,
    service_amount AS valor,status AS situacao,association AS vinculo,client_id AS cliente_id FROM source WHERE issued_at::timestamptz<=CURRENT_TIMESTAMP ${association?`AND association=$${src.params.length}`:''}`,src.params,p,`${sort} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,id`,reader),reason:note};
}
