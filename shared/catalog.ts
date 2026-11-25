// Catálogo único do QUEST RINNE: o que cada módulo mostra.
// Contém DEFINIÇÕES de negócio, nunca valores. As tabelas em `sources` são candidatas e
// precisam ser confirmadas com `npm run introspect` antes de qualquer cálculo.
import type { Basis, ChartDef, Column, ColumnType, IndicatorDef, ModuleDef, TableDef, Unit } from "./contracts.js";

const FE = "core.financial_entries";
const FECC = "core.financial_entry_cost_centers";
const INV = "core.invoices";
const JOBS = "core.jobs";
const PIECES = "core.job_pieces";
const TASKS = "core.job_tasks";
const STEPS = "core.workflow_steps";
const TIME = "core.time_entries";
const CLI = "core.clients";
const GRP = "core.client_groups";
const DEP = "core.departments";
const EMP = "core.employees";
const QT = "ingest.qpf11_tasks";
const QP = "ingest.qpf11_pages";
const AUDIT = "audit.* (a mapear)";

type I = Omit<IndicatorDef, "id">;
const ind = (label: string, unit: Unit, basis: Basis, formula: string, sources: string[], requires?: string, higherIsBetter?: boolean): I =>
  ({ label, unit, basis, formula, sources, requires, higherIsBetter });

const indicators: Record<string, I> = {
  // ---------------- FINANCEIRO ----------------
  receita_faturada: ind("Receita faturada", "BRL", "faturamento", "Soma das notas fiscais emitidas no período (data de emissão), excluindo canceladas.", [INV], "Data de emissão, valor e situação (cancelada) da nota fiscal.", true),
  receita_recebida: ind("Receita recebida", "BRL", "recebimento", "Soma dos lançamentos de receita efetivamente baixados no período (data de pagamento). Lançamentos previstos ou futuros são excluídos.", [FE], "Tipo do lançamento (receita/despesa), data e valor de baixa.", true),
  receita_competencia: ind("Receita por competência", "BRL", "competencia", "Soma dos lançamentos de receita cuja competência está no período, independentemente do pagamento.", [FE], "Campo de competência no lançamento financeiro.", true),
  valores_em_aberto: ind("Valores em aberto", "BRL", "recebimento", "Receitas com vencimento até o fim do período e sem baixa.", [FE], "Data de vencimento e situação de baixa."),
  despesas: ind("Despesas pagas", "BRL", "recebimento", "Soma dos lançamentos de despesa baixados no período.", [FE], "Tipo do lançamento e data de baixa."),
  custos_diretos: ind("Custos diretos", "BRL", "recebimento", "Despesas pagas vinculadas a cliente ou projeto via centro de custo. Horas NÃO são convertidas em custo sem metodologia validada.", [FE, FECC], "Centro de custo associado a cliente/projeto."),
  custos_indiretos: ind("Custos indiretos", "BRL", "recebimento", "Despesas pagas sem vínculo com cliente/projeto. Não são rateadas.", [FE, FECC], "Classificação de centros de custo (direto × indireto)."),
  resultado_operacional: ind("Resultado operacional", "BRL", "recebimento", "Receita recebida − custos diretos − custos indiretos, todos na mesma base (caixa).", [FE, FECC], "Receitas e despesas na mesma base temporal.", true),
  margem_bruta: ind("Margem bruta", "percent", "recebimento", "(Receita recebida − custos diretos) ÷ receita recebida.", [FE, FECC], "Custos diretos confiáveis.", true),
  margem_contribuicao: ind("Margem de contribuição", "percent", "recebimento", "(Receita recebida − custos variáveis) ÷ receita recebida.", [FE, FECC], "Classificação de custos variáveis — ainda não definida pela Quest.", true),
  margem_operacional: ind("Margem operacional", "percent", "recebimento", "Resultado operacional ÷ receita recebida.", [FE, FECC], "Custos diretos e indiretos completos.", true),
  lancamentos_futuros: ind("Lançamentos com data futura", "count", "competencia", "Lançamentos com data posterior a hoje (ex.: 166 em dez/2026 na auditoria). Nunca contam como realizados.", [FE]),

  // ---------------- PRODUÇÃO ----------------
  projetos_ativos: ind("Projetos ativos", "count", "operacional", "Jobs abertos (status não concluído/cancelado) no fim do período.", [JOBS], "Status de conclusão do job na origem.", true),
  projetos_iniciados: ind("Projetos iniciados", "count", "operacional", "Jobs com data de abertura no período.", [JOBS], "Data de abertura do job."),
  projetos_concluidos: ind("Projetos concluídos", "count", "operacional", "Jobs com data de conclusão no período e status de concluído na origem.", [JOBS], "Status e data de conclusão.", true),
  pecas_produzidas: ind("Peças produzidas", "count", "operacional", "Peças de jobs com conclusão no período.", [PIECES, JOBS], "Status/data de conclusão da peça.", true),
  atividades_concluidas: ind("Atividades concluídas", "count", "operacional", "Tarefas com status de concluída na origem e data de conclusão no período.", [TASKS], "Status de conclusão da tarefa.", true),
  entregas: ind("Entregas realizadas", "count", "operacional", "Definição de 'entrega' a validar com a Quest (peça aprovada, job entregue ou etapa final do workflow).", [PIECES, STEPS], "Critério oficial de entrega.", true),
  horas_registradas: ind("Horas registradas", "hours", "operacional", "Soma dos apontamentos de horas com data no período.", [TIME], "Duração e data do apontamento."),
  horas_previstas: ind("Horas previstas", "hours", "operacional", "Soma das horas orçadas/previstas nas tarefas ou jobs do período.", [TASKS, JOBS], "Campo de horas previstas na tarefa ou no job."),
  desvio_horas: ind("Desvio de horas", "hours", "operacional", "Horas registradas − horas previstas. Negativo = abaixo do previsto.", [TIME, TASKS], "Horas previstas confiáveis."),
  horas_retrabalho: ind("Horas de retrabalho", "hours", "operacional", "Horas apontadas em tarefas/etapas identificadas como refação.", [TIME, TASKS, STEPS], "Marcação de refação no workflow."),
  custo_mao_de_obra: ind("Custo de mão de obra", "BRL", "operacional", "Horas × custo/hora por colaborador. Só calculável com metodologia de custo validada — nenhum salário ou taxa é presumido.", [TIME, EMP], "Custo/hora oficial por colaborador (não existe na fonte até agora)."),
  projetos_atrasados: ind("Projetos em atraso", "count", "operacional", "Jobs abertos com prazo vencido ou concluídos após o prazo no período.", [JOBS], "Prazo e data de conclusão do job."),
  atrasos: ind("Atividades atrasadas", "count", "operacional", "Tarefas concluídas após o prazo ou abertas com prazo vencido.", [TASKS], "Prazo e data de conclusão da tarefa."),
  retrabalho: ind("Retrabalho / refações", "count", "operacional", "Tarefas ou etapas identificadas como refação na origem.", [TASKS, STEPS], "Marcação de refação no workflow."),
  alteracoes: ind("Alterações solicitadas", "count", "operacional", "Etapas de alteração solicitadas pelo cliente.", [STEPS, TASKS], "Etapa de alteração identificável."),
  tempo_medio_execucao: ind("Tempo médio de execução", "days", "operacional", "Média (conclusão − abertura) dos jobs concluídos no período.", [JOBS], "Datas de abertura e conclusão."),
  clientes_ativos: ind("Clientes ativos", "count", "operacional", "Clientes com job, apontamento ou lançamento no período.", [CLI, JOBS, FE], undefined, true),
  colaboradores_ativos: ind("Colaboradores com apontamento", "count", "operacional", "Colaboradores distintos com horas registradas no período.", [TIME, EMP]),

  // ---------------- EFICIÊNCIA / CAPACIDADE ----------------
  produtividade: ind("Entregas por hora", "ratio", "operacional", "Entregas realizadas ÷ horas registradas.", [PIECES, TIME], "Critério de entrega validado.", true),
  capacidade_disponivel: ind("Capacidade disponível", "hours", "operacional", "Soma da jornada contratada dos colaboradores ativos no período.", [EMP], "Fonte de jornada/disponibilidade — não identificada até agora."),
  horas_produtivas: ind("Horas produtivas", "hours", "operacional", "Horas apontadas em tarefas de jobs de clientes.", [TIME, TASKS], "Distinção entre job de cliente e job interno."),
  horas_improdutivas: ind("Horas improdutivas", "hours", "operacional", "Horas apontadas em atividades internas/administrativas.", [TIME, TASKS], "Classificação de jobs internos."),
  ocupacao: ind("Ocupação da capacidade", "percent", "operacional", "Horas registradas ÷ capacidade disponível.", [TIME, EMP], "Capacidade disponível."),
  tempo_medio_atividade: ind("Tempo médio por atividade", "hours", "operacional", "Horas apontadas ÷ atividades concluídas.", [TIME, TASKS]),
  horas_por_mil_receita: ind("Esforço operacional (h por R$ 1.000)", "ratio", "operacional", "Horas registradas ÷ (receita recebida ÷ 1.000). Mede esforço relativo, não custo.", [TIME, FE], "Receita e horas do mesmo cliente/período."),

  // ---------------- CONTRATADO × EXECUTADO ----------------
  escopo_contratado: ind("Escopo contratado", "count", "operacional", "Quantidade de entregas previstas em contrato no período.", ["contratos (não identificados no CORE)"], "Contratos/escopos estruturados — fonte inexistente até agora."),
  receita_contratada: ind("Receita contratada", "BRL", "competencia", "Valor contratual previsto para o período.", ["contratos (não identificados no CORE)"], "Contratos estruturados."),
  entregas_vs_contratado: ind("Executado ÷ contratado", "percent", "operacional", "Entregas realizadas ÷ escopo contratado.", [PIECES, "contratos"], "Escopo contratado."),
  horas_vs_previstas: ind("Horas ÷ horas previstas", "percent", "operacional", "Horas registradas ÷ horas orçadas no job.", [TIME, JOBS], "Horas previstas/orçadas no job."),

  // ---------------- QUALIDADE ----------------
  ultima_sincronizacao: ind("Última sincronização", "datetime", "ingestao", "Maior data de atualização em ingest.qpf11_tasks.", [QT]),
  ultima_publicacao_core: ind("Última publicação no CORE", "datetime", "ingestao", "Data da última publicação registrada na auditoria.", [AUDIT]),
  tarefas_recebidas: ind("Tarefas de coleta", "count", "ingestao", "Total de tarefas de coleta do QPF.", [QT]),
  tarefas_pendentes: ind("Tarefas pendentes", "count", "ingestao", "Tarefas com status pendente.", [QT]),
  tarefas_em_execucao: ind("Tarefas em execução", "count", "ingestao", "Tarefas com status em execução.", [QT]),
  tarefas_em_reconciliacao: ind("Tarefas em reconciliação", "count", "ingestao", "Tarefas em reconciliação (ex.: 209 divergências de projetos na auditoria).", [QT]),
  paginas_recebidas: ind("Páginas recebidas", "count", "ingestao", "Páginas da API iClips armazenadas.", [QP]),
  registros_recebidos: ind("Registros recebidos", "count", "ingestao", "Registros contidos nas páginas recebidas.", [QP]),
  conflitos_financeiros: ind("Conflitos financeiros", "count", "ingestao", "Conflitos de publicação financeira em aberto (ex.: 66 centros de custo + 28 documentos na auditoria).", [AUDIT]),
  divergencias_projetos: ind("Divergências de projetos", "count", "ingestao", "Tarefas de projetos com divergência de contagem.", [QT, AUDIT]),
  recursos_sem_atualizacao: ind("Recursos sem atualização", "count", "ingestao", "Recursos cujo último sucesso é anterior ao limite definido.", [QT]),
  cobertura_dados: ind("Cobertura dos dados", "percent", "ingestao", "Meses do período com coleta concluída ÷ meses do período.", [QT, QP]),
};

type C = Omit<ChartDef, "id">;
const ch = (label: string, kind: ChartDef["kind"], unit: Unit, basis: Basis, sources: string[]): C => ({ label, kind, unit, basis, sources });

const charts: Record<string, C> = {
  evolucao_financeira: ch("Evolução mensal: faturado × recebido × competência", "line", "BRL", "competencia", [INV, FE]),
  receitas_vs_despesas: ch("Receitas × despesas (caixa)", "bar", "BRL", "recebimento", [FE]),
  faturado_vs_recebido: ch("Faturado × recebido por mês", "bar", "BRL", "faturamento", [INV, FE]),
  concentracao_receita: ch("Concentração de receita por cliente", "ranking", "percent", "recebimento", [FE, CLI]),
  receita_por_grupo: ch("Receita por grupo empresarial", "ranking", "BRL", "recebimento", [FE, CLI, GRP]),
  top_clientes_receita: ch("Principais clientes por receita recebida", "ranking", "BRL", "recebimento", [FE, CLI]),
  receita_por_categoria: ch("Principais fontes de receita", "ranking", "BRL", "recebimento", [FE]),
  despesas_por_categoria: ch("Despesas por categoria", "ranking", "BRL", "recebimento", [FE]),
  despesas_por_centro_custo: ch("Despesas por centro de custo", "ranking", "BRL", "recebimento", [FE, FECC]),
  margem_por_cliente: ch("Margem bruta por cliente", "ranking", "percent", "recebimento", [FE, FECC, CLI]),
  resultado_por_projeto: ch("Resultado por projeto", "ranking", "BRL", "recebimento", [FE, FECC, JOBS]),
  evolucao_margem: ch("Evolução da margem bruta", "line", "percent", "recebimento", [FE, FECC]),
  evolucao_producao: ch("Evolução mensal da produção", "line", "count", "operacional", [JOBS, PIECES, TASKS]),
  projetos_por_status: ch("Projetos por status", "bar", "count", "operacional", [JOBS]),
  entregas_por_departamento: ch("Entregas por departamento", "ranking", "count", "operacional", [TASKS, DEP]),
  entregas_por_cliente: ch("Entregas por cliente", "ranking", "count", "operacional", [PIECES, JOBS, CLI]),
  entregas_por_servico: ch("Entregas por serviço", "ranking", "count", "operacional", [PIECES]),
  horas_por_departamento: ch("Horas por departamento", "ranking", "hours", "operacional", [TIME, DEP]),
  horas_por_cliente: ch("Horas por cliente", "ranking", "hours", "operacional", [TIME, JOBS, CLI]),
  horas_por_colaborador: ch("Horas por colaborador", "ranking", "hours", "operacional", [TIME, EMP]),
  horas_por_projeto: ch("Horas por projeto", "ranking", "hours", "operacional", [TIME, JOBS]),
  previstas_vs_realizadas: ch("Horas previstas × realizadas por job", "bar", "hours", "operacional", [TIME, TASKS, JOBS]),
  ocupacao_por_departamento: ch("Departamentos sob recarga (ocupação da capacidade)", "ranking", "percent", "operacional", [TIME, DEP, EMP]),
  retrabalho_por_colaborador: ch("Frequência de retrabalho por colaborador", "ranking", "hours", "operacional", [TIME, TASKS, EMP]),
  contratado_vs_executado: ch("Contratado × executado por cliente", "bar", "count", "operacional", ["contratos", PIECES]),
  ingest_por_status: ch("Tarefas de coleta por status", "bar", "count", "ingestao", [QT]),
};

const col = (key: string, label: string, type: ColumnType = "text"): Column => ({ key, label, type });
type T = Omit<TableDef, "id">;

const tables: Record<string, T> = {
  alertas: { label: "Painel de alertas de governança operacional", display: "alerts", sources: ["regras sobre indicadores"], columns: [col("tipo", "Tipo"), col("severidade", "Severidade"), col("entidade", "Entidade"), col("descricao", "Descrição")] },
  top_clientes_resultado: { label: "Top 5 clientes por resultado", description: "Maior resultado financeiro calculável no período.", display: "list", pageSize: 5, sources: [FE, FECC, CLI], link: { column: "cliente_id", to: "clientes" }, columns: [col("cliente", "Cliente"), col("detalhe", "Detalhe"), col("resultado", "Resultado", "BRL"), col("margem", "Margem", "percent")] },
  top_projetos_menor_margem: { label: "Top 5 projetos com menor margem", description: "Projetos com margem comprimida ou custo acima da receita.", display: "list", pageSize: 5, sources: [FE, FECC, JOBS], link: { column: "projeto_id", to: "projetos" }, columns: [col("projeto", "Projeto"), col("detalhe", "Detalhe"), col("resultado", "Resultado", "BRL"), col("margem", "Margem", "percent")] },
  apontamentos: { label: "Apontamentos de horas", sources: [TIME], link: { column: "projeto_id", to: "projetos" }, columns: [col("data", "Data", "date"), col("colaborador", "Colaborador"), col("departamento", "Departamento"), col("projeto", "Projeto"), col("atividade", "Atividade"), col("horas", "Horas", "hours"), col("retrabalho", "Retrabalho")] },
  resultado_mensal: { label: "Resultado mensal", description: "Receita recebida, despesas pagas e resultado por mês (base caixa).", sources: [FE], columns: [col("mes", "Mês"), col("receita", "Receita recebida", "BRL"), col("despesas", "Despesas pagas", "BRL"), col("resultado", "Resultado", "BRL"), col("margem", "Margem", "percent")] },
  retrabalho: { label: "Horas de retrabalho", description: "Retrabalho por departamento e colaborador.", sources: [TIME, TASKS, STEPS], columns: [col("colaborador", "Colaborador"), col("departamento", "Departamento"), col("ocorrencias", "Ocorrências", "count"), col("horas", "Horas", "hours")] },
  lancamentos_financeiros: { label: "Lançamentos financeiros", sources: [FE], columns: [col("id", "ID origem"), col("data", "Data", "date"), col("competencia", "Competência", "date"), col("tipo", "Tipo"), col("descricao", "Descrição"), col("cliente", "Cliente"), col("centro_custo", "Centro de custo"), col("valor", "Valor", "BRL"), col("situacao", "Situação")] },
  notas_fiscais: { label: "Notas fiscais", sources: [INV], columns: [col("numero", "Número"), col("emissao", "Emissão", "date"), col("cliente", "Cliente"), col("valor", "Valor", "BRL"), col("situacao", "Situação")] },
  receita_por_cliente: { label: "Receita por cliente", sources: [FE, INV, CLI], link: { column: "cliente_id", to: "clientes" }, columns: [col("cliente", "Cliente"), col("grupo", "Grupo"), col("faturado", "Faturado", "BRL"), col("recebido", "Recebido", "BRL"), col("em_aberto", "Em aberto", "BRL"), col("participacao", "Participação", "percent")] },
  anomalias_financeiras: { label: "Variações e anomalias", sources: [FE], columns: [col("mes", "Mês"), col("categoria", "Categoria"), col("valor", "Valor", "BRL"), col("variacao", "Variação", "percent"), col("observacao", "Observação")] },
  rentabilidade_clientes: { label: "Rentabilidade por cliente", sources: [FE, FECC, CLI], link: { column: "cliente_id", to: "clientes" }, columns: [col("cliente", "Cliente"), col("receita", "Receita", "BRL"), col("custo_direto", "Custo direto", "BRL"), col("resultado", "Resultado", "BRL"), col("margem", "Margem bruta", "percent"), col("horas", "Horas", "hours")] },
  rentabilidade_projetos: { label: "Rentabilidade por projeto", sources: [FE, FECC, JOBS], link: { column: "projeto_id", to: "projetos" }, columns: [col("projeto", "Projeto"), col("cliente", "Cliente"), col("receita", "Receita", "BRL"), col("custo_direto", "Custo direto", "BRL"), col("resultado", "Resultado", "BRL"), col("margem", "Margem", "percent")] },
  custo_por_servico: { label: "Custo e receita por serviço", sources: [FE, FECC], columns: [col("servico", "Serviço"), col("receita", "Receita", "BRL"), col("custo_direto", "Custo direto", "BRL"), col("horas", "Horas", "hours"), col("entregas", "Entregas", "count")] },
  atividades: { label: "Atividades", sources: [TASKS], link: { column: "projeto_id", to: "projetos" }, columns: [col("id", "ID origem"), col("projeto", "Projeto"), col("atividade", "Atividade"), col("departamento", "Departamento"), col("responsavel", "Responsável"), col("prazo", "Prazo", "date"), col("conclusao", "Conclusão", "date"), col("status", "Status")] },
  entregas_colaboradores: { label: "Produção por colaborador", sources: [TASKS, TIME, EMP], columns: [col("colaborador", "Colaborador"), col("departamento", "Departamento"), col("atividades", "Atividades", "count"), col("horas", "Horas", "hours"), col("atrasos", "Atrasos", "count"), col("refacoes", "Refações", "count")] },
  projetos: { label: "Projetos", sources: [JOBS], link: { column: "id", to: "projetos" }, columns: [col("codigo", "Código"), col("titulo", "Título"), col("cliente", "Cliente"), col("status", "Status"), col("abertura", "Abertura", "date"), col("prazo", "Prazo", "date"), col("horas", "Horas", "hours"), col("pecas", "Peças", "count")] },
  clientes: { label: "Ranking de clientes", sources: [CLI, GRP, JOBS, FE, TIME], link: { column: "id", to: "clientes" }, columns: [col("cliente", "Cliente"), col("grupo", "Grupo empresarial"), col("projetos", "Projetos", "count"), col("faturado", "Faturado", "BRL"), col("recebido", "Recebido", "BRL"), col("horas", "Horas", "hours"), col("pecas", "Peças", "count"), col("atrasos", "Atrasos", "count")] },
  departamentos: { label: "Departamentos da agência", description: "Carga, horas e retrabalho por área.", display: "cards", sources: [DEP, TASKS, TIME], columns: [col("departamento", "Departamento"), col("colaboradores", "Colaboradores", "count"), col("horas", "Horas registradas", "hours"), col("projetos", "Projetos atendidos", "count"), col("horas_retrabalho", "Retrabalho", "hours"), col("atividades", "Atividades", "count"), col("atrasos", "Atrasos", "count"), col("ocupacao", "Ocupação", "percent")] },
  colaboradores: { label: "Colaboradores", description: "Horas, retrabalho e aproveitamento por pessoa.", display: "cards", sources: [EMP, TIME, TASKS], columns: [col("colaborador", "Colaborador"), col("cargo", "Cargo · departamento"), col("horas", "Horas realizadas", "hours"), col("horas_previstas", "Previstas", "hours"), col("horas_retrabalho", "Retrabalho", "hours"), col("projetos", "Projetos", "count"), col("aproveitamento", "Aproveitamento vs. previsto", "percent")] },
  timesheet_departamentos: { label: "Horas por departamento", sources: [TIME, DEP], columns: [col("departamento", "Departamento"), col("colaboradores", "Colaboradores", "count"), col("apontamentos", "Apontamentos", "count"), col("horas", "Horas", "hours"), col("horas_retrabalho", "Retrabalho", "hours")] },
  contratado_executado: { label: "Contratado × executado", sources: ["contratos", PIECES, TIME], link: { column: "cliente_id", to: "clientes" }, columns: [col("cliente", "Cliente"), col("escopo", "Escopo contratado", "count"), col("entregue", "Entregue", "count"), col("desvio", "Desvio", "percent"), col("horas", "Horas", "hours"), col("alteracoes", "Alterações", "count")] },
  capacidade_colaboradores: { label: "Carga por colaborador", sources: [EMP, TIME], columns: [col("colaborador", "Colaborador"), col("departamento", "Departamento"), col("capacidade", "Capacidade", "hours"), col("registradas", "Registradas", "hours"), col("ocupacao", "Ocupação", "percent"), col("projetos", "Projetos", "count")] },
  conflitos: { label: "Conflitos de publicação", sources: [AUDIT], columns: [col("tipo", "Tipo"), col("recurso", "Recurso"), col("id_externo", "ID externo"), col("detectado_em", "Detectado em", "datetime"), col("situacao", "Situação")] },
  tarefas_ingest: { label: "Tarefas de coleta (QPF)", sources: [QT], columns: [col("tarefa", "Tarefa"), col("recurso", "Recurso"), col("status", "Status"), col("paginas", "Páginas", "count"), col("registros", "Registros", "count"), col("atualizado_em", "Atualizado em", "datetime")] },
  periodos_incompletos: { label: "Períodos incompletos", sources: [QT, QP], columns: [col("recurso", "Recurso"), col("periodo", "Período"), col("situacao", "Situação"), col("observacao", "Observação")] },
};

const mod = (id: string, path: string, label: string, group: string, question: string, i: string[], c: string[], t: string[], detailOf?: ModuleDef["detailOf"]): ModuleDef =>
  ({ id, path, label, group, question, indicators: i, charts: c, tables: t, detailOf });

export const MODULES: ModuleDef[] = [
  mod("executivo", "/", "Visão geral", "Principal", "Dashboard executivo: quanto recebemos, faturamos, gastamos e produzimos.",
    ["receita_recebida", "receita_faturada", "despesas", "resultado_operacional", "margem_operacional", "projetos_ativos", "projetos_atrasados", "horas_registradas", "colaboradores_ativos", "clientes_ativos"],
    ["receitas_vs_despesas", "horas_por_departamento", "evolucao_financeira", "despesas_por_centro_custo"], ["alertas", "top_clientes_resultado", "top_projetos_menor_margem"]),
  mod("clientes", "/clientes", "Clientes", "Principal", "Carteira, rentabilidade por conta e histórico de jobs.",
    ["clientes_ativos", "receita_faturada", "receita_recebida", "horas_registradas", "projetos_ativos"],
    ["top_clientes_receita", "concentracao_receita", "horas_por_cliente", "receita_por_grupo"], ["clientes"]),
  mod("projetos", "/projetos", "Projetos / Jobs", "Principal", "Escopo, entregas, horas das equipes e resultado por job.",
    ["projetos_ativos", "projetos_iniciados", "projetos_concluidos", "projetos_atrasados", "horas_registradas", "horas_previstas"],
    ["projetos_por_status", "resultado_por_projeto"], ["projetos"]),
  mod("rentabilidade", "/rentabilidade", "Rentabilidade", "Principal", "Resultados e margens por cliente, projeto e serviço.",
    ["receita_recebida", "custos_diretos", "custos_indiretos", "resultado_operacional", "margem_bruta", "margem_contribuicao", "margem_operacional"],
    ["margem_por_cliente", "resultado_por_projeto", "evolucao_margem"], ["rentabilidade_clientes", "rentabilidade_projetos", "custo_por_servico"]),
  mod("financeiro", "/financeiro", "Financeiro", "Principal", "Faturamento, recebimento e competência — sempre separados.",
    ["receita_faturada", "receita_recebida", "receita_competencia", "valores_em_aberto", "despesas", "custos_diretos", "custos_indiretos", "resultado_operacional", "lancamentos_futuros"],
    ["evolucao_financeira", "receitas_vs_despesas", "faturado_vs_recebido", "concentracao_receita", "receita_por_grupo", "despesas_por_categoria", "despesas_por_centro_custo"],
    ["receita_por_cliente", "resultado_mensal", "lancamentos_financeiros", "notas_fiscais", "anomalias_financeiras"]),
  mod("timesheet", "/timesheet", "Timesheet", "Principal", "Apontamentos de horas por departamento, colaborador e projeto.",
    ["horas_registradas", "horas_previstas", "desvio_horas", "custo_mao_de_obra", "colaboradores_ativos", "horas_retrabalho"],
    ["horas_por_departamento", "horas_por_colaborador", "horas_por_projeto"], ["timesheet_departamentos", "apontamentos"]),
  mod("departamentos", "/departamentos", "Departamentos", "Principal", "Carga, horas e retrabalho por área.",
    ["colaboradores_ativos", "horas_registradas", "atividades_concluidas", "entregas", "tempo_medio_execucao", "atrasos", "horas_retrabalho"],
    ["horas_por_departamento", "entregas_por_departamento"], ["departamentos"]),
  mod("colaboradores", "/colaboradores", "Colaboradores", "Principal", "Perfis individuais com horas, retrabalho e aproveitamento.",
    ["colaboradores_ativos", "horas_registradas", "horas_previstas", "horas_retrabalho"],
    ["horas_por_colaborador", "retrabalho_por_colaborador"], ["colaboradores"]),
  mod("produtividade", "/produtividade", "Produtividade", "Principal", "Entregas, atrasos, capacidade, ocupação e gargalos operacionais.",
    ["projetos_concluidos", "projetos_atrasados", "horas_previstas", "horas_registradas", "desvio_horas", "horas_retrabalho", "capacidade_disponivel", "ocupacao", "produtividade", "tempo_medio_atividade"],
    ["previstas_vs_realizadas", "ocupacao_por_departamento", "retrabalho_por_colaborador", "evolucao_producao"], ["capacidade_colaboradores", "retrabalho", "atividades"]),
  mod("producao", "/producao", "Produção", "Análises", "Quanto produzimos: projetos, peças, atividades e entregas.",
    ["projetos_iniciados", "projetos_concluidos", "projetos_ativos", "pecas_produzidas", "atividades_concluidas", "entregas", "tempo_medio_execucao", "atrasos", "retrabalho", "alteracoes"],
    ["evolucao_producao", "entregas_por_departamento", "entregas_por_cliente", "entregas_por_servico"], ["entregas_colaboradores"]),
  mod("contratado", "/contratado", "Contratado × executado", "Análises", "Estamos entregando além do contratado?",
    ["escopo_contratado", "entregas", "entregas_vs_contratado", "horas_vs_previstas", "receita_contratada", "alteracoes", "retrabalho"],
    ["contratado_vs_executado"], ["contratado_executado"]),
  mod("qualidade", "/qualidade", "Qualidade dos dados", "Governança", "Podemos confiar nos números apresentados?",
    ["ultima_sincronizacao", "ultima_publicacao_core", "tarefas_recebidas", "tarefas_pendentes", "tarefas_em_execucao", "tarefas_em_reconciliacao", "paginas_recebidas", "registros_recebidos", "conflitos_financeiros", "divergencias_projetos", "recursos_sem_atualizacao", "lancamentos_futuros", "cobertura_dados"],
    ["ingest_por_status"], ["conflitos", "tarefas_ingest", "periodos_incompletos"]),
  mod("cliente", "/clientes/:id", "Cliente", "Principal", "Visão individual do cliente",
    ["receita_faturada", "receita_recebida", "valores_em_aberto", "custos_diretos", "resultado_operacional", "margem_bruta", "horas_registradas", "pecas_produzidas", "entregas", "projetos_ativos", "atrasos", "horas_retrabalho"],
    ["evolucao_financeira", "evolucao_producao"], ["projetos", "lancamentos_financeiros", "notas_fiscais"], "client"),
  mod("projeto", "/projetos/:id", "Projeto", "Principal", "Visão individual do projeto",
    ["receita_faturada", "custos_diretos", "resultado_operacional", "horas_registradas", "horas_previstas", "pecas_produzidas", "atividades_concluidas", "atrasos", "horas_retrabalho", "horas_vs_previstas"],
    ["horas_por_colaborador"], ["atividades", "apontamentos", "lancamentos_financeiros"], "project"),
];

const withId = <V>(r: Record<string, V>) => Object.fromEntries(Object.entries(r).map(([id, v]) => [id, { id, ...v }]));
export const INDICATORS = withId(indicators) as Record<string, IndicatorDef>;
export const CHARTS = withId(charts) as Record<string, ChartDef>;
export const TABLES = withId(tables) as Record<string, TableDef>;
export const moduleById = (id: string) => MODULES.find((m) => m.id === id);
