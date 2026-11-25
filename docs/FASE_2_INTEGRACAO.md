# Integração dos dados reais — fase 2

Implementação local sobre a revisão `3c85ab6`, com os novos campos e relacionamentos confirmados no pedido. Não houve conexão ao PostgreSQL externo, acesso à VPS, alteração de n8n/banco, push ou deploy. Os quantitativos do diagnóstico não foram copiados para o código: todos os valores da aplicação vêm de consultas em execução.

## Cobertura do código

| Catálogo | Implementações SQL registradas | Pendentes |
|---|---:|---:|
| 107 indicadores | 85 | 22 |
| 36 gráficos | 28 | 8 |
| 40 tabelas | 31 | 9 |

Essas são contagens de implementação, não de disponibilidade ou homologação na VPS. Campos, tipos, cardinalidade e escopo são validados em execução. Quatro indicadores de classificação gerencial de projetos e dois de recurso específico da qualidade continuam exigindo configuração semântica aprovada. Contratos, jornadas, entregas, custo completo e cobertura histórica não são presumidos.

O [dicionário gerado](DICIONARIO_INDICADORES.md) lista cada indicador, gráfico e tabela. Os itens pendentes continuam visíveis com motivos objetivos; não foram removidos para alterar a aparência da cobertura.

## Relacionamentos, nomes e permissões

O backend mantém a conexão PostgreSQL existente e os relacionamentos explícitos do contrato. Pessoas, departamentos históricos, clientes, grupos, projetos, peças, catálogo, categorias e contas usam seus nomes de cadastro. `time_entries.department_id` aponta para `departments.id`, não para o ID de origem. `employees.main_department_id` descreve o cadastro atual e não substitui o histórico do apontamento.

Chaves são preservadas para filtros, navegação e rastreabilidade; nomes não são chaves de agrupamento. Cadastros duplicados/ausentes ou nomes exclusivamente numéricos recebem sinalização. Cadastros são agregados por identidade antes de se relacionarem aos fatos; homônimos não se fundem. Não há junção 1:N com vínculos departamentais multiplicando horas.

Detalhes globais podem resolver o nome de cadastro mesmo sem atividade no período. Com escopo departamental, não consultam nomes fora dos fatos autorizados. Faturamento no ranking de clientes só é associado quando a mesma filtragem é comprovável; o filtro departamental nunca é descartado para buscar valores financeiros globais.

Todos os novos itens financeiros e as horas relacionadas à cobertura de custo possuem permissões próprias no backend. Razões livres de conflitos exigem também `financeiro.view`, pois podem conter informações financeiras. Gráficos, detalhamentos, tabelas e exportações seguem as mesmas regras. O SQLite e os perfis existentes não foram migrados ou substituídos.

## DRE de origem e caixa

Foram implementadas as classificações textuais fornecidas: receitas operacionais e não operacionais; despesas operacionais fixas e variáveis; despesas não operacionais; impostos; participação nos lucros; NENHUM, ausentes e desconhecidos. Não há mapeamento por códigos numéricos ou quantitativos constantes.

Entradas/saídas realizadas usam `payment_date`, valor finito, pagamento não futuro e exclusão integral de famílias pai/filho. A revisão anterior de parentesco permanece: órfãos de A Pagar que não afetam os movimentos consultados não bloqueiam o caixa isolado. Relações incidentes são verificadas também fora do período. Referências ambíguas, duplicidades e identidades inválidas relevantes continuam bloqueadas, independentemente da existência de FK.

O resultado operacional **preliminar por caixa** soma receita operacional classificada e subtrai somente despesas operacionais fixas e variáveis classificadas. A margem divide esse resultado pela receita operacional positiva. Ambos são anteriores a impostos, participação nos lucros e itens não operacionais, com cobertura e exclusões explícitas; valores negativos nos componentes impedem resultado/margem até validar a convenção de sinais. Não são lucro ou certificação contábil. Não subtraem novamente `labor_cost` nem acrescentam o faturamento de notas.

Impostos, estornos, transferências, retenções, pagamentos parciais, sinais e completude dos custos continuam exigindo conciliação/decisões. Custo fixo/variável não implica custo direto/indireto e não autoriza margem bruta ou margem de contribuição.

A perspectiva por `competence_date` considera apenas receita operacional de movimentos já realizados e sem datas futuras, excluindo títulos abertos e famílias relacionadas. O escopo de validação de parentesco acompanha essa base. Não é reconhecimento contábil completo ou receita a receber. Faturamento por competência das notas permanece uma perspectiva distinta.

Há evolução mensal, resultado mensal preliminar, categorias, contas e movimentos associados a clientes/projetos. Contas e movimentos não dependem da presença de DRE quando não usam essa classificação. A comparação faturado × recebido apresenta séries separadas, com emissão e pagamento claramente distintos; não soma bases nem calcula contas em aberto pela diferença.

## Notas por documento

`clients.document` e `invoices.client_document` são normalizados conservadoramente. Somente CPF/CNPJ numéricos com dígitos verificadores válidos e um único cadastro candidato podem se associar. Formatação não altera a identidade. Letras não são removidas para fabricar um documento numérico; formatos não suportados permanecem sem vínculo, sem afirmar que são documentos legalmente inválidos.

Notas ambíguas e sem vínculo ficam em tabelas próprias, além da visão conjunta e das contagens. Não há distribuição proporcional ou vínculo por nome. Notas canceladas não compõem faturamento. O filtro por cliente utiliza apenas documentos unívocos; departamento, projeto e grupo não são atribuídos artificialmente à nota. A ausência dos campos documentais não bloqueia faturamento global ou a lista original de notas.

## Centros de custo

O perfil confirmado usa `financial_entry_id`, `source_center_id`, `name`, `amount` e `percentage`. O vínculo financeiro pode usar `id` interno ou `iclips_id`: FK encontrada ou evidência unívoca dos dados valida o namespace; FK não é obrigatória. Se os namespaces concorrentes levarem às mesmas entidades, a associação econômica é equivalente; se levarem a entidades diferentes, é necessária escolha semântica explícita em `FINANCIAL_ALLOCATION_TARGET`. A configuração não dispensa validação. Ambiguidade de rateio não bloqueia DRE independente.

Cada lançamento é validado conjuntamente: centros identificados sem duplicidade; valores e percentuais finitos/preenchidos; valores não negativos; percentuais entre 0 e 100; soma de valores exatamente igual ao original; soma percentual exatamente 100; parcelas correspondentes aos percentuais com arredondamento em centavos. Não é aplicada tolerância monetária silenciosa. Ausências ou divergências permanecem separadas.

O gráfico soma apenas `amount` das parcelas conciliadas. O lançamento original aparece uma vez no resumo; não é multiplicado pela quantidade de centros. Valores sem rateio e valores com rateio divergente são separados. Nenhuma parcela faltante é redistribuída. Isso não certifica alocação contábil nem custo direto/indireto.

## Projetos, produção, planejamento e custo

Contagens literais atuais dos seis status fornecidos não dependem de `status_code` ou de datas de abertura. Autorizado continua candidato a ativo; Stand By é a proposta de suspenso. `JOB_STATUS_POLICY` continua necessário para aprovação das classificações gerenciais, sem converter estado atual em histórico.

O calendário da aplicação usa a coorte de status atual Finalizado com conclusão informada no período, abertura preenchida, conclusão não anterior à abertura e não futura. Mostra denominador, mínimo, mediana, máximo e registros excluídos, com tabela auditável. Não remove extremos arbitrariamente nem usa horas trabalhadas como dias corridos. Não foi certificado ou recalculado nesta tarefa o valor observado anteriormente na produção.

Peças cadastradas, peças com apontamento, tarefas TASK, etapas WORKFLOW, atividades com duração válida e projetos atendidos têm significados distintos. Peças com apontamento podem vir de TASK ou WORKFLOW e exigem vínculo unívoco peça/projeto. O catálogo de peças é descritivo. Códigos de status de peças não receberam significados inventados. Entregas efetivas continuam pendentes de critério/evento comprovado.

O perfil real de etapas usa `workflow_id`: `(job_piece_id, workflow_id) → workflow_steps.(job_piece_id, iclips_id)`. Tarefas usam `(job_id, task_id)`. O perfil legado `workflow_step_id` é compatível quando o campo real não existe. Perfis alternativos explícitos continuam sujeitos a validação; não se extrai identidade de `source_path`.

Os apontamentos são agregados antes das estimativas; cada estimativa **positiva** entra uma vez por unidade. A comparação é entre horas do período e orçamento integral dessas unidades, identificada como parcial no rótulo e motivo; não representa o desvio do ciclo completo. Cobertura e unidades sem estimativa ficam explícitas. Não é necessário que toda a base tenha previsão. Orçamento compartilhado não é atribuído a pessoa/departamento sem evidência de distribuição; essas previsões individuais permanecem ausentes.

Custos continuam usando somente `labor_cost`, sem adicionar duração × taxa ou despesas financeiras de pessoal. Há horas com custo positivo, horas sem custo positivo comprovado e cobertura por horas, além de cobertura de preenchimento que inclui zero. Zero, ausência, negativos e valores não finitos não são confundidos. Nenhuma barra de ocupação/aproveitamento é desenhada sem percentual finito.

## Qualidade, atualização e operação

As consultas usam `published_at`, `resource`, `source_id`, `resolved_at`, status/contagens das tarefas e `record_count`. Há estado de publicação por recurso, conflitos por estado e detalhes restritos, divergências e recebidos. Estados armazenados, recebidos em páginas e reportados em tarefas não são chamados de registros únicos publicados ou cobertura completa.

`QUALITY_PROJECT_RESOURCE` e `QUALITY_FINANCIAL_RESOURCE` continuam necessários para indicadores de recurso específico quando o discriminador literal não estiver comprovado. As contagens globais e tabelas por recurso não dependem dessa escolha. Não presumir que nomes de tipos de tarefa sejam valores do campo `resource` da auditoria.

A atualização em 60 segundos conserva compartilhamento de SELECTs idênticos durante a execução/pedido, sem cache de resultados entre pedidos. A introspecção permanece em memória por cinco minutos. Não há consultas por registro no frontend, banco analítico adicional ou duplicação persistida dos fatos.

`verify:analytics` foi ampliado para nomes, cardinalidade, faturamento, caixa/DRE, estimativas, custo, partição das horas por custo, conservação dos rateios e qualidade. Só registra identificador e resultado; não imprime valores, documentos ou nomes. Códigos: 0 aprovado, 1 erro/divergência, 2 parcial por fonte/critério indisponível. É uma ferramenta para execução manual posterior no backend configurado, não evidência de homologação real nesta tarefa.

O procedimento atualizado preserva o `RINNE_PUBLISH` efetivo **somente da API**, inclusive no rollback, mantendo todas as demais verificações. Release completa pode ser retomada com SHA, manifestos e backup verificados, sem novo backup. Revisão das imagens, arquivos da API e assets é conferida por hash; healthcheck interno exige PostgreSQL conectado e sessão anônima recusada. Nenhum 403 externo isolado dispara rollback e nenhum IP é adicionado automaticamente. Ver [ATUALIZACAO_PRODUCAO.md](ATUALIZACAO_PRODUCAO.md).

Testes e limites estão em [TESTES.md](TESTES.md); dados complementares e aprovações pendentes em [DADOS_COMPLEMENTARES_N8N.md](DADOS_COMPLEMENTARES_N8N.md). Não foram alterados SQLite, credenciais, volumes, role, Traefik ou workflows.
