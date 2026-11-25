# Dicionário de indicadores

Gerado de `shared/catalog.ts` por `npm run docs:indicators`. Não editar à mão.

Percentuais são frações (0–1). Bases temporais nunca são misturadas no mesmo número.

| id | indicador | unidade | base | definição | fontes candidatas | requisito | módulos | situação |
|---|---|---|---|---|---|---|---|---|
| `receitas_nao_operacionais` | Receitas não operacionais recebidas | BRL | recebimento | Soma de Entrada isolada na classificação textual RECEITAS NÃO OPERACIONAIS por payment_date. | core.financial_entries, core.financial_categories |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `despesas_fixas` | Despesas operacionais fixas pagas | BRL | recebimento | Saídas isoladas classificadas DESPESAS OPERACIONAIS CUSTO FIXO. | core.financial_entries, core.financial_categories |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `despesas_variaveis` | Despesas operacionais variáveis pagas | BRL | recebimento | Saídas isoladas classificadas DESPESAS OPERACIONAIS CUSTO VARIÁVEL. | core.financial_entries, core.financial_categories |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `despesas_nao_operacionais` | Despesas não operacionais pagas | BRL | recebimento | Saídas isoladas classificadas DESPESAS NÃO OPERACIONAIS. | core.financial_entries, core.financial_categories |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `impostos_pagos` | Impostos pagos — origem | BRL | recebimento | Saídas isoladas classificadas IMPOSTOS; fora do resultado operacional preliminar. | core.financial_entries, core.financial_categories |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `participacao_lucros_paga` | Participação nos lucros paga — origem | BRL | recebimento | Saídas isoladas classificadas PARTICIPAÇÃO NOS LUCROS; não certifica lucro. | core.financial_entries, core.financial_categories |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `movimentacoes_sem_classificacao` | Movimentos sem classificação — soma assinada | BRL | recebimento | Valores de movimentos NENHUM, classificação ausente, ambígua ou desconhecida; não é saldo nem resultado. | core.financial_entries, core.financial_categories |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `despesas_rateadas` | Saídas com rateio conciliado | BRL | recebimento | Valor original contado uma vez por lançamento com soma monetária, percentual e parcelas conjuntamente conciliados. | core.financial_entries, core.financial_entry_cost_centers |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `despesas_sem_rateio` | Saídas sem rateio disponível | BRL | recebimento | Valor original de lançamentos sem registros de centro de custo; não redistribui. | core.financial_entries, core.financial_entry_cost_centers |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `despesas_rateio_divergente` | Saídas com rateio divergente | BRL | recebimento | Valor original contado uma vez por lançamento com valores/percentuais ausentes, divergentes ou centro duplicado. | core.financial_entries, core.financial_entry_cost_centers |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `notas_vinculadas` | Notas emitidas com cliente unívoco | count | faturamento | Notas issued com CPF/CNPJ numérico válido e um único cadastro candidato por documento. | core.invoices, core.clients |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `notas_ambiguas` | Notas emitidas com documento ambíguo | count | faturamento | Notas issued com mais de um cadastro candidato por documento válido; valores não distribuídos. | core.invoices, core.clients |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `notas_sem_vinculo` | Notas emitidas sem vínculo válido | count | faturamento | Notas issued sem candidato válido, documento ausente/inválido ou formato não suportado. | core.invoices, core.clients |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `faturamento_clientes_vinculados` | Faturamento com cliente comprovado | BRL | faturamento | Soma de notas issued com associação documental unívoca e valor finito, por issued_at. | core.invoices, core.clients |  | clientes | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_status_finalizado` | Status atual: Finalizado | count | operacional | Contagem literal atual, independentemente de data de conclusão e do período; não equivale a entrega. | core.jobs |  | projetos, producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_status_autorizado` | Status atual: Autorizado | count | operacional | Contagem literal atual; candidato a ativo, definição gerencial pendente. | core.jobs |  | projetos, producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_status_standby` | Status atual: Stand By | count | operacional | Contagem literal atual; proposta de suspenso, sujeita à aprovação gerencial. | core.jobs |  | projetos, producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_status_cancelado` | Status atual: Cancelado | count | operacional | Contagem literal atual, sem reconstrução histórica. | core.jobs |  | projetos, producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_status_proposta` | Status atual: Proposta Comercial | count | operacional | Contagem literal atual. | core.jobs |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_status_concorrencia` | Status atual: Concorrência | count | operacional | Contagem literal atual. | core.jobs |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_finalizados_periodo` | Marcados Finalizado com conclusão válida | count | operacional | Status atual Finalizado e completed_at no período, não futuro nem anterior à abertura. | core.jobs |  | projetos, producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_trabalhadas` | Tarefas TASK com apontamento | count | operacional | Unidades distintas (job_id, task_id) com duração válida e cadastro unívoco. | core.time_entries, core.job_tasks |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `etapas_trabalhadas` | Etapas WORKFLOW com apontamento | count | operacional | Unidades distintas (job_piece_id, workflow_id) com duração válida e vínculo ao projeto. | core.time_entries, core.workflow_steps, core.job_pieces |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `unidades_sem_estimativa` | Unidades comparáveis sem estimativa positiva | count | operacional | Unidades trabalhadas com cadastro unívoco mas sem estimativa positiva válida. | core.time_entries, core.job_tasks, core.workflow_steps |  | timesheet | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_atendidos` | Projetos com apontamento válido | count | operacional | Projetos distintos nos apontamentos válidos do período, sem inferir entrega. | core.time_entries, core.jobs |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `horas_com_custo_positivo` | Horas com custo registrado positivo | hours | operacional | Duração válida de apontamentos com labor_cost finito positivo. | core.time_entries |  | rentabilidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `horas_sem_custo_positivo` | Horas sem custo positivo comprovado | hours | operacional | Duração válida com labor_cost ausente, inválido, zero ou negativo; não estima custo. | core.time_entries |  | rentabilidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `cobertura_custo_positivo_horas` | Cobertura de custo positivo por horas | percent | operacional | Horas com labor_cost finito positivo / horas válidas do mesmo escopo. | core.time_entries |  | rentabilidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `estados_publicacao` | Registros com estado de publicação — atual | count | ingestao | Linhas atuais em audit.qpf11_publication_state, sem certificar únicos publicados ou cobertura. | audit.qpf11_publication_state |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `atividades_trabalhadas` | Atividades com apontamento | count | operacional | Unidades distintas TASK/WORKFLOW com apontamentos válidos e chave composta unívoca; não são entregas. | core.time_entries, core.job_tasks, core.workflow_steps |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `pecas_trabalhadas` | Peças com apontamento válido | count | operacional | Peças distintas em apontamentos TASK ou WORKFLOW com vínculo unívoco ao projeto; não são entregas. | core.time_entries, core.job_pieces |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_suspensos` | Projetos suspensos — atual | count | operacional | Fotografia atual dos status textuais explicitamente aprovados na política gerencial. | core.jobs |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `cobertura_custos` | Cobertura de custo registrado | percent | operacional | Apontamentos válidos com labor_cost finito / apontamentos válidos, incluindo zero. | core.time_entries |  | rentabilidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `apontamentos_custo_zero` | Duração positiva com custo zero | count | operacional | Apontamentos válidos com duração positiva e labor_cost igual a zero; não estima custo ausente. | core.time_entries |  | rentabilidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `conflitos_abertos` | Conflitos de publicação abertos — atual | count | ingestao | Contagem pontual com resolved_at nulo; todos os recursos. | audit.qpf11_publication_conflicts |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `conflitos_resolvidos` | Conflitos de publicação resolvidos — atual | count | ingestao | Contagem pontual com resolved_at preenchido e não futuro. | audit.qpf11_publication_conflicts |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `divergencias_contagem` | Tarefas com contagens divergentes — atual | count | ingestao | expected_total diferente de received_records, com ambas contagens válidas; todos os recursos. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `registros_reportados_tarefas` | Registros reportados pelas tarefas — atual | count | ingestao | Soma de received_records não negativos; pode incluir repetições, não são publicados únicos. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `clientes_cadastrados` | Clientes cadastrados — atual | count | operacional | Contagem física atual de core.clients; sem recorte nem comparação histórica. | core.clients |  | clientes | SQL implementado; condicionado à introspecção e qualidade parcial |
| `colaboradores_cadastrados` | Colaboradores cadastrados — atual | count | operacional | Contagem física atual de core.employees; não pressupõe cadastro ativo ou vínculo vigente. | core.employees |  | colaboradores | SQL implementado; condicionado à introspecção e qualidade parcial |
| `departamentos_cadastrados` | Departamentos cadastrados — atual | count | operacional | Contagem física atual de core.departments, sem recorte histórico. | core.departments |  | departamentos | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_cadastrados` | Projetos cadastrados — atual | count | operacional | Contagem física atual de core.jobs, independentemente do status. | core.jobs |  | projetos | SQL implementado; condicionado à introspecção e qualidade parcial |
| `pecas_cadastradas` | Peças cadastradas — atual | count | operacional | Contagem física atual de core.job_pieces; não representa entregas por período. | core.job_pieces |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_cadastradas` | Tarefas cadastradas — atual | count | operacional | Contagem física atual de core.job_tasks; chave composta preservada, sem pressupor execução. | core.job_tasks |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `etapas_cadastradas` | Etapas cadastradas — atual | count | operacional | Contagem física atual de core.workflow_steps; não soma estimativas de tarefas e etapas. | core.workflow_steps |  | producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `entradas_realizadas` | Entradas realizadas — preliminar | BRL | recebimento | Soma algébrica de amount de Entrada por payment_date; famílias pai/filho excluídas. Não classifica receita operacional. | core.financial_entries |  | executivo, financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `saidas_realizadas` | Saídas realizadas — preliminar | BRL | recebimento | Soma algébrica de amount de Saída por payment_date; famílias pai/filho excluídas. Não classifica despesa operacional. | core.financial_entries |  | executivo, financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `saldo_movimentacoes` | Saldo de movimentações — preliminar | BRL | recebimento | Entradas menos saídas isoladas na mesma base payment_date. Indisponível se houver sinais negativos ambíguos; não representa lucro. | core.financial_entries |  | executivo, financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_com_falhas` | Tarefas nos estados FAILED/ERROR | count | ingestao | Contagem literal atual dos estados FAILED e ERROR; outros estados não são presumidos. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `faturamento_liquido` | Faturamento líquido das notas | BRL | faturamento | Soma de net_amount de notas issued por issued_at; canceladas e nulos excluídos, sinais preservados. | core.invoices |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `faturamento_competencia` | Faturamento por competência das notas | BRL | competencia | Soma de service_amount de notas issued por competence_date; não é receita de caixa. | core.invoices |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `notas_emitidas` | Notas emitidas | count | faturamento | Quantidade de notas com status issued por issued_at, sem datas futuras. | core.invoices |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `notas_canceladas` | Notas canceladas | count | faturamento | Quantidade de notas cancelled pela data de emissão; não representa data de cancelamento. | core.invoices |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `percentual_retrabalho` | Percentual de horas em retrabalho | percent | operacional | Duração válida com is_rework true / duração válida com marcação preenchida, por started_at; desconhecidos excluídos. | core.time_entries |  | timesheet | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receita_faturada` | Receita faturada | BRL | faturamento | Soma das notas fiscais emitidas no período (data de emissão), excluindo canceladas. | core.invoices | Data de emissão, valor e situação (cancelada) da nota fiscal. | executivo, clientes, financeiro, cliente, projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receita_recebida` | Receita operacional recebida — origem | BRL | recebimento | Entradas isoladas classificadas RECEITAS OPERACIONAIS por payment_date. Sem notas, títulos abertos ou receitas não operacionais. | core.financial_entries, core.financial_categories |  | executivo, clientes, rentabilidade, financeiro, cliente | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receita_competencia` | Receita operacional realizada por competência — parcial | BRL | competencia | Movimentos isolados já pagos, com classificação operacional, por competence_date não futura; sem títulos abertos ou reconhecimento contábil completo. | core.financial_entries, core.financial_categories |  | financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `valores_em_aberto` | Valores em aberto | BRL | recebimento | Receitas com vencimento até o fim do período e sem baixa. | core.financial_entries | Data de vencimento e situação de baixa. | financeiro, cliente | indisponível; sem fonte/semântica validada |
| `despesas` | Despesas operacionais pagas — origem | BRL | recebimento | Saídas isoladas classificadas custo operacional fixo ou variável por payment_date; não soma custos do timesheet. | core.financial_entries, core.financial_categories |  | executivo, financeiro | SQL implementado; condicionado à introspecção e qualidade parcial |
| `custos_diretos` | Custos diretos | BRL | recebimento | Despesas pagas vinculadas a cliente ou projeto via centro de custo. Horas NÃO são convertidas em custo sem metodologia validada. | core.financial_entries, core.financial_entry_cost_centers | Centro de custo associado a cliente/projeto. | rentabilidade, financeiro, cliente, projeto | indisponível; sem fonte/semântica validada |
| `custos_indiretos` | Custos indiretos | BRL | recebimento | Despesas pagas sem vínculo com cliente/projeto. Não são rateadas. | core.financial_entries, core.financial_entry_cost_centers | Classificação de centros de custo (direto × indireto). | rentabilidade, financeiro | indisponível; sem fonte/semântica validada |
| `resultado_operacional` | Resultado operacional por caixa — preliminar | BRL | recebimento | Receita operacional menos despesas operacionais fixas e variáveis, antes de impostos, participação e não operacionais; somente valores isolados classificados. | core.financial_entries, core.financial_categories |  | executivo, rentabilidade, financeiro, cliente, projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `margem_bruta` | Margem bruta | percent | recebimento | (Receita recebida − custos diretos) ÷ receita recebida. | core.financial_entries, core.financial_entry_cost_centers | Custos diretos confiáveis. | rentabilidade, cliente | indisponível; sem fonte/semântica validada |
| `margem_contribuicao` | Margem de contribuição | percent | recebimento | (Receita recebida − custos variáveis) ÷ receita recebida. | core.financial_entries, core.financial_entry_cost_centers | Classificação de custos variáveis — ainda não definida pela Quest. | rentabilidade | indisponível; sem fonte/semântica validada |
| `margem_operacional` | Margem operacional por caixa — preliminar | percent | recebimento | Resultado operacional preliminar dividido por receita operacional positiva; sinais negativos ambíguos impedem o cálculo. | core.financial_entries, core.financial_categories |  | executivo, rentabilidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `lancamentos_futuros` | Lançamentos com data futura | count | operacional | Contagem por entry_date em dia futuro no período; pode haver payment_date passado, que continua classificando o caixa. | core.financial_entries |  | financeiro, qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_ativos` | Projetos ativos — atual | count | operacional | Fotografia dos status textuais ativos explicitamente aprovados; sem reconstrução histórica. | core.jobs |  | executivo, clientes, projetos, producao, cliente | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_iniciados` | Projetos iniciados | count | operacional | Jobs com data de abertura no período. | core.jobs | Data de abertura do job. | projetos, producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_concluidos` | Projetos concluídos | count | operacional | Jobs com data de conclusão no período e status de concluído na origem. | core.jobs | Status e data de conclusão. | projetos, produtividade, producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `pecas_produzidas` | Peças produzidas | count | operacional | Peças de jobs com conclusão no período. | core.job_pieces, core.jobs | Status/data de conclusão da peça. | producao, cliente, projeto | indisponível; sem fonte/semântica validada |
| `atividades_concluidas` | Atividades concluídas | count | operacional | Tarefas com status de concluída na origem e data de conclusão no período. | core.job_tasks | Status de conclusão da tarefa. | departamentos, producao, projeto | indisponível; sem fonte/semântica validada |
| `entregas` | Entregas realizadas | count | operacional | Definição de 'entrega' a validar com a Quest (peça aprovada, job entregue ou etapa final do workflow). | core.job_pieces, core.workflow_steps | Critério oficial de entrega. | departamentos, producao, contratado, cliente | indisponível; sem fonte/semântica validada |
| `horas_registradas` | Horas registradas | hours | operacional | Soma dos apontamentos de horas com data no período. | core.time_entries | Duração e data do apontamento. | executivo, clientes, projetos, timesheet, departamentos, colaboradores, produtividade, capacidade, cliente, projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `horas_previstas` | Horas previstas — subconjunto com estimativa | hours | operacional | Cada estimated_minutes uma vez por chave composta de unidade trabalhada no período; cobertura explícita. | core.time_entries, core.job_tasks, core.workflow_steps |  | projetos, timesheet, colaboradores, produtividade, capacidade, projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `desvio_horas` | Desvio parcial: período × orçamento integral | hours | operacional | Horas do período menos estimativa integral das unidades com estimativa positiva; não é desvio do ciclo completo. | core.time_entries, core.job_tasks, core.workflow_steps |  | timesheet, produtividade, eficiencia | SQL implementado; condicionado à introspecção e qualidade parcial |
| `horas_retrabalho` | Horas de retrabalho | hours | operacional | Soma de durações válidas de apontamentos com is_rework=true por started_at. | core.time_entries | is_rework booleano no apontamento. | timesheet, departamentos, colaboradores, produtividade, eficiencia, cliente, projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `custo_mao_de_obra` | Custo de mão de obra registrado — parcial | BRL | operacional | Soma de labor_cost preenchido em apontamentos válidos por started_at. Não adiciona horas × taxa nem despesas financeiras de pessoal. | core.time_entries | labor_cost numérico; cobertura explícita e sem certificação de custo total. | rentabilidade, timesheet | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_atrasados` | Projetos em atraso — atual | count | operacional | Status ativo aprovado, sem completed_at e expected_end_at anterior ao instante atual. | core.jobs |  | executivo, projetos, produtividade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `atrasos` | Atividades atrasadas | count | operacional | Tarefas concluídas após o prazo ou abertas com prazo vencido. | core.job_tasks | Prazo e data de conclusão da tarefa. | departamentos, producao, eficiencia, cliente, projeto | indisponível; sem fonte/semântica validada |
| `retrabalho` | Apontamentos com retrabalho | count | operacional | Quantidade de apontamentos válidos com is_rework=true; não representa tarefas distintas. | core.time_entries | is_rework booleano no apontamento. | producao, contratado | SQL implementado; condicionado à introspecção e qualidade parcial |
| `alteracoes` | Alterações solicitadas | count | operacional | Etapas de alteração solicitadas pelo cliente. | core.workflow_steps, core.job_tasks | Etapa de alteração identificável. | producao, contratado | indisponível; sem fonte/semântica validada |
| `tempo_medio_execucao` | Calendário de Finalizado — datas válidas | days | operacional | Média de completed_at menos entered_at em dias corridos para status atual Finalizado e conclusão no período. Sem futuro ou corte de extremos; não mede horas trabalhadas. | core.jobs |  | departamentos, producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `clientes_ativos` | Clientes com apontamentos | count | operacional | Clientes distintos vinculados a jobs com apontamentos válidos por started_at. Não mede atividade financeira nem situação administrativa. | core.time_entries, core.jobs |  | executivo, clientes | SQL implementado; condicionado à introspecção e qualidade parcial |
| `colaboradores_ativos` | Colaboradores com apontamento | count | operacional | Colaboradores distintos com horas registradas no período. | core.time_entries, core.employees |  | executivo, timesheet, departamentos, colaboradores | SQL implementado; condicionado à introspecção e qualidade parcial |
| `produtividade` | Entregas por hora | ratio | operacional | Entregas realizadas ÷ horas registradas. | core.job_pieces, core.time_entries | Critério de entrega validado. | produtividade, eficiencia | indisponível; sem fonte/semântica validada |
| `capacidade_disponivel` | Capacidade disponível | hours | operacional | Soma da jornada contratada dos colaboradores ativos no período. | core.employees | Fonte de jornada/disponibilidade — não identificada até agora. | produtividade, capacidade | indisponível; sem fonte/semântica validada |
| `horas_produtivas` | Horas produtivas | hours | operacional | Horas apontadas em tarefas de jobs de clientes. | core.time_entries, core.job_tasks | Distinção entre job de cliente e job interno. |  | indisponível; sem fonte/semântica validada |
| `horas_improdutivas` | Horas improdutivas | hours | operacional | Horas apontadas em atividades internas/administrativas. | core.time_entries, core.job_tasks | Classificação de jobs internos. |  | indisponível; sem fonte/semântica validada |
| `ocupacao` | Ocupação da capacidade | percent | operacional | Horas registradas ÷ capacidade disponível. | core.time_entries, core.employees | Capacidade disponível. | produtividade, capacidade | indisponível; sem fonte/semântica validada |
| `tempo_medio_atividade` | Tempo médio por atividade | hours | operacional | Horas apontadas ÷ atividades concluídas. | core.time_entries, core.job_tasks |  | produtividade, eficiencia | indisponível; sem fonte/semântica validada |
| `horas_por_mil_receita` | Esforço operacional (h por R$ 1.000) | ratio | operacional | Horas registradas ÷ (receita recebida ÷ 1.000). Mede esforço relativo, não custo. | core.time_entries, core.financial_entries | Receita e horas do mesmo cliente/período. |  | indisponível; sem fonte/semântica validada |
| `escopo_contratado` | Escopo contratado | count | operacional | Quantidade de entregas previstas em contrato no período. | contratos (não identificados no CORE) | Contratos/escopos estruturados — fonte inexistente até agora. | contratado, contratos | indisponível; sem fonte/semântica validada |
| `receita_contratada` | Receita contratada | BRL | competencia | Valor contratual previsto para o período. | contratos (não identificados no CORE) | Contratos estruturados. | contratado, contratos | indisponível; sem fonte/semântica validada |
| `entregas_vs_contratado` | Executado ÷ contratado | percent | operacional | Entregas realizadas ÷ escopo contratado. | core.job_pieces, contratos | Escopo contratado. | contratado, contratos | indisponível; sem fonte/semântica validada |
| `horas_vs_previstas` | Horas do período ÷ previsão integral | percent | operacional | Horas do período no subconjunto com estimativa positiva / estimativa integral dessas unidades, uma vez por chave. | core.time_entries, core.job_tasks, core.workflow_steps |  | contratado, projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `ultima_sincronizacao` | Última atualização de tarefas | datetime | ingestao | Maior updated_at em ingest.qpf11_tasks. Não certifica coleta bem-sucedida nem publicação integral. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `ultima_publicacao_core` | Última publicação no CORE | datetime | ingestao | Data da última publicação registrada na auditoria. | audit.* (a mapear) |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_recebidas` | Tarefas de coleta | count | ingestao | Total de tarefas de coleta do QPF. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_pendentes` | Tarefas pendentes | count | ingestao | Tarefas com status pendente. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_em_execucao` | Tarefas em execução | count | ingestao | Tarefas com status em execução. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_em_reconciliacao` | Tarefas em reconciliação | count | ingestao | Tarefas em reconciliação. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `paginas_recebidas` | Páginas recebidas | count | ingestao | Páginas da API iClips armazenadas. | ingest.qpf11_pages |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `registros_recebidos` | Registros recebidos | count | ingestao | Registros contidos nas páginas recebidas. | ingest.qpf11_pages |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `conflitos_financeiros` | Conflitos financeiros | count | ingestao | Conflitos de publicação financeira em aberto. | audit.* (a mapear) |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `divergencias_projetos` | Divergências de projetos | count | ingestao | Tarefas de projetos com divergência de contagem. | ingest.qpf11_tasks, audit.* (a mapear) |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `recursos_sem_atualizacao` | Recursos sem atualização | count | ingestao | Recursos cujo último sucesso é anterior ao limite definido. | ingest.qpf11_tasks |  | qualidade | indisponível; sem fonte/semântica validada |
| `cobertura_dados` | Cobertura dos dados | percent | ingestao | Meses do período com coleta concluída ÷ meses do período. | ingest.qpf11_tasks, ingest.qpf11_pages |  | qualidade | indisponível; sem fonte/semântica validada |

## Limitações por indicador ainda indisponível

- `valores_em_aberto`: Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente.
- `custos_diretos`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `custos_indiretos`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `margem_bruta`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `margem_contribuicao`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `pecas_produzidas`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `atividades_concluidas`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `entregas`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `atrasos`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `alteracoes`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `produtividade`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `capacidade_disponivel`: Jornadas, disponibilidade e capacidade contratada não comprovadas; nenhuma jornada de oito horas é presumida.
- `horas_produtivas`: Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas.
- `horas_improdutivas`: Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas.
- `ocupacao`: Jornadas, disponibilidade e capacidade contratada não comprovadas; nenhuma jornada de oito horas é presumida.
- `tempo_medio_atividade`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `horas_por_mil_receita`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `escopo_contratado`: Fonte contratual e escopo de entregas não comprovados. Orçamento de job não é contrato.
- `receita_contratada`: Fonte contratual e escopo de entregas não comprovados. Orçamento de job não é contrato.
- `entregas_vs_contratado`: Fonte contratual e escopo de entregas não comprovados. Orçamento de job não é contrato.
- `recursos_sem_atualizacao`: Recurso, último sucesso e prazo esperado de atualização não aprovados; não inventar limiar de desatualização.
- `cobertura_dados`: Exige intervalos completos e publicação efetiva, reconciliando sobreposições e publicações posteriores. Contagem de tarefas não é cobertura.

## Gráficos

| id | gráfico | tipo | unidade | base | situação |
|---|---|---|---|---|---|
| `dre_mensal` | DRE de origem por caixa — preliminar | bar | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `status_atual_projetos` | Status textual atual — todos no escopo | bar | count | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `pecas_por_cliente` | Peças com apontamento por cliente | ranking | count | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `pecas_por_departamento` | Peças com apontamento por departamento histórico | ranking | count | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `custo_por_colaborador` | Custo registrado por colaborador | ranking | BRL | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `custo_por_departamento` | Custo registrado por departamento histórico | ranking | BRL | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `custo_por_cliente` | Custo registrado por cliente | ranking | BRL | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `custo_por_projeto` | Custo registrado por projeto | ranking | BRL | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `movimentacoes_realizadas` | Movimentações isoladas — preliminar | bar | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `evolucao_faturamento` | Faturamento por mês de emissão | line | BRL | faturamento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `evolucao_financeira` | Faturamento emitido: bruto e líquido | line | BRL | faturamento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receitas_vs_despesas` | Receitas × despesas (caixa) | bar | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `faturado_vs_recebido` | Faturado × recebido por mês | bar | BRL | faturamento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `concentracao_receita` | Participação das entradas isoladas por cliente — preliminar | ranking | percent | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receita_por_grupo` | Entradas isoladas por grupo — preliminar | ranking | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `top_clientes_receita` | Entradas isoladas por cliente — preliminar | ranking | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receita_por_categoria` | Entradas isoladas por categoria — preliminar | ranking | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `despesas_por_categoria` | Saídas isoladas por categoria — preliminar | ranking | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `despesas_por_centro_custo` | Despesas por centro de custo | ranking | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `margem_por_cliente` | Margem bruta por cliente | ranking | percent | recebimento | indisponível; sem fonte/semântica validada |
| `resultado_por_projeto` | Resultado por projeto | ranking | BRL | recebimento | indisponível; sem fonte/semântica validada |
| `evolucao_margem` | Evolução da margem bruta | line | percent | recebimento | indisponível; sem fonte/semântica validada |
| `evolucao_producao` | Projetos cadastrados por mês de abertura | line | count | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_por_status` | Status atual dos projetos abertos no período | bar | count | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `entregas_por_departamento` | Entregas por departamento | ranking | count | operacional | indisponível; sem fonte/semântica validada |
| `entregas_por_cliente` | Entregas por cliente | ranking | count | operacional | indisponível; sem fonte/semântica validada |
| `entregas_por_servico` | Entregas por serviço | ranking | count | operacional | indisponível; sem fonte/semântica validada |
| `horas_por_departamento` | Horas por departamento | ranking | hours | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `horas_por_cliente` | Horas por cliente | ranking | hours | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `horas_por_colaborador` | Horas por colaborador | ranking | hours | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `horas_por_projeto` | Horas por projeto | ranking | hours | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `previstas_vs_realizadas` | Previsto × realizado — subconjunto com estimativa | bar | hours | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `ocupacao_por_departamento` | Departamentos sob recarga (ocupação da capacidade) | ranking | percent | operacional | indisponível; sem fonte/semântica validada |
| `retrabalho_por_colaborador` | Frequência de retrabalho por colaborador | ranking | hours | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `contratado_vs_executado` | Contratado × executado por cliente | bar | count | operacional | indisponível; sem fonte/semântica validada |
| `ingest_por_status` | Tarefas de coleta por status | bar | count | ingestao | SQL implementado; condicionado à introspecção e qualidade parcial |

## Tabelas

| id | tabela | situação |
|---|---|---|
| `rateios_financeiros` | Conciliação dos rateios por lançamento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `faturamento_por_cliente` | Faturamento por cliente comprovado | SQL implementado; condicionado à introspecção e qualidade parcial |
| `notas_vinculos` | Notas: vínculos unívocos, ambíguos e ausentes | SQL implementado; condicionado à introspecção e qualidade parcial |
| `notas_ambiguas_detalhes` | Notas com documento ambíguo | SQL implementado; condicionado à introspecção e qualidade parcial |
| `notas_sem_vinculo_detalhes` | Notas sem vínculo válido | SQL implementado; condicionado à introspecção e qualidade parcial |
| `pecas_trabalhadas` | Peças com apontamentos no período | SQL implementado; condicionado à introspecção e qualidade parcial |
| `coorte_calendario` | Coorte de calendário: Finalizado | SQL implementado; condicionado à introspecção e qualidade parcial |
| `estados_publicacao` | Estado de publicação por recurso — atual | SQL implementado; condicionado à introspecção e qualidade parcial |
| `conflitos_detalhes` | Conflitos: razões e resolução — restrito | SQL implementado; condicionado à introspecção e qualidade parcial |
| `dre_categorias` | Movimentos por categoria e classificação DRE | SQL implementado; condicionado à introspecção e qualidade parcial |
| `dre_contas` | Movimentos por conta financeira | SQL implementado; condicionado à introspecção e qualidade parcial |
| `movimentos_clientes` | Movimentos com vínculo de cliente pelo projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `movimentos_projetos` | Movimentos por projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `vinculos_centros_custo` | Vínculos de centros de custo — sem rateio | SQL implementado; condicionado à introspecção e qualidade parcial |
| `custos_registrados` | Custos registrados dos apontamentos | SQL implementado; condicionado à introspecção e qualidade parcial |
| `alertas` | Painel de alertas de governança operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `top_clientes_resultado` | Top 5 clientes por resultado | indisponível; sem fonte/semântica validada |
| `top_projetos_menor_margem` | Top 5 projetos com menor margem | indisponível; sem fonte/semântica validada |
| `apontamentos` | Apontamentos de horas | SQL implementado; condicionado à introspecção e qualidade parcial |
| `resultado_mensal` | Resultado operacional mensal — preliminar | SQL implementado; condicionado à introspecção e qualidade parcial |
| `retrabalho` | Horas de retrabalho | SQL implementado; condicionado à introspecção e qualidade parcial |
| `lancamentos_financeiros` | Lançamentos financeiros | SQL implementado; condicionado à introspecção e qualidade parcial |
| `notas_fiscais` | Notas fiscais | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receita_por_cliente` | Entradas isoladas por cliente — preliminar | SQL implementado; condicionado à introspecção e qualidade parcial |
| `anomalias_financeiras` | Variações e anomalias | indisponível; sem fonte/semântica validada |
| `rentabilidade_clientes` | Rentabilidade por cliente | indisponível; sem fonte/semântica validada |
| `rentabilidade_projetos` | Rentabilidade por projeto | indisponível; sem fonte/semântica validada |
| `custo_por_servico` | Custo e receita por serviço | indisponível; sem fonte/semântica validada |
| `atividades` | Atividades com apontamento no período | SQL implementado; condicionado à introspecção e qualidade parcial |
| `entregas_colaboradores` | Produção por colaborador | indisponível; sem fonte/semântica validada |
| `projetos` | Projetos | SQL implementado; condicionado à introspecção e qualidade parcial |
| `clientes` | Ranking de clientes | SQL implementado; condicionado à introspecção e qualidade parcial |
| `departamentos` | Departamentos da agência | SQL implementado; condicionado à introspecção e qualidade parcial |
| `colaboradores` | Colaboradores | SQL implementado; condicionado à introspecção e qualidade parcial |
| `timesheet_departamentos` | Horas por departamento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `contratado_executado` | Contratado × executado | indisponível; sem fonte/semântica validada |
| `capacidade_colaboradores` | Carga por colaborador | SQL implementado; condicionado à introspecção e qualidade parcial |
| `conflitos` | Conflitos de publicação por estado — atual | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_ingest` | Tarefas de coleta (QPF) | SQL implementado; condicionado à introspecção e qualidade parcial |
| `periodos_incompletos` | Períodos incompletos | indisponível; sem fonte/semântica validada |

SQL implementado não comprova disponibilidade em produção. Políticas gerenciais e perfis de relacionamento são validados em execução; ausências continuam indisponíveis. Consultar CORRECOES_RELACIONAMENTOS.md.
