import {useQuery} from '@tanstack/react-query';
import {ChevronDown,Info} from 'lucide-react';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {INDICATORS,TABLES} from '../../../shared/catalog';
import {DRE_VIEW} from '../../../shared/management';
import type {Filters,IndicatorDetail} from '../../../shared/contracts';
import {api,analyticsRefresh,filterParams,fmt,shortState,toQuery,useCatalogCan} from '../lib';
import {DataTable} from './DataTable';
import {Panel,ReliabilityBadge,Skeleton} from './ui';

const useIndicator=(id:string,filters:Filters)=>useQuery<IndicatorDetail>({queryKey:['indicator',id,filters],queryFn:({signal})=>api(`/indicators/${id}`,filterParams(filters),signal),refetchInterval:q=>analyticsRefresh(q.state.status==='error'?'error':q.state.data?.result.status,q.state.data?.result.refreshAfterMs,q.state.dataUpdatedAt)});
function DreLine({id,filters,onInfo}:{id:string;filters:Filters;onInfo:(id:string)=>void}){
  const q=useIndicator(id,filters),r=q.data?.result,def=INDICATORS[id],[expanded,setExpanded]=useState(false);
  return <div className="border-b border-q-line last:border-0">
    <div className={`flex items-center gap-3 px-5 py-4 ${id==='resultado_operacional'?'bg-q-ink font-bold text-white':'text-q-ink'}`}>
      {id!=='resultado_operacional'&&<button aria-label={`Expandir ${def.label}`} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><ChevronDown size={16} className={expanded?'':'-rotate-90'}/></button>}
      <span className="flex-1 text-sm">{def.label}{id==='resultado_operacional'&&' preliminar'}</span>
      {!r?<Skeleton className="h-5 w-24"/>:<span className="num text-right text-sm">{r.status==='OK'?fmt(r.value,'BRL'):shortState(r)}</span>}
      <button onClick={()=>onInfo(id)} aria-label={`Informações sobre ${def.label}`} className="rounded p-1 text-q-orange"><Info size={16}/></button>
    </div>
    {expanded&&<div className="bg-q-bg p-3"><DataTable def={TABLES.dre_categorias} filters={filters} extraParams={{dreGroup:id}}/></div>}
  </div>;
}
export function DreStatement({filters,onInfo}:{filters:Filters;onInfo:(id:string)=>void}){
  const allowed=useCatalogCan();
  return <Panel title="DRE Gerencial" subtitle="Base caixa · pagamentos realizados no período">
    {DRE_VIEW.indicators.filter(id=>allowed('indicators',id)).map(id=><DreLine key={id} id={id} filters={filters} onInfo={onInfo}/>)}
    <div className="flex flex-wrap justify-between gap-2 px-5 py-4 text-sm"><span>Resultado final</span><span className="text-q-mid">Configuração necessária</span><p className="w-full text-xs text-q-mid">A metodologia e a conciliação precisam ser validadas antes de apresentar lucro líquido.</p></div>
  </Panel>;
}
const alerts=[{id:'projetos_atrasados',label:'Projetos atrasados',path:'/projetos',tab:'visao'}, {id:'unidades_sem_estimativa',label:'Atividades sem estimativa',path:'/timesheet',tab:'todos'}, {id:'notas_ambiguas',label:'Notas com cliente em revisão',path:'/financeiro',tab:'receitas'}, {id:'despesas_rateio_divergente',label:'Despesas com rateio em revisão',path:'/financeiro',tab:'centros'}, {id:'tarefas_com_falhas',label:'Atualizações com falha',path:'/qualidade',tab:'visao'}, {id:'conflitos_abertos',label:'Atualizações em revisão',path:'/qualidade',tab:'visao'}];
function AlertItem({item,filters}:{item:typeof alerts[number];filters:Filters}){
  const q=useIndicator(item.id,filters),r=q.data?.result,attention=r?.status==='OK'&&typeof r.value==='number'&&r.value>0;
  return <Link to={{pathname:item.path,search:toQuery({...filterParams(filters),aba:item.tab})}} className={`rounded-lg border p-4 text-sm hover:border-q-orange ${attention?'border-q-orange bg-q-orange/5':'border-q-line'}`}>
    <span className="block font-semibold">{item.label}</span><span className="mt-2 block text-xs text-q-mid">{!r?'Consultando…':r.status==='OK'?`${fmt(r.value,INDICATORS[item.id].unit)} no escopo selecionado`:shortState(r)}</span>
    {r?.status==='OK'&&<span className="mt-2 block"><ReliabilityBadge value={r.reliability}/></span>}
  </Link>;
}
export function AlertsPanel({filters,compact=false}:{filters:Filters;compact?:boolean}){
  const allowed=useCatalogCan(),items=alerts.filter(a=>allowed('indicators',a.id)&&(!compact||a.path!=='/qualidade'));
  return items.length?<Panel title="Pontos de atenção" subtitle="Acesse um alerta para consultar seus detalhes."><div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">{items.map(item=><AlertItem key={item.id} item={item} filters={filters}/>)}</div></Panel>:null;
}
