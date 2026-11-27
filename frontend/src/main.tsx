import React,{useEffect,useState} from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter,Link,Route,Routes } from 'react-router-dom';
import type { Bootstrap } from '../../backend/src/types';
import { DataContext } from './context';
import { demoRoutes } from './demo-routes';
import './modules.css';
import { Layout } from './components/Layout';
import { Button,Panel } from './components/ui';
import { StrategicIndicators, ConsolidatedProfitability, ManagementAlerts, PiecesActivities } from './pages/Executive';
import './executive.css';
import { Dashboard } from './pages/Dashboard';
import { Brands,BrandDetail,Categories,Clients,ClientDetail,Contracts,ContractDetail,Fees,Integrations,NotFound } from './pages/Commercial';
import { Projects,ProjectDetail } from './pages/Projects';
import { Departments,People,Productivity,Timesheet } from './pages/Operations';
import { Profitability,Reports,Settings } from './pages/Finance';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import './compact.css';
import { Login } from './pages/Login';
import { AccessControl } from './pages/AccessControl';
function App(){const [data,setData]=useState<Bootstrap|null>(null);const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);useEffect(()=>{const controller=new AbortController();fetch('/api/v1/bootstrap',{signal:controller.signal}).then(async r=>{if(r.status===401)window.location.reload();if(!r.ok)throw new Error('A API retornou uma falha.');return r.json();}).then(setData).catch(e=>{if(e.name!=='AbortError')setError('Não foi possível carregar a API local. Verifique se o backend está em execução.');});return ()=>controller.abort();},[attempt]);
 if(error)return <div className="startup"><Panel title="API indisponível"><p>{error}</p><code>npm run dev:api</code><Button onClick={()=>{setError('');setAttempt(n=>n+1);}}>Tentar novamente</Button></Panel></div>;
 if(!data)return <div className="startup"><span className="brand-symbol">Q</span><p>Carregando QUEST INTELLIGENCE...</p></div>;
 return <DataContext.Provider value={data}><BrowserRouter><Layout><Routes>{demoRoutes.map(r=><Route key={r.path} path={r.path} element={r.element}/>)}<Route path="/indicadores-estrategicos" element={<StrategicIndicators/>}/><Route path="/rentabilidade-consolidada" element={<ConsolidatedProfitability/>}/><Route path="/alertas-gerenciais" element={<ManagementAlerts/>}/><Route path="/pecas-atividades" element={<PiecesActivities/>}/><Route path="/" element={<Dashboard/>}/><Route path="/clientes" element={<Clients/>}/><Route path="/clientes/:id" element={<ClientDetail/>}/><Route path="/marcas" element={<Brands/>}/><Route path="/marcas/:id" element={<BrandDetail/>}/><Route path="/contratos" element={<Contracts/>}/><Route path="/contratos/:id" element={<ContractDetail/>}/><Route path="/categorias-servicos" element={<Categories/>}/><Route path="/fees-jobs-extras" element={<Fees/>}/><Route path="/integracoes" element={<Integrations/>}/><Route path="/projetos" element={<Projects/>}/><Route path="/projetos/:id" element={<ProjectDetail/>}/><Route path="/timesheet" element={<Timesheet/>}/><Route path="/colaboradores" element={<People/>}/><Route path="/departamentos" element={<Departments/>}/><Route path="/produtividade" element={<Productivity/>}/><Route path="/rentabilidade" element={<Profitability/>}/><Route path="/rentabilidade-comercial" element={<Profitability commercial/>}/><Route path="/relatorios" element={<Reports/>}/><Route path="/configuracoes" element={<Settings/>}/><Route path="/controle-acesso" element={<AccessControl/>}/><Route path="*" element={<NotFound/>}/></Routes><Link to="/" className="sr-only">Início</Link></Layout></BrowserRouter></DataContext.Provider>;
}
// Os dados só são pedidos depois do login; a API também recusa sem sessão.
function Root(){
 const [state,setState]=useState<'loading'|'login'|'app'>('loading');
 useEffect(()=>{fetch('/api/auth/me').then(r=>r.json()).then(b=>setState(b.user?'app':'login')).catch(()=>setState('login'));},[]);
 if(state==='loading')return <div className="startup"><span className="brand-symbol">Q</span></div>;
 return state==='login'?<Login onSuccess={()=>setState('app')}/>:<App/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Root/></React.StrictMode>);
