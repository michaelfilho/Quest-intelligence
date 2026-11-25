# Integração com o PostgreSQL `quest_rinne`

Estado: **não conectado**. Toda a aplicação funciona sem o banco, mostrando `DATABASE_UNAVAILABLE` e nunca valores. Os cálculos só serão escritos depois de inspecionar o schema real.

## Princípios

- Fonte oficial: `core` (consumo), `ingest` (coletas) e `audit` (conflitos e rastreabilidade).
- **Somente leitura**, em três camadas:
  1. a role `quest_rinne_app_ro` só tem SELECT ([sql/001_create_readonly_role.sql](../sql/001_create_readonly_role.sql));
  2. a sessão abre com `default_transaction_read_only=on`;
  3. a API não tem rotas de escrita no banco analítico.
- A API recusa `DATABASE_URL` que não seja `postgres://…/quest_rinne` ou que use o usuário `postgres`.
- `statement_timeout` de 15 s, pool de 10 conexões e SQL sempre parametrizado.
- Usuários, sessões, auditoria, conversas e reuniões ficam no **SQLite da aplicação**, isolado do banco analítico.

## Passo a passo (na fase de deploy)

1. Criar a role somente leitura (com aprovação): ver [DEPLOY_VPS.md](DEPLOY_VPS.md#1-role-somente-leitura).
2. Conectar por túnel SSH e preencher `DATABASE_URL` no `.env` local.
3. `npm --prefix server run introspect` gera `docs/DICIONARIO_DADOS.md` e `docs/schema-snapshot.json` (colunas, chaves, índices, funções com md5, contagens e faixas de datas).
4. Implementar os mapeamentos em [server/src/mappings.ts](../server/src/mappings.ts), **um indicador por vez**:
   - `indicatorImpls[id].compute(f)` → `{ value, recordsUsed, recordsExcluded, exclusions, updatedAt, reliability }`;
   - `indicatorImpls[id].records(f, page)` → registros de origem (drill-down);
   - `chartImpls`, `tableImpls` (respeitando `page.sort`/`page.dir`, já validados) e `dimensionImpls`.
5. Comparar cada total com uma consulta SQL independente e registrar o resultado em [HOMOLOGACAO_LOCAL.md](HOMOLOGACAO_LOCAL.md) (seção produção).
6. `npm run docs:indicators` atualiza a coluna "situação" do dicionário.

Nada mais precisa mudar: telas, relatórios, RINNE e ferramentas do n8n usam as mesmas funções.

## Regras de confiabilidade a implementar nos mapeamentos

| estado | quando usar |
|---|---|
| `VALIDADO` | fonte completa, sem conflitos em aberto no período |
| `PARCIAL` | parte dos registros excluída (informe `exclusions`) |
| `DESATUALIZADO` | coleta sem sincronização recente além do esperado |
| `PENDENTE` | coletas pendentes no período (`ingest`) |
| `EM_RECONCILIACAO` | conflitos em `audit` ou tarefas em reconciliação que afetam o período |
| `INDISPONIVEL` | não calculável |

- Um registro **não** é confiável só por estar no CORE: considerar as divergências históricas da API iClips e os conflitos financeiros em auditoria.
- Ausência de informação nunca vira zero.
- Lançamentos com data futura (ex.: os 166 de dez/2026) não entram como realizados.

## Investigações obrigatórias (herdadas da auditoria de 24/11/2026)

- Os 166 lançamentos de dez/2026: origem e diferença entre previsto e realizado.
- Hash atual do publicador financeiro, comparado com `e18f80468b341d1ba2e8c1238e4ec05e` (o introspect grava o md5 de cada função).
- Situação dos conflitos: 66 de centros de custo, 28 de documentos, 94 identificadores e 209 tarefas de projetos.
- Processamento das 34 tarefas `FIN_ENTRIES_ENTRY` reenfileiradas.
