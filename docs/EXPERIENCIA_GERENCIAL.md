# Experiência gerencial — integração da fase 3

Revisão local de 25/11/2026, integrada às otimizações de [PERFORMANCE.md](PERFORMANCE.md). Sem push, deploy, acesso à VPS, alterações no PostgreSQL/n8n, credenciais ou novo banco analítico. Entrada real do frontend: `web/src/main.tsx`; não existe um `App.tsx` separado nesta aplicação.

## Menu e rotas

A sidebar mantém a identidade preta/cinza/branca/laranja, com seis grupos recolhíveis:

| Grupo | Páginas |
|---|---|
| Gestão Executiva | Visão Geral |
| Gestão Comercial | Clientes; Contratos e Escopos |
| Gestão Operacional | Projetos; Produção; Timesheet; Colaboradores; Departamentos; Produtividade e Capacidade |
| Gestão Financeira | Financeiro; Rentabilidade; DRE Gerencial; Fluxo de Caixa |
| Gestão e Controle | Relatórios; Alertas |
| Administração | Integrações e Qualidade; Configurações |

As rotas anteriores permanecem funcionais, inclusive `/contratado`, `/capacidade`, `/eficiencia` e `/qualidade`. `/dre` e `/fluxo-caixa` reutilizam o módulo Financeiro, com a mesma permissão. `/alertas` reutiliza indicadores existentes e autorizados. `/departamentos/:id` e `/colaboradores/:id` reutilizam suas páginas e filtros. Todas funcionam sob o basename `/core/`. Nenhum componente fictício, página vazia, IA, voz ou reunião foi introduzido.

## Páginas e navegações

- **Visão Geral:** dez indicadores prioritários, faturamento separado de recebimento, despesas e resultado operacional, margem preliminar, custo registrado, projetos e horas. Gráficos de receitas/despesas, resultado, departamentos, status, faturamento por cliente e retrabalho. Alertas clicáveis sem informações técnicas de coleta na primeira tela.
- **Clientes:** listagem consolidada, pesquisa literal no servidor, ordenação, paginação e CSV da página autorizada. Abas do detalhe: Visão Geral, Financeiro, Projetos, Contratos e Escopos, Produção e Timesheet. Cliente → projeto por nomes de cadastro.
- **Projetos:** por projeto ou agrupados por cliente, com cadastro/prazos em aba própria. Nome real, cliente, responsável principal quando identificado, departamentos com atividade, status, prazo, estimativas por unidade, horas/retrabalho e componentes financeiros. Abas do detalhe: Visão Geral, Financeiro, Equipe, Peças e Atividades, Timesheet e Rentabilidade.
- **Atividades:** expansão sob demanda para descrição, primeiro/último registro, retrabalho e apontamentos com datas, colaboradores, horas e custo autorizado. Origem, chave do pai e chave do filho são preservadas separadamente; não se interpreta `source_path`. A ordenação e a identidade visual usam os componentes completos.
- **Timesheet:** por departamento, colaborador, projeto, calendário e registros. Dia do calendário → apontamentos daquela data. Horas são atribuídas ao início do registro, sem presumir rateio diário. Dias ausentes não são preenchidos com zero.
- **Departamentos/colaboradores:** Departamento → Colaborador → Projeto → Atividade → Apontamento, preservando período e filtros. Departamento é o observado nos apontamentos; não se infere cargo, jornada ou vínculo ativo.
- **Financeiro:** Visão Geral, Receitas, Despesas, Contas a Receber, Contas a Pagar, Centros de Custo e Lançamentos. Valores em aberto/vencidos permanecem pendentes quando os títulos e vencimentos não estão comprovados.
- **DRE Gerencial:** linhas hierárquicas por pagamentos realizados, com categorias expansíveis restritas ao grupo selecionado. Categoria → lançamentos filtrados por categoria. Resultado operacional permanece preliminar; resultado final não é calculado sem metodologia validada.
- **Fluxo de Caixa:** entradas, saídas, saldo de movimentações, períodos diários/mensais, contas e categorias. Período → lançamentos. Não representa saldo bancário ou previsões.
- **Rentabilidade:** cliente, projeto e departamento. Exibe componentes comprovados separadamente. Resultado e margem completos não são derivados de bases incompatíveis ou de custos incompletos.
- **Contratos/produtividade:** contratos/vigência e planejado × executado; produtividade, capacidade e gargalos organizados em abas. Mantêm-se as limitações das fontes e dos critérios gerenciais.
- **Relatórios:** finalidades executiva, financeira, rentabilidade, clientes, projetos, colaboradores, departamentos, produção/produtividade, contratos e qualidade. Mesmas funções e filtros do backend dos dashboards; sem calcular gráficos descartados.

A aba **Todos os indicadores** preserva o inventário original e seus motivos de indisponibilidade. A curadoria não remove itens para esconder problemas.

## Linguagem e disponibilidade

Títulos foram simplificados sem mudar fórmulas: Faturamento, Receita operacional recebida, Colaboradores com atividade, Peças trabalhadas, Tempo médio dos projetos finalizados, Registros de retrabalho e Atualizações em revisão, entre outros.

Cards usam estados curtos, valor ausente como `—`, sinalização discreta de Dados parciais/Preliminar e ícone de informação. O drawer apresenta significado, cálculo, período, cobertura, limitações, fonte e atualização. A data consultada não substitui a atualização da origem, quando esta não existe. Fórmulas técnicas e identificadores de origem ficam em detalhes restritos a `config.view` ou `qualidade.view`; erros SQL/stack traces não são exibidos ao gestor.

Números, moedas, horas, percentuais e datas seguem a formatação brasileira. Gráficos têm legendas gerenciais e meses legíveis. Tabelas têm linhas compactas e rolagem interna, com estados vazios legíveis no celular. O drawer permite Escape, mantém o foco dentro do diálogo e devolve-o ao controle de origem.

## Consultas e segurança

Novas tabelas implementadas: `gestao_clientes`, `gestao_projetos`, `projetos_por_cliente`, `timesheet_projetos`, `timesheet_calendario`, `caixa_diario` e `caixa_mensal`. Novos gráficos: `top_clientes_faturamento` e `evolucao_resultado`. Permanecem **107 indicadores de catálogo / 85 implementações**, passando a **30 gráficos e 38 tabelas implementados**. Implementação não significa disponibilidade garantida no banco real: introspecção, dados e critérios continuam sendo validados em execução.

As consultas agregam fatos antes de associar cadastros e usam SQL parametrizado. O resumo de projetos reutiliza a base temporal nas estimativas, sem buscas por linha. Faturamento exige documento válido e único; pagamento exige vínculo financeiro validado e projeto identificado. Não se associa nota a projeto por nome. Clientes sem movimento podem aparecer pelo cadastro com componentes ausentes. Valores financeiros e custos pessoais não são lidos pela nova lista operacional quando o usuário não tem a respectiva permissão.

Resultado/margem completos são `NULL` enquanto a metodologia estiver pendente. Não se subtrai custo de mão de obra das despesas novamente. A integração não transforma peças trabalhadas em entregas nem horas em capacidade.

`ACCESS_MODULES` preserva os módulos que autorizavam os itens anteriores: adicionar um item a uma aba não concede acesso por herança visual. Backend verifica autenticação, IP, permissão de item, colunas e departamento antes de consultar/exportar. Pesquisa usa somente colunas textuais explícitas, sem pesquisar valores financeiros ocultos. Ordenação por custo sem permissão é recusada, inclusive no detalhe de atividade.

CSV de listagens usa o endpoint `/api/tables/:id/export`, com `relatorios.export`, auditoria e os mesmos filtros, ordem, pesquisa e colunas autorizadas da página. O botão informa **Exportar página**. Relatórios mantêm o limite existente de mil linhas por tabela e agora avisam explicitamente quando há registros adicionais; refinar filtros para obter o subconjunto desejado.

Status de projetos e situação de notas fiscais possuem origem explícita no filtro. Ao trocar de área, o backend recusa interpretação cruzada; a interface oferece remover o filtro incompatível, sem transformar ausência em zero.

## Performance e atualização

Somente a aba aberta monta os componentes. Cards são independentes; gráficos/tabelas são progressivos, com cache autorizado, deduplicação, paginação SQL e dados anteriores durante atualização silenciosa. Pesquisa tem debounce de 300 ms. Comparação altera cards sem reiniciar a página atual de tabelas. Registros expandidos só são consultados depois da ação do usuário.

Cache, admissão de duas consultas pesadas, pool padrão de cinco, timeout de 15 s, telemetria sem conteúdo sensível e atualização de 60 s permanecem. A página não espera por um único indicador para exibir os demais. Opções de dimensões são carregadas ao abrir os filtros e reutilizadas por cache, sem manter timers para filtros fechados.

## Pendências reais

- Identidade/situação dos títulos, saldos em aberto e vencimentos confiáveis para contas a pagar/receber.
- Contratos, vigência, valores e escopo contratados.
- Critérios aprovados para projetos ativos/atrasados, entregas e produtividade onde ainda não definidos.
- Jornadas/disponibilidade para capacidade e ocupação; atribuição comprovada de estimativas individuais/departamentais.
- Conciliação e metodologia para resultado final/margens completas, sem dupla contagem de pessoal.
- Atribuição de receita aos departamentos e faturamento por projeto; documentos ambíguos não são distribuídos.
- Validação após atualização da VPS com PostgreSQL nativo e publicações normais do n8n. Nenhum workflow foi alterado ou disparado.

## Verificação e publicação

130 testes backend e 19 frontend, typecheck e build aprovados. Homologação sem banco: 42 verificações em `/` e 42 em `/core/`. Homologação com Express + SQL em PGlite readonly e dados exclusivamente sintéticos: onze fluxos em cada base. Foram inspecionadas capturas desktop/celular. Auditorias npm de raiz/server/web/e2e: zero vulnerabilidades reportadas.

Reprodução do cenário com dados: `$env:HOMOLOG_ANALYTICS_FIXTURE='1'; npm run homologacao`. Para o prefixo, definir também `$env:VITE_BASE_PATH='/core/'`. O script cria SQLite temporário para autenticação e PGlite efêmero para testes; não acessa PostgreSQL externo ou `.env` de produção. O fixture está em `server/test`, não é copiado pelo Docker e exige modo de teste.

Resultados locais não certificam produção. Ver [BENCHMARKS.md](BENCHMARKS.md). A entrega combina performance e UX em um único commit local, sem push. Quando a publicação e a atualização forem autorizadas, seguir [ATUALIZACAO_PRODUCAO.md](ATUALIZACAO_PRODUCAO.md), preservando os ajustes locais do runtime, SQLite, credenciais, volumes, role e Traefik.
