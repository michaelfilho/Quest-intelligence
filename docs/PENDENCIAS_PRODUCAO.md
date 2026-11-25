# Pendências de integração e produção

A produção foi informada como conectada a `quest_rinne` pela role somente leitura. Não foi acessada nesta tarefa. A nova integração precisa ser atualizada e validada no ambiente existente.

- Conferir `/api/metadata/schema` com permissão administrativa: campos, tipos, constraints e capacidades reais.
- Homologar 31 indicadores com SQL condicional, 16 gráficos e 14 tabelas contra dados reais; são parciais ou em reconciliação.
- Conciliar duplicidades econômicas, sinais, transferências, estornos, retenções, parcelas e pagamentos parciais. Movimentos exigem namespace e referências do vínculo-pai validados; FK física não é obrigatória.
- Mapear a identidade e os estados dos conflitos para excluir versões antigas conflitantes. Movimentos preliminares são sinalizados como não conciliados.
- Validar cobertura por intervalos completos e publicações efetivas, tarefas sobrepostas e publicações posteriores. Contagem de tarefas não é cobertura.
- Verificar sobreposição WORKFLOW/TASK, duração, custos preenchidos e atribuição temporal dos apontamentos.
- Definir status de conclusão/atraso, critério de entrega, estimativas compatíveis e distinção entre esforço produtivo e demais horas.
- Fornecer fonte contratual real, jornadas/capacidade, metodologia de custo completo, classificação de custos e critérios de rateio. Orçamento de job não é contrato.
- Validar documento unívoco para ligar notas a clientes; não usar nomes.
- Conferir IDs dos escopos departamentais, sem atribuir departamento atual a todo histórico.
- Validar Docker, TLS, Traefik com strip de `/core`, cookie Path `/core/`, proxy confiável, volumes e backup/restauração.

Os 38 indicadores sem SQL disponível têm motivo individual no [dicionário](DICIONARIO_INDICADORES.md). Conectar o banco não resolve ausência de fonte ou semântica gerencial.

Não houve deploy, push, acesso SSH, alteração de banco, migração analítica ou alteração do n8n nesta execução.
