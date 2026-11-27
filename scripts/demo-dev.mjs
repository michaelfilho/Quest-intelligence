import { spawn,execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const api=spawn(process.execPath,['backend/node_modules/tsx/dist/cli.mjs','watch','backend/src/index.ts'],{cwd:root,stdio:'inherit',windowsHide:true});
const ui=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5175','--strictPort'],{cwd:fileURLToPath(new URL('../frontend/',import.meta.url)),stdio:'inherit',windowsHide:true});
let stopping=false;
function stop(code=0){
 if(stopping)return;stopping=true;
 for(const child of [api,ui]){
  if(!child.pid)continue;
  if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});}catch{/* O filho pode ter encerrado antes da limpeza. */}}
  else child.kill('SIGTERM');
 }
 process.exit(code);
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
for(const child of [api,ui]){child.on('error',error=>{console.error(error.message);stop(1);});child.on('exit',code=>stop(code??0));}
