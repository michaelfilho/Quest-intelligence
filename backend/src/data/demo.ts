import type { DemoData, Project, Entry } from '../types.js';
const clientSeeds = [
 ['Banco Vértice S.A.','Fintech & Bancário',255000,96136.91,4],['Omni Retail Group','Varejo & E-commerce',297500,100845.02,5],['Solaris Energia Renovável','Energia & Sustentabilidade',188000,64270.19,3],['Nexus Tech Global','Software SaaS B2B',147750,52835.60,3],['Hospital São Lucas & Saúde','Saúde & Diagnósticos',120000,47608.51,3],['Aurora Bebidas & Destilados','Bens de Consumo & Cervejaria',191550,44396.64,3],['Vanguard Educação Corporativa','EdTech & Treinamento',138750,42522.45,3],['Aero Cargo Express','Logística & Transporte',100500,29547.79,3],['Bella Vita Cosméticos','Beleza & Cuidados Pessoais',107000,41091.26,3],['Urban Construtora & Urbanismo','Construção Civil & Imobiliário',104250,45093.68,3],['AgroSul Sementes & Grãos','Agronegócio',39000,9796.03,1],['Prime Corretora de Seguros','Seguros & Benefícios',16500,9899.42,1]
] as const;
const departmentNames=['Atendimento','Criação','Digital','Audiovisual','Branding','Planejamento','Mídia','Comercial','Administrativo'];
const names=['João Silva','Maria Oliveira','Rodrigo Paiva','Thiago Mattos','Larissa Couto','Aline Tavares','Renata Guimarães','Helena Carvalho','Guilherme Siqueira','Gabriel Faria','Felipe Santana','Camila Zanin','Bruno Meirelles','Beatriz Fonseca','Rafael Costa','Luiza Martins','Pedro Almeida','Ana Souza','Lucas Ribeiro','Juliana Lima','Marcos Dias','Carolina Rocha','Daniel Melo','Isabela Nunes','André Castro','Fernanda Lopes','Ricardo Alves','Mariana Santos','Vinícius Reis','Paula Mendes'];
const titles=['Campanha Institucional Open Finance','Redesign do App Mobile Vértice Invest','Portal de Conteúdo Financeiro & SEO','Spot TV & Motion Festival de Investimentos','Campanha Black Friday Antecipada & Saldão','Automação CRM & Réguas de Retenção','Campanha de Páscoa & Varejo Doce','Reestruturação de Naming de Linhas Próprias','Campanha de Liquidação Relâmpago Varejo','Lançamento Consórcio Solar Residencial','Vídeo Manifesto de Sustentabilidade & ESG','Landing Page de Simulação de Economia','Rebranding Global & Manual de Marca 2.0','Campanha de Performance B2B para C-Levels','Kit de Vendas & Demonstração Interativa','Campanha Check-up Cardiovascular 360°','Sinalização & Wayfinding Nova Ala Hospitalar','Agendamento Online Integrado via WhatsApp','Lançamento Cerveja Artesanal Aurora','Campanha de Verão & Experiências','Embalagens Linha Reserva Especial','Programa de Liderança e Desenvolvimento','Plataforma de Treinamento Digital','Campanha de Matrículas Corporativas','Apresentação Comercial para Grandes Importadores','Portal de Rastreamento & Conversão','Campanha Logística Sem Fronteiras','Campanha Beleza Natural','E-commerce & Jornada de Compra','Identidade Linha Essencial','Tour Virtual 3D & Imersão VR do Apartamento Decorado','Lançamento Residencial Horizonte','Conteúdo & Performance Imobiliária','Campanha Safra de Resultados','Diagnóstico de Comunicação & Pitch Comercial'];
const round=(n:number)=>Math.round(n*100)/100;
export function createDemoData():DemoData {
 const clients=clientSeeds.map((s,i)=>({id:`cli-${i+1}`,name:s[0],segment:s[1],status:i===10?'inativo':i===11?'em prospecção':'ativo'}));
 const departments=departmentNames.map((name,i)=>({id:`dep-${i+1}`,name,capacity:[160,650,620,340,400,300,220,160,160][i]}));
 const people=names.map((name,i)=>({id:`col-${i+1}`,name,departmentId:`dep-${[1,2,2,3,1,2,6,4,5,2,6,1,1,4,1,2,3,1,2,4,5,6,0,1,2,3,4,5,7,8][i]+1}`,role:['Designer','Desenvolvedor','Analista','Diretor de Arte','Redator','Estrategista'][i%6],rate:[62,78,85,105,58,72][i%6]}));
 const categories=['Criação & Design','Digital & Tecnologia','Audiovisual','Branding','Planejamento','Mídia & Performance','Consultoria'].map((name,i)=>({id:`cat-${i+1}`,name}));
 const brands=Array.from({length:25},(_,i)=>({id:`marca-${i+1}`,name:`${clients[i%12].name.split(' ')[0]} ${['Institucional','Premium','Digital'][Math.floor(i/12)]}`,clientId:clients[i%12].id}));
 const contracts=Array.from({length:20},(_,i)=>({id:`ctr-${i+1}`,name:`${i<12?'Fee mensal':'Projeto extra'} · ${clients[i%12].name}`,clientId:clients[i%12].id,brandId:brands[i].id,categoryId:categories[i%7].id,type:i<12?'Fee mensal':'Job extra',status:i===10?'encerrado':'ativo',value:round(Number(clientSeeds[i%12][2])*(i<12?0.65:0.35)),start:'2024-01-01',end:'2024-12-31',versions:[{version:1,date:'2024-01-01',value:round(Number(clientSeeds[i%12][2])*0.6),description:'Contrato inicial'},{version:2,date:'2024-02-01',value:round(Number(clientSeeds[i%12][2])*(i<12?0.65:0.35)),description:'Revisão de escopo e vigência'}]}));
 const projects:Project[]=[]; const entries:Entry[]=[];
 let index=0;
 for(let c=0;c<12;c++) {
  const count=Number(clientSeeds[c][4]); let revenueLeft=Number(clientSeeds[c][2]); let costLeft=Number(clientSeeds[c][3]);
  for(let j=0;j<count;j++) {
   const n=index++; const person=people[n%28]; const departmentId=person.departmentId;
   const revenue=j===count-1?round(revenueLeft):round(Number(clientSeeds[c][2])*(1/count+(j===0?0.035:-0.01))); revenueLeft=round(revenueLeft-revenue);
   const targetCost=j===count-1?round(costLeft):round(Number(clientSeeds[c][3])/count); costLeft=round(costLeft-targetCost);
   const id=`proj-${n+1}`; let labor=0;
   for(let k=0;k<11;k++) {
    const p=k%3===0?people[(n+3)%28]:person; const hours=[4,6,8,7,5,8,6,8,9,7,6][k]; labor+=hours*p.rate;
    const start=9+(k%2); entries.push({id:`apt-${entries.length+1}`,projectId:id,personId:p.id,date:`2024-02-${String(5+(k*2+n)%24).padStart(2,'0')}`,hours,rework:(k+n)%9===0,activity:['Conceito criativo','Desenvolvimento','Revisão do cliente','Finalização','Planejamento'][k%5],piece:`PEÇA-${String(n*11+k+1).padStart(4,'0')}`,description:['Elaboração e validação do conceito com a equipe.','Execução do escopo aprovado no briefing.','Ajustes solicitados na revisão do cliente.'][k%3],start:`${start}:00`,end:`${start+hours}:00`});
   }
   const tax=round(revenue*0.06),indirect=round(targetCost*0.1); const external=round(targetCost-labor-tax-indirect);
   projects.push({id,code:`JOB-${2401+n}`,name:titles[n],clientId:clients[c].id,brandId:brands[c].id,contractId:contracts[c].id,departmentId,ownerId:person.id,status:[3,7,16,24,30].includes(n)?'atrasado':n%3===2?'concluído':n%7===6?'em aprovação':'em andamento',revenue,contracted:round(revenue*1.41),invoiced:round(revenue*0.9),received:round(revenue*0.78),external,tax,indirect,planned:[120,140,95,85,160,110,90,130][n%8],due:`2024-03-${String(5+n%23).padStart(2,'0')}`});
  }
 }
 // A soma dos valores contratados dos jobs é exatamente o total de contratos.
 for(let c=0;c<8;c++) { const own=projects.filter(p=>p.clientId===clients[c].id);own[own.length-1].contractId=contracts[c+12].id;own[own.length-1].brandId=contracts[c+12].brandId; }
 for(const contract of contracts){contract.value=round(projects.filter(p=>p.contractId===contract.id).reduce((s,p)=>s+p.contracted,0));contract.versions[0].value=round(contract.value*0.9);contract.versions[1].value=contract.value;}
 // Alocações vinculadas a projetos do mesmo cliente, sem exceder o contrato.
 const allocations=Array.from({length:24},(_,i)=>{const contract=contracts[i%20];const linked=projects.filter(p=>p.contractId===contract.id);return {id:`rateio-${i+1}`,contractId:contract.id,projectId:linked[Math.floor(i/20)%linked.length].id,amount:round(contract.value*(i<4||i>=20?0.3:0.6))};});
 const financialEntries=projects.flatMap(p=>[
  {type:'Receita reconhecida',amount:p.revenue},{type:'Faturamento',amount:p.invoiced},{type:'Recebimento',amount:p.received},{type:'Fornecedores',amount:p.external},{type:'Impostos',amount:p.tax},{type:'Indiretos',amount:p.indirect}
 ].map((row,i)=>({id:`fin-${p.id}-${i+1}`,projectId:p.id,clientId:p.clientId,date:'2024-02-29',...row})));
 return {clients,departments,people,brands,categories,contracts,allocations,projects,entries,financialEntries};
}
