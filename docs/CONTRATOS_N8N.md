# Contratos de integração — futuros workflows n8n

Para quem vai construir as coletas. **Nenhum workflow foi desenvolvido.** O n8n é somente a camada de integração: lê a origem e grava no PostgreSQL. Cálculos e regras ficam na aplicação.

## Antes de começar

1. Desativar **todos** os workflows antigos e apagar as credenciais PostgreSQL deles no n8n. As roles antigas não conectam, mas um workflow com credencial de **superusuário** ainda conecta: ele não consegue gravar nas tabelas novas sem a tarefa de coleta, porém a credencial deve ser removida.
2. Liberar a role de integração, com senha forte, quando a coleta for homologada (no container do banco):
   ```sql
   ALTER ROLE qi_ingest LOGIN PASSWORD '<senha forte>';
   ```
   Credencial exclusiva do n8n: host `quest-rinne-db-1`, banco `quest_rinne`, usuário `qi_ingest`. Nunca reutilizar `qi_app`, `qi_migrator` ou `postgres`.
3. O n8n precisa alcançar o container pela rede `quest-rinne_private`; a porta 5432 continua sem publicação.

## Domínios (um workflow por domínio, nesta ordem de carga)

| ordem | domínio (`resource`) | tabelas em `core` | chave de origem |
|---|---|---|---|
| 1 | `departments`, `client_groups`, `piece_catalog`, `financial_categories`, `financial_accounts` | mesmos nomes | `id` (departamentos) / `iclips_id` |
| 2 | `clients`, `employees` | `clients`, `employees`, `employee_department_links` | `iclips_id` |
| 3 | `brands`, `jobs` | `brands`, `jobs` | `(source_system, external_id)` / `iclips_id` |
| 4 | `production` | `job_tasks`, `job_pieces`, `workflow_steps` | `(job_id, iclips_id)`, `iclips_id`, `(job_piece_id, iclips_id)` |
| 5 | `timesheet` | `time_entries` | `id` |
| 6 | `financial` | `financial_entries`, `financial_entry_cost_centers` | `iclips_id`, `(financial_entry_id, source_center_id)` |
| 7 | `invoices` | `invoices` | `iclips_id` |
| 8 | `contracts` | `contracts`, `contract_versions`, `fees` | `(source_system, external_id)`, `(contract_id, version)` |

## Ciclo de uma execução

1. **Abrir a tarefa** (idempotência da execução):
   ```sql
   INSERT INTO ingest.tasks (source_code, resource, idempotency_key, mode, status, expected_total)
   VALUES ('iclips', 'clients', $1, 'incremental', 'RUNNING', $2)
   ON CONFLICT (source_code, resource, idempotency_key) DO UPDATE SET updated_at = now()
   RETURNING id, status, cursor;
   ```
   `idempotency_key`: identificador estável da execução (por exemplo, recurso + marca d'água inicial). Se voltar `SUCCEEDED`, não reprocessar.
2. **Ler o ponto de retomada:** `SELECT cursor, watermark FROM ingest.checkpoints WHERE source_code='iclips' AND resource=$1`.
3. **Por página**, em uma transação:
   - registrar `ingest.pages (task_id, page_number, record_count, payload_hash)` — a chave `(task_id, page_number)` impede contar a página duas vezes;
   - gravar os registros com *upsert*:
     ```sql
     INSERT INTO core.clients (iclips_id, name, document, ingest_task_id, source_updated_at, record_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (iclips_id) DO UPDATE SET name = excluded.name, document = excluded.document,
       ingest_task_id = excluded.ingest_task_id, source_updated_at = excluded.source_updated_at,
       record_hash = excluded.record_hash, updated_at = now()
     WHERE core.clients.record_hash IS DISTINCT FROM excluded.record_hash
       AND (core.clients.source_updated_at IS NULL OR excluded.source_updated_at >= core.clients.source_updated_at);
     ```
   - registrar `audit.publication_state (resource, source_id, task_id, record_hash)` com *upsert*;
   - atualizar `ingest.tasks.received_records`, `cursor` e `updated_at`.
4. **Fechar:** `status = 'SUCCEEDED'`, `finished_at = now()`; atualizar `ingest.checkpoints` somente após o sucesso.

## Erros e conflitos

- Falha temporária: `status = 'FAILED'`, `error_message` sem segredos; a próxima execução retoma pelo checkpoint.
- Registro rejeitado: `ingest.errors (task_id, external_id, error_code, message, retryable)`. **Não guardar o payload** nem dados pessoais.
- Referência ausente, chave divergente ou valor ambíguo: `audit.publication_conflicts (resource, source_id, reason, task_id)`; preencher `resolved_at` ao resolver. Não inventar vínculo por nome.
- Contagem esperada diferente da recebida: `status = 'RECONCILE_REQUIRED'`.
- Estados aceitos: `PENDING, QUEUED, RUNNING, PROCESSING, RECONCILE_REQUIRED, SUCCEEDED, FAILED, ERROR`.

## Regras de preenchimento que afetam os indicadores

| campo | exigência |
|---|---|
| `invoices.status` | `issued` ou `cancelled` (outros ficam fora das somas) |
| `financial_entries.entry_type` | `Entrada` ou `Saída`; `parent_id` aponta o lançamento-pai |
| `financial_categories.dre_indicator` | `RECEITAS OPERACIONAIS`, `RECEITAS NÃO OPERACIONAIS`, `DESPESAS OPERACIONAIS CUSTO FIXO`, `DESPESAS OPERACIONAIS CUSTO VARIÁVEL`, `DESPESAS NÃO OPERACIONAIS`, `IMPOSTOS`, `PARTICIPAÇÃO NOS LUCROS` |
| `time_entries.source_kind` | `TASK` (com `job_id`, `task_id`) ou `WORKFLOW` (com `workflow_step_id`, `job_piece_id`) |
| rateios | percentuais somando 100 e parcelas somando o valor original |
| datas e horas | `timestamptz` com fuso; datas de pagamento e competência como `date` |
| valores | ausente = `NULL`, nunca zero |

## O que a integração não pode fazer

Acessar o schema `app`; criar ou alterar objetos; apagar registros (exceto rateios e vínculos de departamento); alterar `core.goals`, `core.allocation_rules` e `ingest.sources` (decisões gerenciais — uma nova origem entra por migration ou por um administrador do banco).
