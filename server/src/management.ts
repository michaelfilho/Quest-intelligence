import type {Filters} from '../../shared/contracts.js';
import {sourceStatement,eligibleTime,paginate,type Query} from './analytics.js';
import {analyticsQuery,numericTypes,temporalTypes} from './schema.js';
import {schemaFor,labelledTime,registryJoin} from './presentation.js';
import {dreSource,dreMonthlyTable} from './dre.js';
import {invoiceLinkSource} from './invoice-links.js';
import {activitySource} from './activities.js';
import {cashSource,scopedProfile} from './cash.js';
import {SourceLimitation} from './source-errors.js';
import type {Page} from './mappings.js';
import {TABLES} from '../../shared/catalog.js';
import {dataPermission} from './performance.js';

const shifted=(sql:string,offset:number)=>sql.replace(/\$(\d+)/g,(_s,n)=>'$'+(Number(n)+offset));
const note='Componentes independentes: faturamento por emissão e documento unívoco; recebimento/despesas operacionais por pagamento e projeto; custo e horas por apontamento. Não somar custo de pessoal às despesas nem presumir margem completa. Cadastros sem movimento mantêm valores ausentes. Estimativas integrais de atividades não são rateadas por colaborador/departamento.';

export async function entitySummary(kind:'client'|'project'|'group',f:Filters,p:Page,reader:Query=analyticsQuery){
  const table=TABLES[kind==='client'?'gestao_clientes':kind==='group'?'projetos_por_cliente':'gestao_projetos'];
  if(p.sort&&!table.columns.some(c=>c.key===p.sort))throw new SourceLimitation('Coluna de ordenação indisponível.');
  const s=await schemaFor(reader),has=(table:string,column:string)=>s.columns.some(c=>c.schema==='core'&&c.table===table&&c.column===column);
  const cost=s.columns.some(c=>c.schema==='core'&&c.table==='time_entries'&&c.column==='labor_cost'&&numericTypes.has(c.type));
  const time=sourceStatement('time',f,undefined,cost),params=[...time.params],ctes:string[]=[];
  if(cost&&dataPermission('custos_pessoal.view')===false)time.sql=time.sql.replace('t.labor_cost,','NULL::numeric AS labor_cost,');
  const add=(sql:string,args:unknown[])=>{const text=shifted(sql,params.length);params.push(...args);return text;};
  const limitations:string[]=[];
  ctes.push(`time_base AS (${time.sql}),time_names AS (${labelledTime('SELECT * FROM time_base',s)}),worked AS (
    SELECT job_id,client_id,max(job_name) AS projeto,max(client_name) AS cliente,string_agg(DISTINCT department_name,', ') AS departamento,
      count(DISTINCT employee_id)::int AS colaboradores,sum(seconds)/3600.0 AS horas,
      sum(seconds) FILTER(WHERE is_rework IS TRUE)/3600.0 AS horas_retrabalho,
      ${cost?"sum(labor_cost) FILTER(WHERE labor_cost::text NOT IN ('NaN','Infinity','-Infinity'))":'NULL::numeric'} AS custo_registrado
    FROM time_names WHERE ${eligibleTime} GROUP BY job_id,client_id)`);
  let paid=false,billed=false,planned=false;
  if(kind!=='group'&&dataPermission('financeiro.view')!==false)try{
    const source=await dreSource(f,reader);
    ctes.push(`paid_source AS (${add(source.sql,source.params)}),paid AS (
      SELECT job_id::text AS job_key,sum(valor) FILTER(WHERE tipo='Entrada' AND classification='RECEITAS OPERACIONAIS') AS recebido,
      sum(valor) FILTER(WHERE tipo='Saída' AND classification IN ('DESPESAS OPERACIONAIS CUSTO FIXO','DESPESAS OPERACIONAIS CUSTO VARIÁVEL')) AS despesas
      FROM paid_source GROUP BY job_id::text)`);paid=true;
  }catch(e){if(!(e instanceof SourceLimitation))throw e;limitations.push('Recebimento e despesas não atribuíveis neste escopo.');}
  if(kind==='client'){
    if(dataPermission('financeiro.view')!==false)try{
      if(!has('invoices','client_document')||!has('clients','document'))throw new SourceLimitation('Documento não integrado.');
      const invoices=await invoiceLinkSource(f,reader);
      ctes.push(`billed_source AS (${add(invoices.sql,invoices.params)}),billed AS (SELECT client_id::text AS client_key,sum(service_amount) AS faturado FROM billed_source
        WHERE association='Vínculo unívoco' AND status='issued' AND issued_at::timestamptz<=CURRENT_TIMESTAMP AND service_amount IS NOT NULL AND service_amount::text NOT IN ('NaN','Infinity','-Infinity') GROUP BY client_id::text)`);billed=true;
    }catch(e){if(!(e instanceof SourceLimitation))throw e;limitations.push('Faturamento por cliente não atribuível neste escopo.');}
    ctes.push(`client_work AS (SELECT client_id::text AS id,count(DISTINCT job_id)::int AS projetos,sum(horas) AS horas,sum(custo_registrado) AS custo_registrado FROM worked GROUP BY client_id::text)`);
    if(paid)ctes.push(`client_paid AS (SELECT jr.client_id::text AS id,sum(p.recebido) AS recebido,sum(p.despesas) AS despesas FROM paid p JOIN core.jobs jr ON jr.iclips_id::text=p.job_key GROUP BY jr.client_id::text)`);
    const narrow=!!(f.department||f.employee||f.project||f.group||f.status||f.service);
    let registry='';
    if(has('clients','iclips_id')&&!narrow){
      let where='';if(f.client){params.push(f.client);where=`WHERE iclips_id::text=$${params.length}`;}
      registry=`UNION SELECT iclips_id::text FROM core.clients ${where}`;
    }
    ctes.push(`keys AS (SELECT id FROM client_work ${paid?'UNION SELECT id FROM client_paid':''} ${billed?'UNION SELECT client_key FROM billed':''} ${registry})`);
    const names=registryJoin(s,'clients','iclips_id','k.id','cn','Cliente sem nome');
    const movement=`(w.id IS NOT NULL${paid?' OR p.recebido IS NOT NULL OR p.despesas IS NOT NULL':''}${billed?' OR b.client_key IS NOT NULL':''})`;
    const activityWhere=p.clientActivity==='active'?` AND ${movement}`:p.clientActivity==='inactive'?` AND NOT ${movement}`:'';
    const activityNote=p.clientActivity?' Atividade considera movimentação visível no período e nas permissões atuais; não representa situação cadastral de ativação/desativação.':'';
    return {...await paginate(`WITH ${ctes.join(',')} SELECT k.id,${names.value} AS cliente,w.projetos,w.horas,w.custo_registrado,
      ${billed?'b.faturado':'NULL::numeric AS faturado'},${paid?'p.recebido,p.despesas':'NULL::numeric AS recebido,NULL::numeric AS despesas'},NULL::numeric AS resultado,NULL::numeric AS margem
      FROM keys k LEFT JOIN client_work w ON w.id=k.id ${names.join} ${paid?'LEFT JOIN client_paid p ON p.id=k.id':''} ${billed?'LEFT JOIN billed b ON b.client_key=k.id':''} WHERE k.id IS NOT NULL${activityWhere}`,params,p,`${p.sort??'cliente'} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,id`,reader),reason:[note,...limitations].join(' ')+activityNote};
  }
  if(kind==='project'&&!f.department&&!f.employee){
    try{
      const source=await activitySource(f,reader,{sql:'SELECT * FROM time_base',params:time.params});
      ctes.push(`planned AS (${source.sql} SELECT project_id::text AS job_key,sum(planned) AS horas_previstas FROM activities GROUP BY project_id::text)`);planned=true;
    }catch(e){if(!(e instanceof SourceLimitation))throw e;limitations.push('Estimativas sem vínculo comprovado não são exibidas.');}
  }
  const registered=!f.department&&!f.employee&&s.columns.some(c=>c.schema==='core'&&c.table==='jobs'&&c.column==='entered_at'&&temporalTypes.has(c.type));
  if(registered){
    const jobs=sourceStatement('jobs',{...f,department:undefined,employee:undefined});
    // Cadastro precisa somente de identidade/data/filtros: não exigir conclusão para listar horas.
    const sql=jobs.sql.replace(/^SELECT[\s\S]*?FROM core\.jobs j\b/,'SELECT j.iclips_id FROM core.jobs j');
    ctes.push(`registered AS (${add(sql,jobs.params)})`);
  }else if(!f.department&&!f.employee)limitations.push('Data de cadastro não integrada; listagem restrita a projetos com atividade ou movimentação comprovada.');
  ctes.push(`keys AS (SELECT job_id::text AS id FROM worked ${registered?'UNION SELECT iclips_id::text FROM registered':''} ${paid?'UNION SELECT job_key FROM paid':''})`);
  const project=registryJoin(s,'jobs','iclips_id','k.id','jn','Projeto sem nome',['client_id','principal_employee_id','expected_end_at','status_text']);
  const client=registryJoin(s,'clients','iclips_id',project.extras.client_id,'cn','Cliente sem nome');
  const employee=registryJoin(s,'employees','iclips_id',project.extras.principal_employee_id,'en','');
  const identified=has('jobs','iclips_id')?'jn.entity_key IS NOT NULL':'FALSE';
  const sql=`WITH ${ctes.join(',')} SELECT k.id,${project.value} AS projeto,${project.extras.client_id} AS cliente_id,${client.value} AS cliente,
    nullif(${employee.value},'') AS responsavel,w.departamento,${project.extras.status_text} AS status,${project.extras.expected_end_at} AS prazo,
    w.horas,w.horas_retrabalho,w.custo_registrado,${planned?'p.horas_previstas':'NULL::numeric AS horas_previstas'},
    ${paid?`CASE WHEN ${identified} THEN f.recebido END AS recebido,CASE WHEN ${identified} THEN f.despesas END AS despesas`:'NULL::numeric AS recebido,NULL::numeric AS despesas'},NULL::numeric AS resultado,NULL::numeric AS margem
    FROM keys k ${project.join} ${client.join} ${employee.join} LEFT JOIN worked w ON w.job_id::text=k.id ${planned?'LEFT JOIN planned p ON p.job_key=k.id':''} ${paid?'LEFT JOIN paid f ON f.job_key=k.id':''} WHERE k.id IS NOT NULL`;
  const grouped=kind==='group'?`SELECT cliente_id, max(cliente) AS cliente,count(DISTINCT id)::int AS projetos,sum(horas) AS horas,sum(horas_retrabalho) AS horas_retrabalho,sum(custo_registrado) AS custo_registrado FROM (${sql}) projects GROUP BY cliente_id`:sql;
  return {...await paginate(grouped,params,p,`${p.sort??(kind==='group'?'cliente':'projeto')} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST,${kind==='group'?'cliente_id':'id'}`,reader),reason:[note,...limitations].join(' ')};
}
export async function cashPeriods(unit:'day'|'month',f:Filters,p:Page,reader:Query=analyticsQuery){
  if(p.sort&&!['periodo','entrada','saida','saldo'].includes(p.sort))throw new SourceLimitation('Coluna de ordenação indisponível.');
  const profile=await scopedProfile(f,reader,await schemaFor(reader)),src=cashSource(f,profile);
  const sql=`WITH source AS (${src.sql}) SELECT to_char(payment_date::timestamptz AT TIME ZONE 'America/Sao_Paulo','${unit==='day'?'YYYY-MM-DD':'YYYY-MM'}') AS periodo,
    sum(valor) FILTER(WHERE tipo='Entrada') AS entrada,sum(valor) FILTER(WHERE tipo='Saída') AS saida,
    CASE WHEN count(*) FILTER(WHERE valor<0)=0 THEN sum(valor) FILTER(WHERE tipo='Entrada')-sum(valor) FILTER(WHERE tipo='Saída') END AS saldo
    FROM source WHERE standalone AND valor IS NOT NULL AND payment_date::timestamptz<=CURRENT_TIMESTAMP AND tipo IN ('Entrada','Saída') GROUP BY 1`;
  return {...await paginate(sql,src.params,p,`${p.sort??'periodo'} ${p.dir==='desc'?'DESC':'ASC'} NULLS LAST`,reader),reliability:'EM_RECONCILIACAO' as const,reason:'Movimentações realizadas e isoladas. Não é saldo bancário nem lucro. Ausência de entrada/saída não comprova saldo. Sinais negativos impedem saldo até conciliação.'};
}
export async function resultEvolution(f:Filters,reader:Query=analyticsQuery){
  const r=await dreMonthlyTable(f,{page:1,pageSize:200,sort:'mes',dir:'asc'},reader);
  return {series:['resultado'],points:r.rows.map(row=>({label:String(row.mes),resultado:row.resultado==null?null:Number(row.resultado)})),reliability:r.reliability,reason:r.reason};
}
