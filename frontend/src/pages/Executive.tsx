import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Entry, Piece, Financial } from '../../../backend/src/types';
import { useData } from '../context';
import { date, exportCSV, fold, hours, money, number, percent } from '../lib';
import { Badge, Button, Chart, ExportButton, PageTitle, Panel, SearchBox, Select, Stat, Table, Tabs } from '../components/ui';
import { ActivityDrawer } from '../components/ActivityDrawer';

export function StrategicIndicators() {
 const d=useData();
 const indicators=d.executive.indicators;
 const onTarget=indicators.filter(i=>i.value!==null&&(i.direction==='above'?i.value>=i.target:i.value<=i.target)).length;
 return <>
  <PageTitle title="Indicadores Estratégicos" description="Saúde financeira, concentração de receita e eficiência operacional da agência."><Badge tone="orange">Dados fictícios · 2024</Badge></PageTitle>
  <div className="four-columns">
   <Stat title="Indicadores Monitorados" value={indicators.length}/>
   <Stat title="Dentro da Referência Demo" value={onTarget} tone="green-text"/>
   <Stat title="Pontos de Atenção" value={indicators.length-onTarget} tone="orange-text" path="/alertas-gerenciais"/>
   <Stat title="Receita Reconhecida" value={money(d.totals.revenue)} path="/rentabilidade-consolidada"/>
  </div>
  <p className="info-note">As metas abaixo são referências fictícias para visualização. Todos os resultados são calculados com a mesma base das demais telas.</p>
  <div className="two-columns indicator-grid">{indicators.map(i=>{
   const ok=i.value!==null&&(i.direction==='above'?i.value>=i.target:i.value<=i.target);
   const display=(v:number|null)=>i.unit==='money'?money(v):percent(v);
   return <Panel key={i.id} title={i.name} action={<Badge tone={ok?'green':'amber'}>{i.value===null?'Sem dados':ok?'Na referência':'Atenção'}</Badge>}>
    <div className="indicator-value"><strong className={ok?'green-text':'orange-text'}>{display(i.value)}</strong><span>Meta demo: {i.direction==='above'?'≥':'≤'} {display(i.target)}</span></div>
    <p>{i.description}</p>
    <div className="indicator-meter"><span style={{width:`${Math.min(100,Math.max(0,(i.value??0)/Math.max(i.target*1.5,1)*100))}%`,background:ok?'#10b981':'#ff6b00'}}/></div>
    <Button asChild><Link to={i.path}>Analisar dados</Link></Button>
   </Panel>;
  })}</div>
  <Panel title="Concentração de Receita por Cliente" subtitle="Participação por conta sobre a receita reconhecida total."><Table rows={[...d.clientRows].sort((a,b)=>b.revenue-a.revenue)} path={c=>`/clientes/${c.id}`} columns={[
   {key:'name',label:'Cliente',value:c=>c.name,render:c=><strong>{c.name}</strong>},
   {key:'revenue',label:'Receita Reconhecida',value:c=>c.revenue,render:c=>money(c.revenue)},
   {key:'share',label:'Participação',value:c=>c.revenue,render:c=>percent(d.totals.revenue?c.revenue/d.totals.revenue*100:null)},
   {key:'margin',label:'Margem',value:c=>c.margin,render:c=><Badge>{percent(c.margin)}</Badge>}
  ]}/></Panel>
 </>;
}

export function ConsolidatedProfitability() {
 const d=useData(); const t=d.totals; const [dimension,setDimension]=useState('Clientes');
 const costs=[{id:'labor',name:'Mão de obra',value:t.labor},{id:'external',name:'Fornecedores',value:t.external},{id:'tax',name:'Impostos',value:t.tax},{id:'indirect',name:'Indiretos',value:t.indirect}];
 const monthly=d.monthly.map(m=>({...m,profit:m.revenue-m.cost,margin:m.revenue?(m.revenue-m.cost)/m.revenue*100:null,id:m.month}));
 const rows:(Financial & {id:string;name:string;path:string})[]=dimension==='Clientes'?d.clientRows.map(c=>({...c,path:`/clientes/${c.id}`})):d.brandRows.filter(b=>b.jobs>0).map(b=>({...b,path:`/marcas/${b.id}`}));
 return <>
  <PageTitle title="Rentabilidade Consolidada" description="Receitas, composição dos custos e resultado operacional em uma visão única."><Badge tone="orange">Consolidado demonstrativo</Badge></PageTitle>
  <div className="four-columns"><Stat title="Receita Reconhecida" value={money(t.revenue)}/><Stat title="Custos Totais" value={money(t.cost)}/><Stat title="Lucro Operacional" value={money(t.profit)} tone="green-text"/><Stat title="Margem Consolidada" value={percent(t.margin)} tone="green-text"/></div>
  <div className="two-columns">
   <Panel title="Formação do Resultado" subtitle="Receita reconhecida menos todos os componentes de custo."><div className="result-bridge"><div><span>Receita reconhecida</span><strong>{money(t.revenue)}</strong></div>{costs.map(c=><div key={c.id}><span>− {c.name}</span><strong>{money(c.value)}</strong></div>)}<div className="bridge-total"><strong>Lucro operacional</strong><strong className="green-text">{money(t.profit)}</strong></div></div></Panel>
   <Panel title="Composição dos Custos" subtitle="Participação de cada componente no custo total."><div className="cost-composition">{costs.map((c,i)=><div key={c.id}><div><strong>{c.name}</strong><span>{money(c.value)} · {percent(t.cost?c.value/t.cost*100:null)}</span></div><div className="cost-meter"><span style={{width:`${t.cost?c.value/t.cost*100:0}%`,background:['#ff6b00','#182d45','#64748b','#b3bdca'][i]}}/></div></div>)}</div><p>Custo de mão de obra = horas apontadas × valor/hora de cada colaborador.</p><Button asChild><Link to="/timesheet">Detalhar mão de obra</Link></Button></Panel>
  </div>
  <Panel title="Evolução do Resultado" subtitle="Distribuição mensal fictícia, conciliada com os totais do período."><Chart rows={monthly} labelKey="month" moneyAxis series={[{key:'revenue',name:'Receita',color:'#10b981'},{key:'cost',name:'Custos',color:'#f43f46'},{key:'profit',name:'Lucro',color:'#ff6b00'}]}/></Panel>
  <Panel title="Resultado por Mês"><Table rows={monthly} columns={[{key:'month',label:'Mês',render:r=>r.month},{key:'revenue',label:'Receita',render:r=>money(r.revenue)},{key:'cost',label:'Custo',render:r=>money(r.cost)},{key:'profit',label:'Lucro',render:r=><strong className="green-text">{money(r.profit)}</strong>},{key:'margin',label:'Margem',render:r=><Badge>{percent(r.margin)}</Badge>}]}/></Panel>
  <Panel title="Contribuição para o Resultado" action={<Tabs items={['Clientes','Marcas']} value={dimension} onChange={setDimension}/>}>
   <Table rows={rows} path={r=>r.path} columns={[{key:'name',label:dimension,value:r=>r.name,render:r=><strong>{r.name}</strong>},{key:'revenue',label:'Receita',value:r=>r.revenue,render:r=>money(r.revenue)},{key:'cost',label:'Custo Total',value:r=>r.cost,render:r=>money(r.cost)},{key:'profit',label:'Lucro',value:r=>r.profit,render:r=><strong className="green-text">{money(r.profit)}</strong>},{key:'margin',label:'Margem',value:r=>r.margin,render:r=><Badge>{percent(r.margin)}</Badge>}]}/>
  </Panel>
 </>;
}

const severityLabels={red:'Crítico',amber:'Atenção',blue:'Acompanhamento'};
export function ManagementAlerts({title='Alertas Gerenciais'}:{title?:string}) {
 const d=useData(); const [q,setQ]=useState('');const [category,setCategory]=useState('');const [severity,setSeverity]=useState('');
 const alerts=d.executive.managementAlerts;
 const rows=alerts.filter(a=>(!category||a.category===category)&&(!severity||a.severity===severity)&&fold(`${a.title} ${a.entity}`).includes(fold(q)));
 return <>
  <PageTitle title={title} description="Ocorrências calculadas sobre os dados fictícios e ações sugeridas para análise."><Badge tone="orange">Monitoramento demonstrativo</Badge></PageTitle>
  <div className="four-columns"><Stat title="Ocorrências Monitoradas" value={alerts.length}/><Stat title="Críticos" value={alerts.filter(a=>a.severity==='red').length} tone="red-text"/><Stat title="Atenção" value={alerts.filter(a=>a.severity==='amber').length} tone="orange-text"/><Stat title="Acompanhamento" value={alerts.filter(a=>a.severity==='blue').length}/></div>
  <div className="filter-bar"><SearchBox value={q} onChange={setQ} placeholder="Buscar alerta, cliente ou job..."/><Select value={category} onChange={setCategory} label="Todas as Categorias" options={[...new Set(alerts.map(a=>a.category))].map(value=>({value,label:value}))}/><Select value={severity} onChange={setSeverity} label="Todas as Prioridades" options={Object.entries(severityLabels).map(([value,label])=>({value,label}))}/>{(q||category||severity)&&<Button onClick={()=>{setQ('');setCategory('');setSeverity('');}}>Limpar</Button>}<Badge tone="gray">{rows.length} alertas exibidos</Badge></div>
  <div className="two-columns management-alerts">{rows.map(a=><Panel key={a.id} title={a.title} className={`management-alert severity-${a.severity}`} action={<Badge tone={a.severity}>{severityLabels[a.severity]}</Badge>}>
   <small>{a.category}</small><h3>{a.entity}</h3><p className="alert-evidence">{a.evidence}</p><p><strong>Ação sugerida:</strong> {a.recommendation}</p><Button asChild><Link to={a.path}>Analisar origem</Link></Button>
  </Panel>)}</div>
  {!rows.length&&<Panel><p className="empty">Nenhum alerta corresponde aos filtros selecionados.</p></Panel>}
  <p className="info-note">Regras demo: status atrasado; margem abaixo de 45%; retrabalho acima de 15%; capacidade acima de 90%; fee alocado abaixo de 75%; recebimento abaixo de 90% do faturado. Não há monitoramento de serviços externos.</p>
 </>;
}

export function PiecesActivities() {
 const d=useData();const [params,setParams]=useSearchParams();const [q,setQ]=useState('');const [client,setClient]=useState('');const [project,setProject]=useState('');const [person,setPerson]=useState('');const [department,setDepartment]=useState('');const [rework,setRework]=useState(false);const [sort,setSort]=useState('date');const [page,setPage]=useState(0);const [drawer,setDrawer]=useState<Entry[]|null>(null);
 const piece=params.get('peca');
 const rows=d.executive.pieces.filter(p=>(!piece||p.id===piece)&&(!client||p.clientId===client)&&(!project||p.projectId===project)&&(!person||p.personIds.includes(person))&&(!department||p.departmentIds.includes(department))&&(!rework||p.rework>0)&&fold(`${p.id} ${p.activity} ${d.projects.find(job=>job.id===p.projectId)?.name}`).includes(fold(q))).sort((a,b)=>sort==='hours'?b.hours-a.hours:sort==='labor'?b.labor-a.labor:b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const filtered=!!(piece||q||client||project||person||department||rework);const pages=Math.max(1,Math.ceil(rows.length/25));const current=Math.min(page,pages-1);const visible=rows.slice(current*25,(current+1)*25);
 function filter(setter:(value:string)=>void){return (value:string)=>{setter(value);setPage(0);};}
 function clear(){setQ('');setClient('');setProject('');setPerson('');setDepartment('');setRework(false);setParams({});setPage(0);}
 function open(p:Piece){setDrawer(d.entries.filter(e=>p.entryIds.includes(e.id)));}
 return <>
  <PageTitle title="Peças e Atividades" description="Explore as entregas, os apontamentos e o custo de mão de obra de cada peça."><ExportButton onClick={()=>exportCSV('pecas-atividades-quest.csv',['Peça','Atividade','Projeto','Data','Horas','Custo Mão de Obra','Horas Retrabalho'],rows.map(p=>[p.id,p.activity,d.projects.find(job=>job.id===p.projectId)!.code,p.date,p.hours,p.labor,p.rework]))}/></PageTitle>
  <div className="four-columns"><Stat title="Peças no Filtro" value={rows.length}/><Stat title="Horas Realizadas" value={hours(rows.reduce((s,p)=>s+p.hours,0))}/><Stat title="Custo de Mão de Obra" value={money(rows.reduce((s,p)=>s+p.labor,0))}/><Stat title="Horas de Retrabalho" value={hours(rows.reduce((s,p)=>s+p.rework,0))} tone="orange-text"/></div>
  <div className="filter-bar wrap"><SearchBox value={q} onChange={filter(setQ)} placeholder="Buscar peça, atividade ou projeto..."/><Select value={client} onChange={filter(setClient)} label="Todos os Clientes" options={d.clients.map(c=>({value:c.id,label:c.name}))}/><Select value={project} onChange={filter(setProject)} label="Todos os Jobs" options={d.projects.map(p=>({value:p.id,label:p.code}))}/><Select value={person} onChange={filter(setPerson)} label="Todos os Colaboradores" options={d.people.map(p=>({value:p.id,label:p.name}))}/><Select value={department} onChange={filter(setDepartment)} label="Todos os Departamentos" options={d.departments.map(p=>({value:p.id,label:p.name}))}/><label className="checkbox"><input type="checkbox" checked={rework} onChange={e=>{setRework(e.target.checked);setPage(0);}}/>Somente retrabalho</label>{filtered&&<Button onClick={clear}>Limpar filtros</Button>}</div>
  {piece&&<p className="info-note">Visualizando a peça {piece}. Use “Limpar filtros” para consultar todas as atividades.</p>}
  <Panel className="pieces-panel" title="Catálogo de Peças e Apontamentos" subtitle="Cada peça está vinculada a um projeto. Clique em Ver atividades para consultar descrição, horários e custos." action={<Select value={sort} onChange={filter(setSort)} label="Ordenação" options={[{value:'date',label:'Mais recentes'},{value:'hours',label:'Mais horas'},{value:'labor',label:'Maior custo'}]}/>}>
   <Table rows={visible} columns={[
    {key:'piece',label:'Peça / Atividade',render:p=><><strong>{p.id}</strong><small>{p.activity} · {date(p.date)}</small></>},
    {key:'project',label:'Projeto / Cliente',render:p=><><Link className="text-link" to={`/projetos/${p.projectId}`}>{d.projects.find(job=>job.id===p.projectId)?.code}</Link><small>{d.clients.find(c=>c.id===p.clientId)?.name}</small></>},
    {key:'person',label:'Colaborador',render:p=><>{p.personIds.map(id=><Link className="piece-person text-link" key={id} to={`/colaboradores?id=${id}`}>{d.people.find(person=>person.id===id)?.name}</Link>)}</>},
    {key:'hours',label:'Horas',numeric:true,render:p=>hours(p.hours)},
    {key:'labor',label:'Mão de Obra',numeric:true,render:p=>money(p.labor)},
    {key:'rework',label:'Retrabalho',render:p=><Badge tone={p.rework?'orange':'gray'}>{p.rework?hours(p.rework):'Sem retrabalho'}</Badge>},
    {key:'actions',label:'Detalhes',render:p=><Button size="sm" onClick={()=>open(p)}>Ver atividades</Button>}
   ]}/>
  </Panel>
  <div className="pagination"><small>{rows.length?`${current*25+1}–${Math.min((current+1)*25,rows.length)}`:'0'} de {number(rows.length)} peças · 25 por página</small><div><Button disabled={current===0} onClick={()=>setPage(current-1)}>Anterior</Button><span>Página {current+1} de {pages}</span><Button disabled={current===pages-1} onClick={()=>setPage(current+1)}>Próxima</Button></div></div>
  <ActivityDrawer entries={drawer} onClose={()=>setDrawer(null)}/>
 </>;
}
