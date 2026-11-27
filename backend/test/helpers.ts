import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { saveUser, type SecurityOptions } from '../src/security.js';

export const PASSWORD='senha-de-teste-123';
/** Sobe a API com dados de segurança temporários; nada toca em backend/data. */
export async function startApp(options:SecurityOptions={}){
 const dir=mkdtempSync(join(tmpdir(),'quest-sec-'));
 await saveUser('admin',PASSWORD,dir);
 const server=createApp({dir,adminIps:['127.0.0.1'],...options}).listen(0,'127.0.0.1');
 await new Promise<void>(r=>server.once('listening',r));
 const address=server.address() as {port:number};
 const origin=`http://127.0.0.1:${address.port}`;
 const post=(path:string,body:unknown,headers:Record<string,string>={})=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 const login=async()=>(await post('/api/auth/login',{username:'admin',password:PASSWORD})).headers.get('set-cookie')!.split(';')[0];
 const close=async()=>{await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true});};
 return {origin,base:`${origin}/api/v1`,post,login,close};
}
