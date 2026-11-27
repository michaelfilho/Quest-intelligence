-- Dados empresariais (core), controle de integração (ingest) e rastreabilidade (audit). Nasce vazio.
CREATE SCHEMA ingest;
CREATE SCHEMA audit;
CREATE SCHEMA core;
COMMENT ON SCHEMA core IS 'Dados empresariais publicados pela integração. A aplicação apenas lê.';
COMMENT ON SCHEMA ingest IS 'Controle das coletas: origens, tarefas, páginas, checkpoints e erros.';
COMMENT ON SCHEMA audit IS 'Rastreabilidade da publicação e conflitos.';

-- ---------------- Integração ----------------
CREATE TABLE ingest.sources (
  code        text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  description text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ingest.sources IS 'Sistemas de origem autorizados.';
INSERT INTO ingest.sources (code, description) VALUES ('iclips', 'ERP de agência (origem principal)'), ('manual', 'Cadastro gerencial aprovado');

CREATE TABLE ingest.tasks (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_code      text NOT NULL REFERENCES ingest.sources(code),
  resource         text NOT NULL,
  idempotency_key  text NOT NULL,
  mode             text NOT NULL DEFAULT 'incremental' CHECK (mode IN ('full','incremental')),
  status           text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','QUEUED','RUNNING','PROCESSING','RECONCILE_REQUIRED','SUCCEEDED','FAILED','ERROR')),
  expected_total   integer CHECK (expected_total >= 0),
  received_records integer NOT NULL DEFAULT 0 CHECK (received_records >= 0),
  cursor           text,
  error_message    text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_code, resource, idempotency_key)
);
CREATE INDEX tasks_status ON ingest.tasks (status, updated_at);
COMMENT ON TABLE ingest.tasks IS 'Uma execução de coleta. Toda linha publicada em core aponta para a tarefa que a gravou.';

CREATE TABLE ingest.pages (
  task_id      bigint NOT NULL REFERENCES ingest.tasks(id) ON DELETE CASCADE,
  page_number  integer NOT NULL CHECK (page_number >= 1),
  record_count integer NOT NULL CHECK (record_count >= 0),
  payload_hash text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, page_number)
);
COMMENT ON TABLE ingest.pages IS 'Paginação recebida; a chave impede contar a mesma página duas vezes.';

CREATE TABLE ingest.checkpoints (
  source_code   text NOT NULL REFERENCES ingest.sources(code),
  resource      text NOT NULL,
  cursor        text,
  watermark     timestamptz,
  last_task_id  bigint REFERENCES ingest.tasks(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_code, resource)
);
COMMENT ON TABLE ingest.checkpoints IS 'Ponto de retomada da atualização incremental.';

CREATE TABLE ingest.errors (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id     bigint NOT NULL REFERENCES ingest.tasks(id) ON DELETE CASCADE,
  external_id text,
  error_code  text NOT NULL,
  message     text NOT NULL,
  retryable   boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX errors_task ON ingest.errors (task_id);
COMMENT ON TABLE ingest.errors IS 'Registros rejeitados. Não armazenar payloads nem dados pessoais.';

-- ---------------- Rastreabilidade ----------------
CREATE TABLE audit.publication_state (
  resource     text NOT NULL,
  source_id    text NOT NULL,
  task_id      bigint REFERENCES ingest.tasks(id),
  record_hash  text,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource, source_id)
);
COMMENT ON TABLE audit.publication_state IS 'Última versão publicada de cada registro de origem.';

CREATE TABLE audit.publication_conflicts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource    text NOT NULL,
  source_id   text NOT NULL,
  reason      text NOT NULL,
  task_id     bigint REFERENCES ingest.tasks(id),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX publication_conflicts_open ON audit.publication_conflicts (resource, source_id) WHERE resolved_at IS NULL;
COMMENT ON TABLE audit.publication_conflicts IS 'Registros que não puderam ser publicados sem revisão.';

-- ---------------- Cadastros ----------------
-- Colunas de rastreio em toda tabela integrada:
--   source_system      origem                       ingest_task_id  tarefa que gravou (obrigatória)
--   source_updated_at  data de alteração na origem  record_hash     detecta alteração (idempotência)
-- As chaves estrangeiras são adiáveis: a carga pode gravar pai e filho na mesma transação.

CREATE TABLE core.client_groups (
  iclips_id bigint PRIMARY KEY, name text,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE core.client_groups IS 'Grupos empresariais.';

CREATE TABLE core.clients (
  iclips_id bigint PRIMARY KEY, name text, document text,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clients_document ON core.clients (document);
COMMENT ON TABLE core.clients IS 'Clientes.';

CREATE TABLE core.departments (
  id text PRIMARY KEY, iclips_id bigint UNIQUE, name text,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE core.departments IS 'Departamentos.';

CREATE TABLE core.employees (
  iclips_id bigint PRIMARY KEY, name text, job_title text,
  main_department_id text REFERENCES core.departments(id) DEFERRABLE INITIALLY DEFERRED,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employees_department ON core.employees (main_department_id);
COMMENT ON TABLE core.employees IS 'Colaboradores.';

CREATE TABLE core.employee_department_links (
  employee_id bigint NOT NULL REFERENCES core.employees(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  department_id text NOT NULL REFERENCES core.departments(id) DEFERRABLE INITIALLY DEFERRED,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, department_id)
);
COMMENT ON TABLE core.employee_department_links IS 'Vínculos adicionais entre colaborador e departamento.';

CREATE TABLE core.brands (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, external_id text NOT NULL, name text NOT NULL, status text,
  client_id bigint REFERENCES core.clients(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, external_id)
);
CREATE INDEX brands_client ON core.brands (client_id);
COMMENT ON TABLE core.brands IS 'Marcas dos clientes (aguarda fonte).';

-- ---------------- Projetos e produção ----------------
CREATE TABLE core.jobs (
  iclips_id bigint PRIMARY KEY, name text,
  client_id bigint REFERENCES core.clients(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  client_group_id bigint REFERENCES core.client_groups(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  brand_id bigint REFERENCES core.brands(id) DEFERRABLE INITIALLY DEFERRED,
  principal_employee_id bigint REFERENCES core.employees(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  auxiliary_employee_id bigint REFERENCES core.employees(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  status_text text, entered_at timestamptz, completed_at timestamptz, expected_end_at timestamptz,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_client ON core.jobs (client_id);
CREATE INDEX jobs_group ON core.jobs (client_group_id);
CREATE INDEX jobs_entered ON core.jobs (entered_at);
CREATE INDEX jobs_completed ON core.jobs (completed_at);
CREATE INDEX jobs_principal ON core.jobs (principal_employee_id);
COMMENT ON TABLE core.jobs IS 'Projetos / jobs.';

CREATE TABLE core.piece_catalog (
  iclips_id bigint PRIMARY KEY, name text,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE core.piece_catalog IS 'Catálogo de tipos de peça / serviço.';

CREATE TABLE core.job_pieces (
  iclips_id bigint PRIMARY KEY, name text,
  job_id bigint NOT NULL REFERENCES core.jobs(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  catalog_piece_id bigint REFERENCES core.piece_catalog(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_pieces_job ON core.job_pieces (job_id);
COMMENT ON TABLE core.job_pieces IS 'Peças de cada projeto.';

CREATE TABLE core.job_tasks (
  job_id bigint NOT NULL REFERENCES core.jobs(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  iclips_id bigint NOT NULL, name text, description text, estimated_minutes numeric,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, iclips_id)
);
COMMENT ON TABLE core.job_tasks IS 'Tarefas dos projetos.';

CREATE TABLE core.workflow_steps (
  job_piece_id bigint NOT NULL REFERENCES core.job_pieces(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  iclips_id bigint NOT NULL, name text, description text, estimated_minutes numeric,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_piece_id, iclips_id)
);
COMMENT ON TABLE core.workflow_steps IS 'Etapas das peças.';

CREATE TABLE core.time_entries (
  id bigint PRIMARY KEY,
  job_id bigint REFERENCES core.jobs(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  employee_id bigint REFERENCES core.employees(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  department_id text REFERENCES core.departments(id) DEFERRABLE INITIALLY DEFERRED,
  source_kind text CHECK (source_kind IN ('TASK','WORKFLOW')),
  task_id bigint, workflow_step_id bigint, job_piece_id bigint,
  started_at timestamptz, finished_at timestamptz, completed_at timestamptz,
  duration_seconds numeric, duration_minutes numeric, is_rework boolean, labor_cost numeric(18,2),
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_entries_started ON core.time_entries (started_at);
CREATE INDEX time_entries_job ON core.time_entries (job_id);
CREATE INDEX time_entries_employee ON core.time_entries (employee_id, started_at);
CREATE INDEX time_entries_department ON core.time_entries (department_id, started_at);
COMMENT ON TABLE core.time_entries IS 'Apontamentos de horas.';

-- ---------------- Financeiro ----------------
CREATE TABLE core.financial_categories (
  iclips_id bigint PRIMARY KEY, name text, dre_indicator text,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE core.financial_categories IS 'Categorias financeiras e sua classificação gerencial.';

CREATE TABLE core.financial_accounts (
  iclips_id bigint PRIMARY KEY, name text,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE core.financial_accounts IS 'Contas financeiras.';

CREATE TABLE core.financial_entries (
  iclips_id bigint PRIMARY KEY,
  parent_id bigint REFERENCES core.financial_entries(iclips_id) DEFERRABLE INITIALLY DEFERRED CHECK (parent_id <> iclips_id),
  entry_type text, amount numeric(18,2), payment_date date, competence_date date,
  category_id bigint REFERENCES core.financial_categories(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  account_id bigint REFERENCES core.financial_accounts(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  job_id bigint REFERENCES core.jobs(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX financial_entries_payment ON core.financial_entries (payment_date);
CREATE INDEX financial_entries_competence ON core.financial_entries (competence_date);
CREATE INDEX financial_entries_parent ON core.financial_entries (parent_id);
CREATE INDEX financial_entries_category ON core.financial_entries (category_id);
CREATE INDEX financial_entries_job ON core.financial_entries (job_id);
COMMENT ON TABLE core.financial_entries IS 'Movimentações financeiras.';

CREATE TABLE core.financial_entry_cost_centers (
  financial_entry_id bigint NOT NULL REFERENCES core.financial_entries(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  source_center_id bigint NOT NULL, name text, percentage numeric, amount numeric(18,2),
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (financial_entry_id, source_center_id)
);
COMMENT ON TABLE core.financial_entry_cost_centers IS 'Rateio das movimentações por centro de custo.';

CREATE TABLE core.invoices (
  iclips_id bigint PRIMARY KEY, invoice_number text, status text, issued_at timestamptz, competence_date date,
  service_amount numeric(18,2), net_amount numeric(18,2), iss_amount numeric(18,2),
  client_name text, client_document text, last_seen_at timestamptz,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_issued ON core.invoices (issued_at);
CREATE INDEX invoices_competence ON core.invoices (competence_date);
CREATE INDEX invoices_document ON core.invoices (client_document);
COMMENT ON TABLE core.invoices IS 'Notas fiscais.';

-- ---------------- Comercial ----------------
CREATE TABLE core.contracts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, external_id text NOT NULL, name text NOT NULL, contract_type text, status text,
  client_id bigint REFERENCES core.clients(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  brand_id bigint REFERENCES core.brands(id) DEFERRABLE INITIALLY DEFERRED,
  starts_on date, ends_on date,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, external_id),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX contracts_client ON core.contracts (client_id);
COMMENT ON TABLE core.contracts IS 'Contratos (aguarda fonte).';

CREATE TABLE core.contract_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id bigint NOT NULL REFERENCES core.contracts(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), effective_on date, amount numeric(18,2), description text,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, version)
);
COMMENT ON TABLE core.contract_versions IS 'Histórico de versões de escopo e valor dos contratos.';

CREATE TABLE core.fees (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, external_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('FEE','EXTRA_JOB')),
  contract_id bigint REFERENCES core.contracts(id) DEFERRABLE INITIALLY DEFERRED,
  job_id bigint REFERENCES core.jobs(iclips_id) DEFERRABLE INITIALLY DEFERRED,
  competence date, amount numeric(18,2), description text,
  source_system text NOT NULL DEFAULT 'iclips' REFERENCES ingest.sources(code), ingest_task_id bigint NOT NULL REFERENCES ingest.tasks(id),
  source_updated_at timestamptz, record_hash text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, external_id)
);
CREATE INDEX fees_contract ON core.fees (contract_id);
CREATE INDEX fees_competence ON core.fees (competence);
COMMENT ON TABLE core.fees IS 'Fees recorrentes e jobs extras (aguarda fonte e classificação aprovada).';

-- ---------------- Gerencial (cadastro aprovado, sem regra presumida) ----------------
CREATE TABLE core.goals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, indicator_id text NOT NULL,
  period_start date NOT NULL, period_end date NOT NULL, target numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('above','below')),
  approved_by text, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start), UNIQUE (indicator_id, period_start, period_end)
);
COMMENT ON TABLE core.goals IS 'Metas por indicador (aguarda aprovação).';

CREATE TABLE core.allocation_rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE, criterion text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb, effective_from date, effective_to date,
  active boolean NOT NULL DEFAULT false, approved_by text, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CHECK (NOT active OR approved_at IS NOT NULL)
);
COMMENT ON TABLE core.allocation_rules IS 'Regras de rateio de custos indiretos; só ativam depois de aprovadas.';
