# Benchmarks locais — fase 3 consolidada

Execução em 25/11/2026, Windows/Node 24.19.0, PGlite/WASM com dados exclusivamente sintéticos. Sem PostgreSQL externo, VPS ou Docker nativo. As medições não certificam produção.

## Reprodução

Execute `npm --prefix server run benchmark`. O script define modo de teste antes de importar o backend. Gera 200 mil apontamentos, 50 mil lançamentos, 80 mil etapas, 25 mil tarefas, 20 mil peças, 4 mil projetos, 100 colaboradores, 30 departamentos e 100 clientes. Nenhum fixture é instalado na aplicação de produção. Planos e resultados detalhados ficam em e2e/output/performance.private.json, ignorado pelo Git.

Frio significa sem cache analítico da aplicação; engine e buffers já inicializados. Cinco amostras frias e 20 aquecidas: p95 de cinco amostras é o maior valor observado, sem representatividade estatística de produção. Medidas únicas não são percentis.

## Antes e depois

| Caso | Antes | Depois | Consultas antes → depois |
|---|---:|---:|---:|
| Sete cards de horas, mesmo período | 2345.82 ms | 471.85 ms | 7 → 1 |
| Vínculo etapa/peça, EXPLAIN ANALYZE de 500 etapas | 946.486 ms | 23.496 ms | Uma consulta em cada caso |

O plano antigo varreu job_pieces 500 vezes, removendo 19.999 linhas por filtro em cada execução. O novo fez uma varredura das 20 mil peças. A amostra limita as etapas consultadas, mantendo os cadastros completos; não estima o tempo integral do SQL anterior com 80 mil etapas na VPS. A versão financeira com busca correlacionada por lançamento foi interrompida no WASM; não foi atribuído um tempo fictício de baseline HTTP.

## Resultados atuais

| Caso | Tempo | Consultas físicas |
|---|---:|---:|
| Atividades, com descoberta do reader de teste | 1821.89 ms | 3 |
| Agregado DRE por pagamentos | 121.64 ms | 4 |
| Agregado frio, n=5 | p50 390.34 ms; p95 393.03 ms | Uma por amostra |
| Agregado em cache, n=20 | p50 0.17 ms; p95 0.21 ms | 0 |
| API executivo | 1317.61 ms | 12 |
| API financeiro | 315.46 ms | 12 |
| API producao | 3059.56 ms | 12 |
| Relatório financeiro após os módulos | 128.18 ms | 3 |
| API financeiro aquecida, n=20 | p50 8.51 ms; p95 10.36 ms | 0 |
| Nova tabela clients, página de 25 linhas | 284.52 ms | 6 |
| Nova tabela projects, página de 25 linhas | 2139.61 ms | 8 |
| Nova tabela records, página de 25 linhas | 2374.6 ms | 5 |

Os módulos são medidos em sequência executivo → financeiro → produção, após três cards de outro período. Há reuso autorizado de itens. A API de módulo inclui cards/gráficos, não todas as tabelas nem a renderização do navegador. O relatório é medido depois dos módulos. As novas tabelas usam reader direto no engine e suas contagens incluem introspecção do adaptador; não são benchmark HTTP isolado ou do PostgreSQL nativo. Não existe baseline HTTP completo equivalente da fase anterior.

A primeira conclusão observada pelo cliente HTTP para três cards frios em paralelo foi 2088.93 ms; os três terminaram em 2089.8 ms. A meta de primeiro card em um segundo não foi comprovada. O WASM executa no mesmo processo do cliente de teste e interfere no event loop; é necessária medição com PostgreSQL externo, sem atribuir automaticamente esse comportamento à VPS.

O teste de admissão com 12 tarefas chegou ao pico de 2 execuções. Isso não constitui teste de carga de processos PostgreSQL concorrentes. RSS observado: 595279872 bytes; heap usado: 39891176 bytes. Incluem engine, fixtures e API temporária, não representam o backend nativo. O cache permanece limitado a 16 MiB de conteúdo serializado.

## Verificação e limites

130 testes de backend e 19 de frontend aprovados; typecheck e build aprovados. Playwright/Edge: 42 verificações sem banco em cada base, / e /core/; onze fluxos com Express e PGlite readonly/dados sintéticos em cada base. Capturas desktop/celular inspecionadas. Auditorias npm de raiz/server/web/e2e: zero vulnerabilidades reportadas.

Testes incluem equivalência dos sete agregados com SQL anterior, três tipos temporais em três timezones, cache após revogação real de permissão, isolamento por usuário/escopo/configuração, limites de bytes/TTL/LRU, singleflight, fila/timeouts, pesquisa antes de paginar, exportação sem vazamento, documentos ambíguos, ausência de margem completa, estimativas sem rateio, identidade composta das atividades, projetos com campos opcionais ausentes, referências financeiras sem cadastro e status de fontes diferentes.

Navegação visual em 300 ms, primeiro card em 1 s, gráficos em 2 s, página completa em 3 s e relatórios em 5 s não estão certificados em produção. Endpoints locais favoráveis não substituem medições de rede, distribuição real dos dados, concorrência e publicações n8n. Nenhum índice novo foi recomendado sem planos nativos representativos.

Ver [PERFORMANCE.md](PERFORMANCE.md), [EXPERIENCIA_GERENCIAL.md](EXPERIENCIA_GERENCIAL.md) e [ATUALIZACAO_PRODUCAO.md](ATUALIZACAO_PRODUCAO.md). Após publicação e atualização manual autorizadas, reconciliar os indicadores pelo backend existente e repetir os tempos/planos com dados reais. Não aumentar pool ou timeout para mascarar SQL caro.
