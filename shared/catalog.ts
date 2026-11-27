// Catálogo único do QUEST RINNE: o que cada módulo mostra.
// Contém DEFINIÇÕES de negócio, nunca valores. As tabelas em `sources` são candidatas e
// precisam ser confirmadas com `npm run introspect` antes de qualquer cálculo.
import type { Basis, ChartDef, Column, ColumnType, IndicatorDef, ModuleDef, TableDef, Unit } from "./contracts.js";
import {CASH_VIEW,DRE_VIEW,INDICATOR_LABELS,MANAGEMENT_VIEWS,TABLE_LABELS} from './management.js';

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
const QT = "ingest.tasks";
const QP = "ingest.pages";
const AUDIT = "audit.* (a mapear)";

type I = Omit<IndicatorDef, "id">;
const ind = (label: string, unit: Unit, basis: Basis, formula: string, sources: string[], requires?: string, higherIsBetter?: boolean): I =>
  ({ label, unit, basis, formula, sources, requires, higherIsBetter });

const indicators: Record<string, I> = {
  marcas_cadastradas:ind('Marcas cadastradas','count','operacional','Contagem física atual de marcas.',['core.brands']),
  contratos_cadastrados:ind('Contratos cadastrados','count','operacional','Contagem física atual de contratos.',['core.contracts']),
  fees_cadastrados:ind('Fees e jobs extras cadastrados','count','operacional','Contagem física atual de lançamentos de fee e job extra.',['core.fees']),
  metas_cadastradas:ind('Metas cadastradas','count','operacional','Contagem física atual de metas.',['core.goals']),
  regras_rateio_cadastradas:ind('Regras de rateio cadastradas','count','operacional','Contagem física atual de regras.',['core.allocation_rules']),
  receitas_nao_operacionais:ind('Receitas não operacionais recebidas','BRL','recebimento','Soma de Entrada isolada na classificação textual RECEITAS NÃO OPERACIONAIS por payment_date.',[FE,'core.financial_categories']),
  despesas_fixas:ind('Despesas operacionais fixas pagas','BRL','recebimento','Saídas isoladas classificadas DESPESAS OPERACIONAIS CUSTO FIXO.',[FE,'core.financial_categories']),
  despesas_variaveis:ind('Despesas operacionais variáveis pagas','BRL','recebimento','Saídas isoladas classificadas DESPESAS OPERACIONAIS CUSTO VARIÁVEL.',[FE,'core.financial_categories']),
  despesas_nao_operacionais:ind('Despesas não operacionais pagas','BRL','recebimento','Saídas isoladas classificadas DESPESAS NÃO OPERACIONAIS.',[FE,'core.financial_categories']),
  impostos_pagos:ind('Impostos pagos — origem','BRL','recebimento','Saídas isoladas classificadas IMPOSTOS; fora do resultado operacional preliminar.',[FE,'core.financial_categories']),
  participacao_lucros_paga:ind('Participação nos lucros paga — origem','BRL','recebimento','Saídas isoladas classificadas PARTICIPAÇÃO NOS LUCROS; não certifica lucro.',[FE,'core.financial_categories']),
  movimentacoes_sem_classificacao:ind('Movimentos sem classificação — soma assinada','BRL','recebimento','Valores de movimentos NENHUM, classificação ausente, ambígua ou desconhecida; não é saldo nem resultado.',[FE,'core.financial_categories']),
  despesas_rateadas:ind('Saídas com rateio conciliado','BRL','recebimento','Valor original contado uma vez por lançamento com soma monetária, percentual e parcelas conjuntamente conciliados.',[FE,FECC]),
  despesas_sem_rateio:ind('Saídas sem rateio disponível','BRL','recebimento','Valor original de lançamentos sem registros de centro de custo; não redistribui.',[FE,FECC]),
  despesas_rateio_divergente:ind('Saídas com rateio divergente','BRL','recebimento','Valor original contado uma vez por lançamento com valores/percentuais ausentes, divergentes ou centro duplicado.',[FE,FECC]),
  notas_vinculadas:ind('Notas emitidas com cliente unívoco','count','faturamento','Notas issued com CPF/CNPJ numérico válido e um único cadastro candidato por documento.',[INV,CLI]),
  notas_ambiguas:ind('Notas emitidas com documento ambíguo','count','faturamento','Notas issued com mais de um cadastro candidato por documento válido; valores não distribuídos.',[INV,CLI]),
  notas_sem_vinculo:ind('Notas emitidas sem vínculo válido','count','faturamento','Notas issued sem candidato válido, documento ausente/inválido ou formato não suportado.',[INV,CLI]),
  faturamento_clientes_vinculados:ind('Faturamento com cliente comprovado','BRL','faturamento','Soma de notas issued com associação documental unívoca e valor finito, por issued_at.',[INV,CLI]),
  projetos_status_finalizado:ind('Status atual: Finalizado','count','operacional','Contagem literal atual, independentemente de data de conclusão e do período; não equivale a entrega.',[JOBS]),
  projetos_status_autorizado:ind('Status atual: Autorizado','count','operacional','Contagem literal atual; candidato a ativo, definição gerencial pendente.',[JOBS]),
  projetos_status_standby:ind('Status atual: Stand By','count','operacional','Contagem literal atual; proposta de suspenso, sujeita à aprovação gerencial.',[JOBS]),
  projetos_status_cancelado:ind('Status atual: Cancelado','count','operacional','Contagem literal atual, sem reconstrução histórica.',[JOBS]),
  projetos_status_proposta:ind('Status atual: Proposta Comercial','count','operacional','Contagem literal atual.',[JOBS]),
  projetos_status_concorrencia:ind('Status atual: Concorrência','count','operacional','Contagem literal atual.',[JOBS]),
  projetos_finalizados_periodo:ind('Marcados Finalizado com conclusão válida','count','operacional','Status atual Finalizado e completed_at no período, não futuro nem anterior à abertura.',[JOBS]),
  tarefas_trabalhadas:ind('Tarefas TASK com apontamento','count','operacional','Unidades distintas (job_id, task_id) com duração válida e cadastro unívoco.',[TIME,TASKS]),
  etapas_trabalhadas:ind('Etapas WORKFLOW com apontamento','count','operacional','Unidades distintas (job_piece_id, workflow_id) com duração válida e vínculo ao projeto.',[TIME,STEPS,PIECES]),
  unidades_sem_estimativa:ind('Unidades comparáveis sem estimativa positiva','count','operacional','Unidades trabalhadas com cadastro unívoco mas sem estimativa positiva válida.',[TIME,TASKS,STEPS]),
  projetos_atendidos:ind('Projetos com apontamento válido','count','operacional','Projetos distintos nos apontamentos válidos do período, sem inferir entrega.',[TIME,JOBS]),
  horas_com_custo_positivo:ind('Horas com custo registrado positivo','hours','operacional','Duração válida de apontamentos com labor_cost finito positivo.',[TIME]),
  horas_sem_custo_positivo:ind('Horas sem custo positivo comprovado','hours','operacional','Duração válida com labor_cost ausente, inválido, zero ou negativo; não estima custo.',[TIME]),
  cobertura_custo_positivo_horas:ind('Cobertura de custo positivo por horas','percent','operacional','Horas com labor_cost finito positivo / horas válidas do mesmo escopo.',[TIME]),
  estados_publicacao:ind('Registros com estado de publicação — atual','count','ingestao','Linhas atuais em audit.publication_state, sem certificar únicos publicados ou cobertura.', ['audit.publication_state']),
  atividades_trabalhadas: ind('Atividades com apontamento','count','operacional','Unidades distintas TASK/WORKFLOW com apontamentos válidos e chave composta unívoca; não são entregas.',[TIME,TASKS,STEPS]),
  pecas_trabalhadas: ind('Pe\u00e7as com apontamento v\u00e1lido','count','operacional','Pe\u00e7as distintas em apontamentos TASK ou WORKFLOW com v\u00ednculo un\u00edvoco ao projeto; n\u00e3o s\u00e3o entregas.',[TIME,PIECES]),
  projetos_suspensos: ind('Projetos suspensos — atual','count','operacional','Fotografia atual dos status textuais explicitamente aprovados na política gerencial.',[JOBS]),
  cobertura_custos: ind('Cobertura de custo registrado','percent','operacional','Apontamentos válidos com labor_cost finito / apontamentos válidos, incluindo zero.',[TIME]),
  apontamentos_custo_zero: ind('Duração positiva com custo zero','count','operacional','Apontamentos válidos com duração positiva e labor_cost igual a zero; não estima custo ausente.',[TIME]),
  conflitos_abertos: ind('Conflitos de publicação abertos — atual','count','ingestao','Contagem pontual com resolved_at nulo; todos os recursos.', ['audit.publication_conflicts']),
  conflitos_resolvidos: ind('Conflitos de publicação resolvidos — atual','count','ingestao','Contagem pontual com resolved_at preenchido e não futuro.', ['audit.publication_conflicts']),
  divergencias_contagem: ind('Tarefas com contagens divergentes — atual','count','ingestao','expected_total diferente de received_records, com ambas contagens válidas; todos os recursos.',[QT]),
  registros_reportados_tarefas: ind('Registros reportados pelas tarefas — atual','count','ingestao','Soma de received_records não negativos; pode incluir repetições, não são publicados únicos.',[QT]),
  clientes_cadastrados: ind("Clientes cadastrados — atual", "count", "operacional", "Contagem física atual de core.clients; sem recorte nem comparação histórica.", [CLI]),
  colaboradores_cadastrados: ind("Colaboradores cadastrados — atual", "count", "operacional", "Contagem física atual de core.employees; não pressupõe cadastro ativo ou vínculo vigente.", [EMP]),
  departamentos_cadastrados: ind("Departamentos cadastrados — atual", "count", "operacional", "Contagem física atual de core.departments, sem recorte histórico.", [DEP]),
  projetos_cadastrados: ind("Projetos cadastrados — atual", "count", "operacional", "Contagem física atual de core.jobs, independentemente do status.", [JOBS]),
  pecas_cadastradas: ind("Peças cadastradas — atual", "count", "operacional", "Contagem física atual de core.job_pieces; não representa entregas por período.", [PIECES]),
  tarefas_cadastradas: ind("Tarefas cadastradas — atual", "count", "operacional", "Contagem física atual de core.job_tasks; chave composta preservada, sem pressupor execução.", [TASKS]),
  etapas_cadastradas: ind("Etapas cadastradas — atual", "count", "operacional", "Contagem física atual de core.workflow_steps; não soma estimativas de tarefas e etapas.", [STEPS]),
  entradas_realizadas: ind("Entradas realizadas — preliminar", "BRL", "recebimento", "Soma algébrica de amount de Entrada por payment_date; famílias pai/filho excluídas. Não classifica receita operacional.", [FE]),
  saidas_realizadas: ind("Saídas realizadas — preliminar", "BRL", "recebimento", "Soma algébrica de amount de Saída por payment_date; famílias pai/filho excluídas. Não classifica despesa operacional.", [FE]),
  saldo_movimentacoes: ind("Saldo de movimentações — preliminar", "BRL", "recebimento", "Entradas menos saídas isoladas na mesma base payment_date. Indisponível se houver sinais negativos ambíguos; não representa lucro.", [FE]),
  tarefas_com_falhas: ind("Tarefas nos estados FAILED/ERROR", "count", "ingestao", "Contagem literal atual dos estados FAILED e ERROR; outros estados não são presumidos.", [QT]),
  faturamento_liquido: ind("Faturamento líquido das notas", "BRL", "faturamento", "Soma de net_amount de notas issued por issued_at; canceladas e nulos excluídos, sinais preservados.", [INV]),
  faturamento_competencia: ind("Faturamento por competência das notas", "BRL", "competencia", "Soma de service_amount de notas issued por competence_date; não é receita de caixa.", [INV]),
  notas_emitidas: ind("Notas emitidas", "count", "faturamento", "Quantidade de notas com status issued por issued_at, sem datas futuras.", [INV]),
  notas_canceladas: ind("Notas canceladas", "count", "faturamento", "Quantidade de notas cancelled pela data de emissão; não representa data de cancelamento.", [INV]),
  percentual_retrabalho: ind("Percentual de horas em retrabalho", "percent", "operacional", "Duração válida com is_rework true / duração válida com marcação preenchida, por started_at; desconhecidos excluídos.", [TIME]),
  // ---------------- FINANCEIRO ----------------
  receita_faturada: ind("Receita faturada", "BRL", "faturamento", "Soma das notas fiscais emitidas no período (data de emissão), excluindo canceladas.", [INV], "Data de emissão, valor e situação (cancelada) da nota fiscal.", true),
  receita_recebida: ind('Receita operacional recebida \u2014 origem','BRL','recebimento','Entradas isoladas classificadas RECEITAS OPERACIONAIS por payment_date. Sem notas, t\u00edtulos abertos ou receitas n\u00e3o operacionais.',[FE,'core.financial_categories']),
  receita_competencia: ind('Receita operacional realizada por compet\u00eancia \u2014 parcial','BRL','competencia','Movimentos isolados j\u00e1 pagos, com classifica\u00e7\u00e3o operacional, por competence_date n\u00e3o futura; sem t\u00edtulos abertos ou reconhecimento cont\u00e1bil completo.',[FE,'core.financial_categories']),
  valores_em_aberto: ind("Valores em aberto", "BRL", "recebimento", "Receitas com vencimento até o fim do período e sem baixa.", [FE], "Data de vencimento e situação de baixa."),
  despesas: ind('Despesas operacionais pagas \u2014 origem','BRL','recebimento','Sa\u00eddas isoladas classificadas custo operacional fixo ou vari\u00e1vel por payment_date; n\u00e3o soma custos do timesheet.',[FE,'core.financial_categories']),
  custos_diretos: ind("Custos diretos", "BRL", "recebimento", "Despesas pagas vinculadas a cliente ou projeto via centro de custo. Horas NÃO são convertidas em custo sem metodologia validada.", [FE, FECC], "Centro de custo associado a cliente/projeto."),
  custos_indiretos: ind("Custos indiretos", "BRL", "recebimento", "Despesas pagas sem vínculo com cliente/projeto. Não são rateadas.", [FE, FECC], "Classificação de centros de custo (direto × indireto)."),
  resultado_operacional: ind('Resultado operacional por caixa \u2014 preliminar','BRL','recebimento','Receita operacional menos despesas operacionais fixas e vari\u00e1veis, antes de impostos, participa\u00e7\u00e3o e n\u00e3o operacionais; somente valores isolados classificados.',[FE,'core.financial_categories']),
  margem_bruta: ind("Margem bruta", "percent", "recebimento", "(Receita recebida − custos diretos) ÷ receita recebida.", [FE, FECC], "Custos diretos confiáveis.", true),
  margem_contribuicao: ind("Margem de contribuição", "percent", "recebimento", "(Receita recebida − custos variáveis) ÷ receita recebida.", [FE, FECC], "Classificação de custos variáveis — ainda não definida pela Quest.", true),
  margem_operacional: ind('Margem operacional por caixa \u2014 preliminar','percent','recebimento','Resultado operacional preliminar dividido por receita operacional positiva; sinais negativos amb\u00edguos impedem o c\u00e1lculo.',[FE,'core.financial_categories']),
  lancamentos_futuros: ind("Lançamentos com data futura", "count", "operacional", "Contagem por entry_date em dia futuro no período; pode haver payment_date passado, que continua classificando o caixa.", [FE]),

  // ---------------- PRODUÇÃO ----------------
  projetos_ativos: ind('Projetos ativos \u2014 atual','count','operacional','Fotografia dos status textuais ativos explicitamente aprovados; sem reconstru\u00e7\u00e3o hist\u00f3rica.',[JOBS]),
  projetos_iniciados: ind("Projetos iniciados", "count", "operacional", "Jobs com data de abertura no período.", [JOBS], "Data de abertura do job."),
  projetos_concluidos: ind("Projetos concluídos", "count", "operacional", "Jobs com data de conclusão no período e status de concluído na origem.", [JOBS], "Status e data de conclusão.", true),
  pecas_produzidas: ind("Peças produzidas", "count", "operacional", "Peças de jobs com conclusão no período.", [PIECES, JOBS], "Status/data de conclusão da peça.", true),
  atividades_concluidas: ind("Atividades concluídas", "count", "operacional", "Tarefas com status de concluída na origem e data de conclusão no período.", [TASKS], "Status de conclusão da tarefa.", true),
  entregas: ind("Entregas realizadas", "count", "operacional", "Definição de 'entrega' a validar com a Quest (peça aprovada, job entregue ou etapa final do workflow).", [PIECES, STEPS], "Critério oficial de entrega.", true),
  horas_registradas: ind("Horas registradas", "hours", "operacional", "Soma dos apontamentos de horas com data no período.", [TIME], "Duração e data do apontamento."),
  horas_previstas: ind('Horas previstas — subconjunto com estimativa','hours','operacional','Cada estimated_minutes uma vez por chave composta de unidade trabalhada no período; cobertura explícita.',[TIME,TASKS,STEPS]),
  desvio_horas: ind('Desvio parcial: per\u00edodo \u00d7 or\u00e7amento integral','hours','operacional','Horas do per\u00edodo menos estimativa integral das unidades com estimativa positiva; n\u00e3o \u00e9 desvio do ciclo completo.',[TIME,TASKS,STEPS]),
  horas_retrabalho: ind("Horas de retrabalho", "hours", "operacional", "Soma de durações válidas de apontamentos com is_rework=true por started_at.", [TIME], "is_rework booleano no apontamento."),
  custo_mao_de_obra: ind("Custo de mão de obra registrado — parcial", "BRL", "operacional", "Soma de labor_cost preenchido em apontamentos válidos por started_at. Não adiciona horas × taxa nem despesas financeiras de pessoal.", [TIME], "labor_cost numérico; cobertura explícita e sem certificação de custo total."),
  projetos_atrasados: ind('Projetos em atraso \u2014 atual','count','operacional','Status ativo aprovado, sem completed_at e expected_end_at anterior ao instante atual.',[JOBS]),
  atrasos: ind("Atividades atrasadas", "count", "operacional", "Tarefas concluídas após o prazo ou abertas com prazo vencido.", [TASKS], "Prazo e data de conclusão da tarefa."),
  retrabalho: ind("Apontamentos com retrabalho", "count", "operacional", "Quantidade de apontamentos válidos com is_rework=true; não representa tarefas distintas.", [TIME], "is_rework booleano no apontamento."),
  alteracoes: ind("Alterações solicitadas", "count", "operacional", "Etapas de alteração solicitadas pelo cliente.", [STEPS, TASKS], "Etapa de alteração identificável."),
  tempo_medio_execucao: ind('Calend\u00e1rio de Finalizado \u2014 datas v\u00e1lidas','days','operacional','M\u00e9dia de completed_at menos entered_at em dias corridos para status atual Finalizado e conclus\u00e3o no per\u00edodo. Sem futuro ou corte de extremos; n\u00e3o mede horas trabalhadas.',[JOBS]),
  clientes_ativos: ind("Clientes com apontamentos", "count", "operacional", "Clientes distintos vinculados a jobs com apontamentos válidos por started_at. Não mede atividade financeira nem situação administrativa.", [TIME, JOBS], undefined, true),
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
  horas_vs_previstas: ind('Horas do per\u00edodo \u00f7 previs\u00e3o integral','percent','operacional','Horas do per\u00edodo no subconjunto com estimativa positiva / estimativa integral dessas unidades, uma vez por chave.',[TIME,TASKS,STEPS]),

  // ---------------- QUALIDADE ----------------
  ultima_sincronizacao: ind("Última atualização de tarefas", "datetime", "ingestao", "Maior updated_at em ingest.tasks. Não certifica coleta bem-sucedida nem publicação integral.", [QT]),
  ultima_publicacao_core: ind("Última publicação no CORE", "datetime", "ingestao", "Data da última publicação registrada na auditoria.", [AUDIT]),
  tarefas_recebidas: ind("Tarefas de coleta", "count", "ingestao", "Total de tarefas de coleta registradas.", [QT]),
  tarefas_pendentes: ind("Tarefas pendentes", "count", "ingestao", "Tarefas com status pendente.", [QT]),
  tarefas_em_execucao: ind("Tarefas em execução", "count", "ingestao", "Tarefas com status em execução.", [QT]),
  tarefas_em_reconciliacao: ind("Tarefas em reconciliação", "count", "ingestao", "Tarefas em reconciliação.", [QT]),
  paginas_recebidas: ind("Páginas recebidas", "count", "ingestao", "Páginas da API iClips armazenadas.", [QP]),
  registros_recebidos: ind("Registros recebidos", "count", "ingestao", "Registros contidos nas páginas recebidas.", [QP]),
  conflitos_financeiros: ind("Conflitos financeiros", "count", "ingestao", "Conflitos de publicação financeira em aberto.", [AUDIT]),
  divergencias_projetos: ind("Divergências de projetos", "count", "ingestao", "Tarefas de projetos com divergência de contagem.", [QT, AUDIT]),
  recursos_sem_atualizacao: ind("Recursos sem atualização", "count", "ingestao", "Recursos cujo último sucesso é anterior ao limite definido.", [QT]),
  cobertura_dados: ind("Cobertura dos dados", "percent", "ingestao", "Meses do período com coleta concluída ÷ meses do período.", [QT, QP]),
};

type C = Omit<ChartDef, "id">;
const ch = (label: string, kind: ChartDef["kind"], unit: Unit, basis: Basis, sources: string[]): C => ({ label, kind, unit, basis, sources });

const charts: Record<string, C> = {
  dre_mensal:ch('DRE de origem por caixa — preliminar','bar','BRL','recebimento',[FE,'core.financial_categories']),
  status_atual_projetos:ch('Status textual atual — todos no escopo','bar','count','operacional',[JOBS]),
  pecas_por_cliente:ch('Peças com apontamento por cliente','ranking','count','operacional',[TIME,PIECES,JOBS]),
  pecas_por_departamento:ch('Peças com apontamento por departamento histórico','ranking','count','operacional',[TIME,PIECES,DEP]),
  custo_por_colaborador: ch('Custo registrado por colaborador','ranking','BRL','operacional',[TIME,EMP]),
  custo_por_departamento: ch('Custo registrado por departamento histórico','ranking','BRL','operacional',[TIME,DEP]),
  custo_por_cliente: ch('Custo registrado por cliente','ranking','BRL','operacional',[TIME,JOBS,CLI]),
  custo_por_projeto: ch('Custo registrado por projeto','ranking','BRL','operacional',[TIME,JOBS]),
  movimentacoes_realizadas: ch("Movimentações isoladas — preliminar", "bar", "BRL", "recebimento", [FE]),
  evolucao_faturamento: ch("Faturamento por mês de emissão", "line", "BRL", "faturamento", [INV]),
  evolucao_financeira: ch("Faturamento emitido: bruto e líquido", "line", "BRL", "faturamento", [INV]),
  receitas_vs_despesas: ch("Receitas × despesas (caixa)", "bar", "BRL", "recebimento", [FE]),
  faturado_vs_recebido: ch("Faturado × recebido por mês", "bar", "BRL", "faturamento", [INV, FE]),
  concentracao_receita: ch("Participação das entradas isoladas por cliente — preliminar", "ranking", "percent", "recebimento", [FE, JOBS]),
  receita_por_grupo: ch("Entradas isoladas por grupo — preliminar", "ranking", "BRL", "recebimento", [FE, JOBS]),
  top_clientes_receita: ch("Entradas isoladas por cliente — preliminar", "ranking", "BRL", "recebimento", [FE, JOBS]),
  receita_por_categoria: ch("Entradas isoladas por categoria — preliminar", "ranking", "BRL", "recebimento", [FE]),
  despesas_por_categoria: ch("Saídas isoladas por categoria — preliminar", "ranking", "BRL", "recebimento", [FE]),
  despesas_por_centro_custo: ch("Despesas por centro de custo", "ranking", "BRL", "recebimento", [FE, FECC]),
  margem_por_cliente: ch("Margem bruta por cliente", "ranking", "percent", "recebimento", [FE, FECC, CLI]),
  resultado_por_projeto: ch("Resultado por projeto", "ranking", "BRL", "recebimento", [FE, FECC, JOBS]),
  evolucao_margem: ch("Evolução da margem bruta", "line", "percent", "recebimento", [FE, FECC]),
  evolucao_producao: ch("Projetos cadastrados por mês de abertura", "line", "count", "operacional", [JOBS]),
  projetos_por_status: ch("Status atual dos projetos abertos no período", "bar", "count", "operacional", [JOBS]),
  entregas_por_departamento: ch("Entregas por departamento", "ranking", "count", "operacional", [TASKS, DEP]),
  entregas_por_cliente: ch("Entregas por cliente", "ranking", "count", "operacional", [PIECES, JOBS, CLI]),
  entregas_por_servico: ch("Entregas por serviço", "ranking", "count", "operacional", [PIECES]),
  horas_por_departamento: ch("Horas por departamento", "ranking", "hours", "operacional", [TIME, DEP]),
  horas_por_cliente: ch("Horas por cliente", "ranking", "hours", "operacional", [TIME, JOBS, CLI]),
  horas_por_colaborador: ch("Horas por colaborador", "ranking", "hours", "operacional", [TIME, EMP]),
  horas_por_projeto: ch("Horas por projeto", "ranking", "hours", "operacional", [TIME, JOBS]),
  previstas_vs_realizadas: ch('Previsto × realizado — subconjunto com estimativa','bar','hours','operacional',[TIME,TASKS,STEPS]),
  ocupacao_por_departamento: ch("Departamentos sob recarga (ocupação da capacidade)", "ranking", "percent", "operacional", [TIME, DEP, EMP]),
  retrabalho_por_colaborador: ch("Frequência de retrabalho por colaborador", "ranking", "hours", "operacional", [TIME, TASKS, EMP]),
  contratado_vs_executado: ch("Contratado × executado por cliente", "bar", "count", "operacional", ["contratos", PIECES]),
  ingest_por_status: ch("Tarefas de coleta por status", "bar", "count", "ingestao", [QT]),
};

const col = (key: string, label: string, type: ColumnType = "text"): Column => ({ key, label, type });
type T = Omit<TableDef, "id">;

const tables: Record<string, T> = {
  marcas:{label:'Marcas',sources:['core.brands',CLI],columns:[col('marca','Marca'),col('cliente','Cliente'),col('situacao','Situação')]},
  contratos_cadastro:{label:'Contratos cadastrados',sources:['core.contracts',CLI],columns:[col('contrato','Contrato'),col('cliente','Cliente'),col('marca','Marca'),col('tipo','Tipo'),col('situacao','Situação'),col('inicio','Início','date'),col('fim','Fim','date')]},
  versoes_contrato:{label:'Versões de contrato',sources:['core.contract_versions','core.contracts'],columns:[col('contrato','Contrato'),col('versao','Versão','count'),col('vigencia','Vigência','date'),col('valor','Valor','BRL'),col('descricao','Descrição')]},
  fees_jobs_extras:{label:'Fees e jobs extras',sources:['core.fees','core.contracts',JOBS],columns:[col('tipo','Tipo'),col('contrato','Contrato'),col('projeto','Projeto'),col('competencia','Competência','date'),col('valor','Valor','BRL'),col('descricao','Descrição')]},
  metas:{label:'Metas por indicador',sources:['core.goals'],columns:[col('indicador','Indicador'),col('inicio','Início','date'),col('fim','Fim','date'),col('meta','Meta','ratio'),col('sentido','Sentido'),col('aprovada_em','Aprovada em','datetime')]},
  regras_rateio:{label:'Regras de rateio',sources:['core.allocation_rules'],columns:[col('regra','Regra'),col('criterio','Critério'),col('inicio','Início','date'),col('fim','Fim','date'),col('situacao','Situação')]},
  rateios_financeiros:{label:'Conciliação dos rateios por lançamento',sources:[FE,FECC],columns:[col('data','Pagamento','date'),col('valor','Valor original','BRL'),col('rateado','Valor das parcelas','BRL'),col('percentual','Soma percentual','ratio'),col('centros','Centros','count'),col('situacao','Situação')]},
  faturamento_por_cliente:{label:'Faturamento por cliente comprovado',sources:[INV,CLI],link:{column:'cliente_id',to:'clientes'},columns:[col('cliente','Cliente'),col('faturado','Faturado vinculado','BRL'),col('notas','Notas','count')]},
  notas_vinculos:{label:'Notas: vínculos unívocos, ambíguos e ausentes',sources:[INV,CLI],columns:[col('numero','Número'),col('emissao','Emissão','date'),col('cliente','Cliente'),col('valor','Valor','BRL'),col('situacao','Status da nota'),col('vinculo','Associação documental')]},
  notas_ambiguas_detalhes:{label:'Notas com documento ambíguo',sources:[INV,CLI],columns:[col('numero','Número'),col('emissao','Emissão','date'),col('cliente','Cliente'),col('valor','Valor','BRL'),col('situacao','Status da nota'),col('vinculo','Associação documental')]},
  notas_sem_vinculo_detalhes:{label:'Notas sem vínculo válido',sources:[INV,CLI],columns:[col('numero','Número'),col('emissao','Emissão','date'),col('cliente','Cliente'),col('valor','Valor','BRL'),col('situacao','Status da nota'),col('vinculo','Associação documental')]},
  pecas_trabalhadas:{label:'Peças com apontamentos no período',sources:[TIME,PIECES,'core.piece_catalog'],columns:[col('peca','Peça'),col('catalogo','Catálogo'),col('projeto','Projeto'),col('cliente','Cliente'),col('departamentos','Departamentos históricos'),col('horas','Horas','hours'),col('apontamentos','Apontamentos','count')]},
  coorte_calendario:{label:'Coorte de calendário: Finalizado',sources:[JOBS],columns:[col('projeto','Projeto'),col('abertura','Abertura','datetime'),col('conclusao','Conclusão informada','datetime'),col('dias','Dias corridos','days'),col('situacao','Validade temporal')]},
  estados_publicacao:{label:'Estado de publicação por recurso — atual',sources:['audit.publication_state'],columns:[col('recurso','Recurso'),col('estados','Linhas de estado','count'),col('identidades','IDs distintos no recurso','count'),col('ultima_publicacao','Última publicação','datetime')]},
  conflitos_detalhes:{label:'Conflitos: razões e resolução — restrito',sources:['audit.publication_conflicts'],columns:[col('recurso','Recurso'),col('id_origem','Origem · rastreabilidade'),col('motivo','Razão'),col('resolvido_em','Resolução','datetime'),col('situacao','Situação'),col('ocorrencias','Ocorrências','count')]},
  dre_categorias:{label:'Movimentos por categoria e classificação DRE',sources:[FE,'core.financial_categories'],columns:[col('nome','Categoria'),col('classificacao','DRE de origem'),col('entrada','Entradas','BRL'),col('saida','Saídas','BRL'),col('movimentos','Movimentos','count')]},
  dre_contas:{label:'Movimentos por conta financeira',sources:[FE,'core.financial_accounts'],columns:[col('nome','Conta'),col('entrada','Entradas','BRL'),col('saida','Saídas','BRL'),col('movimentos','Movimentos','count')]},
  movimentos_clientes:{label:'Movimentos com vínculo de cliente pelo projeto',sources:[FE,JOBS,CLI],columns:[col('nome','Cliente'),col('entrada','Entradas','BRL'),col('saida','Saídas','BRL'),col('movimentos','Movimentos','count')]},
  movimentos_projetos:{label:'Movimentos por projeto',sources:[FE,JOBS],columns:[col('nome','Projeto'),col('entrada','Entradas','BRL'),col('saida','Saídas','BRL'),col('movimentos','Movimentos','count')]},
  vinculos_centros_custo:{label:'Vínculos de centros de custo — sem rateio',sources:[FE,FECC],columns:[col('data','Pagamento','date'),col('tipo','Tipo'),col('valor','Valor da movimentação','BRL'),col('centros','Centros vinculados','count'),col('situacao','Situação')]},
  custos_registrados: {label:'Custos registrados dos apontamentos',sources:[TIME],columns:[col('data','Data','datetime'),col('colaborador','Colaborador'),col('departamento','Departamento'),col('cliente','Cliente'),col('projeto','Projeto'),col('horas','Horas','hours'),col('custo_registrado','Custo registrado','BRL'),col('situacao','Situação')]},
  alertas: { label: "Painel de alertas de governança operacional", display: "alerts", sources: ["regras sobre indicadores"], columns: [col("tipo", "Tipo"), col("severidade", "Severidade"), col("entidade", "Entidade"), col("descricao", "Descrição")] },
  top_clientes_resultado: { label: "Top 5 clientes por resultado", description: "Maior resultado financeiro calculável no período.", display: "list", pageSize: 5, sources: [FE, FECC, CLI], link: { column: "cliente_id", to: "clientes" }, columns: [col("cliente", "Cliente"), col("detalhe", "Detalhe"), col("resultado", "Resultado", "BRL"), col("margem", "Margem", "percent")] },
  top_projetos_menor_margem: { label: "Top 5 projetos com menor margem", description: "Projetos com margem comprimida ou custo acima da receita.", display: "list", pageSize: 5, sources: [FE, FECC, JOBS], link: { column: "projeto_id", to: "projetos" }, columns: [col("projeto", "Projeto"), col("detalhe", "Detalhe"), col("resultado", "Resultado", "BRL"), col("margem", "Margem", "percent")] },
  apontamentos: { label: "Apontamentos de horas", sources: [TIME], link: { column: "projeto_id", to: "projetos" }, columns: [col("data", "Data", "date"), col("colaborador", "Colaborador"), col("departamento", "Departamento"), col("projeto", "Projeto"), col("atividade", "Atividade"), col("horas", "Horas", "hours"), col("retrabalho", "Retrabalho")] },
  resultado_mensal: { label: "Resultado operacional mensal \u2014 preliminar", description: "Receita recebida, despesas pagas e resultado por mês (base caixa).", sources: [FE], columns: [col("mes", "Mês"), col("receita", "Receita recebida", "BRL"), col("despesas", "Despesas pagas", "BRL"), col("resultado", "Resultado", "BRL"), col("margem", "Margem", "percent")] },
  retrabalho: { label: "Horas de retrabalho", description: "Retrabalho por departamento e colaborador.", sources: [TIME, TASKS, STEPS], columns: [col("colaborador", "Colaborador"), col("departamento", "Departamento"), col("ocorrencias", "Ocorrências", "count"), col("horas", "Horas", "hours")] },
  lancamentos_financeiros: { label: "Lançamentos financeiros", sources: [FE], columns: [col("data", "Data", "date"), col("competencia", "Competência", "date"), col("tipo", "Tipo"), col("projeto", "Projeto"),col("cliente", "Cliente"),col("categoria", "Categoria"),col("conta", "Conta"), col("valor", "Valor", "BRL"), col("situacao", "Situação")] },
  notas_fiscais: { label: "Notas fiscais", sources: [INV], columns: [col("numero", "Número"), col("emissao", "Emissão", "date"), col("cliente", "Cliente"), col("valor", "Valor", "BRL"), col("situacao", "Situação")] },
  receita_por_cliente: { label: "Entradas isoladas por cliente — preliminar", sources: [FE, JOBS], link: { column: "cliente_id", to: "clientes" }, columns: [col("cliente", "Cliente"), col("recebido", "Entradas isoladas", "BRL"), col("participacao", "Participação", "percent")] },
  anomalias_financeiras: { label: "Variações e anomalias", sources: [FE], columns: [col("mes", "Mês"), col("categoria", "Categoria"), col("valor", "Valor", "BRL"), col("variacao", "Variação", "percent"), col("observacao", "Observação")] },
  rentabilidade_clientes: { label: "Rentabilidade por cliente", sources: [FE, FECC, CLI], link: { column: "cliente_id", to: "clientes" }, columns: [col("cliente", "Cliente"), col("receita", "Receita", "BRL"), col("custo_direto", "Custo direto", "BRL"), col("resultado", "Resultado", "BRL"), col("margem", "Margem bruta", "percent"), col("horas", "Horas", "hours")] },
  rentabilidade_projetos: { label: "Rentabilidade por projeto", sources: [FE, FECC, JOBS], link: { column: "projeto_id", to: "projetos" }, columns: [col("projeto", "Projeto"), col("cliente", "Cliente"), col("receita", "Receita", "BRL"), col("custo_direto", "Custo direto", "BRL"), col("resultado", "Resultado", "BRL"), col("margem", "Margem", "percent")] },
  custo_por_servico: { label: "Custo e receita por serviço", sources: [FE, FECC], columns: [col("servico", "Serviço"), col("receita", "Receita", "BRL"), col("custo_direto", "Custo direto", "BRL"), col("horas", "Horas", "hours"), col("entregas", "Entregas", "count")] },
  atividades: {label:'Atividades com apontamento no período',sources:[TIME,TASKS,STEPS],link:{column:'projeto_id',to:'projetos'},columns:[col('atividade','Atividade'),col('projeto','Projeto'),col('departamento','Departamento'),col('responsavel','Responsáveis'),col('horas','Horas realizadas','hours'),col('horas_previstas','Previstas no subconjunto','hours'),col('custo_registrado','Custo registrado','BRL'),col('origem','Origem')]},
  entregas_colaboradores: { label: "Produção por colaborador", sources: [TASKS, TIME, EMP], columns: [col("colaborador", "Colaborador"), col("departamento", "Departamento"), col("atividades", "Atividades", "count"), col("horas", "Horas", "hours"), col("atrasos", "Atrasos", "count"), col("refacoes", "Refações", "count")] },
  projetos: { label: "Projetos", sources: [JOBS], link: { column: "id", to: "projetos" }, columns: [col("titulo", "Título"), col("cliente", "Cliente"), col("status", "Status"), col("abertura", "Abertura", "date"), col("prazo", "Prazo", "date"), col("horas", "Horas", "hours"), col("pecas", "Peças", "count")] },
  clientes: { label: "Ranking de clientes", sources: [CLI, GRP, JOBS, FE, TIME], link: { column: "id", to: "clientes" }, columns: [col("cliente", "Cliente"), col("grupo", "Grupo empresarial"), col("projetos", "Projetos", "count"), col("faturado", "Faturado", "BRL"), col("recebido", "Recebido", "BRL"), col("horas", "Horas", "hours"), col("pecas", "Peças", "count"), col("atrasos", "Atrasos", "count")] },
  departamentos: { label: "Departamentos da agência", description: "Carga, horas e retrabalho por área.", display: "cards", sources: [DEP, TASKS, TIME], columns: [col("departamento", "Departamento"), col("colaboradores", "Colaboradores", "count"), col("horas", "Horas registradas", "hours"), col("projetos", "Projetos atendidos", "count"), col("horas_retrabalho", "Retrabalho", "hours"), col("atividades", "Atividades", "count"), col("atrasos", "Atrasos", "count"), col("ocupacao", "Ocupação", "percent"),col('custo_registrado','Custo registrado','BRL')] },
  colaboradores: { label: "Colaboradores", description: "Horas, retrabalho e aproveitamento por pessoa.", display: "cards", sources: [EMP, TIME, TASKS], columns: [col("colaborador", "Colaborador"), col("cargo", "Cargo · departamento"), col("horas", "Horas realizadas", "hours"), col("horas_previstas", "Previstas", "hours"), col("horas_retrabalho", "Retrabalho", "hours"), col("projetos", "Projetos", "count"), col("aproveitamento", "Aproveitamento vs. previsto", "percent"), col('atividades','Atividades com apontamento','count'),col('custo_registrado','Custo registrado','BRL')] },
  timesheet_departamentos: { label: "Horas por departamento", sources: [TIME, DEP], columns: [col("departamento", "Departamento"), col("colaboradores", "Colaboradores", "count"), col("apontamentos", "Apontamentos", "count"), col("horas", "Horas", "hours"), col("horas_retrabalho", "Retrabalho", "hours")] },
  contratado_executado: { label: "Contratado × executado", sources: ["contratos", PIECES, TIME], link: { column: "cliente_id", to: "clientes" }, columns: [col("cliente", "Cliente"), col("escopo", "Escopo contratado", "count"), col("entregue", "Entregue", "count"), col("desvio", "Desvio", "percent"), col("horas", "Horas", "hours"), col("alteracoes", "Alterações", "count")] },
  capacidade_colaboradores: { label: "Carga por colaborador", sources: [EMP, TIME], columns: [col("colaborador", "Colaborador"), col("departamento", "Departamento"), col("capacidade", "Capacidade", "hours"), col("registradas", "Registradas", "hours"), col("ocupacao", "Ocupação", "percent"), col("projetos", "Projetos", "count")] },
  conflitos: {label:'Conflitos de publica\u00e7\u00e3o por estado \u2014 atual',sources:['audit.publication_conflicts'],columns:[col('situacao','Situa\u00e7\u00e3o'),col('quantidade','Conflitos','count')]},
  tarefas_ingest: { label: "Tarefas de coleta", sources: [QT], columns: [col("tarefa", "Tarefa"), col("recurso", "Recurso"), col("status", "Status"), col("paginas", "Páginas", "count"), col("registros", "Registros", "count"), col("atualizado_em", "Atualizado em", "datetime")] },
  periodos_incompletos: { label: "Períodos incompletos", sources: [QT, QP], columns: [col("recurso", "Recurso"), col("periodo", "Período"), col("situacao", "Situação"), col("observacao", "Observação")] },
};

const mod = (id: string, path: string, label: string, group: string, question: string, i: string[], c: string[], t: string[], detailOf?: ModuleDef["detailOf"]): ModuleDef =>
  ({ id, path, label, group, question, indicators: i, charts: c, tables: t, detailOf });

export const MODULES: ModuleDef[] = [
  mod("executivo", "/", "Visão geral", "Principal", "Dashboard executivo: quanto recebemos, faturamos, gastamos e produzimos.",
    ["receita_recebida", "receita_faturada", "despesas", "resultado_operacional", "margem_operacional", "projetos_ativos", "projetos_atrasados", "horas_registradas", "colaboradores_ativos", "clientes_ativos", "entradas_realizadas", "saidas_realizadas", "saldo_movimentacoes"],
    ["receitas_vs_despesas", "horas_por_departamento", "evolucao_financeira", "despesas_por_centro_custo"], ["alertas", "top_clientes_resultado", "top_projetos_menor_margem"]),
  mod("clientes", "/clientes", "Clientes", "Principal", "Carteira, rentabilidade por conta e histórico de jobs.",
    ["faturamento_clientes_vinculados","clientes_cadastrados", "clientes_ativos", "receita_faturada", "receita_recebida", "horas_registradas", "projetos_ativos"],
    ["top_clientes_receita", "concentracao_receita", "horas_por_cliente", "receita_por_grupo"], ["faturamento_por_cliente","clientes"]),
  mod("projetos", "/projetos", "Projetos / Jobs", "Principal", "Escopo, entregas, horas das equipes e resultado por job.",
    ["projetos_status_finalizado","projetos_status_autorizado","projetos_status_standby","projetos_status_cancelado","projetos_finalizados_periodo","projetos_cadastrados", "projetos_ativos", "projetos_iniciados", "projetos_concluidos", "projetos_atrasados", "horas_registradas", "horas_previstas"],
    ["status_atual_projetos","projetos_por_status", "resultado_por_projeto"], ["coorte_calendario","projetos"]),
  mod("rentabilidade", "/rentabilidade", "Rentabilidade", "Principal", "Resultados e margens por cliente, projeto e serviço.",
    ["horas_com_custo_positivo","horas_sem_custo_positivo","cobertura_custo_positivo_horas","cobertura_custos","apontamentos_custo_zero","custo_mao_de_obra", "receita_recebida", "custos_diretos", "custos_indiretos", "resultado_operacional", "margem_bruta", "margem_contribuicao", "margem_operacional"],
    ["custo_por_cliente","custo_por_projeto","custo_por_colaborador","custo_por_departamento","margem_por_cliente", "resultado_por_projeto", "evolucao_margem"], ["custos_registrados","rentabilidade_clientes", "rentabilidade_projetos", "custo_por_servico"]),
  mod("financeiro", "/financeiro", "Financeiro", "Principal", "Faturamento, recebimento e competência — sempre separados.",
    ["receitas_nao_operacionais","despesas_fixas","despesas_variaveis","despesas_nao_operacionais","impostos_pagos","participacao_lucros_paga","movimentacoes_sem_classificacao","despesas_rateadas","despesas_sem_rateio","despesas_rateio_divergente","notas_vinculadas","notas_ambiguas","notas_sem_vinculo","entradas_realizadas", "saidas_realizadas", "saldo_movimentacoes", "receita_faturada", "faturamento_liquido", "faturamento_competencia", "notas_emitidas", "notas_canceladas", "receita_recebida", "receita_competencia", "valores_em_aberto", "despesas", "custos_diretos", "custos_indiretos", "resultado_operacional", "lancamentos_futuros"],
    ["dre_mensal","movimentacoes_realizadas", "evolucao_faturamento", "evolucao_financeira", "receitas_vs_despesas", "faturado_vs_recebido", "concentracao_receita", "receita_por_grupo", "despesas_por_categoria", "despesas_por_centro_custo"],
    ["dre_categorias","dre_contas","movimentos_clientes","movimentos_projetos","rateios_financeiros","faturamento_por_cliente","notas_vinculos","notas_ambiguas_detalhes","notas_sem_vinculo_detalhes","vinculos_centros_custo","receita_por_cliente", "resultado_mensal", "lancamentos_financeiros", "notas_fiscais", "anomalias_financeiras"]),
  mod("timesheet", "/timesheet", "Timesheet", "Principal", "Apontamentos de horas por departamento, colaborador e projeto.",
    ["unidades_sem_estimativa","horas_registradas", "horas_previstas", "desvio_horas", "custo_mao_de_obra", "colaboradores_ativos", "horas_retrabalho", "percentual_retrabalho"],
    ["horas_por_departamento", "horas_por_colaborador", "horas_por_projeto"], ["timesheet_departamentos", "apontamentos"]),
  mod("departamentos", "/departamentos", "Departamentos", "Principal", "Carga, horas e retrabalho por área.",
    ["departamentos_cadastrados", "colaboradores_ativos", "horas_registradas", "atividades_concluidas", "entregas", "tempo_medio_execucao", "atrasos", "horas_retrabalho"],
    ["horas_por_departamento", "entregas_por_departamento"], ["departamentos"]),
  mod("colaboradores", "/colaboradores", "Colaboradores", "Principal", "Perfis individuais com horas, retrabalho e aproveitamento.",
    ["colaboradores_cadastrados", "colaboradores_ativos", "horas_registradas", "horas_previstas", "horas_retrabalho"],
    ["horas_por_colaborador", "retrabalho_por_colaborador"], ["colaboradores"]),
  mod("produtividade", "/produtividade", "Produtividade", "Principal", "Entregas, atrasos, capacidade, ocupação e gargalos operacionais.",
    ["projetos_concluidos", "projetos_atrasados", "horas_previstas", "horas_registradas", "desvio_horas", "horas_retrabalho", "capacidade_disponivel", "ocupacao", "produtividade", "tempo_medio_atividade"],
    ["previstas_vs_realizadas", "ocupacao_por_departamento", "retrabalho_por_colaborador", "evolucao_producao"], ["capacidade_colaboradores", "retrabalho", "atividades"]),
  mod("producao", "/producao", "Produção", "Análises", "Quanto produzimos: projetos, peças, atividades e entregas.",
    ["tarefas_trabalhadas","etapas_trabalhadas","projetos_atendidos","projetos_status_finalizado","projetos_status_autorizado","projetos_status_standby","projetos_status_cancelado","projetos_status_proposta","projetos_status_concorrencia","projetos_finalizados_periodo","atividades_trabalhadas","pecas_trabalhadas","projetos_suspensos","pecas_cadastradas", "tarefas_cadastradas", "etapas_cadastradas", "projetos_iniciados", "projetos_concluidos", "projetos_ativos", "pecas_produzidas", "atividades_concluidas", "entregas", "tempo_medio_execucao", "atrasos", "retrabalho", "alteracoes"],
    ["status_atual_projetos","pecas_por_cliente","pecas_por_departamento","evolucao_producao", "entregas_por_departamento", "entregas_por_cliente", "entregas_por_servico"], ["pecas_trabalhadas","coorte_calendario","entregas_colaboradores"]),
  mod("contratado", "/contratado", "Contratado × executado", "Análises", "Estamos entregando além do contratado?",
    ["escopo_contratado", "entregas", "entregas_vs_contratado", "horas_vs_previstas", "receita_contratada", "alteracoes", "retrabalho"],
    ["contratado_vs_executado"], ["contratado_executado"]),
  mod("contratos", "/contratos", "Contratos", "Análises", "Qual o escopo contratado e a remuneração correspondente?",
    ["escopo_contratado", "receita_contratada", "entregas_vs_contratado"],
    ["contratado_vs_executado"], ["contratado_executado"]),
  mod("capacidade", "/capacidade", "Capacidade operacional", "Análises", "Como está a utilização da capacidade disponível?",
    ["capacidade_disponivel", "ocupacao", "horas_previstas", "horas_registradas"],
    ["ocupacao_por_departamento", "previstas_vs_realizadas"], ["capacidade_colaboradores"]),
  mod("eficiencia", "/eficiencia", "Eficiência", "Análises", "Onde estão os atrasos e o esforço de retrabalho?",
    ["produtividade", "tempo_medio_atividade", "atrasos", "horas_retrabalho", "desvio_horas"],
    ["retrabalho_por_colaborador", "previstas_vs_realizadas"], ["retrabalho", "atividades"]),
  mod("qualidade", "/qualidade", "Qualidade dos dados", "Governança", "Podemos confiar nos números apresentados?",
    ["estados_publicacao","conflitos_abertos","conflitos_resolvidos","divergencias_contagem","registros_reportados_tarefas","tarefas_com_falhas", "ultima_sincronizacao", "ultima_publicacao_core", "tarefas_recebidas", "tarefas_pendentes", "tarefas_em_execucao", "tarefas_em_reconciliacao", "paginas_recebidas", "registros_recebidos", "conflitos_financeiros", "divergencias_projetos", "recursos_sem_atualizacao", "lancamentos_futuros", "cobertura_dados"],
    ["ingest_por_status"], ["estados_publicacao","conflitos_detalhes","conflitos", "tarefas_ingest", "periodos_incompletos"]),
  mod("cliente", "/clientes/:id", "Cliente", "Principal", "Visão individual do cliente",
    ["receita_faturada", "receita_recebida", "valores_em_aberto", "custos_diretos", "resultado_operacional", "margem_bruta", "horas_registradas", "pecas_produzidas", "entregas", "projetos_ativos", "atrasos", "horas_retrabalho"],
    ["evolucao_financeira", "evolucao_producao"], ["projetos", "lancamentos_financeiros", "notas_fiscais"], "client"),
  mod("projeto", "/projetos/:id", "Projeto", "Principal", "Visão individual do projeto",
    ["receita_faturada", "custos_diretos", "resultado_operacional", "horas_registradas", "horas_previstas", "pecas_produzidas", "atividades_concluidas", "atrasos", "horas_retrabalho", "horas_vs_previstas"],
    ["horas_por_colaborador"], ["atividades", "apontamentos", "lancamentos_financeiros"], "project"),
];

const componentColumns=[col('faturado','Faturamento','BRL'),col('recebido','Receita operacional recebida','BRL'),col('despesas','Despesas operacionais associadas','BRL'),col('custo_registrado','Custo registrado','BRL'),col('horas','Horas realizadas','hours'),col('resultado','Resultado completo','BRL'),col('margem','Margem completa','percent')];
tables.gestao_clientes={label:'Clientes',sources:[CLI,TIME,JOBS,INV,FE],link:{column:'id',to:'clientes'},columns:[col('cliente','Cliente'),col('projetos','Projetos com atividade','count'),...componentColumns],description:'Componentes por cliente; valores ausentes não são zero. Resultado completo depende de conciliação.'};
tables.gestao_projetos={label:'Projetos',sources:[JOBS,TIME,TASKS,STEPS,FE],link:{column:'id',to:'projetos'},columns:[col('projeto','Projeto'),col('cliente','Cliente'),col('responsavel','Responsável'),col('departamento','Departamentos com atividade'),col('status','Status'),col('prazo','Prazo','date'),col('horas_previstas','Estimativa das atividades','hours'),...componentColumns.filter(c=>c.key!=='faturado'),col('horas_retrabalho','Retrabalho','hours')],description:'Projetos cadastrados ou com atividade no período; estimativas compartilhadas não são rateadas.'};
tables.projetos_por_cliente={label:'Projetos agrupados por cliente',sources:[JOBS,TIME],link:{column:'cliente_id',to:'clientes'},columns:[col('cliente','Cliente'),col('projetos','Projetos','count'),col('horas','Horas realizadas','hours'),col('horas_retrabalho','Retrabalho','hours'),col('custo_registrado','Custo registrado','BRL')]};
tables.timesheet_projetos={label:'Horas por projeto',sources:[TIME,JOBS],link:{column:'projeto_id',to:'projetos'},columns:[col('projeto','Projeto'),col('departamento','Departamentos'),col('colaboradores','Colaboradores','count'),col('horas','Horas realizadas','hours'),col('horas_retrabalho','Retrabalho','hours'),col('custo_registrado','Custo registrado','BRL')]};
tables.timesheet_calendario={label:'Calendário de horas',sources:[TIME],columns:[col('data','Dia','date'),col('horas','Horas realizadas','hours'),col('horas_retrabalho','Retrabalho','hours'),col('apontamentos','Registros','count')]};
for(const [id,label]of [['caixa_diario','Movimentações diárias'],['caixa_mensal','Movimentações mensais']])tables[id]={label,sources:[FE],columns:[col('periodo','Período'),col('entrada','Entradas','BRL'),col('saida','Saídas','BRL'),col('saldo','Saldo de movimentações','BRL')]};
for(const [id,label]of [['titulos_receber','Contas a receber'],['titulos_pagar','Contas a pagar']])tables[id]={label,sources:[FE],columns:[col('descricao','Título'),col('vencimento','Vencimento','date'),col('em_aberto','Em aberto','BRL')],description:'Identidade do título, saldo e vencimento ainda não comprovados.'};
charts.top_clientes_faturamento={label:'Clientes com maior faturamento',kind:'ranking',basis:'faturamento',unit:'BRL',sources:[INV,CLI]};
charts.evolucao_resultado={label:'Evolução do resultado operacional',kind:'line',basis:'recebimento',unit:'BRL',sources:[FE]};
for(const [id,label]of Object.entries(INDICATOR_LABELS))if(indicators[id])indicators[id].label=label;
for(const [id,label]of Object.entries(TABLE_LABELS))if(tables[id])tables[id].label=label;
tables.colaboradores.columns=tables.colaboradores.columns.map(c=>c.key==='cargo'?{...c,label:'Departamentos com atividade'}:c);
tables.apontamentos.columns.push(col('custo_registrado','Custo registrado','BRL'));
// Curadoria visual não amplia o acesso aos itens existentes.
// Cadastros comerciais e gerenciais pertencem ao módulo que concede o acesso a eles.
for(const [moduleId,ids,tableIds] of [
  ['clientes',['marcas_cadastradas'],['marcas']],
  ['contratos',['contratos_cadastrados','fees_cadastrados'],['contratos_cadastro','versoes_contrato','fees_jobs_extras']],
  ['executivo',['metas_cadastradas','departamentos_cadastrados'],['metas']],
  ['financeiro',['regras_rateio_cadastradas'],['regras_rateio']],
] as [string,string[],string[]][]){
  const target=MODULES.find(m=>m.id===moduleId)!;
  target.indicators=[...target.indicators,...ids];
  target.tables=[...target.tables,...tableIds];
}
export const ACCESS_MODULES:Record<'indicators'|'charts'|'tables',Record<string,string[]>>={indicators:{},charts:{},tables:{}};
for(const kind of ['indicators','charts','tables'] as const)for(const m of MODULES)for(const id of m[kind])(ACCESS_MODULES[kind][id]??=[]).push(m.id);
for(const [id,views]of Object.entries({...MANAGEMENT_VIEWS,financeiro:[...MANAGEMENT_VIEWS.financeiro,DRE_VIEW,CASH_VIEW]})){
  const m=MODULES.find(m=>m.id===id);if(!m)continue;
  for(const kind of ['indicators','charts','tables'] as const)m[kind]=[...new Set([...m[kind],...views.flatMap(v=>v[kind])])];
}
for(const kind of ['indicators','charts','tables'] as const)for(const m of MODULES)for(const id of m[kind])if(!ACCESS_MODULES[kind][id])ACCESS_MODULES[kind][id]=MODULES.filter(owner=>owner[kind].includes(id)).map(owner=>owner.id);
const labels:Record<string,string>={projetos:'Projetos',contratos:'Contratos e Escopos',produtividade:'Produtividade e Capacidade',qualidade:'Integrações e Qualidade'};
for(const m of MODULES)if(labels[m.id])m.label=labels[m.id];
const withId = <V>(r: Record<string, V>) => Object.fromEntries(Object.entries(r).map(([id, v]) => [id, { id, ...v }]));
export const INDICATORS = withId(indicators) as Record<string, IndicatorDef>;
export const CHARTS = withId(charts) as Record<string, ChartDef>;
export const TABLES = withId(tables) as Record<string, TableDef>;
export const moduleById = (id: string) => MODULES.find((m) => m.id === id);
