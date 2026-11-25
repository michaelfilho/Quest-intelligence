> Registro da revisao publicada anteriormente. A revisao local posterior, ainda sem push/deploy, esta em [CORRECOES_RELACIONAMENTOS.md](CORRECOES_RELACIONAMENTOS.md).

# Revisão final da integração e publicação

Data: 25/11/2026. Revisão local, sem SSH, acesso à VPS, conexão ao PostgreSQL de produção, alteração de n8n ou deploy. O push para a main foi autorizado; o hash remoto verificado é informado na entrega.

## Resultado

| Catálogo | SQL implementado, condicionado à estrutura real | Ainda indisponível |
|---|---|---|
| 69 indicadores | 31 | 38 |
| 28 gráficos | 16 | 12 |
| 25 tabelas | 14 | 11 |

As contagens se referem a implementações de código, não a valores certificados em produção. Resultados são parciais ou em reconciliação. Estrutura, namespace, escopo ou dados não comprovados mantêm insuficiência, sem zeros artificiais.

## Correções da revisão

- Removida a exigência de FK física como prova exclusiva de parentesco financeiro. `parent_entry_source_id` é suportado explicitamente, distinguindo `iclips_id`, `source_id` e `entry_source_id`. A seleção exige chave única, referências existentes, ausência de autorreferência e namespace unívoco. FK é evidência adicional; não dispensa checar dados. Ambiguidades podem ser resolvidas somente por declaração de origem revisada e ainda passam pelos testes de integridade.
- Campos apenas descritivos ou medidas independentes ausentes não bloqueiam cálculos válidos. Validação segue os campos efetivamente usados, com NULL explícito nos opcionais. Filtros em campos inexistentes, tipos errados e ausência de ambas as durações seguem bloqueados.
- Ausência de PK/unique declarada em jobs não impede consulta se os dados têm identidade única. Sem constraint protetora, a verificação é refeita; resultado de integridade não fica guardado por cinco minutos. Escopos financeiros incompatíveis são recusados antes da leitura dos dados.
- Novos indicadores: apontamentos válidos com retrabalho e lançamentos com `entry_date` futura. Data de lançamento futura não invalida um pagamento passado. O indicador financeiro mantém permissão financeira explícita.
- Novos gráficos: projetos por abertura/status textual atual, faturamento bruto/líquido e estados de coleta. Também foram implementadas entradas isoladas por cliente/grupo/categoria, saídas isoladas por categoria e participação das entradas, com rótulos preliminares e sem vínculo em grupo separado. Negativos ou total não positivo impedem participação; nunca se aplica ABS indiscriminadamente.
- Novas tabelas: alertas de apontamentos inválidos no período/escopo, tarefas cadastradas dos projetos abertos, monitoramento de tarefas com identidade explícita e entradas isoladas por cliente. Chaves compostas de tarefas são verificadas sem exigir FK. Não se chamam tarefas cadastradas de tarefas executadas nem entradas isoladas de receita operacional.
- Permanecem indisponíveis lucro/rentabilidade completa, receitas/despesas operacionais não classificadas, estimativas incompatíveis, contratos, capacidade, entrega/status não aprovado e cobertura/publicação não comprovada.

## Atualização e processamento

Polling global foi removido. Módulos, tabelas, detalhamento aberto e relatório selecionado usam 60 segundos em janela ativa. Saúde tem um único dono de timer no Layout; painéis compartilham a query. Configurações, usuários, impressão, catálogo e opções de filtros não repetem consultas automaticamente. Comparação de períodos não recarrega tabelas/opções do período atual.

O backend compartilha SELECTs idênticos no mesmo pedido e entre pedidos simultâneos enquanto estão em andamento. Parâmetros, inclusive departamento, fazem parte da identidade. Não existe cache de dados após conclusão entre pedidos distintos. Relatórios não calculam gráficos que não retornam no documento. PostgreSQL continua sendo consultado pelo pool existente; não há banco analítico adicional, importação, duplicação ou alteração de workflows.

## Segurança, stack e verificações

Stack preservada: React/TypeScript, Express/Node, `pg`, PostgreSQL somente leitura e SQLite da aplicação. PGlite é exclusivo dos testes, não uma fonte da aplicação.

- 79 testes backend + 15 frontend aprovados.
- Typecheck e build de produção aprovados.
- Homologação Playwright/Edge: 36 verificações em `/` e 36 em `/core/`, incluindo login/logout, assets/API no prefixo correto, cookie no Path correto, impressão, exportações, permissões, responsividade e comparação sem duplicar consultas das tabelas.
- Nenhuma transformação `proxy_cookie_path` no nginx; apenas o backend emite/apaga o cookie no Path configurado.
- Auditorias da raiz, server, web e e2e sem vulnerabilidades reportadas.
- Script de preparo validado com `bash -n`; transformação do override, proteção contra perda de mounts/ambiente/portas/labels e backup SQLite consistente testados localmente. Docker/Traefik e números reais ainda não foram homologados.
- Segredos, SQLite, `.env` reais, backups, levantamentos internos e artefatos de execução são ignorados. Referências históricas agregadas da operação foram removidas do catálogo vigente; fixtures são explicitamente sintéticas e exclusivas dos testes. Não houve reescrita do histórico ou force push.

## Atualização existente na VPS

Procedimento exato: [ATUALIZACAO_PRODUCAO.md](ATUALIZACAO_PRODUCAO.md). A preparação descobre os arquivos efetivos do Compose, verifica o estado corrente, guarda backup privado e SQLite consistente, registra diff do runtime e gera um override mínimo para uma release separada. Não sobrepõe a cópia runtime. Ambiente, role, volumes, porta e Traefik continuam nos arquivos originais; o override altera apenas build/base pública. Mounts de nginx/código, entrypoints ou divergências exigem revisão manual, sem bypass automático.

Após revisão do diff e hashes: construir somente api/web, conferir hashes de configuração novamente e atualizar com `--no-deps --no-build`. Rollback usa imagens anteriores, sem apagar volumes nem restaurar automaticamente um SQLite antigo. A validação com dados reais ocorrerá após essa atualização manual.

## Revisão item a item do que estava indisponível

A matriz abaixo cobre os 40 indicadores, 21 gráficos e 15 tabelas que estavam indisponíveis antes desta revisão. Não depende de registros reais ou de arquivos estáticos de levantamento.

<!-- MATRIZ -->

### Indicadores (40)

| ID | Resultado da revisao |
|---|---|
| `receita_recebida` | Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente. |
| `receita_competencia` | Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente. |
| `valores_em_aberto` | Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente. |
| `despesas` | Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente. |
| `custos_diretos` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `custos_indiretos` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `resultado_operacional` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `margem_bruta` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `margem_contribuicao` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `margem_operacional` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `lancamentos_futuros` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `projetos_ativos` | Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada. |
| `projetos_concluidos` | Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada. |
| `pecas_produzidas` | Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada. |
| `atividades_concluidas` | Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada. |
| `entregas` | Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada. |
| `horas_previstas` | Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas. |
| `desvio_horas` | Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas. |
| `projetos_atrasados` | Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada. |
| `atrasos` | Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada. |
| `retrabalho` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `alteracoes` | Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada. |
| `produtividade` | Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada. |
| `capacidade_disponivel` | Jornadas, disponibilidade e capacidade contratada não comprovadas; nenhuma jornada de oito horas é presumida. |
| `horas_produtivas` | Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas. |
| `horas_improdutivas` | Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas. |
| `ocupacao` | Jornadas, disponibilidade e capacidade contratada não comprovadas; nenhuma jornada de oito horas é presumida. |
| `tempo_medio_atividade` | Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada. |
| `horas_por_mil_receita` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `escopo_contratado` | Fonte contratual e escopo de entregas não comprovados. Orçamento de job não é contrato. |
| `receita_contratada` | Fonte contratual e escopo de entregas não comprovados. Orçamento de job não é contrato. |
| `entregas_vs_contratado` | Fonte contratual e escopo de entregas não comprovados. Orçamento de job não é contrato. |
| `horas_vs_previstas` | Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas. |
| `ultima_publicacao_core` | Timestamp de publicação efetiva não mapeado; atualização da tarefa não significa publicação no CORE. |
| `paginas_recebidas` | Identidade, granularidade e ciclo de retenção das páginas de ingestão não comprovados; não inferir páginas pelo número de tarefas. |
| `registros_recebidos` | Quantidade de registros por página/publicação não mapeada; tarefas não equivalem a registros recebidos. |
| `conflitos_financeiros` | Identidade do registro, estado aberto/resolvido e versão publicada do conflito não mapeados; não inferir resolução por nomes de campos. |
| `divergencias_projetos` | Comparação entre quantidade esperada/recebida e tipo da tarefa de projeto não comprovada. |
| `recursos_sem_atualizacao` | Recurso, último sucesso e prazo esperado de atualização não aprovados; não inventar limiar de desatualização. |
| `cobertura_dados` | Exige intervalos completos e publicação efetiva, reconciliando sobreposições e publicações posteriores. Contagem de tarefas não é cobertura. |

### Graficos (21)

| ID | Resultado da revisao |
|---|---|
| `evolucao_financeira` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `receitas_vs_despesas` | Receita e despesa operacional não estão classificadas. Movimentações preliminares têm análise própria, sem reclassificação arbitrária. |
| `faturado_vs_recebido` | Faturamento é consultável, mas receita recebida operacional ainda não foi classificada; não substituir por toda Entrada. |
| `concentracao_receita` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `receita_por_grupo` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `top_clientes_receita` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `receita_por_categoria` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `despesas_por_categoria` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `despesas_por_centro_custo` | Mapeamento semântico ainda não disponível para esta fonte. A introspecção verifica tabelas e tipos, mas não presume relacionamentos, cobertura, estados de publicação nem fórmulas gerenciais. |
| `margem_por_cliente` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `resultado_por_projeto` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `evolucao_margem` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `evolucao_producao` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `projetos_por_status` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `entregas_por_departamento` | Critério e data de entrega e associação à dimensão não comprovados. Peças cadastradas ou apontamentos não provam entrega. |
| `entregas_por_cliente` | Critério e data de entrega e associação à dimensão não comprovados. Peças cadastradas ou apontamentos não provam entrega. |
| `entregas_por_servico` | Critério e data de entrega e associação à dimensão não comprovados. Peças cadastradas ou apontamentos não provam entrega. |
| `previstas_vs_realizadas` | Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas. |
| `ocupacao_por_departamento` | Jornadas, disponibilidade e capacidade contratada não comprovadas; nenhuma jornada de oito horas é presumida. |
| `contratado_vs_executado` | Fonte contratual e escopo de entregas não comprovados. Orçamento de job não é contrato. |
| `ingest_por_status` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |

### Tabelas (15)

| ID | Resultado da revisao |
|---|---|
| `alertas` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `top_clientes_resultado` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `top_projetos_menor_margem` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `resultado_mensal` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `receita_por_cliente` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `anomalias_financeiras` | Comparação econômica e limites de anomalia dependem de classificação e conciliação; não inferir alerta apenas de variação bruta. |
| `rentabilidade_clientes` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `rentabilidade_projetos` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `custo_por_servico` | Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional. |
| `atividades` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `entregas_colaboradores` | Faltam critério e data de entrega, autoria e relação departamental na granularidade da entrega; horas não são contagem de entregas. |
| `contratado_executado` | Fonte contratual e escopo de entregas não comprovados. Orçamento de job não é contrato. |
| `conflitos` | Identidade, recurso, estado e timestamp dos conflitos precisam de um contrato explícito; não expor contagens históricas como atuais. |
| `tarefas_ingest` | SQL implementado; perfil, filtros, granularidade e limitacoes descritos nesta revisao e no dicionario. |
| `periodos_incompletos` | Falta contrato de intervalos e evidência de publicação; ausência de notas em um mês não prova coleta incompleta. |
