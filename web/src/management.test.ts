import {expect,it} from 'vitest';
import {INDICATORS,CHARTS,TABLES,ACCESS_MODULES} from '../../shared/catalog';
import {CASH_VIEW,DRE_VIEW,MANAGEMENT_VIEWS} from '../../shared/management';
import {columnPermission} from '../../shared/permissions';
import {shortState,managementText} from './lib';
it('abas referenciam itens existentes e mantêm os 107 indicadores do catálogo',()=>{
  expect(Object.keys(INDICATORS)).toHaveLength(107);
  for(const view of [...Object.values(MANAGEMENT_VIEWS).flat(),DRE_VIEW,CASH_VIEW]){
    for(const id of view.indicators)expect(INDICATORS[id],id).toBeDefined();
    for(const id of view.charts)expect(CHARTS[id],id).toBeDefined();
    for(const id of view.tables)expect(TABLES[id],id).toBeDefined();
  }
  expect(ACCESS_MODULES.tables.atividades).not.toContain('cliente');
});
it('componentes financeiros e custos novos preservam proteção por coluna',()=>{
  for(const id of ['gestao_clientes','gestao_projetos','caixa_diario','caixa_mensal'])for(const col of TABLES[id].columns.filter(c=>c.type==='BRL'))expect(columnPermission(col.key),`${id}/${col.key}`).not.toBeNull();
});
it('mensagens gerenciais distinguem ausência, critério pendente e falha',()=>{
  expect(shortState({status:'INSUFFICIENT_DATA',reasonCode:'NO_RECORDS'})).toBe('Sem registros');
  expect(shortState({status:'INSUFFICIENT_DATA',reasonCode:'BUSINESS_POLICY_PENDING'})).toBe('Configuração necessária');
  expect(shortState({status:'ERROR'})).toBe('Falha na consulta');
  expect(managementText('Soma de service_amount por issued_at em core.invoices')).toBe('Soma de valor dos serviços por data de emissão em dados de origem');
});
