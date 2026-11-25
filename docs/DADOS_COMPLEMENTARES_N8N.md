# Dados complementares — planejamento de coleta

Lista de requisitos para integração futura. **Nenhuma alteração do n8n ou PostgreSQL foi executada.** Antes de criar coleta adicional, usar a introspecção da aplicação para conferir se os campos já existem e documentar sua semântica. Falta de um mapeamento aprovado não significa ausência do dado na origem.

Atualização da fase 2: os documentos de notas/clientes, `workflow_id`, estimativas de tarefas/etapas, rateios `source_center_id/name/amount/percentage`, classificações DRE e estado/conflitos de publicação foram confirmados e já são aproveitados. **Não solicitar coleta ou duplicação desses dados novamente.** Nas linhas abaixo, somente completude, atribuições/semânticas ainda ausentes e fontes complementares continuam pendentes. Ver [FASE_2_INTEGRACAO.md](FASE_2_INTEGRACAO.md).

| Finalidade | Dados e granularidade necessários |
|---|---|
| Contratos | Identidade do contrato, cliente vinculado, vigência, aditivos/versionamento, valor e moeda, periodicidade e competência, escopo por unidade/tipo de entrega, quantidades e mudanças de escopo com datas efetivas. |
| Capacidade | Identidade da pessoa, vínculo vigente, jornada/disponibilidade por data, calendário, feriados, férias/afastamentos e exceções; não assumir oito horas por dia. |
| Planejamento individual | Atribuição explícita da estimativa por pessoa/departamento e período, com unidade de trabalho composta e versão. Sem isso, não repartir orçamento compartilhado. |
| Atividades e estimativas | As chaves confirmadas já são usadas: `(job_id, task_id)` e `(job_piece_id, workflow_id)`. Preservar identidades e preencher estimativas reais na origem quando disponíveis; não gerar estimativas nem duplicar apontamentos. Atribuição por pessoa/departamento é um dado adicional ainda necessário. |
| Entregas efetivas | Evento de conclusão/aprovação, data efetiva, tipo e identidade da entrega, autoria, cliente/projeto/serviço, histórico de cancelamento/reabertura; peça cadastrada não basta. |
| Prazos e alterações | Prazo original e revisões com vigência, eventos de alteração/refação e responsável. Separar retrabalho apontado de alterações solicitadas pelo cliente. |
| Notas × clientes | Os documentos existentes já permitem associação parcial. Resolver na origem ambiguidades/cadastros incompletos; documentar tipos/formatos adicionais antes de expandir a validação numérica de CPF/CNPJ. Não distribuir valores de documentos compartilhados. |
| Rateios | Valores e percentuais existentes já são conciliados conjuntamente. Corrigir divergências na origem quando cabível e esclarecer moeda/base, versões/vigência e natureza direta/indireta. Não redistribuir automaticamente partes ausentes nem recoletar relações já presentes. |
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
