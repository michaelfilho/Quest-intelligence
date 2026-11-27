# QUEST INTELLIGENCE — protótipo local

Esta é a implementação do prompt enviado em 26/11/2026. O código anterior e suas alterações locais permanecem em `server/` e `web/`. O novo protótipo usa exclusivamente `backend/` e `frontend/`, sem ler `.env`, sem banco e sem serviços externos.

## Executar

Node.js 22.12+ ou versão compatível com Vite 8.

```powershell
npm run setup
npm run dev
```

Interface: http://127.0.0.1:5175 · API: http://127.0.0.1:4310/api/v1

Também é possível iniciar separadamente: `npm run dev:api` e `npm run dev:web`.

Verificação: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:prototype` (o último inicia os serviços temporariamente e usa Edge instalado via Playwright). Evidências visuais em `e2e/output/quest-intelligence/`.

## Organização e decisões

- `backend/src/data/demo.ts`: fonte determinística fictícia. 12 clientes, 25 marcas, 20 contratos com versões, 7 categorias, 24 rateios, 35 projetos, 9 departamentos, 30 colaboradores, 385 apontamentos e 210 lançamentos financeiros vinculados aos projetos. Tipos de lançamento representam etapas distintas e não devem ser somados entre si como receita adicional.
- `backend/src/analytics.ts`: mão de obra por apontamento × custo/hora; receitas separadas; custos, lucro e margem ponderada; margem nula quando sem receita. Totais dos contratos coincidem com os valores contratados dos projetos.
- `backend/src/types.ts`: contrato tipado consumido pelo frontend.
- `frontend/src/pages/`: páginas React por domínio; `components/ui/`: componente Button baseado no padrão shadcn/ui com Radix Slot, CVA e Tailwind Merge. Drawer acessível com Radix Dialog. Inter e Lucide locais, Recharts, Router e Tailwind via Vite.
- Todos os módulos do menu possuem telas demonstrativas. Após as primeiras entregas, os 17 módulos que ainda estavam pendentes foram preenchidos com dados fictícios; não restam páginas “Em desenvolvimento”.
- O cabeçalho oferece pesquisa real sobre a base demo, notificações navegáveis e somente o período disponível: 2024 consolidado.
- Gráficos mensais financeiros são uma distribuição fictícia dos totais em seis meses; apontamentos têm datas em fevereiro/2024. Não representam dados históricos externos.
- Departamentos mostram mão de obra dos colaboradores lotados na área. A receita é atribuída ao responsável pelo projeto. Custos externos, impostos e indiretos ficam detalhados nos projetos, sem serem duplicados entre equipes.
- Receitas, custos e status são demonstrativos. Configurações não gravam alterações e não há autenticação real ou integração iClips/n8n.
- A navegação principal adota os seis grupos do prompt mais recente; as imagens orientam cores, densidade, cartões, tabelas e disposição geral.

## API REST v1

`GET /api/v1` lista endpoints. `GET /health`, `/bootstrap` e `/dashboard` fornecem saúde, base tipada e indicadores.

`GET /clientes`, `/projetos`, `/marcas`, `/contratos`, `/departamentos`, `/colaboradores`, `/apontamentos`, `/categorias`, `/rateios`, `/lancamentos`, `/pecas`, `/indicadores`, `/alertas-gerenciais`: resposta `{ data, total, mode }`. Cada coleção tem `GET /:id`, com 404 JSON para registro inexistente.

Filtros opcionais: `q`, `cliente`, `departamento`, `colaborador`, `projeto`, `marca`, `status`, `retrabalho=true`, `sort`, `direction=desc`. Os campos são aplicáveis conforme a coleção. Exemplo: `/api/v1/projetos?cliente=cli-2&status=atrasado&sort=revenue&direction=desc`.

`POST /api/v1/rateios/simular`, corpo `{ "contractId":"ctr-1", "projectId":"proj-1", "amount":100 }`: simula alocação adicional; retorna antes/depois e saldo sem persistir. Bloqueia excesso, cliente divergente e valores negativos com 422. Não altera os dados.

`GET /api/v1/modulos`: retorna cenários de caixa, projeção, contas, lançamentos, orçamentos, capacidade, retrabalho, diagnósticos, metas, matriz ilustrativa de perfis e auditoria fictícia. Esses dados também integram o `bootstrap`.

`POST /api/v1/rateios/indiretos/simular`, corpo `{ "pool":1000, "criterion":"hours" }` (ou `revenue`): retorna distribuição antes/depois sem gravar. O cálculo distribui centavos pelo método dos maiores restos para conservar o total e impedir alocações negativas, inclusive em valores muito pequenos.

`POST /api/v1/assistente/simular`, corpo `{ "question":"Como está o caixa?" }`: resposta gerencial por regras locais, evidências da base fictícia e links de origem. Valida texto de 1 a 500 caracteres e sinaliza `simulated: true`. Não consulta um modelo de IA.

## Limites reais

Protótipo local demonstrativo. Sem conexão real, publicação, migração ou alteração no banco existente. Todos os módulos do menu foram preenchidos para visualização, com premissas e simulações identificadas. Não existe autenticação real, aplicação de perfis de acesso, auditoria de uso real, conexão bancária ou IA externa. Os números financeiros globais das imagens foram preservados (receita R$ 1.705.800,00; custo R$ 584.043,50; lucro R$ 1.121.756,50); as distribuições de horas, equipe e projetos foram reconstruídas e calculadas sobre a base fictícia, pois o anexo não contém o código-fonte original.

## Validação desta entrega

Lint, typecheck e build passaram. Dez testes automatizados verificam inventário, referências, conciliação de receitas/custos/contratos/peças/caixa, indicadores, regras de alertas, margem ponderada, ausência de receita, rateios, cenários financeiros, assistente simulado e respostas HTTP. Trinta e três verificações E2E passaram no Edge: 43 endereços de telas/detalhes verificados, nenhum placeholder, 404, pesquisa, filtros, agrupamento, navegação, drawer, projeção de caixa, simulações, perfis, metas, paginação e downloads CSV. Todos os 17 novos módulos foram verificados também em 390 × 844, sem overflow horizontal da página; capturas de desktop em 2056 × 1264 foram inspecionadas. Tabelas largas rolam dentro dos painéis. O teste inicia e encerra seus próprios serviços quando necessário, preservando os serviços já iniciados para o usuário.

Padrões reutilizáveis: base demonstrativa determinística com integridade referencial; fórmulas financeiras centralizadas e testadas; tipos compartilhados entre API e interface; filtros navegáveis por URL; drawer acessível com foco controlado; exportação do conjunto filtrado; simulações sem persistência claramente identificadas. A revisão visual detectou colunas cortadas na tabela de jobs e levou a larguras explícitas com cabeçalhos quebráveis, agora verificadas no E2E.

## Quatro módulos demonstrativos adicionados em 26/11/2026

- `backend/src/executive.ts` calcula oito indicadores, peças e alertas; o `bootstrap` e os endpoints REST reutilizam esses resultados. Não há uma segunda base de números na interface.
- Peças e Atividades agrega apontamentos por identificador de peça, concilia horas/custo/retrabalho, filtra por cliente/job/colaborador/departamento/retrabalho e exporta o conjunto filtrado. Ordenação é aplicada antes da paginação (25 peças por página). Links do drawer abrem `?peca=` para localizar a peça exata.
- Indicadores Estratégicos compara margem, concentração, atraso, retrabalho, capacidade, recebimento, receita por hora e conclusão com referências explicitamente fictícias. As ações levam às respectivas telas de origem.
- Rentabilidade Consolidada apresenta a ponte receita menos mão de obra/fornecedores/impostos/indiretos, composição de custos, distribuição mensal e contribuição por cliente ou marca. A margem continua calculada sobre totais.
- Alertas Gerenciais oferece filtros por texto, categoria e prioridade, evidência numérica e ação de navegação. As seis regras demo são: status atrasado, margem abaixo de 45%, retrabalho acima de 15%, capacidade acima de 90%, fee alocado abaixo de 75% e recebimento abaixo de 90% do faturado. Saldo a receber não é classificado como inadimplência.
- Mantidos React/TypeScript/Recharts no frontend e Express/TypeScript no backend. Sem nova dependência, banco, serviço externo ou gravação de dados.

## Conclusão dos 17 módulos restantes — 26/11/2026

- Operacional: Capacidade Operacional mostra ocupação, disponibilidade e excedente por área; Refações e Alterações mostra horas e custos de retrabalho com acesso ao drawer e às peças. O retrabalho não é somado novamente às despesas.
- Financeiro: Dashboard Financeiro, DRE Gerencial, Fluxo de Caixa, Receitas e Despesas, Custos Operacionais e Orçado vs. Realizado. Receita reconhecida, faturamento e recebimentos ficam em regimes separados. Conta do plano de contas abre a listagem filtrada por `?conta=` no regime correspondente.
- Premissas fictícias adicionais: saldo inicial de caixa de R$ 35.000,00; pagamentos equivalentes a 82% dos custos; distribuição mensal dos totais e projeção dos saldos pendentes em 50%/30%/20%; cenários de orçamento com custo planejado 12% abaixo ou acima do realizado. Todas essas premissas são visíveis nas telas.
- Inteligência: Central de Alertas reutiliza as ocorrências calculadas; Diagnósticos relaciona evidências e hipóteses; Análises Comparativas permite escolher e inverter duas contas; Assistente de IA oferece perguntas sugeridas e texto livre com resposta explícita de análise simulada e links de origem.
- Administração: Regras de Rateio simula indiretos por horas ou receita; Plano de Contas relaciona sete contas a 245 lançamentos (210 registros originais mais 35 registros derivados de mão de obra); Metas e Parâmetros aplica referências somente na tela; Permissões visualiza quatro perfis ilustrativos; Auditoria oferece 64 eventos fictícios, busca, filtros, paginação e CSV.
- `backend/src/modules.ts` concentra as massas e cenários derivados; `backend/src/simulations.ts` valida simulações. O frontend continua React/TypeScript com Router, Tailwind e Recharts; o backend continua Express/TypeScript. Sem dependências novas.
- Padrão de arredondamento: rateios simulados trabalham em centavos e usam maiores restos. As séries de caixa conservam o total com ajuste da última parcela. Testes cobrem saldos encadeados e a distinção entre despesa, faturamento e recebimento.
- Pendências reais: conectar dados, banco, autenticação, permissões efetivas, auditoria real, integrações e IA depende de trabalho futuro; a solicitação atual de visualização com dados fictícios está concluída.
