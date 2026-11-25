# Testes

| camada | comando | quantidade | cobre |
|---|---|---|---|
| API (node:test) | `npm --prefix server test` | **45** em 6 arquivos | autenticação, autorização por perfil/coluna/escopo, bloqueio por IP e falsificação de cabeçalhos, endpoints, filtros, paginação, relatórios (CSV/XLSX/MD), estados sem PostgreSQL, migrations |
| Interface (vitest) | `npm --prefix web test` | **12** | menu por perfil, colunas sensíveis, bloqueio de câmera/microfone/localização no nginx, formatação pt-BR |
| Tipos | `npm run typecheck` | server + web | — |
| Build | `npm run build` | web | bundle de produção |
| Dependências | `npm --prefix server audit` · `npm --prefix web audit` | — | não garante ausência de falhas |
| Ponta a ponta | `npm run homologacao` | ver [HOMOLOGACAO_LOCAL.md](HOMOLOGACAO_LOCAL.md) | Playwright + Edge, **build de produção**, banco da aplicação temporário |

Os testes da API sobem a API real com um SQLite temporário, **sem PostgreSQL e sem serviços externos**. Usuários e senhas dos testes são fixtures que só existem neles.

## O que ainda não é testável localmente

Cálculos com dados reais, o PostgreSQL de produção, o nginx em execução (só os arquivos de configuração são testados) e os containers Docker. Ver [PENDENCIAS_PRODUCAO.md](PENDENCIAS_PRODUCAO.md).
