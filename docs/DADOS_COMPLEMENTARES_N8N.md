# Dados complementares — planejamento de coleta

Lista de requisitos para integração futura. **Nenhuma alteração do n8n ou PostgreSQL foi executada.** Antes de criar coleta adicional, usar a introspecção da aplicação para conferir se os campos já existem e documentar sua semântica. Falta de um mapeamento aprovado não significa ausência do dado na origem.

| Finalidade | Dados e granularidade necessários |
|---|---|
| Contratos | Identidade do contrato, cliente vinculado, vigência, aditivos/versionamento, valor e moeda, periodicidade e competência, escopo por unidade/tipo de entrega, quantidades e mudanças de escopo com datas efetivas. |
| Capacidade | Identidade da pessoa, vínculo vigente, jornada/disponibilidade por data, calendário, feriados, férias/afastamentos e exceções; não assumir oito horas por dia. |
| Planejamento individual | Atribuição explícita da estimativa por pessoa/departamento e período, com unidade de trabalho composta e versão. Sem isso, não repartir orçamento compartilhado. |
| Atividades e estimativas | Confirmar chaves do apontamento: origem TASK/WORKFLOW, projeto, tarefa de origem e/ou peça/etapa. Preservar `(job_id, iclips_id)` e `(job_piece_id, iclips_id)` das estimativas. Se já existirem em outros campos, registrar perfil explícito validado em vez de duplicar registros. |
| Entregas efetivas | Evento de conclusão/aprovação, data efetiva, tipo e identidade da entrega, autoria, cliente/projeto/serviço, histórico de cancelamento/reabertura; peça cadastrada não basta. |
| Prazos e alterações | Prazo original e revisões com vigência, eventos de alteração/refação e responsável. Separar retrabalho apontado de alterações solicitadas pelo cliente. |
| Notas × clientes | Documento de cliente na nota e no cadastro, normalização/validade comprovadas, tipo de documento, chaves estáveis e tratamento de documentos compartilhados/duplicados. O vínculo deve ser unívoco; não associar pelo nome. |
| Rateios | Identidade financeira estável, centro de custo, valor ou percentual de cada alocação, moeda/base, competência e vigência, versão, total de referência e regras de conciliação. Uma relação 1:N não comprova como dividir amount. |
| Caixa completo | Semântica documentada de pagamentos parciais, parcelas, famílias pai/filho, transferências, estornos, sinais, encargos/retenções e vencimento. Não inferir natureza operacional somente por Entrada/Saída. |
| Cobertura de custo | labor_cost e sua unidade/moeda/metodologia, versões de taxa e validade quando aplicável; esclarecer zeros/ausências. Não somar custo registrado com um custo novamente calculado pela taxa. |
| Publicação e cobertura | Identidade de execução/recurso, intervalo coberto, recebidos, únicos publicados, versão e timestamp efetivo, conflitos e resolução, sobreposições/substituições e retenção das páginas. RECEIVED não comprova publicação. |

Estas informações não devem ser copiadas para um novo banco analítico. O backend continuará consultando o PostgreSQL existente, com a role somente leitura. Se uma fonte ainda não estiver integrada, o indicador correspondente permanece indisponível.

## Decisões gerenciais — não são tarefas de coleta

- Aprovar os status de projetos ativos, suspensos e concluídos e o critério de atraso atual. Existem perfis configuráveis sem valores padrão.
- Aprovar os valores de `financial_categories.dre_indicator` que correspondem a receita/despesa operacional; definir exclusões e conciliação antes de certificar resultado.
- Aprovar o critério de entrega, produtividade, horas internas/produtivas e alterações.
- Aprovar rateio, custo direto/indireto/variável, tratamento de taxas, moeda e bases compatíveis para resultados e margens.
- Definir expectativa de atualização por recurso e tratamento de outliers. Não inventar prazos de desatualização ou cortar projetos longos silenciosamente.
- Validar os discriminadores de recursos financeiros/projetos e os campos de origem das atividades já existentes antes de configurar seus perfis.

As configurações semânticas e suas validações estão em [CORRECOES_RELACIONAMENTOS.md](CORRECOES_RELACIONAMENTOS.md). Segredos e dados empresariais não pertencem ao Git ou a esta documentação.
