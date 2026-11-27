import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, PageTitle, Panel } from '../components/ui';

interface Ip { ip:string; status:'pending'|'allowed'|'blocked'; firstSeen:number; lastSeen:number; userAgent:string; fails:number; locks:number; lockedUntil:number; lastUser:string }
interface View { you:string; adminIps:string[]; ips:Ip[] }
const when=(value:number)=>value?new Date(value).toLocaleString('pt-BR'):'—';

export function AccessControl(){
 const [view,setView]=useState<View|null>(null);const [error,setError]=useState('');const [manual,setManual]=useState('');
 async function request(body?:{ip:string;action:string}){
  try{
   const response=await fetch('/api/admin/ips',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
   if(response.status===401)return window.location.reload();
   const result=await response.json();
   if(!response.ok)return setError(result.error??'Falha na operação.');
   setView(result);setError('');
  }catch{setError('Sem conexão com o servidor.');}
 }
 useEffect(()=>{void request();const timer=setInterval(()=>void request(),10_000);return ()=>clearInterval(timer);},[]);
 function add(event:FormEvent){event.preventDefault();void request({ip:manual,action:'allowed'});setManual('');}
 const list=(status:Ip['status'],empty:string)=>{
  const rows=view?.ips.filter(i=>i.status===status||(status==='allowed'&&view.adminIps.includes(i.ip)))
   .filter(i=>status==='allowed'||!view.adminIps.includes(i.ip))??[];
  if(!rows.length)return <p>{empty}</p>;
  return <div className="table-wrap"><table><thead><tr><th>IP</th><th>Último acesso</th><th>Navegador</th><th>Login</th><th>Ações</th></tr></thead><tbody>{rows.map(i=>{
   const fixed=view!.adminIps.includes(i.ip);const locked=i.lockedUntil>Date.now();
   return <tr key={i.ip}>
    <td><strong>{i.ip}</strong> {i.ip===view!.you&&<Badge tone="blue">você</Badge>} {fixed&&<Badge tone="gray">fixo</Badge>}</td>
    <td>{when(i.lastSeen)}</td><td className="ip-agent" title={i.userAgent}>{i.userAgent||'—'}</td>
    <td>{i.lastUser?`${i.lastUser} · ${i.fails} falha(s)`:'—'} {locked&&<Badge tone="red">bloqueado até {when(i.lockedUntil)}</Badge>}</td>
    <td className="ip-actions">
     {status!=='allowed'&&<Button size="sm" variant="default" onClick={()=>void request({ip:i.ip,action:'allowed'})}>Autorizar</Button>}
     {status!=='blocked'&&!fixed&&i.ip!==view!.you&&<Button size="sm" onClick={()=>void request({ip:i.ip,action:'blocked'})}>{status==='pending'?'Excluir notificação':'Revogar acesso'}</Button>}
     {(locked||i.fails>0)&&<Button size="sm" onClick={()=>void request({ip:i.ip,action:'unlock'})}>Zerar tentativas</Button>}
    </td></tr>;})}</tbody></table></div>;
 };
 return <><PageTitle title="Controle de Acesso" description="Autorize quem pode ver o site. IPs não autorizados recebem apenas erro 404."/>
  {error&&<div role="alert" className="access-error">{error}</div>}
  <Panel title="Aguardando autorização">{list('pending','Nenhum IP novo tentou acessar.')}</Panel>
  <Panel title="IPs autorizados" subtitle={view?`Seu IP: ${view.you}`:undefined}>
   <form className="ip-add" onSubmit={add}><input aria-label="IP para autorizar" placeholder="Autorizar IP manualmente (ex.: 200.10.20.30)" value={manual} onChange={e=>setManual(e.target.value)} required/><Button type="submit">Autorizar</Button></form>
   {list('allowed','Nenhum IP autorizado.')}
  </Panel>
  <Panel title="Excluídos / bloqueados" subtitle="Continuam vendo 404 e não geram nova notificação.">{list('blocked','Nenhum IP bloqueado.')}</Panel>
 </>;
}
