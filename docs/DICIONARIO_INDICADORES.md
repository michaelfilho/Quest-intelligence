# Dicionário de indicadores

Gerado de `shared/catalog.ts` por `npm run docs:indicators`. Não editar à mão.

Percentuais são frações (0–1). Bases temporais nunca são misturadas no mesmo número.

| id | indicador | unidade | base | definição | fontes candidatas | requisito | módulos | situação |
|---|---|---|---|---|---|---|---|---|
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
| `percentual_retrabalho` | Percentual de horas em retrabalho | percent | operacional | Duração válida com is_rework true / duração válida total, atribuída ao started_at. | core.time_entries |  | timesheet | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receita_faturada` | Receita faturada | BRL | faturamento | Soma das notas fiscais emitidas no período (data de emissão), excluindo canceladas. | core.invoices | Data de emissão, valor e situação (cancelada) da nota fiscal. | executivo, clientes, financeiro, cliente, projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receita_recebida` | Receita recebida | BRL | recebimento | Soma dos lançamentos de receita efetivamente baixados no período (data de pagamento). Lançamentos previstos ou futuros são excluídos. | core.financial_entries | Tipo do lançamento (receita/despesa), data e valor de baixa. | executivo, clientes, rentabilidade, financeiro, cliente | indisponível; sem fonte/semântica validada |
| `receita_competencia` | Receita por competência | BRL | competencia | Soma dos lançamentos de receita cuja competência está no período, independentemente do pagamento. | core.financial_entries | Campo de competência no lançamento financeiro. | financeiro | indisponível; sem fonte/semântica validada |
| `valores_em_aberto` | Valores em aberto | BRL | recebimento | Receitas com vencimento até o fim do período e sem baixa. | core.financial_entries | Data de vencimento e situação de baixa. | financeiro, cliente | indisponível; sem fonte/semântica validada |
| `despesas` | Despesas pagas | BRL | recebimento | Soma dos lançamentos de despesa baixados no período. | core.financial_entries | Tipo do lançamento e data de baixa. | executivo, financeiro | indisponível; sem fonte/semântica validada |
| `custos_diretos` | Custos diretos | BRL | recebimento | Despesas pagas vinculadas a cliente ou projeto via centro de custo. Horas NÃO são convertidas em custo sem metodologia validada. | core.financial_entries, core.financial_entry_cost_centers | Centro de custo associado a cliente/projeto. | rentabilidade, financeiro, cliente, projeto | indisponível; sem fonte/semântica validada |
| `custos_indiretos` | Custos indiretos | BRL | recebimento | Despesas pagas sem vínculo com cliente/projeto. Não são rateadas. | core.financial_entries, core.financial_entry_cost_centers | Classificação de centros de custo (direto × indireto). | rentabilidade, financeiro | indisponível; sem fonte/semântica validada |
| `resultado_operacional` | Resultado operacional | BRL | recebimento | Receita recebida − custos diretos − custos indiretos, todos na mesma base (caixa). | core.financial_entries, core.financial_entry_cost_centers | Receitas e despesas na mesma base temporal. | executivo, rentabilidade, financeiro, cliente, projeto | indisponível; sem fonte/semântica validada |
| `margem_bruta` | Margem bruta | percent | recebimento | (Receita recebida − custos diretos) ÷ receita recebida. | core.financial_entries, core.financial_entry_cost_centers | Custos diretos confiáveis. | rentabilidade, cliente | indisponível; sem fonte/semântica validada |
| `margem_contribuicao` | Margem de contribuição | percent | recebimento | (Receita recebida − custos variáveis) ÷ receita recebida. | core.financial_entries, core.financial_entry_cost_centers | Classificação de custos variáveis — ainda não definida pela Quest. | rentabilidade | indisponível; sem fonte/semântica validada |
| `margem_operacional` | Margem operacional | percent | recebimento | Resultado operacional ÷ receita recebida. | core.financial_entries, core.financial_entry_cost_centers | Custos diretos e indiretos completos. | executivo, rentabilidade | indisponível; sem fonte/semântica validada |
| `lancamentos_futuros` | Lançamentos com data futura | count | operacional | Contagem por entry_date em dia futuro no período; pode haver payment_date passado, que continua classificando o caixa. | core.financial_entries |  | financeiro, qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_ativos` | Projetos ativos | count | operacional | Jobs abertos (status não concluído/cancelado) no fim do período. | core.jobs | Status de conclusão do job na origem. | executivo, clientes, projetos, producao, cliente | indisponível; sem fonte/semântica validada |
| `projetos_iniciados` | Projetos iniciados | count | operacional | Jobs com data de abertura no período. | core.jobs | Data de abertura do job. | projetos, producao | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_concluidos` | Projetos concluídos | count | operacional | Jobs com data de conclusão no período e status de concluído na origem. | core.jobs | Status e data de conclusão. | projetos, produtividade, producao | indisponível; sem fonte/semântica validada |
| `pecas_produzidas` | Peças produzidas | count | operacional | Peças de jobs com conclusão no período. | core.job_pieces, core.jobs | Status/data de conclusão da peça. | producao, cliente, projeto | indisponível; sem fonte/semântica validada |
| `atividades_concluidas` | Atividades concluídas | count | operacional | Tarefas com status de concluída na origem e data de conclusão no período. | core.job_tasks | Status de conclusão da tarefa. | departamentos, producao, projeto | indisponível; sem fonte/semântica validada |
| `entregas` | Entregas realizadas | count | operacional | Definição de 'entrega' a validar com a Quest (peça aprovada, job entregue ou etapa final do workflow). | core.job_pieces, core.workflow_steps | Critério oficial de entrega. | departamentos, producao, contratado, cliente | indisponível; sem fonte/semântica validada |
| `horas_registradas` | Horas registradas | hours | operacional | Soma dos apontamentos de horas com data no período. | core.time_entries | Duração e data do apontamento. | executivo, clientes, projetos, timesheet, departamentos, colaboradores, produtividade, capacidade, cliente, projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `horas_previstas` | Horas previstas | hours | operacional | Soma das horas orçadas/previstas nas tarefas ou jobs do período. | core.job_tasks, core.jobs | Campo de horas previstas na tarefa ou no job. | projetos, timesheet, colaboradores, produtividade, capacidade, projeto | indisponível; sem fonte/semântica validada |
| `desvio_horas` | Desvio de horas | hours | operacional | Horas registradas − horas previstas. Negativo = abaixo do previsto. | core.time_entries, core.job_tasks | Horas previstas confiáveis. | timesheet, produtividade, eficiencia | indisponível; sem fonte/semântica validada |
| `horas_retrabalho` | Horas de retrabalho | hours | operacional | Soma de durações válidas de apontamentos com is_rework=true por started_at. | core.time_entries | is_rework booleano no apontamento. | timesheet, departamentos, colaboradores, produtividade, eficiencia, cliente, projeto | SQL implementado; condicionado à introspecção e qualidade parcial |
| `custo_mao_de_obra` | Custo de mão de obra registrado — parcial | BRL | operacional | Soma de labor_cost preenchido em apontamentos válidos por started_at. Não adiciona horas × taxa nem despesas financeiras de pessoal. | core.time_entries | labor_cost numérico; cobertura explícita e sem certificação de custo total. | rentabilidade, timesheet | SQL implementado; condicionado à introspecção e qualidade parcial |
| `projetos_atrasados` | Projetos em atraso | count | operacional | Jobs abertos com prazo vencido ou concluídos após o prazo no período. | core.jobs | Prazo e data de conclusão do job. | executivo, projetos, produtividade | indisponível; sem fonte/semântica validada |
| `atrasos` | Atividades atrasadas | count | operacional | Tarefas concluídas após o prazo ou abertas com prazo vencido. | core.job_tasks | Prazo e data de conclusão da tarefa. | departamentos, producao, eficiencia, cliente, projeto | indisponível; sem fonte/semântica validada |
| `retrabalho` | Apontamentos com retrabalho | count | operacional | Quantidade de apontamentos válidos com is_rework=true; não representa tarefas distintas. | core.time_entries | is_rework booleano no apontamento. | producao, contratado | SQL implementado; condicionado à introspecção e qualidade parcial |
| `alteracoes` | Alterações solicitadas | count | operacional | Etapas de alteração solicitadas pelo cliente. | core.workflow_steps, core.job_tasks | Etapa de alteração identificável. | producao, contratado | indisponível; sem fonte/semântica validada |
| `tempo_medio_execucao` | Tempo médio de calendário — preliminar | days | operacional | Média entre entered_at e completed_at informado no período, sem datas futuras. Não mede esforço trabalhado nem certifica entrega por status. | core.jobs | Datas de abertura e conclusão. | departamentos, producao | SQL implementado; condicionado à introspecção e qualidade parcial |
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
| `horas_vs_previstas` | Horas ÷ horas previstas | percent | operacional | Horas registradas ÷ horas orçadas no job. | core.time_entries, core.jobs | Horas previstas/orçadas no job. | contratado, projeto | indisponível; sem fonte/semântica validada |
| `ultima_sincronizacao` | Última atualização de tarefas | datetime | ingestao | Maior updated_at em ingest.qpf11_tasks. Não certifica coleta bem-sucedida nem publicação integral. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `ultima_publicacao_core` | Última publicação no CORE | datetime | ingestao | Data da última publicação registrada na auditoria. | audit.* (a mapear) |  | qualidade | indisponível; sem fonte/semântica validada |
| `tarefas_recebidas` | Tarefas de coleta | count | ingestao | Total de tarefas de coleta do QPF. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_pendentes` | Tarefas pendentes | count | ingestao | Tarefas com status pendente. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_em_execucao` | Tarefas em execução | count | ingestao | Tarefas com status em execução. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `tarefas_em_reconciliacao` | Tarefas em reconciliação | count | ingestao | Tarefas em reconciliação. | ingest.qpf11_tasks |  | qualidade | SQL implementado; condicionado à introspecção e qualidade parcial |
| `paginas_recebidas` | Páginas recebidas | count | ingestao | Páginas da API iClips armazenadas. | ingest.qpf11_pages |  | qualidade | indisponível; sem fonte/semântica validada |
| `registros_recebidos` | Registros recebidos | count | ingestao | Registros contidos nas páginas recebidas. | ingest.qpf11_pages |  | qualidade | indisponível; sem fonte/semântica validada |
| `conflitos_financeiros` | Conflitos financeiros | count | ingestao | Conflitos de publicação financeira em aberto. | audit.* (a mapear) |  | qualidade | indisponível; sem fonte/semântica validada |
| `divergencias_projetos` | Divergências de projetos | count | ingestao | Tarefas de projetos com divergência de contagem. | ingest.qpf11_tasks, audit.* (a mapear) |  | qualidade | indisponível; sem fonte/semântica validada |
| `recursos_sem_atualizacao` | Recursos sem atualização | count | ingestao | Recursos cujo último sucesso é anterior ao limite definido. | ingest.qpf11_tasks |  | qualidade | indisponível; sem fonte/semântica validada |
| `cobertura_dados` | Cobertura dos dados | percent | ingestao | Meses do período com coleta concluída ÷ meses do período. | ingest.qpf11_tasks, ingest.qpf11_pages |  | qualidade | indisponível; sem fonte/semântica validada |

## Limitações por indicador ainda indisponível

- `receita_recebida`: Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente.
- `receita_competencia`: Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente.
- `valores_em_aberto`: Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente.
- `despesas`: Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente.
- `custos_diretos`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `custos_indiretos`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `resultado_operacional`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `margem_bruta`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `margem_contribuicao`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `margem_operacional`: Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.
- `projetos_ativos`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `projetos_concluidos`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `pecas_produzidas`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `atividades_concluidas`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `entregas`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
- `horas_previstas`: Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas.
- `desvio_horas`: Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas.
- `projetos_atrasados`: Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.
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
- `horas_vs_previstas`: Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas.
- `ultima_publicacao_core`: Timestamp de publicação efetiva não mapeado; atualização da tarefa não significa publicação no CORE.
- `paginas_recebidas`: Identidade, granularidade e ciclo de retenção das páginas de ingestão não comprovados; não inferir páginas pelo número de tarefas.
- `registros_recebidos`: Quantidade de registros por página/publicação não mapeada; tarefas não equivalem a registros recebidos.
- `conflitos_financeiros`: Identidade do registro, estado aberto/resolvido e versão publicada do conflito não mapeados; não inferir resolução por nomes de campos.
- `divergencias_projetos`: Comparação entre quantidade esperada/recebida e tipo da tarefa de projeto não comprovada.
- `recursos_sem_atualizacao`: Recurso, último sucesso e prazo esperado de atualização não aprovados; não inventar limiar de desatualização.
- `cobertura_dados`: Exige intervalos completos e publicação efetiva, reconciliando sobreposições e publicações posteriores. Contagem de tarefas não é cobertura.

## Gráficos

| id | gráfico | tipo | unidade | base | situação |
|---|---|---|---|---|---|
| `movimentacoes_realizadas` | Movimentações isoladas — preliminar | bar | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `evolucao_faturamento` | Faturamento por mês de emissão | line | BRL | faturamento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `evolucao_financeira` | Faturamento emitido: bruto e líquido | line | BRL | faturamento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receitas_vs_despesas` | Receitas × despesas (caixa) | bar | BRL | recebimento | indisponível; sem fonte/semântica validada |
| `faturado_vs_recebido` | Faturado × recebido por mês | bar | BRL | faturamento | indisponível; sem fonte/semântica validada |
| `concentracao_receita` | Participação das entradas isoladas por cliente — preliminar | ranking | percent | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receita_por_grupo` | Entradas isoladas por grupo — preliminar | ranking | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `top_clientes_receita` | Entradas isoladas por cliente — preliminar | ranking | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `receita_por_categoria` | Entradas isoladas por categoria — preliminar | ranking | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `despesas_por_categoria` | Saídas isoladas por categoria — preliminar | ranking | BRL | recebimento | SQL implementado; condicionado à introspecção e qualidade parcial |
| `despesas_por_centro_custo` | Despesas por centro de custo | ranking | BRL | recebimento | indisponível; sem fonte/semântica validada |
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
| `previstas_vs_realizadas` | Horas previstas × realizadas por job | bar | hours | operacional | indisponível; sem fonte/semântica validada |
| `ocupacao_por_departamento` | Departamentos sob recarga (ocupação da capacidade) | ranking | percent | operacional | indisponível; sem fonte/semântica validada |
| `retrabalho_por_colaborador` | Frequência de retrabalho por colaborador | ranking | hours | operacional | SQL implementado; condicionado à introspecção e qualidade parcial |
| `contratado_vs_executado` | Contratado × executado por cliente | bar | count | operacional | indisponível; sem fonte/semântica validada |
| `ingest_por_status` | Tarefas de coleta por status | bar | count | ingestao | SQL implementado; condicionado à introspecção e qualidade parcial |
