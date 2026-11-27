import { createModules } from './modules.js';
import type { DemoData, Financial, Project, Bootstrap, Alert } from './types.js';
import { createExecutive } from './executive.js';
export const round=(n:number)=>Math.round(n*100)/100;
export function sum(rows:Financial[]):Financial {
 const keys=['revenue','contracted','invoiced','received','labor','external','tax','indirect','cost','profit','hours','planned','rework','jobs'] as const;
 const result=Object.fromEntries(keys.map(key=>[key,round(rows.reduce((total,row)=>total+row[key],0))])) as unknown as Financial;
 result.margin=result.revenue?round(result.profit/result.revenue*100):null; return result;
}
export function financial(project:Project,data:DemoData):Financial {
 const entries=data.entries.filter(e=>e.projectId===project.id);
 const labor=round(entries.reduce((total,e)=>total+e.hours*(data.people.find(p=>p.id===e.personId)?.rate??0),0));
 const cost=round(labor+project.external+project.tax+project.indirect); const profit=round(project.revenue-cost);
 return {...project,labor,cost,profit,margin:project.revenue?round(profit/project.revenue*100):null,hours:entries.reduce((s,e)=>s+e.hours,0),planned:project.planned,rework:entries.filter(e=>e.rework).reduce((s,e)=>s+e.hours,0),jobs:1};
}
export function simulateAllocation(data:DemoData,contractId:string,projectId:string,amount:number) {
 const contract=data.contracts.find(c=>c.id===contractId);const project=data.projects.find(p=>p.id===projectId);
 if(!contract||!project) throw new Error('Contrato ou projeto não encontrado.');
 if(project.clientId!==contract.clientId) throw new Error('Projeto e contrato devem pertencer ao mesmo cliente.');
 if(!Number.isFinite(amount)||amount<0)throw new Error('Informe um valor válido e não negativo.');
 const before=round(data.allocations.filter(a=>a.contractId===contractId).reduce((s,a)=>s+a.amount,0));
 if(round(before+amount)>contract.value)throw new Error('O rateio excede o valor disponível do contrato.');
 return {contractId,projectId,before,after:round(before+amount),availableBefore:round(contract.value-before),availableAfter:round(contract.value-before-amount),persisted:false};
}
export function bootstrap(data:DemoData):Bootstrap {
 const projectRows=data.projects.map(p=>({...p,...financial(p,data)}));
 const clientRows=data.clients.map(c=>({...c,...sum(projectRows.filter(p=>p.clientId===c.id))}));
 const brandRows=data.brands.map(b=>({...b,...sum(projectRows.filter(p=>p.brandId===b.id))}));
 const personRows=data.people.map(person=>{
  const entries=data.entries.filter(e=>e.personId===person.id);const linked=projectRows.filter(p=>entries.some(e=>e.projectId===p.id));
  const stats=sum([]);stats.hours=entries.reduce((s,e)=>s+e.hours,0);stats.labor=stats.cost=round(stats.hours*person.rate);stats.rework=entries.filter(e=>e.rework).reduce((s,e)=>s+e.hours,0);stats.jobs=linked.length;stats.planned=linked.reduce((s,p)=>s+p.planned/2,0);return {...person,...stats};
 });
 const departmentRows=data.departments.map(d=>{const owned=projectRows.filter(p=>p.departmentId===d.id);const stats=sum(owned);const members=personRows.filter(p=>p.departmentId===d.id);stats.hours=members.reduce((s,p)=>s+p.hours,0);stats.labor=stats.cost=round(members.reduce((s,p)=>s+p.labor,0));stats.profit=round(stats.revenue-stats.cost);stats.margin=stats.revenue?round(stats.profit/stats.revenue*100):null;return {...d,...stats};});
 const totals=sum(projectRows);
 const alerts:Alert[]=[
 {title:'Estouro de Orçamento',label:'Crítico',severity:'red',description:'Pitch Comercial · acompanhe os custos e horas do projeto de menor margem.',target:'/projetos/proj-35'},
 {title:'Carga Elevada',label:'Capacidade',severity:'amber',description:'Carga das equipes de Criação e Digital exige acompanhamento.',target:'/departamentos'},
 {title:'Margem Pressionada',label:'Atenção',severity:'orange',description:'Omni Retail Group · confira a composição de custos e resultados.',target:'/clientes/cli-2'},
 {title:'Retrabalho Excessivo',label:`${round(totals.rework/totals.hours*100)}% total`,severity:'blue',description:'Horas de refação apontadas pelas equipes nos projetos ativos.',target:'/timesheet?retrabalho=true'},
 {title:'Fee sem alocação integral',label:'Comercial',severity:'amber',description:'Contratos têm saldo disponível para distribuição entre os projetos.',target:'/fees-jobs-extras'},
 {title:'Recebimentos pendentes',label:'Financeiro',severity:'blue',description:'Receita reconhecida e recebida são apresentadas separadamente.',target:'/rentabilidade-comercial'}];
 const weights=[0.12,0.145,0.185,0.165,0.20,0.185];
 const monthly=['Set','Out','Nov','Dez','Jan/24','Fev/24'].map((month,i)=>({month,revenue:round(totals.revenue*weights[i]),cost:round(totals.cost*[0.14,0.15,0.19,0.16,0.18,0.18][i])}));
 const executive=createExecutive(data,projectRows,departmentRows,totals);
 return {...data,projectRows,clientRows,brandRows,personRows,departmentRows,totals,monthly,alerts,executive,modules:createModules(data,projectRows,departmentRows,totals,monthly,executive),meta:{mode:'Dados 100% fictícios — protótipo demonstrativo',version:'3.0.0-demo',period:'Ano Fiscal 2024 (Consolidado)'}};
}
