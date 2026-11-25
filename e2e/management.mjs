// Navegação com Express/pg/PGlite e dados sintéticos. Sem PostgreSQL externo, VPS ou dados empresariais.
import {chromium} from 'playwright-core';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const BASE=process.env.BASE,OUT=new URL('./output/',import.meta.url),period='start=2026-01-01&end=2026-01-31';
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.EDGE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'pt-BR'});page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));const results=[];
const check=async(name,fn)=>{try{await fn();results.push({name,ok:true});console.info('✔',name);}catch(e){results.push({name,ok:false,error:e.message});console.info('✖',name,e.message.slice(0,200));}};
const goto=path=>page.goto(`${BASE}${path}${path.includes('?')?'&':'?'}${period}`);
const shot=name=>page.screenshot({path:fileURLToPath(new URL(`management-${name}.png`,OUT)),fullPage:true});
async function panel(title){const target=page.locator('section').filter({has:page.getByRole('heading',{level:3,name:title,exact:true})}).last();for(let i=0;i<8&&!await target.count();i++){await page.mouse.wheel(0,650);await page.waitForTimeout(150);}await target.waitFor();await target.scrollIntoViewIfNeeded();return target;}
try{
  await goto('/');await page.getByLabel('Usuário').fill(process.env.ADMIN_USER);await page.getByLabel('Senha',{exact:true}).fill(process.env.ADMIN_TEMP_PASSWORD);await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByText('Defina sua senha').waitFor();await page.getByLabel('Senha atual').fill(process.env.ADMIN_TEMP_PASSWORD);await page.getByLabel('Nova senha',{exact:true}).fill('Homolog-Gestao-2026!');await page.getByLabel('Confirmar nova senha').fill('Homolog-Gestao-2026!');await page.getByRole('button',{name:'Alterar senha'}).click();await page.getByRole('navigation',{name:'Módulos'}).waitFor();
  await check('menu: grupos recolhíveis e rotas financeiras',async()=>{const nav=page.getByRole('navigation',{name:'Módulos'}),group=nav.getByRole('button',{name:'Gestão Financeira',exact:true});await group.click();if(await nav.getByRole('link',{name:'DRE Gerencial',exact:true}).count())throw new Error('grupo não recolheu');await group.click();await nav.getByRole('link',{name:'DRE Gerencial',exact:true}).waitFor();});
  await check('clientes: pesquisa e valores separados, sem margem inventada',async()=>{await goto('/clientes');const table=await panel('Clientes');await table.getByRole('textbox',{name:'Pesquisar em Clientes'}).fill('Aurora');await page.waitForTimeout(450);await table.getByText('Cliente Aurora',{exact:true}).waitFor();if(await table.getByText('Cliente Horizonte',{exact:true}).count())throw new Error('pesquisa não aplicada');await shot('clientes');});
  await check('cliente: abas e navegação até projeto real',async()=>{const table=await panel('Clientes');await table.getByText('Cliente Aurora',{exact:true}).click();await page.getByRole('navigation',{name:'Visualizações'}).getByRole('button',{name:'Projetos',exact:true}).click();const projects=await panel('Projetos');await projects.getByText('Campanha Aurora',{exact:true}).click();await page.getByRole('heading',{level:1,name:/Campanha Aurora/}).waitFor();await shot('projeto');});
  await check('projeto: atividades expansíveis e apontamentos da unidade',async()=>{await page.getByRole('navigation',{name:'Visualizações'}).getByRole('button',{name:'Peças e Atividades',exact:true}).click();const activities=await panel('Peças e atividades trabalhadas');await activities.getByRole('button',{name:'Ver apontamentos'}).first().click();await activities.getByRole('heading',{level:3,name:'Apontamentos de horas'}).waitFor();await activities.getByText('Descrição sintética da tarefa').waitFor();await shot('atividade');});
  await check('DRE: expansão de categoria e navegação para lançamentos',async()=>{await goto('/dre');await page.getByRole('button',{name:'Expandir Receita operacional recebida',exact:true}).click();const categories=await panel('Categorias financeiras');await categories.getByText('Receita fixture',{exact:true}).click();await page.getByRole('button',{name:'Remover filtro de categoria'}).waitFor();const entries=await panel('Lançamentos financeiros');await entries.getByText('Receita fixture',{exact:true}).waitFor();if(await entries.getByText('Despesa fixture',{exact:true}).count())throw new Error('categoria não filtrou');await shot('categoria');});
  await check('calendário: dia navega aos registros reais do período',async()=>{await goto('/timesheet?aba=calendario');const calendar=await panel('Calendário de horas');await calendar.getByRole('button',{name:'2026-01-05, abrir apontamentos'}).click();await page.waitForURL(/aba=registros/);const records=await panel('Apontamentos de horas');await records.getByText('Criação da campanha').first().waitFor();if(!page.url().includes('end=2026-01-05'))throw new Error('dia não delimitou o período');await shot('calendario');});
  await check('departamento → colaborador → projeto → atividade',async()=>{await goto('/departamentos');const departments=await panel('Departamentos da agência');await departments.getByText('Criação',{exact:true}).click();const employees=await panel('Colaboradores');await employees.getByText('Ana Lima',{exact:true}).first().click();const projects=await panel('Horas por projeto');await projects.getByText('Campanha Aurora',{exact:true}).click();const activities=await panel('Peças e atividades trabalhadas');await activities.getByRole('button',{name:'Ver apontamentos'}).first().click();await activities.getByRole('heading',{name:'Apontamentos de horas',level:3}).waitFor();await shot('cadeia-operacional');});
  await check('CSV: exporta a página autorizada e filtrada',async()=>{await goto('/clientes');const clients=await panel('Clientes');await clients.getByText('Cliente Aurora',{exact:true}).waitFor();const [download]=await Promise.all([page.waitForEvent('download'),clients.getByRole('button',{name:'Exportar página'}).click()]);if(!download.suggestedFilename().includes('gestao_clientes_pagina_1'))throw new Error('exportação inesperada');});
  await check('financeiro: abas e componentes disponíveis no celular',async()=>{await page.setViewportSize({width:390,height:844});await goto('/financeiro');await page.getByRole('navigation',{name:'Visualizações'}).getByRole('button',{name:'Contas a Pagar',exact:true}).click();await page.getByRole('heading',{name:'Contas a pagar',level:3}).waitFor();const sizes=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);if(sizes[0]>sizes[1]+1)throw new Error('rolagem horizontal da página');await shot('celular');});
  await check('ordenação: servidor altera a ordem global e aria-sort',async()=>{
    await page.setViewportSize({width:1440,height:1000});await goto('/clientes');const clients=await panel('Clientes');
    const header=clients.locator('th:has(button:text-is("Cliente"))');await header.locator('button').click();
    if(await header.getAttribute('aria-sort')!=='ascending')throw new Error('ordem crescente não indicada');
    await clients.locator('tbody tr').first().getByText('Cliente % literal',{exact:true}).waitFor();await header.locator('button').click();
    if(await header.getAttribute('aria-sort')!=='descending')throw new Error('ordem decrescente não indicada');
    await clients.locator('tbody tr').first().getByText('Cliente Horizonte',{exact:true}).waitFor();
  });
  await check('status: filtro de projeto não produz zero em notas fiscais',async()=>{
    await goto('/projetos');await page.getByRole('button',{name:/Mais filtros/}).click();
    await page.getByLabel('Status',{exact:true}).selectOption({label:'Exemplo'});
    await page.waitForURL(/statusSource=projects/);
    const nav=page.getByRole('navigation',{name:'Módulos'});
    const finance=nav.getByRole('link',{name:'Financeiro',exact:true});
    if(!await finance.count())await nav.getByRole('button',{name:'Gestão Financeira',exact:true}).click();
    await finance.click();await page.getByRole('button',{name:'Remover filtro de status'}).waitFor();
    await page.getByRole('navigation',{name:'Visualizações'}).getByRole('button',{name:'Receitas',exact:true}).click();
    await page.getByText('Filtro não aplicável',{exact:true}).first().waitFor();
    await page.getByRole('button',{name:'Remover filtro de status'}).click();
    await page.waitForURL(url=>!url.searchParams.has('statusSource')&&!url.searchParams.has('status'));
  });
}finally{await browser.close();}
writeFileSync(new URL('management-result.json',OUT),JSON.stringify({synthetic:true,base:BASE,results,errors},null,2));
console.info(`${results.filter(r=>r.ok).length} aprovados · ${results.filter(r=>!r.ok).length} reprovados · ${errors.length} erros de página`);
process.exitCode=results.some(r=>!r.ok)||errors.length?1:0;
