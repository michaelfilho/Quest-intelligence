> Registro da primeira revisao local. Campos confirmados posteriormente, regras e contagens atuais: [FASE_2_INTEGRACAO.md](FASE_2_INTEGRACAO.md).

# Correção dos relacionamentos e indicadores

Revisão local posterior à versão `d4c3f4671fd624967a3836885473bbdaf428d39e`. Sem acesso à VPS/PostgreSQL externo, alteração de banco/n8n ou deploy. O código usa a conexão já configurada no backend. A publicação desta revisão depende de autorização posterior; o commit é preparado localmente.

## Cobertura do código

| Catálogo | SQL registrado | Sem implementação econômica suficiente |
|---|---:|---:|
| 78 indicadores | 53 | 25 |
| 32 gráficos | 21 | 11 |
| 27 tabelas | 17 | 10 |

Essas contagens representam implementações condicionais, não indicadores homologados em produção. Oito indicadores dependem também de configuração semântica: quatro classificações de projetos, duas classificações DRE e dois discriminadores de recurso da qualidade. Estimativas exigem chaves reais e cobertura válida. O backend mantém indisponibilidade individual quando um requisito faltar.

O [dicionário gerado](DICIONARIO_INDICADORES.md) contém todos os itens, suas definições e a situação. As novas análises aparecem nos módulos existentes, com controles financeiros no backend e na interface.

## Nomes e identidade

- Pessoas: `time_entries.employee_id → employees.iclips_id`.
- Departamento histórico: `time_entries.department_id → departments.id`, com `department_name_snapshot` como fallback; não usa `departments.iclips_id` nem troca o histórico pelo departamento principal atual.
- Departamento principal cadastral: `employees.main_department_id → departments.id`, declarado separadamente na introspecção.
- Projeto, cliente e grupo: `time_entries.job_id → jobs.iclips_id`, `jobs.client_id → clients.iclips_id`, `jobs.client_group_id → client_groups.iclips_id`.
- Financeiro: `job_id → jobs.iclips_id`, `category_id → financial_categories.iclips_id`. Contas usam `account_id → financial_accounts.iclips_id` e seu `name` quando disponíveis; nenhum namespace alternativo é presumido.
- Peças: `job_pieces.job_id → jobs.iclips_id`.

Cada cadastro é agregado por chave antes de apresentar seu nome. Chave duplicada é sinalizada, sem escolher um nome arbitrário nem multiplicar fatos. Homônimos mantêm linhas/pontos separados por ID. Nomes ausentes aparecem explicitamente como cadastro sem nome; IDs permanecem nas chaves, filtros, navegação e rastreabilidade. Títulos de detalhes usam nomes dentro do período/escopo permitido; sem atividade, o título informa essa condição.

Notas continuam apresentando o nome registrado na própria nota. Não foi criado vínculo por nome. O relacionamento por documento permanece indisponível enquanto os campos de documento normalizado e sua validade/unicidade não tiverem contrato comprovado. Filtros de cliente/departamento não são aplicados ficticiamente às notas.

## Caixa e classificação

A integridade do vínculo-pai considera movimentações `Entrada`/`Saída` com pagamento não futuro no período/escopo e todas as arestas incidentes, mesmo quando o outro registro está fora do período ou tem outro tipo. Não restringe a busca de pais/filhos ao período.

Órfãos de `A Pagar` sem relação com essas movimentações não invalidam o caixa isolado. Quando nenhuma aresta incide nas movimentações em nenhum namespace candidato, não é necessário certificar a semântica de pais alheios para somar essas movimentações isoladas. Havendo arestas, continuam exigidas associação unívoca, unicidade, ausência de órfãos/autorreferências. FK física é opcional; ambiguidade continua bloqueada. Configurar um namespace não dispensa a validação dos dados.

Famílias pai/filho permanecem integralmente excluídas. Valores assinados são preservados; saldo com convenção negativa ambígua continua indisponível. Entrada, saída, faturamento e competência não são intercambiáveis.

`FINANCIAL_DRE_POLICY` aceita JSON com `approved: true` e arrays opcionais `revenue`/`expense`, contendo **valores literais aprovados de `dre_indicator`**. Arrays presentes devem ser não vazios e disjuntos. Cada indicador exige apenas sua classificação. Sem aprovação, `receita_recebida` e `despesas` continuam indisponíveis; com aprovação, mostram somente o subconjunto classificado, em reconciliação, com exclusões/cobertura. Não há classificação numérica padrão, lucro ou margem implícita.

A tabela de vínculos de centros de custo agrega relações antes de ligá-las ao lançamento: uma linha e um valor por movimentação, mesmo com vários centros ou vínculos repetidos. Quantidade de vínculos não vira rateio. Despesa por centro, custo direto/indireto e resultado operacional aguardam valores/percentuais e critérios aprovados.

## Estimativas, atividades e custos

As unidades são distintas por origem: tarefa `(job_id, iclips_id)` e etapa `(job_piece_id, iclips_id)`. Etapas também exigem peça com vínculo unívoco ao projeto do apontamento. Primeiro agregam-se os apontamentos; depois liga-se uma única estimativa finita não negativa por unidade. Chave de estimativa duplicada fica sem previsão, sem prejudicar outras unidades válidas.

O perfil nativo usa `source_kind` literal `TASK`/`WORKFLOW`, `task_id`, `workflow_step_id` e `job_piece_id` no apontamento. Quando a fonte usa outros campos, `TIME_ACTIVITY_KEYS` pode registrar um perfil **explicitamente aprovado**: objeto com `approved: true`, `kind`, `taskId`, `stepId`, `pieceId`. Os quatro nomes são identificadores simples validados pela introspecção. Não se extrai associação de `source_path`, texto livre ou coincidência de IDs. Não configurar esse perfil apenas para liberar números; validar sua semântica na origem.

Horas previstas, desvio e razão realizado/previsto comparam o mesmo subconjunto com estimativas válidas. A cobertura informa atividades e apontamentos incluídos. Uma estimativa entra uma vez por unidade trabalhada no período; não é orçamento mensal e não deve ser somada entre períodos que contêm a mesma atividade. A comparação mantém tarefas e etapas identificáveis por origem.

Não há atribuição de orçamento compartilhado a uma pessoa/departamento: com esses filtros, a comparação fica indisponível e a previsão da linha fica ausente até existir atribuição comprovada. O restante das horas, retrabalho e atividades continua filtrado. Capacidade, ocupação e aproveitamento sem denominador não recebem barras preenchidas.

Peças cadastradas, peças com apontamento de etapa e atividades com apontamento são métricas distintas. Nenhuma dessas contagens representa entrega concluída.

Custos usam exclusivamente `labor_cost` registrado em apontamentos válidos, sem adicionar duração × `hourly_rate`. Há distribuição por pessoa, departamento histórico, cliente e projeto, além de custo por atividade e registros individuais. Cobertura de preenchimento finito inclui zero; duração positiva com custo zero recebe alerta específico. Valores ausentes permanecem ausentes. Campos de custo são removidos no backend inclusive de drill-downs e relatórios sem `custos_pessoal.view`.

## Projetos e calendário

Contagens literais do status atual não dependem de `status_code`; o gráfico preserva a coorte de projetos abertos no período. Não reconstrói estado histórico.

`JOB_STATUS_POLICY` aceita JSON com `approved: true` e arrays opcionais `active`, `suspended`, `completed`, `overdue`. Cada indicador exige apenas seu grupo aprovado. Ativos/suspensos/concluídos são disjuntos; `overdue` deve ser subconjunto de `active` aprovado. Ativos/suspensos/atrasados são fotografias atuais, sem comparação histórica fabricada. Atraso atual exige prazo anterior ao instante atual e ausência de conclusão. Conclusões exigem status aprovado, data no período, não futura e posterior à abertura.

Tempo médio de calendário continua calculado por `completed_at` no período, com abertura válida. O motivo mostra denominador, mínimo, mediana e máximo em dias. Não remove outliers por limiar inventado e não troca dias corridos por horas trabalhadas. O valor observado anteriormente em produção precisa ser reconciliado com essa coorte; não foi certificado localmente.

## Qualidade e atualização

Consultas pontuais explícitas: publicação em `audit.publication_state.published_at`; conflitos abertos/resolvidos por `audit.publication_conflicts.resolved_at`; tarefas por status e diferença `expected_total/received_records`; páginas armazenadas e soma válida de `record_count`.

Recebidos em páginas e reportados em tarefas são apresentados separadamente: podem repetir registros e não equivalem a únicos publicados. Contagens não dependem de cobertura histórica integral. Conflitos são agrupados por estado sem expor payloads de auditoria.

Para `conflitos_financeiros`/`divergencias_projetos`, `QUALITY_FINANCIAL_RESOURCE`/`QUALITY_PROJECT_RESOURCE` precisam conter o discriminador literal aprovado do campo `resource` disponível. Não há valor presumido. Sem esse contrato, as contagens globais continuam acessíveis com rótulos corretos.

Telas analíticas e filtros integrados visíveis renovam em 60 segundos; consultas idênticas compartilham execução enquanto pendentes e no mesmo pedido. Não há cache de resultados entre pedidos concluídos. Cadastro/configuração/impressão não recebem polling global; serviço sem fonte não gera polling. A introspecção conserva cache de cinco minutos, sem impedir leitura de novos registros pelo ciclo de atualização.

As respostas distinguem fonte/critério pendente, campo ausente, cadastro incompleto, relacionamento inválido, cobertura parcial, nenhum registro e falha de consulta. Motivos ficam visíveis nos cards, gráficos, tabelas e relatórios; zero factual não é usado para preencher informação inexistente.

## Verificação e operação

Ver [RELATORIO_TESTES.md](RELATORIO_TESTES.md). Fixtures PostgreSQL ficam exclusivamente nos testes. Não foi aberto túnel nem solicitada credencial.

`verify:analytics` é executado posteriormente dentro do backend já configurado: verifica horas e faturamento por referência SQL independente, nomes/relacionamentos, caixa versus seus registros, estimativas por unidade e qualidade por referência SQL. Publica apenas identificador da verificação e resultado/status. Campo/semântica ausente é `UNAVAILABLE`; erro ou divergência causa saída diferente de zero. Não imprime nomes, IDs empresariais ou valores. Códigos de saída: 0 aprovado, 1 erro/divergência, 2 parcial por fonte/critério indisponível. Nenhum resultado desse verificador em produção é declarado nesta revisão.


