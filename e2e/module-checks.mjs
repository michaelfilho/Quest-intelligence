import assert from 'node:assert/strict';

export const modulePaths=['/capacidade-operacional','/refacoes-alteracoes','/dashboard-financeiro','/dre-gerencial','/fluxo-caixa','/receitas-despesas','/custos-operacionais','/orcado-realizado','/central-alertas','/diagnosticos','/analises-comparativas','/assistente-ia','/regras-rateio','/plano-contas','/metas-parametros','/permissoes','/auditoria'];

export async function moduleChecks({check,goto,page,shot,rowCount}) {
 await check('Capacidade: filtro de sobrecarga e vínculo com equipe',async()=>{
  await goto('/capacidade-operacional');await rowCount(9);await page.getByRole('checkbox',{name:'Somente sobrecarga'}).check();await rowCount(2);await shot('10-capacidade');
  await page.locator('tbody tr').first().getByRole('link').first().click();assert.ok(new URL(page.url()).searchParams.get('dept'));
 });
 await check('Refações: detalhes e peças de retrabalho',async()=>{
  await goto('/refacoes-alteracoes');await page.getByRole('button',{name:'Ver revisões',exact:true}).first().click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').locator('summary').first().click();await page.getByRole('dialog').getByText('Sim',{exact:true}).first().waitFor();await page.keyboard.press('Escape');
 });
 await check('Financeiro: dashboard, DRE e exportação',async()=>{
  await goto('/dashboard-financeiro');await shot('11-financeiro');await page.getByRole('link',{name:'Ver DRE Gerencial'}).click();await page.getByRole('heading',{name:'DRE Gerencial',exact:true}).waitFor();await rowCount(7);await shot('12-dre');const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV'}).click();assert.equal((await download).suggestedFilename(),'dre-gerencial-demo.csv');
 });
 await check('Fluxo de caixa: realizado e projeção separados',async()=>{
  await goto('/fluxo-caixa');await rowCount(6);await page.getByRole('tab',{name:'Projeção',exact:true}).click();await rowCount(3);await page.getByText(/Projeção simulada: distribui/).waitFor();await shot('13-caixa');
 });
 await check('Lançamentos: regimes, filtro de cliente e paginação',async()=>{
  await goto('/receitas-despesas');await rowCount(25);await page.getByRole('button',{name:'Próxima',exact:true}).click();await page.getByText('Página 2 de 7',{exact:true}).waitFor();await page.getByRole('tab',{name:'Faturamento',exact:true}).click();await page.getByRole('combobox',{name:'Todos os Clientes',exact:true}).selectOption('cli-2');await rowCount(5);await page.getByRole('tab',{name:'Caixa',exact:true}).click();await rowCount(25);
 });
 await check('Custos e orçamento: composição, jobs e desvios',async()=>{
  await goto('/custos-operacionais');await rowCount(4);await page.getByRole('tab',{name:'Por Projeto',exact:true}).click();await rowCount(35);await goto('/orcado-realizado');await page.getByRole('checkbox',{name:'Somente acima do orçamento'}).check();await rowCount(6);await shot('14-orcamento');
 });
 await check('Central de alertas e diagnósticos: dados e evidências',async()=>{
  await goto('/central-alertas');await page.getByRole('heading',{name:'Central de Alertas',exact:true}).waitFor();const source=await page.request.get(new URL('/api/v1/alertas-gerenciais',page.url()).href).then(r=>r.json());const expected=source.data.filter(r=>r.category==='Capacidade').length;await page.getByRole('combobox',{name:'Todas as Categorias'}).selectOption('Capacidade');await page.waitForFunction(count=>document.querySelectorAll('.management-alert').length===count,expected);await goto('/diagnosticos');assert.equal(await page.getByRole('link',{name:'Analisar evidências',exact:true}).count(),4);await shot('15-diagnosticos');
 });
 await check('Comparativos: troca de contas e indicadores',async()=>{
  await goto('/analises-comparativas');await page.getByRole('combobox',{name:'Selecionar conta A'}).selectOption('cli-3');await page.getByRole('combobox',{name:'Selecionar conta B'}).selectOption('cli-4');await page.getByRole('button',{name:'Inverter contas'}).click();await page.waitForFunction(()=>document.querySelector('select[aria-label="Selecionar conta A"]').value==='cli-4');await rowCount(5);
 });
 await check('Assistente: resposta explicitamente simulada e navegação',async()=>{
  await goto('/assistente-ia');await page.getByRole('button',{name:'Onde há retrabalho?',exact:true}).click();await page.getByRole('heading',{name:'Análise simulada · QUEST INTELLIGENCE',exact:true}).waitFor();await page.getByText(/Nenhum modelo de IA ou serviço externo/).waitFor();await shot('16-assistente');await page.getByRole('link',{name:'Analisar origem',exact:true}).click();await page.waitForURL('**/refacoes-alteracoes');
 });
 await check('Rateio: simulação de centavos, troca de critério e navegação',async()=>{
  await goto('/regras-rateio');await page.getByRole('spinbutton',{name:'Valor de indiretos'}).fill('0.18');await page.getByRole('button',{name:'Simular distribuição'}).click();await page.getByRole('heading',{name:'Comparação Antes / Depois'}).waitFor();await rowCount(35);await page.getByRole('combobox',{name:'Critério de distribuição'}).selectOption('revenue');await page.getByRole('spinbutton',{name:'Valor de indiretos'}).fill('1000');await page.getByRole('button',{name:'Simular distribuição'}).click();await page.getByText('R$ 1.000,00',{exact:true}).first().waitFor();
 });
 await check('Plano de contas: conta abre lançamentos no regime correto',async()=>{
  await goto('/plano-contas');await rowCount(7);await page.getByRole('link',{name:'Faturamento a clientes',exact:true}).click();await page.waitForURL('**/receitas-despesas?conta=1.2');await rowCount(25);assert.equal(await page.getByRole('tab',{name:'Faturamento',exact:true}).getAttribute('aria-selected'),'true');
 });
 await check('Metas: aplicar e restaurar sem gravar nos indicadores',async()=>{
  await goto('/metas-parametros');await page.getByRole('spinbutton',{name:'Meta Margem Operacional',exact:true}).fill('90');await page.getByRole('button',{name:'Aplicar na simulação'}).click();await page.getByRole('status').filter({hasText:'Metas aplicadas apenas nesta tela'}).waitFor();const row=page.locator('tbody tr').filter({hasText:'Margem Operacional'});await row.getByText('Atenção',{exact:true}).waitFor();await page.getByRole('button',{name:'Restaurar referências'}).click();await row.getByText('Na meta',{exact:true}).waitFor();
 });
 await check('Permissões: quatro perfis apenas ilustrativos',async()=>{
  await goto('/permissoes');await page.getByRole('combobox',{name:'Selecionar perfil demo'}).selectOption('Administrador');await page.waitForFunction(()=>[...document.querySelectorAll('tbody tr')].every(r=>r.textContent.includes('Permitido na proposta')));await shot('17-permissoes');await page.getByRole('combobox',{name:'Selecionar perfil demo'}).selectOption('Coordenadores');await page.locator('tbody').getByText('Restrito na proposta',{exact:true}).first().waitFor();
 });
 await check('Auditoria: busca, filtro, CSV e registros fictícios',async()=>{
  await goto('/auditoria');await rowCount(25);await page.getByRole('combobox',{name:'Todos os Módulos'}).selectOption('Rateios');await rowCount(24);await page.getByRole('textbox',{name:'Buscar evento, responsável ou entidade...'}).fill('sem-resultado');await page.getByText('Nenhum registro encontrado para os filtros selecionados.').waitFor();await page.getByRole('button',{name:'Limpar',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV'}).click();assert.equal((await download).suggestedFilename(),'auditoria-demo.csv');
 });
}
