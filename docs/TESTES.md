# Testes da integração

| Verificação | Resultado local |
|---|---|
| `npm test` | 95 backend + 15 interface aprovados |
| `npm run typecheck` | server e web aprovados |
| `npm run build` | build de produção aprovado |
| `npm run homologacao` | 36 verificações Playwright/Edge na raiz |
| `VITE_BASE_PATH=/core/ npm run homologacao` | 36 verificações com prefixo público e cookie em `/core/` |
| Auditorias de raiz/server/web/e2e | sem vulnerabilidades reportadas na entrega |

Em PowerShell: `$env:VITE_BASE_PATH='/core/'; npm run homologacao`; depois restaure a variável para builds na raiz.

Testes preservam autenticação, CSRF, IPs, sessões, permissões, escopo e exportações. A API usa SQLite descartável apenas para autenticação; SQL analítico roda em PostgreSQL embarcado PGlite com fixtures sintéticas em memória. SQLite não valida sintaxe PostgreSQL.

`analytics.test.ts`, `analytics-api.test.ts` e `schema-profile.test.ts` verificam introspecção, tipos incompatíveis, joins sem multiplicação, fallback de durações, retrabalho, custo registrado, nulos e sinais, notas canceladas, datas futuras, timezone, fronteiras semiabertas, registros reconciliando cards, paginação vazia, filtros incompatíveis, escopo em dimensões/detalhes/relatórios, perfis financeiros ambíguos e famílias pai/filho. Fotografias atuais não fabricam comparação histórica.

Os testes HTTP usam a API real; somente o transporte `pg` é substituído pelo motor PostgreSQL em memória. Não há fixtures nem dados simulados nos mapeamentos da aplicação em produção.

`integration-corrections.test.ts` cobre nomes diferentes dos IDs, homônimos, cadastro incompleto/duplicado, ID interno de departamento diferente da origem, fallback histórico, estimativa repetida por atividade e cobertura parcial, chaves compostas, custo registrado sem duplicar taxa, pais órfãos de A Pagar fora do escopo, parentes fora do período, rateio não presumido, políticas independentes e perfil de origem validado. A API verifica remoção de custos em linhas, drill-down e relatórios de perfis operacionais.

`verify-analytics.test.ts` executa o verificador com transporte PostgreSQL de teste, conferindo referências, continuidade com fontes ausentes, saída parcial e ausência de nomes/valores privados no log. Não conecta à produção. O runner limita a concorrência a dois arquivos: a ampliação das fixtures PGlite excedeu a memória disponível na execução irrestrita; todos os testes foram repetidos com a concorrência limitada, sem reduzir as verificações.

A revisão cobre `parent_entry_source_id` em namespace diferente de `iclips_id`, referências válidas sem FK, órfãos, ambiguidade, consultas válidas sem colunas alheias ao cálculo e compartilhamento de SELECTs sem misturar escopos ou guardar dados entre pedidos. Os testes operacionais verificam a geração do override mínimo, preservação de ambiente/volumes/labels/portas e backup SQLite consistente em conexão somente leitura. O script de preparação passou em `bash -n`; não foi executado na VPS ou em Docker real.

O E2E cobre login, senha obrigatória, logout, navegação, relatórios/downloads, impressão, perfis, filtros, ausência do banco e responsividade. Evidências locais em `e2e/output/`, ignoradas pelo Git. Não comprova números reais, nginx/Traefik ou Docker em execução.

Após atualização, executar manualmente o verificador somente leitura de [INTEGRACAO_POSTGRESQL.md](INTEGRACAO_POSTGRESQL.md) e reconciliar os domínios. Nenhum teste acessou produção.
