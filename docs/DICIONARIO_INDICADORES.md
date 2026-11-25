# Dicionário de indicadores

Gerado de `shared/catalog.ts` por `npm run docs:indicators`. Não editar à mão.

Percentuais são frações (0–1). Bases temporais nunca são misturadas no mesmo número.

| id | indicador | unidade | base | definição | fontes candidatas | requisito | módulos | situação |
|---|---|---|---|---|---|---|---|---|
| `receita_faturada` | Receita faturada | BRL | faturamento | Soma das notas fiscais emitidas no período (data de emissão), excluindo canceladas. | core.invoices | Data de emissão, valor e situação (cancelada) da nota fiscal. | executivo, clientes, financeiro, cliente, projeto | aguardando schema |
| `receita_recebida` | Receita recebida | BRL | recebimento | Soma dos lançamentos de receita efetivamente baixados no período (data de pagamento). Lançamentos previstos ou futuros são excluídos. | core.financial_entries | Tipo do lançamento (receita/despesa), data e valor de baixa. | executivo, clientes, rentabilidade, financeiro, cliente | aguardando schema |
| `receita_competencia` | Receita por competência | BRL | competencia | Soma dos lançamentos de receita cuja competência está no período, independentemente do pagamento. | core.financial_entries | Campo de competência no lançamento financeiro. | financeiro | aguardando schema |
| `valores_em_aberto` | Valores em aberto | BRL | recebimento | Receitas com vencimento até o fim do período e sem baixa. | core.financial_entries | Data de vencimento e situação de baixa. | financeiro, cliente | aguardando schema |
| `despesas` | Despesas pagas | BRL | recebimento | Soma dos lançamentos de despesa baixados no período. | core.financial_entries | Tipo do lançamento e data de baixa. | executivo, financeiro | aguardando schema |
| `custos_diretos` | Custos diretos | BRL | recebimento | Despesas pagas vinculadas a cliente ou projeto via centro de custo. Horas NÃO são convertidas em custo sem metodologia validada. | core.financial_entries, core.financial_entry_cost_centers | Centro de custo associado a cliente/projeto. | rentabilidade, financeiro, cliente, projeto | aguardando schema |
| `custos_indiretos` | Custos indiretos | BRL | recebimento | Despesas pagas sem vínculo com cliente/projeto. Não são rateadas. | core.financial_entries, core.financial_entry_cost_centers | Classificação de centros de custo (direto × indireto). | rentabilidade, financeiro | aguardando schema |
| `resultado_operacional` | Resultado operacional | BRL | recebimento | Receita recebida − custos diretos − custos indiretos, todos na mesma base (caixa). | core.financial_entries, core.financial_entry_cost_centers | Receitas e despesas na mesma base temporal. | executivo, rentabilidade, financeiro, cliente, projeto | aguardando schema |
| `margem_bruta` | Margem bruta | percent | recebimento | (Receita recebida − custos diretos) ÷ receita recebida. | core.financial_entries, core.financial_entry_cost_centers | Custos diretos confiáveis. | rentabilidade, cliente | aguardando schema |
| `margem_contribuicao` | Margem de contribuição | percent | recebimento | (Receita recebida − custos variáveis) ÷ receita recebida. | core.financial_entries, core.financial_entry_cost_centers | Classificação de custos variáveis — ainda não definida pela Quest. | rentabilidade | aguardando schema |
| `margem_operacional` | Margem operacional | percent | recebimento | Resultado operacional ÷ receita recebida. | core.financial_entries, core.financial_entry_cost_centers | Custos diretos e indiretos completos. | executivo, rentabilidade | aguardando schema |
| `lancamentos_futuros` | Lançamentos com data futura | count | competencia | Lançamentos com data posterior a hoje (ex.: 166 em dez/2026 na auditoria). Nunca contam como realizados. | core.financial_entries |  | financeiro, qualidade | aguardando schema |
| `projetos_ativos` | Projetos ativos | count | operacional | Jobs abertos (status não concluído/cancelado) no fim do período. | core.jobs | Status de conclusão do job na origem. | executivo, clientes, projetos, producao, cliente | aguardando schema |
| `projetos_iniciados` | Projetos iniciados | count | operacional | Jobs com data de abertura no período. | core.jobs | Data de abertura do job. | projetos, producao | aguardando schema |
| `projetos_concluidos` | Projetos concluídos | count | operacional | Jobs com data de conclusão no período e status de concluído na origem. | core.jobs | Status e data de conclusão. | projetos, produtividade, producao | aguardando schema |
| `pecas_produzidas` | Peças produzidas | count | operacional | Peças de jobs com conclusão no período. | core.job_pieces, core.jobs | Status/data de conclusão da peça. | producao, cliente, projeto | aguardando schema |
| `atividades_concluidas` | Atividades concluídas | count | operacional | Tarefas com status de concluída na origem e data de conclusão no período. | core.job_tasks | Status de conclusão da tarefa. | departamentos, producao, projeto | aguardando schema |
| `entregas` | Entregas realizadas | count | operacional | Definição de 'entrega' a validar com a Quest (peça aprovada, job entregue ou etapa final do workflow). | core.job_pieces, core.workflow_steps | Critério oficial de entrega. | departamentos, producao, contratado, cliente | aguardando schema |
| `horas_registradas` | Horas registradas | hours | operacional | Soma dos apontamentos de horas com data no período. | core.time_entries | Duração e data do apontamento. | executivo, clientes, projetos, timesheet, departamentos, colaboradores, produtividade, cliente, projeto | aguardando schema |
| `horas_previstas` | Horas previstas | hours | operacional | Soma das horas orçadas/previstas nas tarefas ou jobs do período. | core.job_tasks, core.jobs | Campo de horas previstas na tarefa ou no job. | projetos, timesheet, colaboradores, produtividade, projeto | aguardando schema |
| `desvio_horas` | Desvio de horas | hours | operacional | Horas registradas − horas previstas. Negativo = abaixo do previsto. | core.time_entries, core.job_tasks | Horas previstas confiáveis. | timesheet, produtividade | aguardando schema |
| `horas_retrabalho` | Horas de retrabalho | hours | operacional | Horas apontadas em tarefas/etapas identificadas como refação. | core.time_entries, core.job_tasks, core.workflow_steps | Marcação de refação no workflow. | timesheet, departamentos, colaboradores, produtividade, cliente, projeto | aguardando schema |
| `custo_mao_de_obra` | Custo de mão de obra | BRL | operacional | Horas × custo/hora por colaborador. Só calculável com metodologia de custo validada — nenhum salário ou taxa é presumido. | core.time_entries, core.employees | Custo/hora oficial por colaborador (não existe na fonte até agora). | timesheet | aguardando schema |
| `projetos_atrasados` | Projetos em atraso | count | operacional | Jobs abertos com prazo vencido ou concluídos após o prazo no período. | core.jobs | Prazo e data de conclusão do job. | executivo, projetos, produtividade | aguardando schema |
| `atrasos` | Atividades atrasadas | count | operacional | Tarefas concluídas após o prazo ou abertas com prazo vencido. | core.job_tasks | Prazo e data de conclusão da tarefa. | departamentos, producao, cliente, projeto | aguardando schema |
| `retrabalho` | Retrabalho / refações | count | operacional | Tarefas ou etapas identificadas como refação na origem. | core.job_tasks, core.workflow_steps | Marcação de refação no workflow. | producao, contratado | aguardando schema |
| `alteracoes` | Alterações solicitadas | count | operacional | Etapas de alteração solicitadas pelo cliente. | core.workflow_steps, core.job_tasks | Etapa de alteração identificável. | producao, contratado | aguardando schema |
| `tempo_medio_execucao` | Tempo médio de execução | days | operacional | Média (conclusão − abertura) dos jobs concluídos no período. | core.jobs | Datas de abertura e conclusão. | departamentos, producao | aguardando schema |
| `clientes_ativos` | Clientes ativos | count | operacional | Clientes com job, apontamento ou lançamento no período. | core.clients, core.jobs, core.financial_entries |  | executivo, clientes | aguardando schema |
| `colaboradores_ativos` | Colaboradores com apontamento | count | operacional | Colaboradores distintos com horas registradas no período. | core.time_entries, core.employees |  | executivo, timesheet, departamentos, colaboradores | aguardando schema |
| `produtividade` | Entregas por hora | ratio | operacional | Entregas realizadas ÷ horas registradas. | core.job_pieces, core.time_entries | Critério de entrega validado. | produtividade | aguardando schema |
| `capacidade_disponivel` | Capacidade disponível | hours | operacional | Soma da jornada contratada dos colaboradores ativos no período. | core.employees | Fonte de jornada/disponibilidade — não identificada até agora. | produtividade | aguardando schema |
| `horas_produtivas` | Horas produtivas | hours | operacional | Horas apontadas em tarefas de jobs de clientes. | core.time_entries, core.job_tasks | Distinção entre job de cliente e job interno. |  | aguardando schema |
| `horas_improdutivas` | Horas improdutivas | hours | operacional | Horas apontadas em atividades internas/administrativas. | core.time_entries, core.job_tasks | Classificação de jobs internos. |  | aguardando schema |
| `ocupacao` | Ocupação da capacidade | percent | operacional | Horas registradas ÷ capacidade disponível. | core.time_entries, core.employees | Capacidade disponível. | produtividade | aguardando schema |
| `tempo_medio_atividade` | Tempo médio por atividade | hours | operacional | Horas apontadas ÷ atividades concluídas. | core.time_entries, core.job_tasks |  | produtividade | aguardando schema |
| `horas_por_mil_receita` | Esforço operacional (h por R$ 1.000) | ratio | operacional | Horas registradas ÷ (receita recebida ÷ 1.000). Mede esforço relativo, não custo. | core.time_entries, core.financial_entries | Receita e horas do mesmo cliente/período. |  | aguardando schema |
| `escopo_contratado` | Escopo contratado | count | operacional | Quantidade de entregas previstas em contrato no período. | contratos (não identificados no CORE) | Contratos/escopos estruturados — fonte inexistente até agora. | contratado | aguardando schema |
| `receita_contratada` | Receita contratada | BRL | competencia | Valor contratual previsto para o período. | contratos (não identificados no CORE) | Contratos estruturados. | contratado | aguardando schema |
| `entregas_vs_contratado` | Executado ÷ contratado | percent | operacional | Entregas realizadas ÷ escopo contratado. | core.job_pieces, contratos | Escopo contratado. | contratado | aguardando schema |
| `horas_vs_previstas` | Horas ÷ horas previstas | percent | operacional | Horas registradas ÷ horas orçadas no job. | core.time_entries, core.jobs | Horas previstas/orçadas no job. | contratado, projeto | aguardando schema |
| `ultima_sincronizacao` | Última sincronização | datetime | ingestao | Maior data de atualização em ingest.qpf11_tasks. | ingest.qpf11_tasks |  | qualidade | aguardando schema |
| `ultima_publicacao_core` | Última publicação no CORE | datetime | ingestao | Data da última publicação registrada na auditoria. | audit.* (a mapear) |  | qualidade | aguardando schema |
| `tarefas_recebidas` | Tarefas de coleta | count | ingestao | Total de tarefas de coleta do QPF. | ingest.qpf11_tasks |  | qualidade | aguardando schema |
| `tarefas_pendentes` | Tarefas pendentes | count | ingestao | Tarefas com status pendente. | ingest.qpf11_tasks |  | qualidade | aguardando schema |
| `tarefas_em_execucao` | Tarefas em execução | count | ingestao | Tarefas com status em execução. | ingest.qpf11_tasks |  | qualidade | aguardando schema |
| `tarefas_em_reconciliacao` | Tarefas em reconciliação | count | ingestao | Tarefas em reconciliação (ex.: 209 divergências de projetos na auditoria). | ingest.qpf11_tasks |  | qualidade | aguardando schema |
| `paginas_recebidas` | Páginas recebidas | count | ingestao | Páginas da API iClips armazenadas. | ingest.qpf11_pages |  | qualidade | aguardando schema |
| `registros_recebidos` | Registros recebidos | count | ingestao | Registros contidos nas páginas recebidas. | ingest.qpf11_pages |  | qualidade | aguardando schema |
| `conflitos_financeiros` | Conflitos financeiros | count | ingestao | Conflitos de publicação financeira em aberto (ex.: 66 centros de custo + 28 documentos na auditoria). | audit.* (a mapear) |  | qualidade | aguardando schema |
| `divergencias_projetos` | Divergências de projetos | count | ingestao | Tarefas de projetos com divergência de contagem. | ingest.qpf11_tasks, audit.* (a mapear) |  | qualidade | aguardando schema |
| `recursos_sem_atualizacao` | Recursos sem atualização | count | ingestao | Recursos cujo último sucesso é anterior ao limite definido. | ingest.qpf11_tasks |  | qualidade | aguardando schema |
| `cobertura_dados` | Cobertura dos dados | percent | ingestao | Meses do período com coleta concluída ÷ meses do período. | ingest.qpf11_tasks, ingest.qpf11_pages |  | qualidade | aguardando schema |

## Gráficos

| id | gráfico | tipo | unidade | base | situação |
|---|---|---|---|---|---|
| `evolucao_financeira` | Evolução mensal: faturado × recebido × competência | line | BRL | competencia | aguardando schema |
| `receitas_vs_despesas` | Receitas × despesas (caixa) | bar | BRL | recebimento | aguardando schema |
| `faturado_vs_recebido` | Faturado × recebido por mês | bar | BRL | faturamento | aguardando schema |
| `concentracao_receita` | Concentração de receita por cliente | ranking | percent | recebimento | aguardando schema |
| `receita_por_grupo` | Receita por grupo empresarial | ranking | BRL | recebimento | aguardando schema |
| `top_clientes_receita` | Principais clientes por receita recebida | ranking | BRL | recebimento | aguardando schema |
| `receita_por_categoria` | Principais fontes de receita | ranking | BRL | recebimento | aguardando schema |
| `despesas_por_categoria` | Despesas por categoria | ranking | BRL | recebimento | aguardando schema |
| `despesas_por_centro_custo` | Despesas por centro de custo | ranking | BRL | recebimento | aguardando schema |
| `margem_por_cliente` | Margem bruta por cliente | ranking | percent | recebimento | aguardando schema |
| `resultado_por_projeto` | Resultado por projeto | ranking | BRL | recebimento | aguardando schema |
| `evolucao_margem` | Evolução da margem bruta | line | percent | recebimento | aguardando schema |
| `evolucao_producao` | Evolução mensal da produção | line | count | operacional | aguardando schema |
| `projetos_por_status` | Projetos por status | bar | count | operacional | aguardando schema |
| `entregas_por_departamento` | Entregas por departamento | ranking | count | operacional | aguardando schema |
| `entregas_por_cliente` | Entregas por cliente | ranking | count | operacional | aguardando schema |
| `entregas_por_servico` | Entregas por serviço | ranking | count | operacional | aguardando schema |
| `horas_por_departamento` | Horas por departamento | ranking | hours | operacional | aguardando schema |
| `horas_por_cliente` | Horas por cliente | ranking | hours | operacional | aguardando schema |
| `horas_por_colaborador` | Horas por colaborador | ranking | hours | operacional | aguardando schema |
| `horas_por_projeto` | Horas por projeto | ranking | hours | operacional | aguardando schema |
| `previstas_vs_realizadas` | Horas previstas × realizadas por job | bar | hours | operacional | aguardando schema |
| `ocupacao_por_departamento` | Departamentos sob recarga (ocupação da capacidade) | ranking | percent | operacional | aguardando schema |
| `retrabalho_por_colaborador` | Frequência de retrabalho por colaborador | ranking | hours | operacional | aguardando schema |
| `contratado_vs_executado` | Contratado × executado por cliente | bar | count | operacional | aguardando schema |
| `ingest_por_status` | Tarefas de coleta por status | bar | count | ingestao | aguardando schema |
