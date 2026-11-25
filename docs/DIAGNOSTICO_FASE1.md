# QUEST RINNE — Diagnóstico Fase 1 (24/11/2026)

## Repositório
- Pasta vazia, sem git, sem stack prévio → adotado o stack padrão do prompt mestre (Node/TS/Express/pg; React/Vite/Tailwind no frontend).
- Sem Docker nem `psql` na máquina de desenvolvimento. O PostgreSQL `quest_rinne` está somente na VPS (container `quest-rinne-db-1`).

## Conectividade
- **Pendente.** O host da VPS e o caminho de acesso (túnel SSH) não estão documentados no projeto.
- Existe a chave `~/.ssh/quest_rinne_key`, mas o host não foi confirmado → nenhuma conexão foi feita.
- Consequência: **schema real ainda não inspecionado**. Nenhuma consulta de negócio foi escrita, para não inventar colunas ou relacionamentos.

## Entregue nesta fase
| arquivo | função |
|---|---|
| `server/src/db.ts` | Pool `pg`; a sessão é forçada a `read_only`, `statement_timeout` 15s e TZ America/Sao_Paulo |
| `server/src/index.ts` | `GET /api/health` (prova a leitura e mostra o usuário e o modo RO), `GET /api/metadata/coverage` (tabelas reais de core/ingest/audit com volume estimado) |
| `server/src/introspect.ts` | `npm run introspect`: colunas, PK/FK/UK, índices, views, funções (md5 da definição), contagem exata e faixa min/max de cada coluna de data → `docs/schema-snapshot.json` + `docs/DICIONARIO_DADOS.md` |
| `sql/001_create_readonly_role.sql` | Cria `quest_rinne_app_ro` (CONNECT, USAGE, SELECT). **Não executado.** |
| `.env.example`, `.gitignore` | Configuração sem segredos |

## Próximo passo (depende do acesso)
1. Abrir o túnel SSH, criar a role RO (após aprovação) e preencher `.env`.
2. `npm run introspect` → mapear relacionamentos reais, campos financeiros (lançamento × fatura × recebimento × competência), status de conclusão, os 166 lançamentos de dez/2026 e as tabelas de conflito em `audit`.
3. Fase 2/3: endpoints do dashboard sobre as colunas confirmadas e frontend.
