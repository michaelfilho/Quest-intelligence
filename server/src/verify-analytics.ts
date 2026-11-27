// Executar MANUALMENTE no ambiente já atualizado; somente SELECTs, sem acesso por esta tarefa à VPS.
import { parseArgs } from "node:util";
import { closePool, dbState, q } from "./db.js";
import { filtersSchema } from "./filters.js";
import { resolveIndicator } from "./services.js";
import { runtimeSchema } from './schema.js';
import { operationalDimension } from './analytics.js';
import { cashRecords } from './cash.js';
import {cashSource,scopedProfile} from './cash.js';
import {allocationSource,allocationChart} from './allocations.js';
import {metricRecords} from './analytics.js';
import { workedActivities } from './activities.js';
import { SourceLimitation } from './source-errors.js';
const { values } = parseArgs({ options: { start: { type: "string" }, end: { type: "string" } } });
const f = filtersSchema.parse(values);
try {
  if ((await dbState()).state !== "CONNECTED") throw new Error("PostgreSQL indisponível.");
  const [session] = await q("SELECT current_user AS role, current_setting('transaction_read_only') AS readonly");
  if (session.role !== "quest_rinne_app_ro" || session.readonly !== "on") throw new Error("Verificação exige quest_rinne_app_ro e sessão somente leitura.");
  const snapshot=await runtimeSchema();
  let failures=0,unavailable=0;
  async function check(name:string,action:()=>Promise<boolean>) {
    try {const match=await action();if(!match)failures++;console.log(JSON.stringify({check:name,match,status:match?'PASS':'FAIL'}));}
    catch(e) {
      if (e instanceof SourceLimitation) {unavailable++;console.log(JSON.stringify({check:name,status:'UNAVAILABLE'}));}
      else {failures++;console.log(JSON.stringify({check:name,status:'ERROR'}));}
    }
  }
  async function verifiedIndicator(id:string) {
    const indicator=await resolveIndicator(id,f,'CONNECTED');
    if(indicator.status==='ERROR')throw new Error('Query failure');
    if(indicator.status!=='OK')throw new SourceLimitation('Fonte ou critério indisponível');
    return indicator;
  }
  const reference = [
    { id: "receita_faturada", sql: `SELECT sum(service_amount)::float8 AS expected FROM core.invoices
      WHERE status = 'issued' AND service_amount::text NOT IN ('NaN','Infinity','-Infinity') AND issued_at::timestamptz >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND issued_at::timestamptz < (($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AND issued_at::timestamptz <= CURRENT_TIMESTAMP` },
    { id: "horas_registradas", sql: `SELECT sum(CASE WHEN duration_seconds >= 0 AND duration_seconds::text NOT IN ('NaN','Infinity','-Infinity') AND (duration_minutes IS NULL OR
        (duration_minutes >= 0 AND duration_minutes::text NOT IN ('NaN','Infinity','-Infinity') AND abs(duration_seconds-duration_minutes*60) <= 1)) THEN duration_seconds
        WHEN duration_seconds IS NULL AND duration_minutes >= 0 AND duration_minutes::text NOT IN ('NaN','Infinity','-Infinity') THEN duration_minutes*60 ELSE NULL END)::float8 / 3600 AS expected
      FROM core.time_entries WHERE started_at::timestamptz >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND started_at::timestamptz < (($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AND started_at::timestamptz <= CURRENT_TIMESTAMP
      AND (finished_at IS NULL OR (finished_at::timestamptz <= CURRENT_TIMESTAMP AND finished_at::timestamptz >= started_at::timestamptz))` },
  ];
  for (const spec of reference) {
    await check(spec.id,async()=>{
    let sql=spec.sql;
    if (spec.id==='horas_registradas') {
      const has=(column:string)=>snapshot.columns.some(c=>c.schema==='core'&&c.table==='time_entries'&&c.column===column);
      if (!has('duration_seconds')&&!has('duration_minutes')) throw new SourceLimitation('Campo ausente');
      for(const column of ['duration_seconds','duration_minutes']) if(!has(column))sql=sql.replaceAll(column,'NULL::numeric');
    }
    const [r] = await q(sql, [f.start, f.end]);
    const indicator = await verifiedIndicator(spec.id);
    return indicator.status !== "ERROR" && (r.expected == null ? indicator.value == null : indicator.status==='OK' && typeof indicator.value === "number" && Math.abs(Number(r.expected) - indicator.value) < 1e-6);
    });
  }
  for (const [dimension,table,key] of [['employees','employees','iclips_id'],['departments','departments','id'],['clients','clients','iclips_id'],['projects','jobs','iclips_id'],['groups','client_groups','iclips_id']] as const) {
    await check(`names_${dimension}`,async()=>{
      if (!['name',key].every(column=>snapshot.columns.some(c=>c.schema==='core'&&c.table===table&&c.column===column))) throw new SourceLimitation('Campo ausente');
      const options=await operationalDimension(dimension,f);
      if (!options.length) throw new SourceLimitation('Nenhum registro');
      const rows=await q(`SELECT ${key}::text AS key,count(*)::int AS n,max(nullif(btrim(name::text),'')) AS name FROM core.${table} WHERE ${key}::text=ANY($1::text[]) GROUP BY ${key}::text`,[options.map(o=>o.value)]);
      const fallback={employees:'Colaborador sem nome',departments:'Departamento sem nome',clients:'Cliente sem nome',projects:'Projeto sem nome',groups:'Grupo sem nome'}[dimension];
      for(const o of options) {
        const r=rows.find(r=>r.key===o.value);
        if(Number(r?.n)>1) {if(o.label!=='Cadastro com chave duplicada')return false;continue;}
        if(r?.name) {if(o.label!==r.name)return false;continue;}
        if(o.label===fallback)continue;
        if(dimension!=='departments')return false;
        const [historical]=await q(`SELECT EXISTS(SELECT 1 FROM core.time_entries t WHERE t.department_id::text=$1
          AND to_jsonb(t)->>'department_name_snapshot'=$2) AS valid`,[o.value,o.label]);
        if(!historical.valid)return false;
      }
      return true;
    });
  }
  for (const id of ['entradas_realizadas','saidas_realizadas'] as const) await check(id,async()=>{
    const indicator=await verifiedIndicator(id);
    let sum=0,total=0;
    for(let page=1;;page++) {
      const rows=await cashRecords(id,f,{page,pageSize:500});
      sum+=rows.rows.reduce((n,r)=>n+Number(r.valor),0);total+=rows.rows.length;
      if(total>=rows.total)break;
    }
    return Math.abs(sum-Number(indicator.value))<1e-6&&total===indicator.recordsUsed;
  });
  await check('estimates_once_per_unit',async()=>{
    const indicator=await verifiedIndicator('horas_previstas');
    let sum=0,total=0;const keys=new Set<string>();
    for(let page=1;;page++) {
      const rows=await workedActivities(f,{page,pageSize:500});
      for(const row of rows.rows){if(keys.has(String(row.id)))return false;keys.add(String(row.id));sum+=Number(row.horas_previstas??0);}
      total+=rows.rows.length;if(total>=rows.total)break;
    }
    return Math.abs(sum-Number(indicator.value))<1e-6;
  });
  for(const [id,schema,table,expression,fields] of [
    ['ultima_publicacao_core','audit','publication_state','max(published_at) FILTER (WHERE published_at<=CURRENT_TIMESTAMP)::text',['published_at']],
    ['conflitos_abertos','audit','publication_conflicts','count(*) FILTER (WHERE resolved_at IS NULL)::int',['resolved_at']],
    ['conflitos_resolvidos','audit','publication_conflicts','count(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at<=CURRENT_TIMESTAMP)::int',['resolved_at']],
    ['paginas_recebidas','ingest','pages','count(*)::int',[]],
    ['registros_recebidos','ingest','pages',"sum(record_count) FILTER (WHERE record_count>=0 AND record_count::text NOT IN ('NaN','Infinity','-Infinity'))::float8",['record_count']],
    ['divergencias_contagem','ingest','tasks',`count(*) FILTER (WHERE expected_total>=0 AND received_records>=0 AND expected_total::text NOT IN ('NaN','Infinity','-Infinity') AND received_records::text NOT IN ('NaN','Infinity','-Infinity') AND expected_total<>received_records)::int`,['expected_total','received_records']],
  ] as const) await check(id,async()=>{
    if(!snapshot.columns.some(c=>c.schema===schema&&c.table===table)||!fields.every(column=>snapshot.columns.some(c=>c.schema===schema&&c.table===table&&c.column===column)))throw new SourceLimitation('Campo ausente');
    const [r]=await q(`SELECT ${expression} AS value FROM ${schema}.${table}`);
    const indicator=await verifiedIndicator(id);
    return r.value==null?indicator.value==null:indicator.status==='OK'&&String(indicator.value)===String(r.value);
  });
  for(const [table,key]of [['jobs','iclips_id'],['employees','iclips_id'],['departments','id'],['clients','iclips_id'],['financial_categories','iclips_id'],['financial_accounts','iclips_id']] as const)await check(`cardinality_${table}`,async()=>{
    if(!snapshot.columns.some(c=>c.schema==='core'&&c.table===table&&c.column===key))throw new SourceLimitation('Fonte ausente');
    const [r]=await q(`SELECT EXISTS(SELECT 1 FROM core.${table} WHERE ${key} IS NOT NULL GROUP BY ${key} HAVING count(*)>1) AS duplicate`);
    return !r.duplicate;
  });
  for(const [id,expression]of [
    ['receita_recebida',"sum(s.valor) FILTER (WHERE s.tipo='Entrada' AND c.classification='RECEITAS OPERACIONAIS')"],
    ['despesas',"sum(s.valor) FILTER (WHERE s.tipo='Saída' AND c.classification IN ('DESPESAS OPERACIONAIS CUSTO FIXO','DESPESAS OPERACIONAIS CUSTO VARIÁVEL'))"],
  ] as const)await check(`dre_${id}`,async()=>{
    if(!['iclips_id','dre_indicator'].every(column=>snapshot.columns.some(c=>c.schema==='core'&&c.table==='financial_categories'&&c.column===column)))throw new SourceLimitation('Campo ausente');
    const profile=await scopedProfile(f,q,snapshot),source=cashSource(f,profile);
    const [r]=await q(`WITH source AS (${source.sql}),categories AS (SELECT iclips_id,CASE WHEN count(*)=1 THEN max(dre_indicator::text) END AS classification FROM core.financial_categories GROUP BY iclips_id)
      SELECT coalesce(${expression},0)::float8 AS expected,count(*)::int AS used FROM source s LEFT JOIN categories c ON c.iclips_id::text=s.category_id::text
      WHERE s.standalone AND s.valor IS NOT NULL AND s.payment_date::timestamptz<=CURRENT_TIMESTAMP AND s.tipo IN ('Entrada','Saída')`,source.params);
    if(!Number(r.used))throw new SourceLimitation('Sem base');
    return Math.abs(Number((await verifiedIndicator(id)).value)-Number(r.expected))<1e-6;
  });
  await check('operating_cash_identity',async()=>{
    const [revenue,fixed,variable,result,margin]=await Promise.all(['receita_recebida','despesas_fixas','despesas_variaveis','resultado_operacional','margem_operacional'].map(verifiedIndicator));
    const expected=Number(revenue.value)-Number(fixed.value)-Number(variable.value);
    return Math.abs(expected-Number(result.value))<1e-6&&Number(revenue.value)>0&&Math.abs(expected/Number(revenue.value)-Number(margin.value))<1e-6;
  });
  await check('registered_cost_records',async()=>{
    const indicator=await verifiedIndicator('custo_mao_de_obra');let sum=0,total=0;
    for(let page=1;;page++){const rows=await metricRecords('custo_mao_de_obra',f,{page,pageSize:500});sum+=rows.rows.reduce((n,r)=>n+Number(r.custo_registrado),0);total+=rows.rows.length;if(total>=rows.total)break;}
    return Math.abs(sum-Number(indicator.value))<1e-6;
  });
  await check('positive_cost_hours_partition',async()=>{
    const [withCost,withoutCost,hours]=await Promise.all(['horas_com_custo_positivo','horas_sem_custo_positivo','horas_registradas'].map(verifiedIndicator));
    return Math.abs(Number(withCost.value)+Number(withoutCost.value)-Number(hours.value))<1e-6;
  });
  await check('allocated_centers_conservation',async()=>{
    const source=await allocationSource(f),[rows,indicator]=await Promise.all([q(`WITH entries AS (${source.sql}) SELECT sum(valor) FILTER (WHERE allocation_status='Conciliado')::float8 AS expected FROM entries`,source.params),verifiedIndicator('despesas_rateadas')]);
    const chart=await allocationChart(f);const points=chart.points;
    // O gráfico é top 50; não presumir que ele cobre todos os centros.
    const [r]=await q(`WITH entries AS (${source.sql}),links AS (${source.links}) SELECT sum(l.amount)::float8 AS actual FROM entries e JOIN links l ON l.entry_key=e.financial_key WHERE e.allocation_status='Conciliado'`,source.params);
    return Math.abs(Number(r.actual??0)-Number(rows[0].expected??0))<1e-6&&Math.abs(Number(indicator.value)-Number(r.actual??0))<1e-6&&points.every(p=>Number.isFinite(Number(p.despesa)));
  });
  await check('publication_state_rows',async()=>{
    if(!snapshot.columns.some(c=>c.schema==='audit'&&c.table==='publication_state'&&c.column==='source_id'))throw new SourceLimitation('Fonte ausente');
    const [r]=await q('SELECT count(*)::int AS expected FROM audit.publication_state');return Number((await verifiedIndicator('estados_publicacao')).value)===Number(r.expected);
  });
  console.log(JSON.stringify({verification:failures?'FAIL':unavailable?'PARTIAL':'PASS'}));
  process.exitCode = failures ? 1 : unavailable?2:0;
} catch {console.error('Verificação não concluída. Conferir conexão existente, role e sessão somente leitura. Nenhum dado privado é impresso.');process.exitCode=1;}
finally { await closePool(); }
