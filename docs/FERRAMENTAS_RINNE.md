# Ferramentas da RINNE (para os agentes do n8n)

Rota: `POST /api/internal/tools/{nome}`, com assinatura HMAC, nonce único e `X-Rinne-Execution` ([contrato](CONTRATOS_WEBHOOKS.md#5-ferramentas-n8n--backend)). Catálogo: `GET /api/internal/tools`.

## Garantias (todas as ferramentas)

- **Somente leitura.** Não existe ferramenta de SQL livre, de escrita, financeira ou administrativa.
- **Autorização da sessão original.** O token de execução identifica o usuário que fez a pergunta. A cada chamada, o backend relê o usuário e recalcula as permissões a partir do banco; um usuário desativado é bloqueado na hora. O agente não consegue afirmar ser administrador.
- **Escopo departamental imposto.** Para usuários com escopo, o filtro de departamento é substituído pelo do usuário.
- **Restrições financeiras.** Itens e colunas financeiros, de rentabilidade, contratos e custos de pessoal só aparecem com as permissões correspondentes.
- **Entrada validada com Zod**, em modo estrito: campos desconhecidos (ex.: `sql`) resultam em 400.
- **Limites.** Até 50 linhas por tabela, 50 chamadas por solicitação e token válido por 10 min.
- **Rastreabilidade.** Cada chamada é auditada (`rinne.tool`, com usuário, ferramenta e requestId). A resposta traz período, filtros aplicados, estado do banco, confiabilidade e limitações.
- **Honestidade.** Sem banco ou sem mapeamento, os valores voltam `null` com o motivo. Ausência de informação não equivale a zero.

## Lista

| ferramenta | permissão exigida | conteúdo | entradas relevantes |
|---|---|---|---|
| `consultar_resumo_executivo` | `estrategicos.view` | indicadores da visão executiva | `period`, `compare` |
| `consultar_receitas` | `financeiro.view` | receita faturada, recebida, por competência, em aberto + receita por cliente | `period`, `compare`, `clientId` |
| `consultar_despesas` | `financeiro.view` | despesas, custos diretos e indiretos | `period` |
| `consultar_resultado` | `rentabilidade.view` | resultado operacional e margens | `period`, `compare` |
| `consultar_rentabilidade` | `rentabilidade.view` | rentabilidade por cliente, projeto e serviço | `period`, `limit` |
| `consultar_cliente` | `clientes.view` | visão do cliente + projetos | **`clientId`** |
| `consultar_projeto` | `projetos.view` | visão do projeto + atividades | **`projectId`** |
| `consultar_contrato` | `contratos.view` | contratado × executado | `clientId` |
| `consultar_departamento` | `departamentos.view` | indicadores do departamento | `department` |
| `consultar_producao` | `producao.view` | projetos, peças, atividades, entregas | `period`, `department` |
| `consultar_colaboradores` | `departamentos.view` | horas e produção por colaborador | `department` |
| `consultar_capacidade` | `capacidade.view` | capacidade, ocupação, carga | `period`, `department` |
| `consultar_eficiencia` | `capacidade.view` | produtividade, tempos, atrasos, refações, desvios | `period` |
| `consultar_contratado_versus_executado` | `contratos.view` | desvios contratado × realizado | `clientId` |
| `consultar_qualidade_dados` | `qualidade.view` | sincronização, conflitos, tarefas de coleta | — |
| `detalhar_indicador` | permissão do indicador | definição, fórmula, origem, requisito, resultado | **`indicatorId`** |
| `comparar_periodos` | permissão do indicador | indicador no período e no anterior | **`indicatorId`**, `period` |

Os ids de indicadores estão em [DICIONARIO_INDICADORES.md](DICIONARIO_INDICADORES.md).

## Dependência do banco real

As ferramentas já usam as mesmas funções das telas (`resolveModule`, `resolveIndicator` e `resolveTable`). Quando os mapeamentos SQL forem implementados em `server/src/mappings.ts` (ver [INTEGRACAO_POSTGRESQL.md](INTEGRACAO_POSTGRESQL.md)), as ferramentas passam a devolver valores sem nenhuma alteração.
