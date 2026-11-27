import {useQuery} from '@tanstack/react-query';
import {DatabaseZap,Lock} from 'lucide-react';
import {useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {CHARTS,INDICATORS,TABLES,moduleById} from '../../../shared/catalog';
import {MANAGEMENT_VIEWS,type ManagementView} from '../../../shared/management';
import type {Filters,ModuleResult} from '../../../shared/contracts';
import {MODULE_PERMISSION,type Permission} from '../../../shared/permissions';
import {ProgressiveChart,ProgressiveIndicator,Viewport} from '../components/Progressive';
import {DataTable} from '../components/DataTable';
import {FilterBar} from '../components/FilterBar';
import {TraceDrawer} from '../components/TraceDrawer';
import {CountPill,EmptyState,ErrorState,PageHeader} from '../components/ui';
import {api,filterParams,fmtDate,useCan,useCatalogCan,useFilters,useDebouncedFilters} from '../lib';
import {MODULE_ICON} from '../nav';
import {ConnectionPanel} from './ConnectionPanel';
import {AlertsPanel,DreStatement} from '../components/ManagementPanels';

export function DbBanner({database}:{database?:string}){
  if(!database||database==='CONNECTED')return null;
  return <div role="status" className="flex items-start gap-3 rounded-xl bg-q-ink px-5 py-4 text-sm text-white"><DatabaseZap size={20} className="shrink-0 text-q-orange"/><div><p className="font-bold">{database==='NOT_CONFIGURED'?'Integração pendente':'Dados indisponíveis no momento'}</p><p className="mt-1 text-white/65">Os valores serão apresentados quando a fonte estiver disponível. Nenhuma informação ausente é tratada como zero.</p></div></div>;
}
export function NoAccess({title}:{title:string}){
  return <div className="mx-auto max-w-[900px] rounded-xl border border-q-line bg-white"><div className="flex justify-center pt-10"><Lock size={28} className="text-q-orange"/></div><EmptyState title={`Sem permissão para ${title}`} reason="Seu perfil não inclui esta área. Solicite a liberação a um administrador."/></div>;
}
export function ModulePage({moduleId,preset,compare}:{moduleId:string;preset?:ManagementView;compare?:boolean}){
  const can=useCan(),m=moduleById(moduleId)!;
  return can(MODULE_PERMISSION[m.id])?<ModuleContent key={preset?.id??moduleId} moduleId={moduleId} preset={preset} compare={compare}/>:<NoAccess title={preset?.label??m.label}/>;
}
function ModuleContent({moduleId,preset,compare}:{moduleId:string;preset?:ManagementView;compare?:boolean}){
  const allowed=useCatalogCan(),m=moduleById(moduleId)!,{id}=useParams(),[sp,setSp]=useSearchParams();
  const {filters:input}=useFilters(),debounced=useDebouncedFilters(input),global=compare?{...debounced,compare:true}:debounced;
  const filters:Filters=m.detailOf==='client'?{...global,client:id}:m.detailOf==='project'?{...global,project:id}:m.id==='departamentos'&&id?{...global,department:id}:m.id==='colaboradores'&&id?{...global,employee:id}:global;
  const searchParams=new URLSearchParams(sp);for(const [key,value]of Object.entries(filterParams(filters)))if(value!==undefined)searchParams.set(key,String(value));
  const search=searchParams.toString();
  const baseViews=preset?[preset]:MANAGEMENT_VIEWS[m.id]??[{id:'visao',label:'Visão Geral',indicators:m.indicators,charts:m.charts,tables:m.tables}];
  const views:ManagementView[]=m.id==='colaboradores'?[baseViews[0],{id:'projetos',label:'Projetos',indicators:[],charts:[],tables:['timesheet_projetos']},...baseViews.slice(1)]:baseViews;
  const back=new URLSearchParams(sp);if(id)back.delete(m.detailOf==='client'?'client':m.detailOf==='project'?'project':m.id==='departamentos'?'department':'employee');
  const all:ManagementView={id:'todos',label:'Todos os indicadores',indicators:m.indicators,charts:m.charts,tables:m.tables};
  const view=preset??views.find(v=>v.id===sp.get('aba'))??(sp.get('aba')==='todos'?all:views[0]);
  const [open,setOpen]=useState<string|null>(null);
  const q=useQuery({queryKey:['module-summary',m.id,filters],queryFn:({signal})=>api<ModuleResult>(`/modules/${m.id}`,{...filterParams(filters),view:'summary'},signal)});
  const indicators=view.indicators.filter(i=>allowed('indicators',i)),charts=view.charts.filter(c=>allowed('charts',c));
  const tables=view.tables.filter(t=>allowed('tables',t)&&t!=='alertas').map(t=>TABLES[t]);
  const table=(t:typeof tables[number])=><Viewport key={t.id}>{active=><DataTable def={t} filters={filters} search={search} active={active}/>}</Viewport>;
  const setTab=(tab:string)=>{const next=new URLSearchParams(sp);next.set('aba',tab);setSp(next,{replace:true});};
  return <div className="mx-auto max-w-[1480px] space-y-6">
    <PageHeader icon={MODULE_ICON[m.id]} title={<>{preset?.label??m.label}{id&&<span className="font-medium text-q-mid"> · {q.data?.entityName??'Detalhes'}</span>}</>} subtitle={preset?.id==='dre'?'Receitas e despesas operacionais por pagamentos realizados.':m.id==='executivo'?'Os principais resultados financeiros e operacionais da agência.':undefined}
      back={id&&<Link to={{pathname:m.detailOf==='client'?'/clientes':m.detailOf==='project'?'/projetos':m.path,search:back.toString()}} className="mb-1 inline-block text-xs font-medium text-q-mid hover:text-q-orange">← Voltar para a listagem</Link>}
      right={<CountPill>{fmtDate(filters.start)} – {fmtDate(filters.end)}{q.data?.previousPeriod&&<span className="font-normal text-q-mid"> · vs. {fmtDate(q.data.previousPeriod.start)} – {fmtDate(q.data.previousPeriod.end)}</span>}</CountPill>}/>
    <DbBanner database={q.data?.database}/>{q.isError&&<ErrorState error={q.error} onRetry={()=>q.refetch()}/>}
    <FilterBar/>
    {!preset&&<nav aria-label="Visualizações" className="tabs">{[...views,all].map(v=><button key={v.id} aria-current={view.id===v.id?'page':undefined} onClick={()=>setTab(v.id)} className={view.id===v.id?'selected':''}>{v.label}</button>)}</nav>}
    {view.notice&&<p className="rounded-lg border-l-4 border-q-orange bg-white p-4 text-sm text-q-graphite">{view.notice}</p>}
    {m.id==='qualidade'&&<ConnectionPanel/>}
    {preset?.id==='dre'?<DreStatement filters={filters} onInfo={setOpen}/>:indicators.length>0&&<div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{indicators.map(i=><ProgressiveIndicator key={i} def={INDICATORS[i]} filters={filters} onOpen={()=>setOpen(i)}/>)}</div>}
    {m.id==='executivo'&&view.id==='visao'&&<AlertsPanel filters={filters} compact/>}
    {charts.length>0&&<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">{charts.map(c=><Viewport key={c}>{active=><ProgressiveChart def={CHARTS[c]} filters={filters} active={active}/>}</Viewport>)}</div>}
    {tables.map(table)}
    {!indicators.length&&!charts.length&&!tables.length&&<EmptyState title="Acesso aos dados desta aba" reason="Seu perfil não inclui as informações desta visualização. Consulte o administrador."/>}
    {open&&<TraceDrawer id={open} filters={filters} onClose={()=>setOpen(null)}/>}
  </div>;
}

/** Tela prevista no design, mas sem fonte confiável: informa a indisponibilidade, sem números. */
export function UnavailablePage({label,permission,reason}:{label:string;permission:Permission;reason:string}){
  if(!useCan()(permission))return <NoAccess title={label}/>;
  return <div className="mx-auto max-w-[1480px]"><PageHeader title={label}/><section className="panel"><EmptyState title="Informação indisponível" reason={reason}/></section></div>;
}
