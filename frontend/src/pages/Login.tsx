import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui/button';

export function Login({onSuccess}:{onSuccess:()=>void}){
 const [username,setUsername]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function submit(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{
   const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
   if(response.ok)return onSuccess();
   setPassword('');setError((await response.json().catch(()=>null))?.error??'Não foi possível entrar.');
  }catch{setError('Sem conexão com o servidor.');}
  finally{setBusy(false);}
 }
 return <div className="login"><form onSubmit={submit}>
  <span className="brand-symbol">Q</span><h1>QUEST INTELLIGENCE</h1><p>Entre com seu usuário e senha.</p>
  <label>Usuário<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" maxLength={64} required autoFocus/></label>
  <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" maxLength={128} required/></label>
  {error&&<div role="alert">{error}</div>}
  <Button variant="default" type="submit" disabled={busy}>{busy?'Entrando...':'Entrar'}</Button>
 </form></div>;
}
