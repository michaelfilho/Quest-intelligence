/** A introspecção comprova estrutura; não substitui decisões de negócio. */
export function mappingLimitation(id: string) {
  const specific: Record<string,string> = {
    ultima_publicacao_core: "Timestamp de publicação efetiva não mapeado; atualização da tarefa não significa publicação no CORE.",
    paginas_recebidas: "Identidade, granularidade e ciclo de retenção das páginas de ingestão não comprovados; não inferir páginas pelo número de tarefas.",
    registros_recebidos: "Quantidade de registros por página/publicação não mapeada; tarefas não equivalem a registros recebidos.",
    conflitos_financeiros: "Identidade do registro, estado aberto/resolvido e versão publicada do conflito não mapeados; não inferir resolução por nomes de campos.",
    conflitos: "Identidade, recurso, estado e timestamp dos conflitos precisam de um contrato explícito; não expor contagens históricas como atuais.",
    divergencias_projetos: "Comparação entre quantidade esperada/recebida e tipo da tarefa de projeto não comprovada.",
    recursos_sem_atualizacao: "Recurso, último sucesso e prazo esperado de atualização não aprovados; não inventar limiar de desatualização.",
    cobertura_dados: "Exige intervalos completos e publicação efetiva, reconciliando sobreposições e publicações posteriores. Contagem de tarefas não é cobertura.",
    periodos_incompletos: "Falta contrato de intervalos e evidência de publicação; ausência de notas em um mês não prova coleta incompleta.",
    faturado_vs_recebido: "Faturamento é consultável, mas receita recebida operacional ainda não foi classificada; não substituir por toda Entrada.",
    receitas_vs_despesas: "Receita e despesa operacional não estão classificadas. Movimentações preliminares têm análise própria, sem reclassificação arbitrária.",
    anomalias_financeiras: "Comparação econômica e limites de anomalia dependem de classificação e conciliação; não inferir alerta apenas de variação bruta.",
    entregas_colaboradores: "Faltam critério e data de entrega, autoria e relação departamental na granularidade da entrega; horas não são contagem de entregas.",
  };
  if (specific[id]) return specific[id];
  if (id.startsWith('entregas_por_')) return "Critério e data de entrega e associação à dimensão não comprovados. Peças cadastradas ou apontamentos não provam entrega.";
  if (["escopo_contratado", "receita_contratada", "entregas_vs_contratado", "contratado_executado", "contratado_vs_executado"].includes(id)) return "Fonte contratual e escopo de entregas não comprovados. Orçamento de job não é contrato.";
  if (["capacidade_disponivel", "ocupacao", "ocupacao_por_departamento"].includes(id)) return "Jornadas, disponibilidade e capacidade contratada não comprovadas; nenhuma jornada de oito horas é presumida.";
  if (["receita_recebida", "despesas", "receita_competencia", "valores_em_aberto"].includes(id)) return "Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente.";
  if (/margem|resultado|rentabilidade|custos_|custo_|receita_por|concentracao|mil_receita/.test(id)) return "Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.";
  if (["projetos_ativos", "projetos_concluidos", "projetos_atrasados", "atrasos", "atividades_concluidas", "pecas_produzidas", "entregas", "produtividade", "tempo_medio_atividade", "alteracoes"].includes(id)) return "Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.";
  if (/previstas|desvio_horas|produtivas|improdutivas/.test(id)) return "Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas.";
  return "Mapeamento semântico ainda não disponível para esta fonte. A introspecção verifica tabelas e tipos, mas não presume relacionamentos, cobertura, estados de publicação nem fórmulas gerenciais.";
}
