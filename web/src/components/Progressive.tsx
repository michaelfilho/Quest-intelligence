import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ChartDef, ChartResult, Filters, IndicatorDef, IndicatorResult } from '../../../shared/contracts';
import { api, filterParams,analyticsRefresh } from '../lib';
import { KpiCard } from './KpiCard';
import { ErrorState, Skeleton } from './ui';
const Chart=lazy(()=>import('./ChartPanel').then(m=>({default:m.ChartPanel})));

/** Mantém os dados ao sair da tela, mas suspende novas consultas/polling. */
export function Viewport({children}:{children:(active:boolean)=>ReactNode}){
  const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false),[seen,setSeen]=useState(false);
  useEffect(()=>{
    if(!globalThis.IntersectionObserver){setVisible(true);setSeen(true);return;}
    const observer=new IntersectionObserver(([entry])=>{setVisible(entry.isIntersecting);if(entry.isIntersecting)setSeen(true);},{rootMargin:'150px'});
    if(ref.current)observer.observe(ref.current);
    return ()=>observer.disconnect();
  },[]);
  return <div ref={ref} className="min-h-48">{seen?children(visible):<Skeleton className="h-48"/>}</div>;
}
export function ProgressiveIndicator({def,filters,onOpen}:{def:IndicatorDef;filters:Filters;onOpen:()=>void}){
  const q=useQuery({queryKey:['indicator',def.id,filters],queryFn:({signal})=>api<{result:IndicatorResult}>(`/indicators/${def.id}`,filterParams(filters),signal),refetchInterval:q=>analyticsRefresh(q.state.status==='error'?'error':q.state.data?.result.status,q.state.data?.result.refreshAfterMs,q.state.dataUpdatedAt),placeholderData:keepPreviousData});
  return <div className="h-full" title={q.data?.result.calculatedAt?`Consultado em ${new Date(q.data.result.calculatedAt).toLocaleString('pt-BR')}`:undefined}>{q.isError?<ErrorState error={q.error} onRetry={()=>q.refetch()}/>:<KpiCard def={def} result={q.data?.result} onOpen={onOpen}/>}</div>;
}
export function ProgressiveChart({def,filters,active}:{def:ChartDef;filters:Filters;active:boolean}){
  const current={...filters,compare:false};
  const q=useQuery({queryKey:['chart',def.id,current],queryFn:({signal})=>api<ChartResult>(`/charts/${def.id}`,filterParams(current),signal),enabled:active,refetchInterval:q=>active?analyticsRefresh(q.state.status==='error'?'error':q.state.data?.status,q.state.data?.refreshAfterMs,q.state.dataUpdatedAt):false,placeholderData:keepPreviousData});
  return q.isError?<ErrorState error={q.error} onRetry={()=>q.refetch()}/>:<Suspense fallback={<Skeleton className="h-72"/>}><Chart def={def} result={q.data}/></Suspense>;
}
