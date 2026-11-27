import type { Financial } from '../../backend/src/types';
export const money=(value:number|null|undefined)=>value==null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
export const number=(value:number|null|undefined)=>value==null?'—':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value);
export const percent=(value:number|null|undefined)=>value==null?'—':`${number(value)}%`;
export const hours=(value:number)=>`${number(value)}h`;
export const date=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
export function exportCSV(filename:string,columns:string[],rows:(string|number|null)[][]){
 const escape=(v:string|number|null)=>`"${String(v??'—').replace(/^[=+@\t\r-]/,'\'$&').replaceAll('"','""')}"`;
 const blob=new Blob(['\uFEFF'+[columns,...rows].map(row=>row.map(escape).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
export function total(rows:Financial[]):Financial {
 const keys=['revenue','contracted','invoiced','received','labor','external','tax','indirect','cost','profit','hours','planned','rework','jobs'] as const;
 const result=Object.fromEntries(keys.map(k=>[k,rows.reduce((s,r)=>s+r[k],0)])) as unknown as Financial;
 result.margin=result.revenue?result.profit/result.revenue*100:null;return result;
}
export const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
