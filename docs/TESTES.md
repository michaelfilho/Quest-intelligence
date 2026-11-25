# Testes da integração

| Verificação | Resultado local |
|---|---|
| `npm test` | 66 backend + 14 interface aprovados |
| `npm run typecheck` | server e web aprovados |
| `npm run build` | build de produção aprovado |
| `npm run homologacao` | 35 verificações Playwright/Edge na raiz |
| `VITE_BASE_PATH=/core/ npm run homologacao` | 35 verificações com prefixo público e cookie em `/core/` |
| Auditorias de raiz/server/web/e2e | sem vulnerabilidades reportadas na entrega |

Em PowerShell: `$env:VITE_BASE_PATH='/core/'; npm run homologacao`; depois restaure a variável para builds na raiz.

Testes preservam autenticação, CSRF, IPs, sessões, permissões, escopo e exportações. A API usa SQLite descartável apenas para autenticação; SQL analítico roda em PostgreSQL embarcado PGlite com fixtures sintéticas em memória. SQLite não valida sintaxe PostgreSQL.

`analytics.test.ts`, `analytics-api.test.ts` e `schema-profile.test.ts` verificam introspecção, tipos incompatíveis, joins sem multiplicação, fallback de durações, retrabalho, custo registrado, nulos e sinais, notas canceladas, datas futuras, timezone, fronteiras semiabertas, registros reconciliando cards, paginação vazia, filtros incompatíveis, escopo em dimensões/detalhes/relatórios, perfis financeiros ambíguos e famílias pai/filho. Fotografias atuais não fabricam comparação histórica.

Os testes HTTP usam a API real; somente o transporte `pg` é substituído pelo motor PostgreSQL em memória. Não há fixtures nem dados simulados nos mapeamentos da aplicação em produção.

O E2E cobre login, senha obrigatória, logout, navegação, relatórios/downloads, impressão, perfis, filtros, ausência do banco e responsividade. Evidências locais em `e2e/output/`, ignoradas pelo Git. Não comprova números reais, nginx/Traefik ou Docker em execução.

Após atualização, executar manualmente o verificador somente leitura de [INTEGRACAO_POSTGRESQL.md](INTEGRACAO_POSTGRESQL.md) e reconciliar os domínios. Nenhum teste acessou produção.
