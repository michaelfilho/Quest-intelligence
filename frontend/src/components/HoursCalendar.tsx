import {fmt} from '../lib';
type Row=Record<string,unknown>;
export function HoursCalendar({rows,onSelect}:{rows:Row[];onSelect:(row:Row)=>void}){
  const months=[...new Set(rows.map(row=>String(row.data).slice(0,7)))];
  return <div className="space-y-5 px-5 pb-5">{months.map(month=>{
    const [year,m]=month.split('-').map(Number),offset=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7,days=new Date(Date.UTC(year,m,0)).getUTCDate();
    return <section key={month}><h4 className="mb-3 font-bold">{new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,m-1,1)))}</h4><div className="grid grid-cols-7 gap-1 text-center text-xs">
      {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d=><span key={d} className="py-2 font-semibold text-q-mid">{d}</span>)}{Array.from({length:offset},(_,i)=><span key={`blank${i}`}/>)}
      {Array.from({length:days},(_,i)=>{const day=`${month}-${String(i+1).padStart(2,'0')}`,row=rows.find(row=>String(row.data).slice(0,10)===day);
        return <button key={day} disabled={!row} aria-label={`${day}${row?', abrir apontamentos':''}`} onClick={()=>row&&onSelect(row)} className="min-h-24 rounded border border-q-line p-1 text-left hover:border-q-orange disabled:border-transparent disabled:text-q-mid"><span className="block">{i+1}</span><span className="mt-1 block font-bold">{row?fmt(row.horas,'hours'):'—'}</span><span className="hidden text-[10px] text-q-mid sm:block">{row?`${fmt(row.horas_retrabalho,'hours')} retrabalho`:'Sem dados nesta página'}</span></button>;
      })}</div></section>;
  })}</div>;
}
