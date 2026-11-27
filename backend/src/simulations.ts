import type { Bootstrap } from './types.js';
export function simulateIndirect(data:Bootstrap,pool:unknown,criterion:unknown){
 if(typeof pool!=='number'||!Number.isFinite(pool)||pool<0||pool>1e9)throw new Error('Informe um valor entre zero e um bilhão.');
 if(criterion!=='hours'&&criterion!=='revenue')throw new Error('Critério de rateio inválido.');
 const total=data.projectRows.reduce((s,p)=>s+p[criterion],0);if(!total)throw new Error('Sem base para distribuir o valor.');
 const round=(n:number)=>Math.round(n*100)/100;const eligible=data.projectRows.filter(p=>p[criterion]>0);const cents=Math.round(pool*100);
 const amounts=eligible.map(p=>Math.floor(cents*p[criterion]/total));let remainder=cents-amounts.reduce((s,n)=>s+n,0);
 const priority=eligible.map((p,i)=>({i,fraction:cents*p[criterion]/total-amounts[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
 for(const item of priority){if(remainder<=0)break;amounts[item.i]++;remainder--;}
 const rows=eligible.map((p,i)=>{const after=amounts[i]/100;return {id:p.id,name:p.name,code:p.code,before:p.indirect,after,share:p[criterion]/total*100,delta:round(after-p.indirect)};});
 return {pool:round(pool),criterion,persisted:false,rows};
}
export function simulatedAnswer(data:Bootstrap,question:string){
 const q=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const diagnostic=data.modules.diagnostics.find(d=>q.includes('retrabalho')||q.includes('refa')?d.id==='diag-rework':q.includes('caixa')||q.includes('receb')?d.id==='diag-cash':q.includes('capacidade')||q.includes('equipe')?d.id==='diag-capacity':d.id==='diag-margin')!;
 return {simulated:true,period:data.meta.period,title:'Análise simulada · QUEST INTELLIGENCE',summary:diagnostic.finding,cause:diagnostic.cause,recommendation:diagnostic.recommendation,indicators:[{label:'Margem operacional',value:data.totals.margin,unit:'percent'},{label:'Horas de retrabalho',value:data.totals.rework,unit:'hours'},{label:'Saldo faturado a receber',value:data.modules.receivable,unit:'money'}],links:[{label:'Analisar origem',path:diagnostic.path},{label:'Ver diagnóstico completo',path:'/diagnosticos'}],source:'Resposta baseada em regras locais e dados fictícios. Nenhum modelo de IA ou serviço externo foi consultado.'};
}
export type AssistantAnswer=ReturnType<typeof simulatedAnswer>;
export type IndirectSimulation=ReturnType<typeof simulateIndirect>;
