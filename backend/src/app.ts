import { fileURLToPath } from 'node:url';
import express from 'express';
import { createSecurity, type SecurityOptions } from './security.js';
import { createDemoData } from './data/demo.js';
import { bootstrap, simulateAllocation } from './analytics.js';
import { simulatedAnswer, simulateIndirect } from './simulations.js';
export function createApp(options:SecurityOptions={}){
 const app=express(); app.disable('x-powered-by');
 // X-Forwarded-For só é aceito destes proxies (padrão: proxy na própria máquina).
 app.set('trust proxy',process.env.TRUST_PROXY||'loopback');
 const security=createSecurity(options);
 app.use(security.gate); // IP não autorizado: 404 antes de qualquer outra coisa
 app.use((req,res,next)=>{
  res.set({'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Cross-Origin-Opener-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','Strict-Transport-Security':'max-age=31536000'});
  if(req.path.startsWith('/api'))res.set('Cache-Control','no-store');
  // CSRF: outro site não envia application/json sem preflight CORS (que a API não libera); o cookie é SameSite=Strict.
  if(!['GET','HEAD'].includes(req.method)&&!req.headers['content-type']?.startsWith('application/json'))return res.status(415).json({error:'Use Content-Type: application/json.'});
  next();
 });
 app.use(express.json({limit:'32kb'}));
 app.use('/api/auth',security.auth);
 const source=createDemoData();const data=bootstrap(source);
 app.get('/api/v1/health',(_req,res)=>res.json({status:'ok',mode:'demo'}));
 app.use('/api',security.requireAuth); // daqui em diante: sessão obrigatória
 app.use('/api/admin',security.admin);
 app.get('/api/v1/bootstrap',(_req,res)=>res.json(data));
 app.get('/api/v1/dashboard',(_req,res)=>res.json({totals:data.totals,monthly:data.monthly,alerts:data.alerts}));
 app.get('/api/v1/modulos',(_req,res)=>res.json({mode:'demo',data:data.modules}));
 app.post('/api/v1/assistente/simular',(req,res)=>{const question=req.body?.question;if(typeof question!=='string'||!question.trim()||question.length>500)return res.status(422).json({error:'Informe uma pergunta de até 500 caracteres.'});return res.json(simulatedAnswer(data,question));});
 app.post('/api/v1/rateios/indiretos/simular',(req,res)=>{try{return res.json(simulateIndirect(data,req.body?.pool,req.body?.criterion));}catch(error){return res.status(422).json({error:error instanceof Error?error.message:'Simulação inválida.'});}});
 const collections={clientes:data.clientRows,projetos:data.projectRows,marcas:data.brandRows,contratos:data.contracts,departamentos:data.departmentRows,colaboradores:data.personRows,apontamentos:data.entries,categorias:data.categories,rateios:data.allocations,lancamentos:data.financialEntries,pecas:data.executive.pieces,indicadores:data.executive.indicators,'alertas-gerenciais':data.executive.managementAlerts};
 for(const [route,rows] of Object.entries(collections)){
  app.get(`/api/v1/${route}`,(req,res)=>{
   let result:Record<string,unknown>[] = rows.map(r=>({...r}));
   const mapping:Record<string,string>={cliente:'clientId',departamento:'departmentId',colaborador:'personId',projeto:'projectId',marca:'brandId',status:'status'};
   for(const [param,key] of Object.entries(mapping)){if(typeof req.query[param]==='string')result=result.filter(r=>String(r[key]).toLocaleLowerCase('pt-BR')===String(req.query[param]).toLocaleLowerCase('pt-BR'));}
   if(req.query.retrabalho==='true') result=result.filter(r=>r.rework===true);
   if(typeof req.query.q==='string'){const q=req.query.q.toLocaleLowerCase('pt-BR');result=result.filter(r=>Object.values(r).some(v=>String(v).toLocaleLowerCase('pt-BR').includes(q)));}
   if(req.query.sort){const key=String(req.query.sort);const dir=req.query.direction==='desc'?-1:1;result.sort((a,b)=>dir*(typeof a[key]==='number'&&typeof b[key]==='number'?Number(a[key])-Number(b[key]):String(a[key]??'').localeCompare(String(b[key]??''),'pt-BR')));}
   res.json({data:result,total:result.length,mode:'demo'});
  });
  app.get(`/api/v1/${route}/:id`,(req,res)=>{const row=rows.find(r=>r.id===req.params.id);if(!row)return res.status(404).json({error:'Registro não encontrado.'});return res.json(row);});
 }
 app.post('/api/v1/rateios/simular',(req,res)=>{try{res.json(simulateAllocation(source,req.body?.contractId,req.body?.projectId,req.body?.amount));}catch(error){res.status(422).json({error:error instanceof Error?error.message:'Simulação inválida.'});}});
 app.get('/api/v1',(_req,res)=>res.json({name:'QUEST INTELLIGENCE REST API',mode:'demo',endpoints:['health','bootstrap','dashboard','modulos',...Object.keys(collections)].map(p=>`/api/v1/${p}`),simulations:['POST /api/v1/rateios/simular','POST /api/v1/rateios/indiretos/simular','POST /api/v1/assistente/simular']}));
 app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint não encontrado.'}));
 // Em produção a própria API serve o frontend compilado, atrás do mesmo bloqueio por IP.
 const dist=fileURLToPath(new URL('../../frontend/dist',import.meta.url));
 app.use(express.static(dist));
 app.use((req,res,next)=>req.method==='GET'?res.sendFile('index.html',{root:dist},error=>{if(error)next();}):next());
 app.use((error:{status?:number},_req:express.Request,res:express.Response,_next:express.NextFunction)=>{const status=error.status&&error.status<500?error.status:500;res.status(status).json({error:status===400?'JSON inválido.':'Falha ao processar a solicitação.'});});
 return app;
}
