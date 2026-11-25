// CPF/CNPJ numéricos: normalização conservadora e dígitos verificadores em SELECTs.
// Letras/outros formatos ficam sem vínculo; não remover letras para fabricar um documento.
export const normalizedDocument=(expression:string)=>`CASE WHEN (${expression})::text ~ '^[0-9./[:space:]-]+$' THEN regexp_replace((${expression})::text,'[^0-9]','','g') END`;
export function validDocument(d:string) {
  const sum=(length:number,weights:string)=>`(SELECT sum(substring(${d} FROM k FOR 1)::int*(${weights})) FROM generate_series(1,${length}) k)`;
  const digit=(sum:string)=>`CASE WHEN mod((${sum}),11)<2 THEN 0 ELSE 11-mod((${sum}),11) END`;
  const cpf1=digit(sum(9,'11-k')),cpf2=digit(sum(10,'12-k'));
  const cnpj1=digit(sum(12,'CASE WHEN k<=4 THEN 6-k ELSE 14-k END'));
  const cnpj2=digit(sum(13,'CASE WHEN k<=5 THEN 7-k ELSE 15-k END'));
  // CASE impede casts de valores com formato não suportado.
  return `CASE WHEN ${d} ~ '^[0-9]{11}$' AND ${d}<>repeat(left(${d},1),11) THEN
    substring(${d} FROM 10 FOR 1)::int=${cpf1} AND substring(${d} FROM 11 FOR 1)::int=${cpf2}
    WHEN ${d} ~ '^[0-9]{14}$' AND ${d}<>repeat(left(${d},1),14) THEN
    substring(${d} FROM 13 FOR 1)::int=${cnpj1} AND substring(${d} FROM 14 FOR 1)::int=${cnpj2} ELSE FALSE END`;
}
export const documentClientsCTE=()=>`/* invoice_document_link */ document_candidates AS (
  SELECT c.iclips_id,${normalizedDocument('c.document')} AS doc FROM core.clients c
), document_clients AS (
  SELECT doc,count(*)::int AS candidates,CASE WHEN count(*)=1 THEN max(iclips_id) END AS client_id
  FROM document_candidates WHERE ${validDocument('doc')} GROUP BY doc
)`;
