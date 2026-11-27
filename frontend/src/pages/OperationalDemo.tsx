import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Entry } from '../../../backend/src/types';
import { useData } from '../context';
import { hours, money, percent } from '../lib';
import { Badge, Button, Chart, PageTitle, Panel, Select, Stat, Table } from '../components/ui';
import { ActivityDrawer } from '../components/ActivityDrawer';

export function CapacityDemo(){
 const d=useData();const [dept,setDept]=useState('');const [onlyOver,setOnlyOver]=useState(false);
 const rows=d.modules.capacity.filter(r=>(!dept||r.id===dept)&&(!onlyOver||r.excess>0));const capacity=rows.reduce((s,r)=>s+r.capacity,0);const actual=rows.reduce((s,r)=>s+r.hours,0);
 return <><PageTitle title="Capacidade Operacional" description="Capacidade disponível, carga realizada e distribuição por equipe."><Badge tone="orange">Dados fictícios · 2024</Badge></PageTitle>
  <div className="four-columns"><Stat title="Capacidade das Áreas" value={hours(capacity)}/><Stat title="Horas Realizadas" value={hours(actual)}/><Stat title="Ocupação" value={percent(capacity?actual/capacity*100:null)}/><Stat title="Áreas em Sobrecarga" value={rows.filter(r=>r.excess>0).length} tone="orange-text"/></div>
  <div className="filter-bar"><Select value={dept} onChange={setDept} label="Todos os Departamentos" options={d.departments.map(r=>({value:r.id,label:r.name}))}/><label className="checkbox"><input type="checkbox" checked={onlyOver} onChange={e=>setOnlyOver(e.target.checked)}/>Somente sobrecarga</label>{(dept||onlyOver)&&<Button onClick={()=>{setDept('');setOnlyOver(false);}}>Limpar</Button>}</div>
  <Panel title="Capacidade vs. Realizado" subtitle="Capacidade demonstrativa cadastrada por área; horas obtidas dos apontamentos da equipe."><Chart rows={rows} series={[{key:'capacity',name:'Capacidade (h)',color:'#cbd5e1'},{key:'hours',name:'Realizado (h)',color:'#ff6b00'}]}/></Panel>
  <Table rows={rows} path={r=>`/departamentos?dept=${r.id}`} columns={[{key:'name',label:'Departamento',value:r=>r.name,render:r=><strong>{r.name}</strong>},{key:'members',label:'Equipe',value:r=>r.members,render:r=>`${r.members} pessoas`},{key:'capacity',label:'Capacidade',value:r=>r.capacity,render:r=>hours(r.capacity)},{key:'hours',label:'Realizado',value:r=>r.hours,render:r=>hours(r.hours)},{key:'available',label:'Disponível',value:r=>r.available,render:r=>hours(r.available)},{key:'excess',label:'Excedente',value:r=>r.excess,render:r=><span className={r.excess?'red-text':''}>{hours(r.excess)}</span>},{key:'load',label:'Ocupação',value:r=>r.load,render:r=><Badge tone={r.excess?'orange':'green'}>{percent(r.load)}</Badge>}]}/>
  <p className="info-note">A capacidade é um parâmetro fictício. Uma área pode ter horas disponíveis mesmo quando outra está sobrecarregada; os saldos das áreas são mostrados separadamente.</p>
 </>;
}

export function ReworkDemo(){
 const d=useData();const [client,setClient]=useState('');const [drawer,setDrawer]=useState<Entry[]|null>(null);const rows=d.modules.rework.filter(r=>!client||r.clientId===client);const rework=rows.reduce((s,r)=>s+r.rework,0);const allHours=rows.reduce((s,r)=>s+r.hours,0);
 return <><PageTitle title="Refações e Alterações" description="Impacto das revisões nas horas e no custo de mão de obra."><Button asChild><Link to="/timesheet?retrabalho=true">Ver timesheet de retrabalho</Link></Button></PageTitle>
  <div className="four-columns"><Stat title="Horas de Retrabalho" value={hours(rework)}/><Stat title="Custo de Retrabalho" value={money(rows.reduce((s,r)=>s+r.reworkCost,0))} tone="orange-text"/><Stat title="Jobs com Revisões" value={rows.length}/><Stat title="Participação nas Horas dos Jobs" value={percent(allHours?rework/allHours*100:null)}/></div>
  <div className="filter-bar"><Select value={client} onChange={setClient} label="Todos os Clientes" options={d.clients.map(c=>({value:c.id,label:c.name}))}/>{client&&<Button onClick={()=>setClient('')}>Limpar</Button>}</div>
  <Panel title="Jobs com Maior Retrabalho"><Chart rows={[...rows].sort((a,b)=>b.rework-a.rework).slice(0,8).map(r=>({...r,name:r.code}))} series={[{key:'rework',name:'Horas de retrabalho',color:'#ff6b00'}]}/></Panel>
  <Panel title="Apontamentos de Revisão" subtitle="Clique em Ver revisões para consultar as peças e descrições dos apontamentos."><Table rows={rows} columns={[{key:'name',label:'Projeto',value:r=>r.name,render:r=><Link className="text-link" to={`/projetos/${r.id}`}>{r.code}<small>{r.name}</small></Link>},{key:'rework',label:'Horas de Refação',value:r=>r.rework,render:r=>hours(r.rework)},{key:'cost',label:'Custo',value:r=>r.reworkCost,render:r=>money(r.reworkCost)},{key:'rate',label:'Participação',value:r=>r.rate,render:r=><Badge tone="orange">{percent(r.rate)}</Badge>},{key:'count',label:'Atividades',render:r=>r.count},{key:'action',label:'Detalhes',render:r=><Button size="sm" onClick={()=>setDrawer(d.entries.filter(e=>r.entryIds.includes(e.id)))}>Ver revisões</Button>}]}/></Panel>
  <p className="info-note">O custo de refação já está incluído no custo de mão de obra dos projetos. Não é somado novamente às despesas.</p><ActivityDrawer entries={drawer} onClose={()=>setDrawer(null)}/>
 </>;
}
