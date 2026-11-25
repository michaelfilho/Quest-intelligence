# Pendências para produção

Ficam pendentes apenas as atividades que exigem integração externa ou infraestrutura de produção.

| # | pendência | depende de | referência |
|---|---|---|---|
| 1 | Conectar ao PostgreSQL real (túnel/rede + role somente leitura aprovada) | VPS, aprovação | [DEPLOY_VPS.md](DEPLOY_VPS.md) |
| 2 | Inspecionar o schema verdadeiro (`npm run introspect`) | 1 | [INTEGRACAO_POSTGRESQL.md](INTEGRACAO_POSTGRESQL.md) |
| 3 | Implementar os mapeamentos SQL (`server/src/mappings.ts`) | 2 | idem |
| 4 | Alimentar os indicadores com dados reais | 3 | — |
| 5 | Validar cálculos financeiros e operacionais contra SQL independente | 4 | [TESTES.md](TESTES.md) |
| 6 | Criar e configurar os workflows de IA no n8n (contrato 1.0) | n8n | [CONTRATOS_WEBHOOKS.md](CONTRATOS_WEBHOOKS.md) |
| 7 | Configurar provedores de IA **somente no n8n** | 6 | [INTEGRACAO_N8N.md](INTEGRACAO_N8N.md) |
| 8 | Configurar reconhecimento e síntese de voz no n8n | 6 | [RINNE_VOZ.md](RINNE_VOZ.md) |
| 9 | Vincular os webhooks (URL, segredo, rede, `RINNE_N8N_ENABLED=true`) | 6 | [DEPLOY_VPS.md](DEPLOY_VPS.md#6-conectar-o-n8n) |
| 10 | Validar as ferramentas de consulta com dados reais e usuário restrito | 3, 9 | [FERRAMENTAS_RINNE.md](FERRAMENTAS_RINNE.md) |
| 11 | Homologar a RINNE IA | 9, 10 | [RINNE_IA.md](RINNE_IA.md) |
| 12 | Homologar a RINNE Voz (HTTPS, microfone, motores do n8n) | 8, 15 | [RINNE_VOZ.md](RINNE_VOZ.md) |
| 13 | Homologar o Modo reunião completo (reunião longa real) | 9 | [MODO_REUNIAO.md](MODO_REUNIAO.md) |
| 14 | Validar os containers Docker (build e execução reais) | VPS / Docker | [DEPLOY_VPS.md](DEPLOY_VPS.md) |
| 15 | Configurar HTTPS e proxy reverso; conferir `REAL_IP_FROM`/`TRUST_PROXY` | VPS | [SEGURANCA.md](SEGURANCA.md) |
| 16 | Homologar o bloqueio por IP (de dentro e de fora da lista) | 15 | [SEGURANCA.md](SEGURANCA.md) |
| 17 | Validar a integração com as sincronizações existentes (QPF-00, `ingest`, `audit`) | 2 | [INTEGRACAO_POSTGRESQL.md](INTEGRACAO_POSTGRESQL.md) |
| 18 | Executar o deploy | aprovação | [DEPLOY_VPS.md](DEPLOY_VPS.md) |
| 19 | Homologar a produção | 18 | [HOMOLOGACAO_LOCAL.md](HOMOLOGACAO_LOCAL.md) |

## Decisões que dependem da Quest (sem elas os indicadores ficam "DADOS INSUFICIENTES")

- Metodologia de custo/hora por colaborador (custos de pessoal e mão de obra).
- Critério oficial de "entrega".
- Fonte de jornada e capacidade dos colaboradores.
- Estrutura de contratos e escopos (contratado × executado).
- Classificação de custos diretos, indiretos e variáveis (margem de contribuição).

**As funcionalidades de IA não estão operacionais enquanto os workflows reais do n8n não forem conectados e testados.**
