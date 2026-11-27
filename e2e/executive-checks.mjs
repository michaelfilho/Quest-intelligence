import assert from 'node:assert/strict';

export async function executiveChecks({check,goto,page,shot,rowCount}) {
 await check('Indicadores: metas demonstrativas e navegação para origem',async()=>{
  await goto('/indicadores-estrategicos');await page.getByRole('heading',{name:'Indicadores Estratégicos',exact:true}).waitFor();
  assert.equal(await page.locator('.indicator-grid .panel').count(),8);await shot('06-indicadores-desktop');
  await page.getByRole('link',{name:'Analisar dados',exact:true}).first().click();assert.ok(page.url().endsWith('/rentabilidade'));
 });
 await check('Consolidado: composição de custos e dimensões reconciliadas',async()=>{
  await goto('/rentabilidade-consolidada');await page.getByRole('heading',{name:'Formação do Resultado',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Marcas',exact:true}).click();await page.locator('main').getByRole('link',{name:'Banco Institucional',exact:true}).waitFor();await shot('07-consolidado-desktop');
 });
 await check('Alertas gerenciais: filtros, estado vazio e origem',async()=>{
  await goto('/alertas-gerenciais');await page.getByRole('combobox',{name:'Todas as Categorias',exact:true}).selectOption('Prazo');
  await page.waitForFunction(()=>document.querySelectorAll('.management-alert').length===5);await shot('08-alertas-desktop');
  await page.getByRole('textbox',{name:'Buscar alerta, cliente ou job...'}).fill('sem-resultado-impossivel');await page.getByText('Nenhum alerta corresponde aos filtros selecionados.').waitFor();
  await page.getByRole('button',{name:'Limpar',exact:true}).click();const origin=page.getByRole('link',{name:'Analisar origem',exact:true}).first();const href=await origin.getAttribute('href');await origin.click();await page.waitForURL(url=>url.pathname+url.search===href);
 });
 await check('Peças: filtros, paginação, exportação e drawer com vínculo direto',async()=>{
  await goto('/pecas-atividades');await rowCount(25);await page.getByRole('button',{name:'Próxima',exact:true}).click();await page.getByText('Página 2 de 16',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Todos os Clientes',exact:true}).selectOption('cli-2');await page.getByText('Página 1 de 3',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Somente retrabalho'}).check();await page.getByRole('button',{name:'Ver atividades',exact:true}).first().click();await page.getByRole('dialog').locator('summary').first().click();
  await page.getByRole('dialog').getByRole('link',{name:/PEÇA-/}).first().click();assert.ok(new URL(page.url()).searchParams.get('peca'));await rowCount(1);
  await page.getByRole('button',{name:'Limpar filtros'}).click();await rowCount(25);await shot('09-pecas-desktop');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV'}).click();assert.equal((await download).suggestedFilename(),'pecas-atividades-quest.csv');
 });
}
