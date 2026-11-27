-- EXCLUSIVO DE TESTES. Dados sintéticos para a navegação com consultas reais; nunca aplicado em instalação.
INSERT INTO ingest.tasks (source_code, resource, idempotency_key, status) VALUES ('iclips', 'fixture', 'homologacao', 'SUCCEEDED');
SELECT set_config('qi.task', (SELECT id::text FROM ingest.tasks WHERE idempotency_key = 'homologacao'), false);

INSERT INTO core.client_groups (iclips_id, name, ingest_task_id) VALUES (5, 'Grupo Exemplo', current_setting('qi.task')::bigint);
INSERT INTO core.clients (iclips_id, name, document, ingest_task_id)
  SELECT v.id, v.name, v.doc, current_setting('qi.task')::bigint FROM (VALUES (10, 'Cliente Aurora', '12345678909'), (20, 'Cliente Horizonte', NULL), (30, 'Cliente % literal', NULL)) v(id, name, doc);
INSERT INTO core.departments (id, iclips_id, name, ingest_task_id)
  SELECT v.id, v.n, v.name, current_setting('qi.task')::bigint FROM (VALUES ('A', 901, 'Criação'), ('B', 902, 'Operações')) v(id, n, name);
INSERT INTO core.employees (iclips_id, name, main_department_id, ingest_task_id)
  SELECT v.id, v.name, v.dep, current_setting('qi.task')::bigint FROM (VALUES (1, 'Ana Lima', 'B'), (2, 'Ana Lima', 'A'), (3, NULL, 'A')) v(id, name, dep);
INSERT INTO core.jobs (iclips_id, name, client_id, client_group_id, principal_employee_id, status_text, entered_at, completed_at, expected_end_at, ingest_task_id)
  SELECT v.id, v.name, v.client, 5, v.employee, 'Exemplo', v.entered::timestamptz, v.completed::timestamptz, v.expected::timestamptz, current_setting('qi.task')::bigint
  FROM (VALUES (1, 'Campanha Aurora', 10, 1, '2026-01-05', '2026-01-15', NULL), (2, 'Projeto Horizonte', 20, 2, '2026-01-06', NULL, '2099-01-15')) v(id, name, client, employee, entered, completed, expected);
INSERT INTO core.job_tasks (job_id, iclips_id, name, estimated_minutes, description, ingest_task_id)
  VALUES (1, 7, 'Criação da campanha', 60, 'Descrição sintética da tarefa', current_setting('qi.task')::bigint);
INSERT INTO core.job_pieces (iclips_id, job_id, name, ingest_task_id) VALUES (11, 2, 'Peça Horizonte', current_setting('qi.task')::bigint);
INSERT INTO core.workflow_steps (job_piece_id, iclips_id, name, estimated_minutes, description, ingest_task_id)
  VALUES (11, 7, 'Etapa Horizonte', 120, 'Descrição sintética da etapa', current_setting('qi.task')::bigint);
INSERT INTO core.time_entries (id, job_id, employee_id, department_id, started_at, finished_at, duration_seconds, duration_minutes, is_rework, labor_cost, source_kind, task_id, workflow_step_id, job_piece_id, ingest_task_id)
  SELECT v.id, v.job, v.employee, v.dep, v.started::timestamptz, v.finished::timestamptz, v.seconds, v.minutes, v.rework, v.cost, v.kind, v.task, v.step, v.piece, current_setting('qi.task')::bigint
  FROM (VALUES
    (1, 1, 1, 'A', '2026-01-05', '2026-01-05 01:00', 3600, 60, false, 100, 'TASK', 7, NULL::int, NULL::int),
    (2, 1, 1, 'A', '2026-01-05 02:00', '2026-01-05 02:30', NULL::int, 30, true, NULL::int, 'TASK', 7, NULL, NULL),
    (5, 2, 2, 'B', '2026-01-06', NULL, 7200, 120, false, 50, 'WORKFLOW', NULL::int, 7, 11)
  ) v(id, job, employee, dep, started, finished, seconds, minutes, rework, cost, kind, task, step, piece);
INSERT INTO core.invoices (iclips_id, invoice_number, status, issued_at, competence_date, service_amount, net_amount, iss_amount, client_name, client_document, ingest_task_id)
  SELECT v.id, v.n, v.status, v.issued::timestamptz, v.issued::date, v.service, v.net, v.iss, 'Fixture', v.doc, current_setting('qi.task')::bigint
  FROM (VALUES (1, 'N1', 'issued', '2026-01-05', 100, 90, 10, '123.456.789-09'), (2, 'N2', 'cancelled', '2026-01-06', 999, 999, 0, NULL), (3, 'N3', 'issued', '2026-01-07', -10, -9, -1, '123.456.789-09')) v(id, n, status, issued, service, net, iss, doc);
INSERT INTO core.financial_categories (iclips_id, name, dre_indicator, ingest_task_id)
  SELECT v.id, v.name, v.dre, current_setting('qi.task')::bigint FROM (VALUES (1, 'Receita fixture', 'RECEITAS OPERACIONAIS'), (2, 'Despesa fixture', 'DESPESAS OPERACIONAIS CUSTO FIXO')) v(id, name, dre);
INSERT INTO core.financial_accounts (iclips_id, name, ingest_task_id) VALUES (1, 'Conta fixture', current_setting('qi.task')::bigint);
INSERT INTO core.financial_entries (iclips_id, entry_type, amount, payment_date, category_id, job_id, account_id, ingest_task_id)
  SELECT v.id, v.type, v.amount, v.paid::date, v.category, 1, 1, current_setting('qi.task')::bigint FROM (VALUES (100, 'Entrada', 1000, '2026-01-10', 1), (101, 'Saída', 100, '2026-01-11', 2)) v(id, type, amount, paid, category);

-- Estruturas novas
INSERT INTO core.brands (external_id, name, client_id, ingest_task_id) VALUES ('m1', 'Marca fixture', 10, current_setting('qi.task')::bigint);
INSERT INTO core.contracts (external_id, name, client_id, starts_on, ingest_task_id) VALUES ('c1', 'Contrato fixture', 10, '2026-01-01', current_setting('qi.task')::bigint);
INSERT INTO core.contract_versions (contract_id, version, effective_on, amount, description, ingest_task_id)
  SELECT id, 1, '2026-01-01', 500, 'Versão inicial fixture', current_setting('qi.task')::bigint FROM core.contracts WHERE external_id = 'c1';
