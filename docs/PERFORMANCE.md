# Performance — fase 3

> Registro histórico, anterior à instalação limpa em PostgreSQL. Caminhos, procedimentos e persistência citados podem ter mudado; vale [ARQUITETURA.md](ARQUITETURA.md).

Implementação local em 25/11/2026. Sem deploy, acesso à VPS, alterações no PostgreSQL/n8n ou novo banco analítico. O backend Express/TypeScript/pg continua consultando a conexão PostgreSQL configurada; SQLite permanece exclusivo da aplicação/autenticação. React/TanStack Query continua sem acesso direto ao banco.

## Causas encontradas e correções

1. Etapas resolviam o projeto por uma subconsulta correlacionada em `job_pieces`, convertendo a chave para texto. O plano sintético confirmou 500 varreduras completas de 20 mil peças para uma amostra de 500 etapas. Agora as peças são agregadas uma vez e associadas por chave; duplicidades continuam produzindo vínculo indisponível. Estimativas são restringidas às unidades trabalhadas do período/escopo, sem inventar atribuição individual ou departamental.
2. `cashSource` calculava `NOT EXISTS` na projeção de cada lançamento para excluir pais com filhos. Agora associa um conjunto distinto de referências-pai calculado uma vez. As famílias continuam integralmente excluídas, inclusive filhos fora do período. A validação de namespace, órfãos, duplicidades e autorreferências continua separada e obrigatória.
3. Sete métricas do timesheet tinham agregações independentes. Agora compartilham um SQL com `FILTER`, contadores de cobertura e denominadores próprios. Custo permanece independente para que ausência de `labor_cost` não bloqueie horas. DRE, situações de rateio e status observados também consolidam contadores. Somas monetárias continuam no PostgreSQL como `numeric`, convertidas somente após agregar.
4. Gráficos de horas e atividades agregam fatos antes de associar nomes. Tabelas financeiras, projetos e peças passam a usar cadastros agregados em conjunto, preservando indicação de cadastro duplicado e nomes ausentes. Não há escolha arbitrária de registro para resolver duplicidades.
5. Projeções opcionais do timesheet/notas são reescritas pela introspecção para a coluna comprovada ou `NULL::text`, evitando serialização de linhas inteiras com `to_jsonb`. A ausência de campo que comprova vínculo continua bloqueando o respectivo indicador.
6. Predicados de intervalo não aplicam conversão à coluna temporal indexada. Fronteiras semiabertas e interpretação por timezone permanecem, com testes de equivalência para `date`, `timestamp` e `timestamptz`.

Nenhum indicador foi removido: permanecem 107 definições e 85 implementações. A curadoria gerencial ampliou os mapeamentos para 30 gráficos e 38 tabelas; critérios pendentes continuam indisponíveis. Ver [EXPERIENCIA_GERENCIAL.md](EXPERIENCIA_GERENCIAL.md).

## Cache e autorização

O cache estrutural mantém somente colunas/constraints, por cinco minutos e com descoberta simultânea compartilhada. Integridade mutável não é tratada como estrutura: continua validada quando um resultado é recalculado. A falta de FK não invalida automaticamente um relacionamento, nem permite presumir sua semântica.

O cache analítico LRU guarda resultados em memória por 45 segundos, com limites de 256 entradas e 16 MiB, expiração na próxima operação e cópias independentes dos resultados. Não há Redis, persistência de fatos ou duplicação de registros. Erros, indisponibilidade do banco e timeouts não são armazenados. Consultas em andamento idênticas são compartilhadas dentro do mesmo usuário/escopo autorizado; não há retry SQL automático.

A autenticação, IP, permissão do módulo/item, escopo departamental e colunas são verificados novamente a cada pedido, antes de devolver dados. A chave inclui usuário, permissões efetivas ordenadas, departamento, configuração semântica, item, filtros, comparação e paginação/ordenação. Mudanças de permissões ou configuração selecionam outro namespace. As entradas antigas expiram e não são acessíveis por um usuário revogado. O teste HTTP revoga a permissão após aquecer o cache e confirma 403 sem nova leitura.

`calculatedAt` informa quando o cálculo terminou; `updatedAt` mantém a semântica anterior de atualização da fonte, quando disponível. `refreshAfterMs` desconta a idade do resultado no cache; o frontend também desconta o tempo já decorrido desde que recebeu a resposta. Assim, hits e remontagens não acrescentam outro ciclo de 60 segundos. Tempo de execução, aba oculta e fonte sem timestamp impedem prometer atualização instantânea ou certificar a publicação do n8n.

## Controle de carga e telemetria

Pool padrão: cinco conexões. Admissão SQL pesada: duas consultas, configurável até três e limitada abaixo do pool. Health/metadados usam a capacidade restante. A fila aceita até 96 consultas e expira a espera em 12 segundos. O `statement_timeout` continua em 15 segundos e a sessão permanece readonly. A admissão cobre `core`, `ingest` e `audit`; limites são por processo da API, não por cluster de réplicas.

Cada execução física registra identificador de indicador/gráfico/tabela, fingerprint SHA-256 do SQL, duração total, espera de fila, espera real de aquisição no pool, quantidade de linhas retornadas e desfecho. A duração total inclui as esperas; a diferença permite avaliar a execução. A contagem não representa todas as linhas varridas. Nenhum SQL, parâmetro, documento, nome, resultado monetário, mensagem bruta do PostgreSQL ou credencial é registrado nessa telemetria. Singleflight registra a execução uma vez, com o identificador que a iniciou. Hits não executam SQL.

## Frontend e relatórios

Cards usam endpoints independentes; o resumo do módulo não executa cards/gráficos. `GET /api/charts/:id` exige autorização própria. Gráficos/Recharts e tabelas abaixo da dobra são carregados conforme entram no viewport. Ao sair dele, suas consultas/polling são suspensos. Mantêm-se paginação SQL, detalhes apenas com gaveta aberta, skeleton individual e dados anteriores durante atualização silenciosa. Filtros analíticos têm debounce de 300 ms; a URL continua sendo a origem dos filtros.

AbortSignal cancela fetches obsoletos no navegador. Não se cancela indiscriminadamente uma consulta PostgreSQL compartilhada, pois outros consumidores autorizados podem aguardá-la; ela continua limitada pela admissão e timeout. Erros interrompem o polling do item e exigem ação do usuário, sem retry pesado automático. TanStack Query deduplica o mesmo item e pausa intervalos com a aba oculta. Relatórios e dimensões não têm timer próprio; relatórios selecionados reaproveitam indicadores/tabelas autorizados, sem calcular gráficos descartados.

## Configuração

Variáveis opcionais no ambiente **existente** da API; os defaults funcionam sem substituir o `.env` da produção:

| Variável | Padrão | Limite aceito |
|---|---:|---|
| `DATABASE_POOL_MAX` | 5 | 2–50 |
| `ANALYTICS_CONCURRENCY` | 2 | 1–3; máximo pool − 1 |
| `ANALYTICS_QUEUE_MAX` | 96 | 1–512 |
| `ANALYTICS_QUEUE_TIMEOUT_MS` | 12000 | 100–15000 |
| `ANALYTICS_CACHE_TTL_MS` | 45000 | 1000–60000 |
| `ANALYTICS_CACHE_MAX_ENTRIES` | 256 | 1–1000000 |
| `ANALYTICS_CACHE_MAX_BYTES` | 16777216 | 1024–268435456 |
| `SCHEMA_CACHE_TTL_MS` | 300000 | 1000–3600000 |
| `SQL_TELEMETRY` | ligada fora de testes | `0` desliga, `1` liga |

Valores numéricos inválidos usam o padrão. Ajustes exigem recriação/reinício do processo pelo operador. Não aumentar concorrência para compensar SQL caro.

## Índices e validação posterior

Nenhum índice novo é recomendado nesta entrega, e nenhum DDL foi gerado/executado. O plano observado justifica substituir subconsultas repetidas por associações em conjunto; não justifica um índice novo. Os índices informados foram reproduzidos nos casos aplicáveis do fixture. Uma varredura sequencial única de todo o mês pode ser apropriada.

`started_at`, chaves compostas de tarefas/etapas, pai financeiro e datas de competência/conclusão continuam candidatos **sem aprovação**. Antes de recomendar qualquer um, comparar `EXPLAIN (ANALYZE, BUFFERS)` dos SELECTs reais, com parâmetros e seletividade representativos, em ambiente autorizado, além de medir tamanho e custo de ingestão. Não é possível estimar honestamente bytes, benefício ou impacto no n8n com a validação local atual. Somente após essa evidência preparar DDL idempotente `CREATE INDEX CONCURRENTLY`, com rollback correspondente, para execução manual separada.

Diagnóstico manual, pelo operador no backend configurado: `npm run diagnose:performance`. Usa apenas SELECTs, exige sessão readonly e mostra fingerprints/esperas e estatísticas cumulativas; não revela SQL ou conteúdo de registros. Não foi executado na VPS.

## Atualização da instalação existente

Seguir [INSTALACAO_VPS.md](INSTALACAO_VPS.md), após publicação e autorização operacional. Buscar o SHA aprovado, executar `deploy/prepare-release.sh` desse SHA, revisar o diff privado com `/opt/apps/quest-rinne-web-runtime`, preservar os arquivos Compose/env efetivamente usados e só então construir/subir `api web` com o override gerado. Não copiar a fonte por cima do runtime. O preparador faz backup consistente do SQLite e preserva volumes, imagens de rollback, credenciais, role e Traefik.

Revalidar `/core/`, login/logout, cookie `Path=/core/` somente pelo backend, permissões, primeiro card, gráficos, módulos frios/quentes e exportações. Observar telemetria durante uma navegação, comparar fingerprints/esperas/contagens e verificar a atualização após publicação normal do n8n. Não executar workflows manualmente. Rodar `verify:analytics` para períodos conhecidos e o diagnóstico acima quando autorizado. Não declarar metas de produção cumpridas a partir do benchmark WASM.
