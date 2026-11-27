import {Bell} from 'lucide-react';
import {AlertsPanel} from '../components/ManagementPanels';
import {FilterBar} from '../components/FilterBar';
import {PageHeader} from '../components/ui';
import {useFilters,useDebouncedFilters,useCan} from '../lib';
import {NoAccess} from './ModulePage';
export function AlertsPage(){
  const {filters}=useFilters(),current=useDebouncedFilters(filters);
  const can=useCan();
  if(!can('estrategicos.view')&&!can('producao.view')&&!can('projetos.view')&&!can('financeiro.view')&&!can('qualidade.view'))return <NoAccess title="Alertas"/>;
  return <div className="mx-auto max-w-[1480px] space-y-6"><PageHeader icon={Bell} title="Alertas" subtitle="Pontos de atenção financeira e operacional, respeitando suas permissões."/><FilterBar/><AlertsPanel filters={current}/></div>;
}
