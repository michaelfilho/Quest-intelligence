// Execução MANUAL pelo operador no backend já configurado. Somente SELECTs.
// Não imprime SQL, parâmetros, documentos, nomes, valores ou credenciais.
import {q,closePool} from './db.js';
import {metricContext} from './performance.js';
try{
  await metricContext('diagnostic',async()=>{
    const [session]=await q(`SELECT current_setting('transaction_read_only') AS read_only,
      current_setting('statement_timeout') AS statement_timeout`);
    if(session.read_only!=='on')throw new Error('Readonly required');
    console.info(JSON.stringify({check:'session',...session}));
    const activity=await q(`SELECT md5(query) AS fingerprint,state,wait_event_type,wait_event,
      round(extract(epoch FROM clock_timestamp()-query_start)*1000)::bigint AS elapsed_ms
      FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user
      AND pid<>pg_backend_pid() AND state='active' ORDER BY query_start LIMIT 20`);
    console.info(JSON.stringify({check:'activity',queries:activity}));
    const stats=await q(`SELECT schemaname AS schema,relname AS table,seq_scan,idx_scan,n_live_tup
      FROM pg_stat_user_tables WHERE schemaname=ANY($1) ORDER BY schemaname,relname`,[['core','ingest','audit']]);
    console.info(JSON.stringify({check:'cumulative_scans_not_evidence_of_cause',tables:stats}));
  });
}catch{
  console.error(JSON.stringify({check:'diagnostic',status:'FAILED',reason:'Verificar configuração readonly e privilégios existentes. Nenhuma permissão é alterada.'}));
  process.exitCode=1;
}finally{await closePool();}
