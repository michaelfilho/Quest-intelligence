// Composição do Dashboard Executivo do design (banner, 10 cartões, alertas, gráficos, rankings e bloco
// comercial), alimentada pelos indicadores reais. Sem dados, cada componente mostra o próprio estado vazio.
import { Link } from 'react-router-dom';
import { CHARTS, INDICATORS, TABLES } from '../../../shared/catalog';
import type { Filters } from '../../../shared/contracts';
import { DataTable } from '../components/DataTable';
import { AlertsPanel } from '../components/ManagementPanels';
import { ProgressiveChart, ProgressiveIndicator, Viewport } from '../components/Progressive';
import { useCatalogCan } from '../lib';

export const DASHBOARD_STATS = ['receita_recebida', 'despesas', 'custo_mao_de_obra', 'resultado_operacional', 'margem_operacional', 'projetos_ativos', 'projetos_atrasados', 'horas_registradas', 'colaboradores_ativos', 'departamentos_cadastrados'];
const DASHBOARD_CHARTS = ['receitas_vs_despesas', 'horas_por_departamento'];
const DASHBOARD_RANKINGS = ['top_clientes_resultado', 'top_projetos_menor_margem'];
const DASHBOARD_COMMERCIAL = ['marcas_cadastradas', 'contratos_cadastrados', 'faturamento_liquido', 'valores_em_aberto'];

export function Dashboard({ filters, onOpen }: { filters: Filters; onOpen: (id: string) => void }) {
  const allowed = useCatalogCan();
  const stats = (ids: string[]) => ids.filter((id) => allowed('indicators', id)).map((id) => <ProgressiveIndicator key={id} def={INDICATORS[id]} filters={filters} onOpen={() => onOpen(id)} />);
  const charts = DASHBOARD_CHARTS.filter((id) => allowed('charts', id));
  const rankings = DASHBOARD_RANKINGS.filter((id) => allowed('tables', id));
  const commercial = stats(DASHBOARD_COMMERCIAL);
  return (
    <>
      <div className="stats-grid dashboard-stats">{stats(DASHBOARD_STATS)}</div>
      <AlertsPanel filters={filters} compact />
      {charts.length > 0 && <div className="two-columns">{charts.map((id) => <Viewport key={id}>{(active) => <ProgressiveChart def={CHARTS[id]} filters={filters} active={active} />}</Viewport>)}</div>}
      {rankings.length > 0 && <div className="two-columns">{rankings.map((id) => <Viewport key={id}>{(active) => <DataTable def={TABLES[id]} filters={filters} active={active} />}</Viewport>)}</div>}
      {commercial.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Indicadores Comerciais</h2><p>Contratos, marcas e receitas na mesma base integrada.</p></div>
            <Link className="text-link" to="/clientes">Ver clientes</Link>
          </div>
          <div className="four-columns">{commercial}</div>
        </section>
      )}
    </>
  );
}
