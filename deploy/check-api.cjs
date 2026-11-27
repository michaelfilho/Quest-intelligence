// Executado dentro do container API, sem cabeçalhos de proxy.
async function check(fetcher=fetch) {
  const base=`http://127.0.0.1:${process.env.PORT||3333}`;
  const health=await fetcher(`${base}/api/health`);
  if (!health.ok) throw new Error('Health interno falhou');
  const data=await health.json();
  if (data.status!=='ok') throw new Error('Health interno inválido');
  if (data.database!=='CONNECTED') throw new Error('PostgreSQL indisponível');
  if (data.application!=='CONNECTED') throw new Error('Banco da aplicação indisponível');
  const session=await fetcher(`${base}/api/auth/me`);
  if (session.status!==401) throw new Error('Proteção de sessão inesperada');
  const data_=await fetcher(`${base}/api/modules`);
  if (data_.status!==401) throw new Error('Rota de dados sem autenticação');
  console.log(JSON.stringify({internalHealth:'OK',authentication:'REQUIRED'}));
}
module.exports={check};
if(require.main===module)check().catch(()=>{console.error('Verificação interna falhou');process.exitCode=1;});
