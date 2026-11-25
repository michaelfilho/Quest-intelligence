# Diagnóstico da integração — 25/11/2026

> Registro da primeira integração local (`1690e79`). Para a revisão final, contagens atualizadas, publicação e procedimento de atualização, consultar [REVISAO_PUBLICACAO.md](REVISAO_PUBLICACAO.md) e [ATUALIZACAO_PRODUCAO.md](ATUALIZACAO_PRODUCAO.md).

## Entrega e limites

Código preparado para o próprio backend consultar a conexão existente. Nenhum acesso à VPS/PostgreSQL de produção, SSH, deploy ou push foi realizado. A autorização final restringe a validação real ao ambiente após a atualização.

| Catálogo | Com SQL registrado | Sem SQL disponível |
|---|---|---|
| 69 indicadores | 29, condicionados à introspecção e qualidade parcial | 40, com motivo individual |
| 28 gráficos | 7 | 21 |
| 25 tabelas | 10 | 15 |

Implementado não significa certificado: os 29 indicadores retornam qualidade parcial ou em reconciliação, podendo permanecer indisponíveis em produção se seus perfis não forem comprovados. Nenhum resultado foi validado contra dados reais nesta execução.

## Indicadores com consultas

- Notas: faturamento bruto e líquido por emissão, faturamento por competência, quantidades emitidas e canceladas.
- Apontamentos: horas, retrabalho, percentual de retrabalho, colaboradores com apontamento, clientes com apontamento e custo de mão de obra registrado.
- Projetos: iniciados e tempo de calendário preliminar, sem certificar estado histórico ou entrega.
- Caixa: entradas, saídas e saldo preliminares, exigindo perfil não ambíguo, tipos compatíveis e FK de vínculo-pai. Saldo recusa negativos sem convenção aprovada. Movimentos não são receita/despesa operacional nem lucro.
- Cadastros atuais: clientes, colaboradores, departamentos, projetos, peças, tarefas e etapas, sem comparação histórica fabricada.
- Monitoramento atual: tarefas, última atualização, estados pendentes/em execução/em reconciliação/com falhas, sem inferir cobertura de publicação.

Gráficos: horas por cliente/departamento/colaborador/projeto, retrabalho por colaborador, evolução do faturamento e movimentações preliminares. Tabelas: apontamentos, timesheet por departamento, departamentos, colaboradores, capacidade com horas registradas, retrabalho, clientes, projetos, notas e movimentos preliminares. Campos não comprovados permanecem ausentes.

Módulos com dados potenciais: executivo, financeiro, clientes e detalhe, projetos e detalhe, timesheet, departamentos, colaboradores, produção, produtividade, capacidade, eficiência, rentabilidade pelo custo registrado e qualidade. Contratos permanecem indisponíveis sem fonte contratual. Relatórios reutilizam consultas, escopos e limitações dos respectivos módulos.

## Decisões e padrões

- Descoberta em runtime, sem arquivo estático de levantamento: colunas, tipos e constraints em memória por cinco minutos. Relações declaradas no contrato são distintas das FKs realmente encontradas.
- Mapeamentos explícitos; não interpretar nomes de campos como autorização para inventar fórmulas. Tipos inválidos, filtros sem relação ou perfis ambíguos falham com insuficiência de dados.
- PostgreSQL permanece fonte exclusiva dos dados analíticos; SQLite continua apenas como armazenamento operacional de autenticação/configurações/auditoria.
- SQL parametrizado, intervalos semiabertos, America/Sao_Paulo, paginação e ordenação autorizada. Checagem de duplicidade de jobs impede fanout de horas.
- Departamento imposto no backend vale em cards, filtros, dimensões, detalhes, gráficos e exportações. Escopos precisam conter IDs reais.
- Não somar faturamento, caixa e competência; não confundir tempo de calendário com horas trabalhadas. Não preencher ausência com zero nem reconstruir histórico de fotografias atuais.
- Interface atualiza consultas a cada 60 segundos enquanto ativa, lendo mudanças feitas pelo n8n no PostgreSQL sem duplicação local.
- Base pública única `/core/` configurável, mantendo `/` local; API recebe `/api` após strip no Traefik. Cookie transformado apenas no backend.

Stack mantida: React/TypeScript, Express/Node, `pg` e PostgreSQL somente leitura, SQLite da aplicação. PGlite foi adicionado exclusivamente para testes locais com motor PostgreSQL em memória; não é fonte de dados nem dependência de produção.

## Verificações locais

- 66 testes backend e 14 frontend aprovados, incluindo consultas em PostgreSQL, API real, permissões e relatórios.
- Typecheck e build aprovados.
- 35 verificações Playwright na raiz e 35 em `/core/`, sem erros inesperados de console nas rodadas aprovadas.
- Auditorias de dependências da raiz/server/web/e2e sem vulnerabilidades reportadas.
- Configurações de Docker/nginx revisadas, sem execução de containers. Números reais, role efetiva, proxy/TLS e cobertura não homologados nesta tarefa.

Falhas iniciais do executor em `/core` sem barra foram corrigidas; a rodada aprovada acessa `/core/`. Não são evidência de falha no PostgreSQL ou na produção.

## Atualização e pendências

O roteiro está em [DEPLOY_VPS.md](DEPLOY_VPS.md). Preservar o SQLite, ambiente, role, proxy e volumes existentes. Não criar banco ou reexecutar concessão de privilégios. Após atualizar, revisar `/core/api/metadata/schema`, conferir rastreabilidade e executar manualmente `npm run verify:analytics` no backend já configurado.

Cobertura por publicações efetivas, conflitos financeiros, status de conclusão, entrega, capacidade, contratos, custo completo e vínculos de notas com clientes ainda precisam de evidências/decisões. Motivos dos 40 indicadores indisponíveis estão no [dicionário](DICIONARIO_INDICADORES.md). Detalhes em [INTEGRACAO_POSTGRESQL.md](INTEGRACAO_POSTGRESQL.md) e [PENDENCIAS_PRODUCAO.md](PENDENCIAS_PRODUCAO.md).

## Arquivos alterados

O inventário abaixo contém código, testes, configuração e documentação desta integração. O hash do commit local será informado na entrega; nenhum push foi autorizado nesta etapa.

<!-- INVENTARIO -->

```text
 M .env.example
 M .gitignore
 M README.md
 M docker-compose.prod.yml
 M docs/API.md
 M docs/ARQUITETURA.md
 M docs/DEPLOY_VPS.md
 M docs/DICIONARIO_INDICADORES.md
 M docs/INTEGRACAO_POSTGRESQL.md
 M docs/PENDENCIAS_PRODUCAO.md
 M docs/TESTES.md
 M e2e/homologacao.mjs
 M package.json
 M scripts/homologar.mjs
 M server/Dockerfile
 M server/package-lock.json
 M server/package.json
 M server/src/app.ts
 M server/src/auth.ts
 M server/src/docs-indicators.ts
 M server/src/introspect.ts
 M server/src/mappings.ts
 M server/src/reports.ts
 M server/src/services.ts
 M shared/catalog.ts
 M shared/contracts.ts
 M web/Dockerfile
 M web/src/components/FilterBar.tsx
 M web/src/components/TraceDrawer.tsx
 M web/src/lib.ts
 M web/src/main.tsx
 M web/vite.config.ts
?? deploy/.env.production.example
?? docs/DIAGNOSTICO_INTEGRACAO.md
?? server/src/analytics.ts
?? server/src/cash.ts
?? server/src/mapping-limitations.ts
?? server/src/quality.ts
?? server/src/registry-counts.ts
?? server/src/schema.ts
?? server/src/source-errors.ts
?? server/src/verify-analytics.ts
?? server/test/analytics-api.test.ts
?? server/test/analytics-fixtures.ts
?? server/test/analytics.test.ts
?? server/test/schema-profile.test.ts
?? shared/base-path.ts
?? web/src/base-path.test.ts
```
