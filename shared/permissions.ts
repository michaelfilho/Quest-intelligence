// Catálogo de permissões e perfis padrão. Fonte única: o backend APLICA, o frontend só esconde.
// Regra: bloqueio por padrão — sem permissão explícita, sem acesso.

export const PERMISSIONS = {
  // Visualização por área de dados
  "estrategicos.view": "Visão executiva (indicadores estratégicos)",
  "financeiro.view": "Financeiro (receitas, despesas, lançamentos, notas)",
  "rentabilidade.view": "Rentabilidade (resultados e margens)",
  "custos_pessoal.view": "Custos de pessoal",
  "clientes.view": "Clientes",
  "contratos.view": "Contratos (contratado × executado)",
  "projetos.view": "Projetos / jobs",
  "producao.view": "Produção e timesheet",
  "departamentos.view": "Departamentos e colaboradores",
  "capacidade.view": "Capacidade e produtividade",
  "qualidade.view": "Qualidade dos dados",
  "relatorios.view": "Relatórios",
  "relatorios.export": "Exportar relatórios (CSV, XLSX e Markdown)",
  // Administração
  "config.view": "Ver configurações (banco e integrações)",
  "config.manage": "Alterar configurações gerais e segurança",
  "usuarios.manage": "Gerenciar usuários",
  "perfis.manage": "Gerenciar perfis e permissões",
  "ip.manage": "Gerenciar controle de acesso por IP",
  "sessoes.manage": "Ver e revogar sessões de todos os usuários",
  "auditoria.view": "Histórico de acessos e auditoria",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
export const isPermission = (p: string): p is Permission => p in PERMISSIONS;

const VIEW_ALL: Permission[] = ["estrategicos.view", "financeiro.view", "rentabilidade.view", "custos_pessoal.view", "clientes.view", "contratos.view", "projetos.view", "producao.view", "departamentos.view", "capacidade.view", "qualidade.view", "relatorios.view", "relatorios.export"];

/** Perfis criados na primeira inicialização. Depois disso, editáveis em Configurações (exceto Administrador). */
export const DEFAULT_ROLES: { id: string; name: string; description: string; permissions: Permission[] }[] = [
  { id: "admin", name: "Administrador", description: "Acesso total, incluindo usuários, perfis, IPs e auditoria. Não editável.", permissions: ALL_PERMISSIONS },
  { id: "diretoria", name: "Diretoria", description: "Todos os indicadores e relatórios. Sem administração.", permissions: [...VIEW_ALL, "config.view"] },
  { id: "financeiro", name: "Financeiro", description: "Financeiro, rentabilidade, custos de pessoal, clientes e contratos.", permissions: ["estrategicos.view", "financeiro.view", "rentabilidade.view", "custos_pessoal.view", "clientes.view", "contratos.view", "projetos.view", "relatorios.view", "relatorios.export"] },
  { id: "gestor", name: "Gestor de departamento", description: "Operação do próprio departamento (escopo definido no usuário), sem dados financeiros.", permissions: ["projetos.view", "producao.view", "departamentos.view", "capacidade.view", "clientes.view", "relatorios.view"] },
  { id: "analista", name: "Analista", description: "Indicadores operacionais e qualidade dos dados.", permissions: ["projetos.view", "producao.view", "departamentos.view", "capacidade.view", "clientes.view", "qualidade.view", "relatorios.view"] },
  { id: "consulta", name: "Consulta restrita", description: "Somente projetos e produção.", permissions: ["projetos.view", "producao.view"] },
];

/** Permissão exigida para abrir cada módulo. */
export const MODULE_PERMISSION: Record<string, Permission> = {
  executivo: "estrategicos.view",
  financeiro: "financeiro.view",
  rentabilidade: "rentabilidade.view",
  clientes: "clientes.view",
  cliente: "clientes.view",
  contratado: "contratos.view",
  contratos: "contratos.view",
  capacidade: "capacidade.view",
  eficiencia: "capacidade.view",
  projetos: "projetos.view",
  projeto: "projetos.view",
  producao: "producao.view",
  timesheet: "producao.view",
  departamentos: "departamentos.view",
  colaboradores: "departamentos.view",
  produtividade: "capacidade.view",
  qualidade: "qualidade.view",
};

/** Itens (indicador/gráfico/tabela/coluna) com dado sensível próprio, além da permissão do módulo. */
const ITEM_PERMISSION: Record<string, Permission> = {
  colaboradores:'departamentos.view',departamentos:'departamentos.view',capacidade_colaboradores:'capacidade.view',
  caixa_diario:'financeiro.view',caixa_mensal:'financeiro.view',titulos_receber:'financeiro.view',titulos_pagar:'financeiro.view',saldo:'financeiro.view',
  evolucao_resultado:'rentabilidade.view',
  lancamentos_futuros: "financeiro.view",
  custo_mao_de_obra: "custos_pessoal.view",
  horas_com_custo_positivo:'custos_pessoal.view',horas_sem_custo_positivo:'custos_pessoal.view',cobertura_custo_positivo_horas:'custos_pessoal.view',
  faturamento_por_cliente:'financeiro.view',notas_vinculos:'financeiro.view',rateios_financeiros:'financeiro.view',
  notas_ambiguas_detalhes:'financeiro.view',notas_sem_vinculo_detalhes:'financeiro.view',
  dre_categorias:'financeiro.view',dre_contas:'financeiro.view',movimentos_clientes:'financeiro.view',movimentos_projetos:'financeiro.view',conflitos_detalhes:'financeiro.view',
  entrada:'financeiro.view',saida:'financeiro.view',rateado:'financeiro.view',
  custo_registrado: "custos_pessoal.view",
  cobertura_custos: "custos_pessoal.view",
  apontamentos_custo_zero: "custos_pessoal.view",
  custos_registrados: "custos_pessoal.view",
  vinculos_centros_custo: "financeiro.view",
  custo_por_colaborador: "custos_pessoal.view",
  custo_por_cliente: "custos_pessoal.view",
  custo_por_departamento: "custos_pessoal.view",
  custo_por_projeto: "custos_pessoal.view",
  custo_por_atividade: "custos_pessoal.view",
  ...Object.fromEntries(
    ["margem_bruta", "margem_contribuicao", "margem_operacional", "resultado_operacional", "horas_por_mil_receita", "margem_por_cliente", "resultado_por_projeto", "evolucao_margem", "rentabilidade_clientes", "rentabilidade_projetos", "custo_por_servico", "top_clientes_resultado", "top_projetos_menor_margem", "resultado_mensal", "margem", "resultado", "custo_direto"].map((k) => [k, "rentabilidade.view" as Permission])
  ),
  ...Object.fromEntries(
    ["escopo_contratado", "receita_contratada", "entregas_vs_contratado", "contratado_vs_executado", "contratado_executado", "escopo", "desvio"].map((k) => [k, "contratos.view" as Permission])
  ),
  ...Object.fromEntries(
    ["lancamentos_financeiros", "notas_fiscais", "receita_por_cliente", "anomalias_financeiras", "faturado", "recebido", "em_aberto", "receita", "despesas", "participacao", "valor"].map((k) => [k, "financeiro.view" as Permission])
  ),
};

const BASIS_PERMISSION: Record<string, Permission | undefined> = {
  faturamento: "financeiro.view",
  recebimento: "financeiro.view",
  competencia: "financeiro.view",
  ingestao: "qualidade.view",
};

/** Permissão de dado exigida por um item do catálogo (null = basta a do módulo). */
export function itemPermission(id: string, basis?: string): Permission | null {
  return ITEM_PERMISSION[id] ?? (basis ? BASIS_PERMISSION[basis] : undefined) ?? null;
}

/** Permissão exigida por uma coluna de tabela (pelo nome da coluna). */
export const columnPermission = (key: string): Permission | null => ITEM_PERMISSION[key] ?? null;
