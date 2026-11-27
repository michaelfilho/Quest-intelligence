import { Activity, BrainCircuit, Briefcase, Building2, Clock, Factory, FileText, Layers, LayoutGrid, Link2, ListChecks, Lock, Scale, Settings, Shield, Tags, Target, TrendingUp, Users, Wallet, Zap, type LucideIcon } from 'lucide-react';
import { MODULES } from '../../shared/catalog';
import { monthPeriod, todaySP } from '../../shared/contracts';
import { MODULE_PERMISSION, type Permission } from '../../shared/permissions';
import type { ManagementView } from '../../shared/management';

export const MODULE_ICON: Record<string, LucideIcon> = {
  executivo: LayoutGrid, clientes: Building2, cliente: Building2, projetos: Briefcase, projeto: Briefcase,
  rentabilidade: TrendingUp, financeiro: Wallet, timesheet: Clock, departamentos: Layers, colaboradores: Users,
  produtividade: Zap, producao: Factory, contratado: Scale, contratos: FileText, capacidade: Activity,
  eficiencia: Zap, qualidade: Link2,
};

export interface NavItem {
  id: string;
  path: string;
  label: string;
  group: string;
  icon: LucideIcon;
  question: string;
  /** Basta UMA destas permissões para ver o item (o backend sempre confere). */
  anyOf: Permission[];
}

/** Página montada sobre um módulo do catálogo: só escolhe quais itens reais exibir. */
export interface SectionPage { path: string; moduleId: string; preset: ManagementView; compare?: boolean }
const preset = (id: string, label: string, indicators: string[] = [], charts: string[] = [], tables: string[] = [], notice?: string): ManagementView => ({ id, label, indicators, charts, tables, notice });
const page = (path: string, moduleId: string, view: ManagementView, compare?: boolean): SectionPage => ({ path, moduleId, preset: view, compare });

export const SECTION_PAGES: SectionPage[] = [
  page('/indicadores-estrategicos', 'executivo', preset('estrategicos', 'Indicadores Estratégicos',
    ['receita_faturada', 'receita_recebida', 'resultado_operacional', 'margem_operacional', 'projetos_ativos', 'projetos_atrasados', 'horas_registradas', 'clientes_ativos'],
    ['evolucao_resultado', 'receitas_vs_despesas'])),
  page('/rentabilidade-consolidada', 'rentabilidade', preset('consolidada', 'Rentabilidade Consolidada',
    ['receita_recebida', 'custo_mao_de_obra', 'resultado_operacional', 'margem_operacional'],
    ['margem_por_cliente', 'resultado_por_projeto', 'evolucao_margem'], ['rentabilidade_clientes', 'rentabilidade_projetos'])),
  page('/categorias-servicos', 'rentabilidade', preset('categorias', 'Categorias de Serviços',
    [], ['entregas_por_servico'], ['custo_por_servico'], 'Os serviços seguem o catálogo de peças da origem. Não há cadastro próprio de categorias comerciais.')),
  page('/rentabilidade-comercial', 'rentabilidade', preset('comercial', 'Rentabilidade Comercial',
    ['receita_recebida', 'custo_mao_de_obra', 'resultado_operacional', 'margem_operacional'], ['top_clientes_faturamento', 'margem_por_cliente'], ['rentabilidade_clientes'])),
  page('/integracoes', 'qualidade', preset('integracoes', 'Integrações',
    ['ultima_sincronizacao', 'ultima_publicacao_core', 'tarefas_com_falhas', 'tarefas_pendentes', 'conflitos_abertos', 'cobertura_dados'],
    ['ingest_por_status'], ['estados_publicacao', 'tarefas_ingest', 'conflitos'])),
  page('/pecas-atividades', 'producao', preset('pecas', 'Peças e Atividades',
    ['pecas_trabalhadas', 'atividades_trabalhadas', 'tarefas_trabalhadas', 'etapas_trabalhadas'], ['pecas_por_cliente'], ['pecas_trabalhadas', 'atividades'])),
  page('/capacidade-operacional', 'capacidade', preset('capacidade-operacional', 'Capacidade Operacional',
    ['capacidade_disponivel', 'ocupacao', 'horas_previstas', 'horas_registradas'], ['ocupacao_por_departamento', 'previstas_vs_realizadas'], ['capacidade_colaboradores'])),
  page('/refacoes-alteracoes', 'eficiencia', preset('refacoes', 'Refações e Alterações',
    ['horas_retrabalho', 'percentual_retrabalho', 'retrabalho', 'alteracoes'], ['retrabalho_por_colaborador'], ['retrabalho'])),
  page('/receitas-despesas', 'financeiro', preset('lancamentos', 'Receitas e Despesas',
    ['entradas_realizadas', 'saidas_realizadas', 'saldo_movimentacoes'], ['movimentacoes_realizadas'], ['lancamentos_financeiros'])),
  page('/custos-operacionais', 'financeiro', preset('custos', 'Custos Operacionais',
    ['despesas', 'despesas_fixas', 'despesas_variaveis', 'despesas_nao_operacionais', 'impostos_pagos', 'custos_diretos', 'custos_indiretos'],
    ['despesas_por_categoria', 'despesas_por_centro_custo'], ['vinculos_centros_custo'])),
  page('/orcado-realizado', 'produtividade', preset('orcado', 'Orçado vs. Realizado',
    ['horas_previstas', 'horas_registradas', 'desvio_horas', 'unidades_sem_estimativa'], ['previstas_vs_realizadas'], ['atividades'],
    'A comparação disponível é de horas previstas e realizadas. Não há fonte de orçamento financeiro na integração; nenhum valor orçado é estimado.')),
  page('/analises-comparativas', 'executivo', preset('comparativas', 'Análises Comparativas',
    ['receita_faturada', 'receita_recebida', 'despesas', 'resultado_operacional', 'horas_registradas', 'projetos_ativos'], ['receitas_vs_despesas'], [],
    'Cada indicador é comparado com o período imediatamente anterior, de mesma duração.'), true),
  page('/regras-rateio', 'financeiro', preset('rateio', 'Regras de Rateio',
    ['despesas_rateadas', 'despesas_sem_rateio', 'despesas_rateio_divergente'], ['despesas_por_centro_custo'], ['rateios_financeiros'],
    'Consulta dos rateios registrados na origem. A aplicação não cria nem altera regras de rateio.')),
  page('/plano-contas', 'financeiro', preset('plano', 'Plano de Contas', [], [], ['dre_categorias', 'dre_contas'],
    'Categorias e contas com movimentação no período, conforme a origem. Somente consulta.')),
];

/** Telas do design sem fonte confiável no banco: mostram a indisponibilidade, sem nenhum número. */
export const UNAVAILABLE_PAGES: { path: string; label: string; permission: Permission; reason: string }[] = [
  { path: '/marcas', label: 'Marcas', permission: 'clientes.view', reason: 'A integração não possui cadastro de marcas. Grupos empresariais não são marcas e não são usados como substituto.' },
  { path: '/fees-jobs-extras', label: 'Fees e Jobs Extras', permission: 'contratos.view', reason: 'Não há fonte de contratos de fee nem classificação de jobs extras na integração.' },
  { path: '/diagnosticos', label: 'Diagnósticos', permission: 'estrategicos.view', reason: 'Os critérios de diagnóstico gerencial ainda não foram definidos e aprovados. Consulte a Central de Alertas.' },
  { path: '/assistente-ia', label: 'Assistente de IA', permission: 'estrategicos.view', reason: 'Nenhum serviço de inteligência artificial está integrado a esta versão.' },
  { path: '/metas-parametros', label: 'Metas e Parâmetros', permission: 'config.view', reason: 'Não há cadastro de metas aprovado. Os parâmetros do sistema estão em Configurações.' },
];

const NO_QUESTION = '';
const moduleItem = (id: string, group: string, label?: string): NavItem => {
  const m = MODULES.find((m) => m.id === id)!;
  return { id, path: m.path, label: label ?? m.label, group, icon: MODULE_ICON[id], question: m.question, anyOf: [MODULE_PERMISSION[id]] };
};
const sectionItem = (path: string, group: string, icon: LucideIcon): NavItem => {
  const s = SECTION_PAGES.find((s) => s.path === path)!;
  return { id: s.preset.id, path, label: s.preset.label, group, icon, question: NO_QUESTION, anyOf: [MODULE_PERMISSION[s.moduleId]] };
};
const unavailableItem = (path: string, group: string, icon: LucideIcon): NavItem => {
  const u = UNAVAILABLE_PAGES.find((u) => u.path === path)!;
  return { id: path.slice(1), path, label: u.label, group, icon, question: NO_QUESTION, anyOf: [u.permission] };
};
const item = (id: string, path: string, label: string, group: string, icon: LucideIcon, anyOf: Permission[]): NavItem => ({ id, path, label, group, icon, question: NO_QUESTION, anyOf });

const G1 = '01 — Dashboard Executivo', G2 = '02 — Gestão Comercial', G3 = '03 — Gestão Operacional', G4 = '04 — Controladoria e Financeiro', G5 = '05 — Inteligência Gerencial', G6 = '06 — Administração';
const ALERTS: Permission[] = ['estrategicos.view', 'producao.view', 'projetos.view', 'financeiro.view', 'qualidade.view'];

export const NAV: NavItem[] = [
  moduleItem('executivo', G1, 'Visão Geral'), sectionItem('/indicadores-estrategicos', G1, Target), sectionItem('/rentabilidade-consolidada', G1, TrendingUp),
  item('alertas', '/alertas', 'Alertas Gerenciais', G1, Activity, ALERTS),

  moduleItem('clientes', G2), unavailableItem('/marcas', G2, Tags), moduleItem('contratos', G2, 'Contratos'), sectionItem('/categorias-servicos', G2, Layers),
  unavailableItem('/fees-jobs-extras', G2, Wallet), sectionItem('/rentabilidade-comercial', G2, TrendingUp), sectionItem('/integracoes', G2, Link2),

  moduleItem('projetos', G3, 'Projetos / Jobs'), moduleItem('producao', G3), moduleItem('timesheet', G3), moduleItem('departamentos', G3), moduleItem('colaboradores', G3),
  moduleItem('produtividade', G3, 'Produtividade'), sectionItem('/pecas-atividades', G3, ListChecks), sectionItem('/capacidade-operacional', G3, Activity), sectionItem('/refacoes-alteracoes', G3, FileText),

  moduleItem('rentabilidade', G4), item('relatorios', '/relatorios', 'Relatórios', G4, FileText, ['relatorios.view']), moduleItem('financeiro', G4, 'Dashboard Financeiro'),
  item('dre', '/dre', 'DRE Gerencial', G4, Scale, ['financeiro.view']), item('caixa', '/fluxo-caixa', 'Fluxo de Caixa', G4, Wallet, ['financeiro.view']),
  sectionItem('/receitas-despesas', G4, Wallet), sectionItem('/custos-operacionais', G4, Wallet), sectionItem('/orcado-realizado', G4, Target),

  item('central-alertas', '/central-alertas', 'Central de Alertas', G5, Activity, ALERTS), unavailableItem('/diagnosticos', G5, Activity), sectionItem('/analises-comparativas', G5, TrendingUp), unavailableItem('/assistente-ia', G5, BrainCircuit),
  moduleItem('qualidade', G5, 'Qualidade dos Dados'),

  item('configuracoes', '/configuracoes', 'Configurações', G6, Settings, ['config.view', 'usuarios.manage', 'perfis.manage', 'ip.manage', 'sessoes.manage', 'auditoria.view']),
  item('controle-acesso', '/controle-acesso', 'Controle de Acesso', G6, Lock, ['ip.manage']),
  sectionItem('/regras-rateio', G6, Layers), sectionItem('/plano-contas', G6, FileText), unavailableItem('/metas-parametros', G6, Target),
  item('permissoes', '/permissoes', 'Permissões', G6, Shield, ['perfis.manage']), item('auditoria', '/auditoria', 'Auditoria', G6, Shield, ['auditoria.view']),
];

/** Itens de menu liberados para um conjunto de permissões (o backend aplica de verdade). */
export const navFor = (perms: ReadonlySet<string>) => NAV.filter((n) => n.anyOf.some((p) => perms.has(p)));

export function periodPresets() {
  const t = todaySP();
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7));
  const prev = m === 1 ? monthPeriod(y - 1, 12) : monthPeriod(y, m - 1);
  return [
    { label: 'Mês atual', start: `${t.slice(0, 8)}01`, end: t },
    { label: 'Mês anterior', ...prev },
    { label: 'Ano atual', start: `${y}-01-01`, end: t },
    { label: 'Ano anterior', start: `${y - 1}-01-01`, end: `${y - 1}-12-31` },
    { label: 'Últimos 12 meses', start: new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10), end: t },
  ];
}
