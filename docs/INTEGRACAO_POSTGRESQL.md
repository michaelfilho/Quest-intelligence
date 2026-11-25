# Integração PostgreSQL em tempo de execução

O backend usa a conexão existente (`pg`, role somente leitura), sem copiar dados para SQLite, modificar o PostgreSQL ou chamar iClips/n8n. Nenhuma conexão a produção foi realizada nesta tarefa.

## Introspecção e mapeamentos

`server/src/schema.ts` reutiliza a descoberta do CLI `introspect`: `information_schema.columns` e `pg_constraint`, nos schemas autorizados. A estrutura permanece somente em memória por cinco minutos; requisições simultâneas compartilham a descoberta. Não há dependência de arquivos de levantamento.

`GET /api/metadata/schema` exige `config.view` e retorna colunas, tipos, constraints e capacidades, sem dados individuais. Relações declaradas no contrato são distintas das foreign keys encontradas. A presença das colunas não comprova integridade referencial.

A indicação de perfil completo no diagnóstico não é um bloqueio global: cada SQL valida os campos efetivamente referenciados. Medidas independentes e descrições ausentes podem ser projetadas como NULL explícito, sem virar zero; um filtro que utiliza campo ausente continua bloqueado. A duração em segundos pode funcionar sem minutos e vice-versa; tipos inválidos continuam recusados.

As consultas de `analytics.ts`, `cash.ts`, `quality.ts` e `registry-counts.ts` são registradas em `mappings.ts`. Nomes e tipos são validados antes do SQL; campos ausentes/incompatíveis geram `INSUFFICIENT_DATA`. Duplicidades de `jobs.iclips_id` bloqueiam joins que multiplicariam horas. Identificadores SQL vêm de listas fechadas; valores dos filtros são parâmetros.

## Políticas de cálculo

| Domínio | Regra |
|---|---|
| Notas | `issued` por `issued_at`; competência separada por `competence_date`. Canceladas, valores nulos/não finitos e datas futuras são excluídos. Sinais preservados; nomes não vinculam clientes. |
| Horas | Atribuição integral a `started_at` em America/Sao_Paulo; segundos não negativos e consistentes com minutos dentro de 1 segundo. Minutos são fallback só quando segundos são nulos. Não somar durações. |
| Fronteiras | Início inclusivo e dia seguinte ao fim exclusivo. Apontamentos atravessando fronteiras são integralmente atribuídos ao início. Sem início não há atribuição arbitrária ao período. Término futuro, valores não finitos ou inconsistentes são excluídos. |
| Retrabalho | Mesma base elegível; `is_rework=true`. Percentual = duração de retrabalho / duração válida com marcação preenchida; desconhecidos excluídos. Zero de horas só é comprovado quando há base válida com todas as marcações conhecidas e nenhuma verdadeira. |
| Custo registrado | Apenas `labor_cost` numérico preenchido em apontamentos válidos. Não adiciona horas × taxa nem despesas de pessoal. Custo ausente reduz cobertura; não certifica custo total ou margem. |
| Clientes | Clientes distintos em jobs com apontamentos válidos, não todos os clientes ativos administrativamente ou com movimentação financeira. Sem vínculo permanece separado. |
| Projetos | Iniciados por `entered_at`; tempo de calendário preliminar por conclusão informada. Não reconstrói estado histórico nem certifica entrega por status. |
| Cadastros | Contagens físicas atuais de clientes, pessoas, departamentos, jobs, peças, tarefas e etapas. Sem recorte temporal e sem comparação histórica fabricada. |
| Movimentações | Perfis explícitos: `amount`, um campo `entry_type`/`type` e um vínculo `parent_id`, `parent_entry_id` ou `parent_entry_source_id`. FK física não é obrigatória. Namespace `iclips_id`, `source_id` ou `entry_source_id` exige validação unívoca nos dados: unicidade, referências existentes e ausência de autorreferência. Ambiguidade, órfãos ou ausência de evidência mantêm insuficiência. Famílias pai/filho são integralmente excluídas. |
| Caixa | Base `payment_date`, sem usar `entry_date` como substituto. Sinais preservados. Saldo indisponível se houver negativos ambíguos. Não certifica transferências, parcelas, estornos, descontos, juros, multas, retenções ou conflitos de publicação. Não é lucro ou receita operacional. |
| Monitoramento | Fotografia atual de tarefas e estados literais; `updated_at` é atualização da tarefa, não sucesso de coleta. `RECEIVED` não comprova publicação integral. |

Resultados são `PARCIAL` ou `EM_RECONCILIACAO`, nunca certificados só porque o SQL executou. Cobertura por publicações efetivas, sobreposições WORKFLOW/TASK e conflitos abertos exigem validação real.

## Filtros, segurança e atualização

Cliente/grupo/projeto usam chaves de jobs; horas usam departamento e colaborador do próprio apontamento. Escopo imposto pelo usuário prevalece sobre a URL em cards, dimensões, detalhes e relatórios. Deve conter o ID real do departamento.

Filtros sem relação comprovada geram insuficiência antes da leitura, por exemplo departamento em notas ou serviço em horas. Dimensões retornam IDs com apontamentos no período/escopo, até 500 opções. Campos não comprovados permanecem vazios; não viram zero. Ordenação usa colunas autorizadas e comprovadas.

Somente consultas analíticas visíveis — módulo, tabelas, detalhamento aberto, relatório selecionado e saúde — são atualizadas a cada 60 segundos enquanto a janela está ativa. Cadastro de usuários, configurações, catálogo de relatórios e impressão não têm polling global. A estrutura é revalidada a cada cinco minutos. SELECTs idênticos compartilham execução no mesmo pedido ou enquanto estão simultaneamente em andamento; não há cache de dados entre pedidos concluídos. Parâmetros distintos de escopo não se misturam. Cards não necessariamente representam a mesma transação de publicação.

`FINANCIAL_PARENT_FIELD` e `FINANCIAL_PARENT_TARGET` podem registrar uma escolha explícita de campo/namespace após validar a origem, nunca apenas para liberar números. Aceitam somente as opções suportadas e presentes; não dispensam as verificações dos dados. Referências válidas comprovam a associação estrutural, mas não certificam a natureza contábil dos pagamentos, transferências ou parcelas: movimentos continuam em reconciliação.

## Validação posterior

Os testes locais usam PostgreSQL embarcado PGlite, exclusivamente em desenvolvimento, com fixtures em memória. A aplicação não contém fallback para essas fixtures. Não certificam valores reais.

No ambiente já atualizado e configurado, executar manualmente:

```bash
npm run verify:analytics -- --start AAAA-MM-DD --end AAAA-MM-DD
```

Exige `quest_rinne_app_ro` e sessão somente leitura. Compara o serviço que alimenta a API com SELECTs independentes de faturamento e horas, sem logar valores financeiros. Mudanças concorrentes do n8n podem exigir repetição. Não substitui a homologação de todos os indicadores. Não foi executado em produção nesta tarefa.

Ver [dicionário](DICIONARIO_INDICADORES.md), [testes](TESTES.md) e [pendências](PENDENCIAS_PRODUCAO.md).


Revisao posterior: nomes, estimativas parciais, custos, politicas e qualidade pontual estao detalhados em [CORRECOES_RELACIONAMENTOS.md](CORRECOES_RELACIONAMENTOS.md). Opcoes de filtros integrados tambem renovam em 60 segundos quando visiveis; servico sem fonte nao gera polling.


A fase 2 substitui as limitacoes ja resolvidas de DRE, documentos, rateios e workflow_id: [FASE_2_INTEGRACAO.md](FASE_2_INTEGRACAO.md). Fotografias e perspectivas continuam parciais, sem certificacao de producao.
