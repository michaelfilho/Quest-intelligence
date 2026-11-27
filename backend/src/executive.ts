import type { DemoData, DepartmentRow, Executive, Financial, ManagementAlert, Piece, ProjectRow } from './types.js';

const round=(n:number)=>Math.round(n*100)/100;
const ratio=(value:number,total:number)=>total?round(value/total*100):null;
const br=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:2});

/** Regras demonstrativas aplicadas sobre a mesma base do dashboard e timesheet. */
export function createExecutive(data:DemoData,projects:ProjectRow[],departments:DepartmentRow[],totals:Financial):Executive {
 const capacity=data.departments.reduce((s,d)=>s+d.capacity,0);
 const revenueByClient=data.clients.map(c=>projects.filter(p=>p.clientId===c.id).reduce((s,p)=>s+p.revenue,0)).sort((a,b)=>b-a);
 const indicators:Executive['indicators']=[
  {id:'margin',name:'Margem Operacional',value:totals.margin,unit:'percent',target:35,direction:'above',description:'Lucro operacional dividido pela receita reconhecida.',path:'/rentabilidade'},
  {id:'concentration',name:'Concentração nos Top 3 Clientes',value:ratio(revenueByClient.slice(0,3).reduce((s,v)=>s+v,0),totals.revenue),unit:'percent',target:40,direction:'below',description:'Participação dos três maiores clientes em receita.',path:'/clientes'},
  {id:'late',name:'Jobs em Atraso',value:ratio(projects.filter(p=>p.status==='atrasado').length,projects.length),unit:'percent',target:10,direction:'below',description:'Jobs com status atrasado sobre o total cadastrado.',path:'/projetos?status=atrasado'},
  {id:'rework',name:'Taxa de Retrabalho',value:ratio(totals.rework,totals.hours),unit:'percent',target:10,direction:'below',description:'Horas de retrabalho divididas pelas horas apontadas.',path:'/timesheet?retrabalho=true'},
  {id:'utilization',name:'Ocupação da Capacidade',value:ratio(totals.hours,capacity),unit:'percent',target:85,direction:'above',description:'Horas realizadas sobre a capacidade demo das nove áreas.',path:'/departamentos'},
  {id:'collection',name:'Recebimento do Faturado',value:ratio(totals.received,totals.invoiced),unit:'percent',target:90,direction:'above',description:'Receita recebida dividida pela receita faturada.',path:'/rentabilidade-comercial'},
  {id:'revenue-hour',name:'Receita por Hora Apontada',value:totals.hours?round(totals.revenue/totals.hours):null,unit:'money',target:500,direction:'above',description:'Receita reconhecida dividida pelas horas realizadas.',path:'/timesheet'},
  {id:'completion',name:'Jobs Concluídos',value:ratio(projects.filter(p=>p.status==='concluído').length,projects.length),unit:'percent',target:40,direction:'above',description:'Projetos concluídos sobre todos os jobs do período.',path:'/projetos?status=concluído'}
 ];
 const managementAlerts:ManagementAlert[]=[];
 for(const p of projects){
  if(p.status==='atrasado')managementAlerts.push({id:`late-${p.id}`,title:'Projeto em atraso',entity:`${p.code} · ${p.name}`,category:'Prazo',severity:'red',evidence:'O job está marcado como atrasado na base demonstrativa.',recommendation:'Revisar o cronograma e alinhar as próximas entregas com o responsável.',path:`/projetos/${p.id}`});
  if(p.margin!==null&&p.margin<45)managementAlerts.push({id:`margin-${p.id}`,title:'Margem abaixo da referência',entity:`${p.code} · ${p.name}`,category:'Margem',severity:'amber',evidence:`Margem de ${br(p.margin)}%, abaixo da referência demo de 45%.`,recommendation:'Conferir composição de custos, escopo e receita reconhecida.',path:`/projetos/${p.id}`});
  if(p.hours&&p.rework/p.hours>0.15)managementAlerts.push({id:`rework-${p.id}`,title:'Retrabalho acima de 15%',entity:`${p.code} · ${p.name}`,category:'Retrabalho',severity:'amber',evidence:`${br(p.rework)}h de refação em ${br(p.hours)}h apontadas (${br(p.rework/p.hours*100)}%).`,recommendation:'Consultar as atividades e identificar as causas das revisões.',path:`/projetos/${p.id}`});
 }
 for(const d of departments){if(d.capacity&&d.hours/d.capacity>0.9)managementAlerts.push({id:`capacity-${d.id}`,title:d.hours>d.capacity?'Capacidade excedida':'Capacidade próxima do limite',entity:d.name,category:'Capacidade',severity:d.hours>d.capacity?'red':'amber',evidence:`${br(d.hours)}h realizadas / ${br(d.capacity)}h de capacidade (${br(d.hours/d.capacity*100)}%).`,recommendation:'Revisar a distribuição de trabalho entre os colaboradores da área.',path:`/departamentos?dept=${d.id}`});}
 for(const c of data.contracts){const allocated=data.allocations.filter(a=>a.contractId===c.id).reduce((s,a)=>s+a.amount,0);if(c.status==='ativo'&&c.value&&allocated/c.value<0.75)managementAlerts.push({id:`fee-${c.id}`,title:'Fee com saldo a distribuir',entity:c.name,category:'Comercial',severity:'blue',evidence:`${br(c.value-allocated)} reais não alocados (${br((c.value-allocated)/c.value*100)}% do contrato).`,recommendation:'Simular o rateio entre os projetos vinculados ao contrato.',path:`/contratos/${c.id}`});}
 for(const client of data.clients){const own=projects.filter(p=>p.clientId===client.id);const invoiced=own.reduce((s,p)=>s+p.invoiced,0);const received=own.reduce((s,p)=>s+p.received,0);if(invoiced&&received/invoiced<0.9)managementAlerts.push({id:`cash-${client.id}`,title:'Saldo faturado a receber',entity:client.name,category:'Recebimentos',severity:'blue',evidence:`${br(invoiced-received)} reais faturados ainda não recebidos na base demo.`,recommendation:'Conferir os valores faturados e recebidos da conta. Este alerta não representa inadimplência.',path:`/clientes/${client.id}`});}
 const priority={red:0,amber:1,blue:2};managementAlerts.sort((a,b)=>priority[a.severity]-priority[b.severity]||a.entity.localeCompare(b.entity,'pt-BR'));
 const piecesById=new Map<string,Piece>();
 for(const e of data.entries){const p=projects.find(p=>p.id===e.projectId)!;const person=data.people.find(p=>p.id===e.personId)!;const piece=piecesById.get(e.piece)??{id:e.piece,projectId:p.id,clientId:p.clientId,personIds:[],departmentIds:[],entryIds:[],activity:e.activity,date:e.date,hours:0,labor:0,rework:0};
  piece.entryIds.push(e.id);if(!piece.personIds.includes(e.personId))piece.personIds.push(e.personId);if(!piece.departmentIds.includes(person.departmentId))piece.departmentIds.push(person.departmentId);piece.date=piece.date>e.date?piece.date:e.date;piece.hours+=e.hours;piece.labor=round(piece.labor+e.hours*person.rate);piece.rework+=e.rework?e.hours:0;piecesById.set(e.piece,piece);
 }
 return {indicators,managementAlerts,pieces:[...piecesById.values()]};
}
