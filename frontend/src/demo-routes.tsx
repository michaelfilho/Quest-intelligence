import { CapacityDemo, ReworkDemo } from './pages/OperationalDemo';
import { BudgetDemo, CashFlowDemo, DreDemo, FinancialDashboard, LedgerDemo, OperatingCostsDemo } from './pages/FinancialDemo';
import { AssistantDemo, ComparisonsDemo, DiagnosticsDemo } from './pages/IntelligenceDemo';
import { AccountsDemo, AllocationRulesDemo, AuditDemo, GoalsDemo, PermissionsDemo } from './pages/AdministrationDemo';
import { ManagementAlerts } from './pages/Executive';

export const demoRoutes=[
 {path:'/capacidade-operacional',element:<CapacityDemo/>},
 {path:'/refacoes-alteracoes',element:<ReworkDemo/>},
 {path:'/dashboard-financeiro',element:<FinancialDashboard/>},
 {path:'/dre-gerencial',element:<DreDemo/>},
 {path:'/fluxo-caixa',element:<CashFlowDemo/>},
 {path:'/receitas-despesas',element:<LedgerDemo/>},
 {path:'/custos-operacionais',element:<OperatingCostsDemo/>},
 {path:'/orcado-realizado',element:<BudgetDemo/>},
 {path:'/central-alertas',element:<ManagementAlerts title="Central de Alertas"/>},
 {path:'/diagnosticos',element:<DiagnosticsDemo/>},
 {path:'/analises-comparativas',element:<ComparisonsDemo/>},
 {path:'/assistente-ia',element:<AssistantDemo/>},
 {path:'/regras-rateio',element:<AllocationRulesDemo/>},
 {path:'/plano-contas',element:<AccountsDemo/>},
 {path:'/metas-parametros',element:<GoalsDemo/>},
 {path:'/permissoes',element:<PermissionsDemo/>},
 {path:'/auditoria',element:<AuditDemo/>}
];
