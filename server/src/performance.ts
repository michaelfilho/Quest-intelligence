import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

export const integer = (name:string, fallback:number, min=1, max=1_000_000) => {
  const v=Number(process.env[name]??fallback);
  return Number.isInteger(v)&&v>=min&&v<=max?v:fallback;
};
type Context={scope:string; metric:string;permissions?:ReadonlySet<string>};
const context=new AsyncLocalStorage<Context>();
export const performanceScope=()=>context.getStore()?.scope;
export const metricContext=<T>(metric:string,fn:()=>T)=>context.run({...context.getStore(),scope:performanceScope()??'',metric},fn);
export const dataPermission=(permission:string)=>context.getStore()?.permissions?.has(permission);
export function authorizedContext<T>(user:{id:number;permissions:Set<string>;scopeDepartment:string|null},fn:()=>T) {
  // A autorização é refeita pelo middleware a cada pedido. Nenhum nome/documento entra na chave.
  const semantics=Object.entries(process.env).filter(([k])=>/^(?:FINANCIAL_|QUALITY_|TIME_ACTIVITY_|DATABASE_SCHEMA_|JOB_STATUS_POLICY$|APP_TIMEZONE$)/.test(k)).sort();
  const scope=createHash('sha256').update(JSON.stringify([user.id,[...user.permissions].sort(),user.scopeDepartment,semantics])).digest('hex');
  return context.run({scope,metric:'request',permissions:user.permissions},fn);
}
export type QueryTelemetry={metric:string;fingerprint:string;durationMs:number;poolWaitMs:number;queueWaitMs:number;rows:number;outcome:'ok'|'timeout'|'error'};
export function queryTelemetry(sql:string, data:Omit<QueryTelemetry,'metric'|'fingerprint'>) {
  const record:QueryTelemetry={metric:context.getStore()?.metric??'database',fingerprint:createHash('sha256').update(sql.replace(/\s+/g,' ').trim()).digest('hex').slice(0,20),...data};
  // Nunca registrar SQL, parâmetros, resultado, mensagem do PostgreSQL ou URL.
  if(process.env.SQL_TELEMETRY==='1'||(process.env.NODE_ENV!=='test'&&process.env.SQL_TELEMETRY!=='0')) console.info(JSON.stringify({event:'sql',...record}));
  return record;
}

/** LRU limitado por bytes e entradas; só resultados bem-sucedidos, sem persistência. */
export class ResultCache {
  private entries=new Map<string,{json:string;expires:number;bytes:number}>();
  private pending=new Map<string,Promise<any>>();
  private bytes=0;
  constructor(private ttl=45000,private maxEntries=256,private maxBytes=16*1024*1024,private now=Date.now){}
  stats(){return {entries:this.entries.size,bytes:this.bytes,pending:this.pending.size};}
  clear(){this.entries.clear();this.bytes=0;}
  private remove(key:string){const e=this.entries.get(key);if(e)this.bytes-=e.bytes;this.entries.delete(key);}
  async get<T>(key:string,load:()=>Promise<T>):Promise<T> {
    const now=this.now();
    for(const [k,e]of this.entries)if(e.expires<=now)this.remove(k);
    const e=this.entries.get(key);
    if(e){this.entries.delete(key);this.entries.set(key,e);return JSON.parse(e.json);}
    const existing=this.pending.get(key);if(existing)return structuredClone(await existing);
    const work=Promise.resolve().then(load).then(value=>{
      const failed=(v:any):boolean=>!!v&&typeof v==='object'&&(['ERROR','DATABASE_UNAVAILABLE'].includes(v.status)||Object.values(v).some(x=>typeof x==='object'&&failed(x)));
      if(!failed(value)){
        const json=JSON.stringify(value),bytes=Buffer.byteLength(key)+Buffer.byteLength(json);
        if(bytes<=this.maxBytes){
          while(this.entries.size>=this.maxEntries||this.bytes+bytes>this.maxBytes)this.remove(this.entries.keys().next().value!);
          this.entries.set(key,{json,bytes,expires:this.now()+this.ttl});this.bytes+=bytes;
        }
      }
      return value;
    });
    if(this.pending.size<this.maxEntries)this.pending.set(key,work);
    try{return structuredClone(await work);}finally{if(this.pending.get(key)===work)this.pending.delete(key);}
  }
}
export const resultCache=new ResultCache(integer('ANALYTICS_CACHE_TTL_MS',45000,1000,60000),integer('ANALYTICS_CACHE_MAX_ENTRIES',256),integer('ANALYTICS_CACHE_MAX_BYTES',16*1024*1024,1024,256*1024*1024));
export function cachedResult<T>(kind:string,args:unknown[],load:()=>Promise<T>):Promise<T>{
  const scope=performanceScope();
  const calculate=async()=>{
    const result=await load();
    return result&&typeof result==='object'&&!Array.isArray(result)?{...result,calculatedAt:new Date().toISOString()}:result;
  };
  return metricContext(kind,async()=>{
    const result=await (scope?resultCache.get(JSON.stringify([scope,kind,args]),calculate):calculate());
    if(result&&typeof result==='object'&&!Array.isArray(result)){
      const at=Date.parse((result as {calculatedAt?:string}).calculatedAt??'');
      return {...result,refreshAfterMs:Math.max(1000,60000-Math.max(0,Date.now()-at))};
    }
    return result;
  });
}

/** Limita SQL pesado, não conexões de health/autenticação. Fila limitada e sem retry. */
export class Admission {
  private active=0;
  private queue:{resolve:(release:()=>void)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}[]=[];
  constructor(private limit:number,private maxQueue:number,private timeout:number){}
  stats(){return {active:this.active,queued:this.queue.length};}
  private release=()=>{const next=this.queue.shift();if(next){clearTimeout(next.timer);next.resolve(this.release);}else this.active--;};
  async enter():Promise<()=>void>{
    if(this.active<this.limit){this.active++;return this.release;}
    if(this.queue.length>=this.maxQueue)throw new Error('Analytics queue full');
    return new Promise((resolve,reject)=>{
      const item={resolve,reject,timer:setTimeout(()=>{this.queue=this.queue.filter(x=>x!==item);reject(new Error('Analytics queue timeout'));},this.timeout)};
      this.queue.push(item);
    });
  }
}
const poolMax=integer('DATABASE_POOL_MAX',5,2,50);
export const analyticsAdmission=new Admission(Math.min(integer('ANALYTICS_CONCURRENCY',2,1,3),poolMax-1),integer('ANALYTICS_QUEUE_MAX',96,1,512),integer('ANALYTICS_QUEUE_TIMEOUT_MS',12000,100,15000));
