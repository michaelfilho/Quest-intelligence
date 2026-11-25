# Pendências para produção

Ficam pendentes apenas as atividades que exigem o PostgreSQL real ou a infraestrutura de produção.

| # | pendência | depende de | referência |
|---|---|---|---|
| 1 | Conectar ao PostgreSQL real (túnel/rede + role somente leitura aprovada) | VPS, aprovação | [DEPLOY_VPS.md](DEPLOY_VPS.md) |
| 2 | Inspecionar o schema verdadeiro (`npm run introspect`) | 1 | [INTEGRACAO_POSTGRESQL.md](INTEGRACAO_POSTGRESQL.md) |
| 3 | Implementar os mapeamentos SQL (`server/src/mappings.ts`) | 2 | idem |
| 4 | Alimentar os indicadores com dados reais | 3 | — |
| 5 | Validar cálculos financeiros e operacionais contra SQL independente | 4 | [TESTES.md](TESTES.md) |
| 6 | Investigar os 166 lançamentos de dez/2026, os conflitos em `audit` e as tarefas reenfileiradas | 2 | [INTEGRACAO_POSTGRESQL.md](INTEGRACAO_POSTGRESQL.md) |
| 7 | Validar a leitura das sincronizações existentes (QPF-00, `ingest`, `audit`) na tela Qualidade dos dados | 2 | idem |
| 8 | Validar os containers Docker (build e execução reais) | VPS / Docker | [DEPLOY_VPS.md](DEPLOY_VPS.md) |
| 9 | HTTPS, proxy reverso, `REAL_IP_FROM`/`TRUST_PROXY` e cabeçalhos efetivos | VPS | [SEGURANCA.md](SEGURANCA.md) |
| 10 | Homologar o bloqueio por IP (de dentro e de fora da lista) | 9 | [SEGURANCA.md](SEGURANCA.md) |
| 11 | Executar o deploy | aprovação | [DEPLOY_VPS.md](DEPLOY_VPS.md) |
| 12 | Homologar a produção | 11 | [HOMOLOGACAO_LOCAL.md](HOMOLOGACAO_LOCAL.md) |

## Decisões que dependem da Quest (sem elas os indicadores ficam "DADOS INSUFICIENTES")

- Metodologia de custo/hora por colaborador (custos de pessoal e mão de obra).
- Critério oficial de "entrega".
- Fonte de jornada e capacidade dos colaboradores.
- Estrutura de contratos e escopos (contratado × executado).
- Classificação de custos diretos, indiretos e variáveis (margem de contribuição).

## Evolução futura (fora da 1.0)

IA, voz e Modo reunião. Código arquivado na branch `archive/ia-voz-reuniao`.
