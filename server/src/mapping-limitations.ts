/** A introspecção comprova estrutura; não substitui decisões de negócio. */
export function mappingLimitation(id: string) {
  if (["escopo_contratado", "receita_contratada", "entregas_vs_contratado", "contratado_executado", "contratado_vs_executado"].includes(id)) return "Fonte contratual e escopo de entregas não comprovados. Orçamento de job não é contrato.";
  if (["capacidade_disponivel", "ocupacao", "ocupacao_por_departamento"].includes(id)) return "Jornadas, disponibilidade e capacidade contratada não comprovadas; nenhuma jornada de oito horas é presumida.";
  if (["receita_recebida", "despesas", "receita_competencia", "valores_em_aberto"].includes(id)) return "Classificação econômica, pagamentos parciais e semântica de vencimento não validadas. Movimentação financeira preliminar é exibida separadamente.";
  if (/margem|resultado|rentabilidade|custos_|custo_|receita_por|concentracao|mil_receita/.test(id)) return "Custos completos, classificação operacional, vínculo econômico ou rateio não aprovados. Não é possível certificar rentabilidade, custo ou concentração de receita operacional.";
  if (["projetos_ativos", "projetos_concluidos", "projetos_atrasados", "atrasos", "atividades_concluidas", "pecas_produzidas", "entregas", "produtividade", "tempo_medio_atividade", "alteracoes"].includes(id)) return "Códigos de status, critério de conclusão/entrega ou datas efetivas ainda não têm mapeamento semântico validado. Planejamento não é produção realizada.";
  if (/previstas|desvio_horas|produtivas|improdutivas/.test(id)) return "Estimativas compatíveis, classificação do esforço ou denominador não comprovados; não são somadas tarefas e etapas potencialmente sobrepostas.";
  return "Mapeamento semântico ainda não disponível para esta fonte. A introspecção verifica tabelas e tipos, mas não presume relacionamentos, cobertura, estados de publicação nem fórmulas gerenciais.";
}
