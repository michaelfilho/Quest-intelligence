# Dicionário de dados — PostgreSQL `quest_rinne`

> Gerado por `npm run docs:database` a partir das migrations em `server/db/migrations`. Não editar à mão.

## Schema `app`

### app.access_state

Liga/desliga o controle de acesso por IP (linha única).

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| singleton | boolean | sim | true |  |
| enabled | boolean | sim | false |  |
| updated_at | timestamp with time zone |  |  |  |
| updated_by | text |  |  |  |

- Regra: `CHECK (singleton)`
- Chave primária: `PRIMARY KEY (singleton)`
- qi_app: SELECT, UPDATE

### app.app_settings

Configurações alteradas pela interface.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| key | text | sim |  |  |
| value | jsonb | sim |  |  |
| updated_at | timestamp with time zone | sim | now() |  |
| updated_by | text |  |  |  |

- Chave primária: `PRIMARY KEY (key)`
- qi_app: DELETE, INSERT, SELECT, UPDATE

### app.audit_log

Auditoria de acessos e alterações, sem segredos.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim | identity |  |
| at | timestamp with time zone | sim | now() |  |
| event | text | sim |  |  |
| outcome | text | sim | 'success'::text |  |
| actor_id | integer |  |  |  |
| actor | text |  |  |  |
| ip | text |  |  |  |
| target | text |  |  |  |
| details | jsonb | sim | '{}'::jsonb |  |

- Regra: `CHECK ((outcome = ANY (ARRAY['success'::text, 'failure'::text, 'denied'::text])))`
- Chave primária: `PRIMARY KEY (id)`
- Índice `audit_log_at`: `btree (at)`
- Índice `audit_log_event`: `btree (event)`
- qi_app: DELETE, INSERT, SELECT

### app.ip_allowlist

IPs e redes autorizados.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| cidr | text | sim |  |  |
| label | text | sim | ''::text |  |
| added_at | timestamp with time zone | sim | now() |  |

- Chave primária: `PRIMARY KEY (cidr)`
- qi_app: DELETE, INSERT, SELECT, UPDATE

### app.ip_requests

IPs recusados aguardando autorização ou excluídos.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| ip | text | sim |  |  |
| status | text | sim | 'pending'::text |  |
| first_seen | timestamp with time zone | sim | now() |  |
| last_seen | timestamp with time zone | sim | now() |  |
| user_agent | text | sim | ''::text |  |

- Regra: `CHECK ((status = ANY (ARRAY['pending'::text, 'dismissed'::text])))`
- Chave primária: `PRIMARY KEY (ip)`
- Índice `ip_requests_pending`: `btree (status, last_seen)`
- qi_app: DELETE, INSERT, SELECT, UPDATE

### app.login_locks

Bloqueio progressivo de login por IP (3 erros; cada bloqueio triplica).

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| ip | text | sim |  |  |
| fails | integer | sim | 0 |  |
| locks | integer | sim | 0 |  |
| locked_until | timestamp with time zone | sim | '1969-12-31 21:00:00-03'::timestamp with time zone |  |

- Regra: `CHECK ((fails >= 0))`
- Regra: `CHECK ((locks >= 0))`
- Chave primária: `PRIMARY KEY (ip)`
- qi_app: DELETE, INSERT, SELECT, UPDATE

### app.roles

Perfis de acesso e suas permissões.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | text | sim |  |  |
| name | text | sim |  |  |
| description | text | sim | ''::text |  |
| permissions | jsonb | sim | '[]'::jsonb |  |
| system | boolean | sim | false |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK ((jsonb_typeof(permissions) = 'array'::text))`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (name)`
- qi_app: DELETE, INSERT, SELECT, UPDATE

### app.sessions

Sessões ativas; id é o SHA-256 do token, que só existe no cookie.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | text | sim |  |  |
| user_id | integer | sim |  |  |
| created_at | timestamp with time zone | sim |  |  |
| last_seen_at | timestamp with time zone | sim |  |  |
| expires_at | timestamp with time zone | sim |  |  |
| ip | text |  |  |  |
| user_agent | text |  |  |  |

- Regra: `CHECK ((length(id) = 64))`
- Referência: `FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`
- Índice `sessions_expires`: `btree (expires_at)`
- Índice `sessions_user`: `btree (user_id)`
- qi_app: DELETE, INSERT, SELECT, UPDATE

### app.users

Contas individuais. A senha só existe como hash Argon2id.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | integer | sim | identity |  |
| username | text | sim |  |  |
| name | text | sim |  |  |
| email | text |  |  |  |
| password_hash | text | sim |  |  |
| role_id | text |  |  |  |
| grants | jsonb | sim | '[]'::jsonb |  |
| denies | jsonb | sim | '[]'::jsonb |  |
| scope_department | text |  |  | Restringe os dados a um departamento (core.departments.id); sem FK porque o cadastro vem da integração. |
| active | boolean | sim | true |  |
| must_change_password | boolean | sim | true |  |
| password_changed_at | timestamp with time zone |  |  |  |
| last_login_at | timestamp with time zone |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK ((jsonb_typeof(denies) = 'array'::text))`
- Regra: `CHECK ((jsonb_typeof(grants) = 'array'::text))`
- Regra: `CHECK ((password_hash ~~ '$argon2id$%'::text))`
- Regra: `CHECK ((username ~ '^[A-Za-z0-9._-]{3,64}$'::text))`
- Referência: `FOREIGN KEY (role_id) REFERENCES app.roles(id) ON DELETE SET NULL`
- Chave primária: `PRIMARY KEY (id)`
- Índice `users_username_unique`: `btree (lower(username))`
- qi_app: DELETE, INSERT, SELECT, UPDATE

## Schema `core`

### core.allocation_rules

Regras de rateio de custos indiretos; só ativam depois de aprovadas.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim | identity |  |
| name | text | sim |  |  |
| criterion | text | sim |  |  |
| parameters | jsonb | sim | '{}'::jsonb |  |
| effective_from | date |  |  |  |
| effective_to | date |  |  |  |
| active | boolean | sim | false |  |
| approved_by | text |  |  |  |
| approved_at | timestamp with time zone |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from)))`
- Regra: `CHECK (((NOT active) OR (approved_at IS NOT NULL)))`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (name)`
- qi_ingest: SELECT
- qi_reader: SELECT

### core.brands

Marcas dos clientes (aguarda fonte).

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim | identity |  |
| external_id | text | sim |  |  |
| name | text | sim |  |  |
| status | text |  |  |  |
| client_id | bigint |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (client_id) REFERENCES core.clients(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (source_system, external_id)`
- Índice `brands_client`: `btree (client_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.client_groups

Grupos empresariais.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| iclips_id | bigint | sim |  |  |
| name | text |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (iclips_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.clients

Clientes.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| iclips_id | bigint | sim |  |  |
| name | text |  |  |  |
| document | text |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (iclips_id)`
- Índice `clients_document`: `btree (document)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.contract_versions

Histórico de versões de escopo e valor dos contratos.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim | identity |  |
| contract_id | bigint | sim |  |  |
| version | integer | sim |  |  |
| effective_on | date |  |  |  |
| amount | numeric(18,2) |  |  |  |
| description | text |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK ((version >= 1))`
- Referência: `FOREIGN KEY (contract_id) REFERENCES core.contracts(id) ON DELETE CASCADE`
- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (contract_id, version)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.contracts

Contratos (aguarda fonte).

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim | identity |  |
| external_id | text | sim |  |  |
| name | text | sim |  |  |
| contract_type | text |  |  |  |
| status | text |  |  |  |
| client_id | bigint |  |  |  |
| brand_id | bigint |  |  |  |
| starts_on | date |  |  |  |
| ends_on | date |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK (((ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on)))`
- Referência: `FOREIGN KEY (brand_id) REFERENCES core.brands(id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (client_id) REFERENCES core.clients(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (source_system, external_id)`
- Índice `contracts_client`: `btree (client_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.departments

Departamentos.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | text | sim |  |  |
| iclips_id | bigint |  |  |  |
| name | text |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (iclips_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.employee_department_links

Vínculos adicionais entre colaborador e departamento.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| employee_id | bigint | sim |  |  |
| department_id | text | sim |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (department_id) REFERENCES core.departments(id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (employee_id) REFERENCES core.employees(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (employee_id, department_id)`
- qi_ingest: DELETE, INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.employees

Colaboradores.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| iclips_id | bigint | sim |  |  |
| name | text |  |  |  |
| job_title | text |  |  |  |
| main_department_id | text |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (main_department_id) REFERENCES core.departments(id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (iclips_id)`
- Índice `employees_department`: `btree (main_department_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.fees

Fees recorrentes e jobs extras (aguarda fonte e classificação aprovada).

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim | identity |  |
| external_id | text | sim |  |  |
| kind | text | sim |  |  |
| contract_id | bigint |  |  |  |
| job_id | bigint |  |  |  |
| competence | date |  |  |  |
| amount | numeric(18,2) |  |  |  |
| description | text |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK ((kind = ANY (ARRAY['FEE'::text, 'EXTRA_JOB'::text])))`
- Referência: `FOREIGN KEY (contract_id) REFERENCES core.contracts(id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (job_id) REFERENCES core.jobs(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (source_system, external_id)`
- Índice `fees_competence`: `btree (competence)`
- Índice `fees_contract`: `btree (contract_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.financial_accounts

Contas financeiras.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| iclips_id | bigint | sim |  |  |
| name | text |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (iclips_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.financial_categories

Categorias financeiras e sua classificação gerencial.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| iclips_id | bigint | sim |  |  |
| name | text |  |  |  |
| dre_indicator | text |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (iclips_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.financial_entries

Movimentações financeiras.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| iclips_id | bigint | sim |  |  |
| parent_id | bigint |  |  |  |
| entry_type | text |  |  |  |
| amount | numeric(18,2) |  |  |  |
| payment_date | date |  |  |  |
| competence_date | date |  |  |  |
| category_id | bigint |  |  |  |
| account_id | bigint |  |  |  |
| job_id | bigint |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK ((parent_id <> iclips_id))`
- Referência: `FOREIGN KEY (account_id) REFERENCES core.financial_accounts(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (category_id) REFERENCES core.financial_categories(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (job_id) REFERENCES core.jobs(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (parent_id) REFERENCES core.financial_entries(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (iclips_id)`
- Índice `financial_entries_category`: `btree (category_id)`
- Índice `financial_entries_competence`: `btree (competence_date)`
- Índice `financial_entries_job`: `btree (job_id)`
- Índice `financial_entries_parent`: `btree (parent_id)`
- Índice `financial_entries_payment`: `btree (payment_date)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.financial_entry_cost_centers

Rateio das movimentações por centro de custo.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| financial_entry_id | bigint | sim |  |  |
| source_center_id | bigint | sim |  |  |
| name | text |  |  |  |
| percentage | numeric |  |  |  |
| amount | numeric(18,2) |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (financial_entry_id) REFERENCES core.financial_entries(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (financial_entry_id, source_center_id)`
- qi_ingest: DELETE, INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.goals

Metas por indicador (aguarda aprovação).

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim | identity |  |
| indicator_id | text | sim |  |  |
| period_start | date | sim |  |  |
| period_end | date | sim |  |  |
| target | numeric | sim |  |  |
| direction | text | sim |  |  |
| approved_by | text |  |  |  |
| approved_at | timestamp with time zone |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK ((period_end >= period_start))`
- Regra: `CHECK ((direction = ANY (ARRAY['above'::text, 'below'::text])))`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (indicator_id, period_start, period_end)`
- qi_ingest: SELECT
- qi_reader: SELECT

### core.invoices

Notas fiscais.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| iclips_id | bigint | sim |  |  |
| invoice_number | text |  |  |  |
| status | text |  |  |  |
| issued_at | timestamp with time zone |  |  |  |
| competence_date | date |  |  |  |
| service_amount | numeric(18,2) |  |  |  |
| net_amount | numeric(18,2) |  |  |  |
| iss_amount | numeric(18,2) |  |  |  |
| client_name | text |  |  |  |
| client_document | text |  |  |  |
| last_seen_at | timestamp with time zone |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (iclips_id)`
- Índice `invoices_competence`: `btree (competence_date)`
- Índice `invoices_document`: `btree (client_document)`
- Índice `invoices_issued`: `btree (issued_at)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.job_pieces

Peças de cada projeto.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| iclips_id | bigint | sim |  |  |
| name | text |  |  |  |
| job_id | bigint | sim |  |  |
| catalog_piece_id | bigint |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (catalog_piece_id) REFERENCES core.piece_catalog(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (job_id) REFERENCES core.jobs(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (iclips_id)`
- Índice `job_pieces_job`: `btree (job_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.job_tasks

Tarefas dos projetos.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| job_id | bigint | sim |  |  |
| iclips_id | bigint | sim |  |  |
| name | text |  |  |  |
| description | text |  |  |  |
| estimated_minutes | numeric |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (job_id) REFERENCES core.jobs(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (job_id, iclips_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.jobs

Projetos / jobs.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| iclips_id | bigint | sim |  |  |
| name | text |  |  |  |
| client_id | bigint |  |  |  |
| client_group_id | bigint |  |  |  |
| brand_id | bigint |  |  |  |
| principal_employee_id | bigint |  |  |  |
| auxiliary_employee_id | bigint |  |  |  |
| status_text | text |  |  |  |
| entered_at | timestamp with time zone |  |  |  |
| completed_at | timestamp with time zone |  |  |  |
| expected_end_at | timestamp with time zone |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (auxiliary_employee_id) REFERENCES core.employees(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (brand_id) REFERENCES core.brands(id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (client_group_id) REFERENCES core.client_groups(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (client_id) REFERENCES core.clients(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (principal_employee_id) REFERENCES core.employees(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (iclips_id)`
- Índice `jobs_client`: `btree (client_id)`
- Índice `jobs_completed`: `btree (completed_at)`
- Índice `jobs_entered`: `btree (entered_at)`
- Índice `jobs_group`: `btree (client_group_id)`
- Índice `jobs_principal`: `btree (principal_employee_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.piece_catalog

Catálogo de tipos de peça / serviço.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| iclips_id | bigint | sim |  |  |
| name | text |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (iclips_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.time_entries

Apontamentos de horas.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim |  |  |
| job_id | bigint |  |  |  |
| employee_id | bigint |  |  |  |
| department_id | text |  |  |  |
| source_kind | text |  |  |  |
| task_id | bigint |  |  |  |
| workflow_step_id | bigint |  |  |  |
| job_piece_id | bigint |  |  |  |
| started_at | timestamp with time zone |  |  |  |
| finished_at | timestamp with time zone |  |  |  |
| completed_at | timestamp with time zone |  |  |  |
| duration_seconds | numeric |  |  |  |
| duration_minutes | numeric |  |  |  |
| is_rework | boolean |  |  |  |
| labor_cost | numeric(18,2) |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK ((source_kind = ANY (ARRAY['TASK'::text, 'WORKFLOW'::text])))`
- Referência: `FOREIGN KEY (department_id) REFERENCES core.departments(id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (employee_id) REFERENCES core.employees(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (job_id) REFERENCES core.jobs(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (id)`
- Índice `time_entries_department`: `btree (department_id, started_at)`
- Índice `time_entries_employee`: `btree (employee_id, started_at)`
- Índice `time_entries_job`: `btree (job_id)`
- Índice `time_entries_started`: `btree (started_at)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### core.workflow_steps

Etapas das peças.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| job_piece_id | bigint | sim |  |  |
| iclips_id | bigint | sim |  |  |
| name | text |  |  |  |
| description | text |  |  |  |
| estimated_minutes | numeric |  |  |  |
| source_system | text | sim | 'iclips'::text |  |
| ingest_task_id | bigint | sim |  |  |
| source_updated_at | timestamp with time zone |  |  |  |
| record_hash | text |  |  |  |
| created_at | timestamp with time zone | sim | now() |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (ingest_task_id) REFERENCES ingest.tasks(id)`
- Referência: `FOREIGN KEY (job_piece_id) REFERENCES core.job_pieces(iclips_id) DEFERRABLE INITIALLY DEFERRED`
- Referência: `FOREIGN KEY (source_system) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (job_piece_id, iclips_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

## Schema `ingest`

### ingest.checkpoints

Ponto de retomada da atualização incremental.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| source_code | text | sim |  |  |
| resource | text | sim |  |  |
| cursor | text |  |  |  |
| watermark | timestamp with time zone |  |  |  |
| last_task_id | bigint |  |  |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (last_task_id) REFERENCES ingest.tasks(id) ON DELETE SET NULL`
- Referência: `FOREIGN KEY (source_code) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (source_code, resource)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### ingest.errors

Registros rejeitados. Não armazenar payloads nem dados pessoais.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim | identity |  |
| task_id | bigint | sim |  |  |
| external_id | text |  |  |  |
| error_code | text | sim |  |  |
| message | text | sim |  |  |
| retryable | boolean | sim | false |  |
| occurred_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (task_id) REFERENCES ingest.tasks(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (id)`
- Índice `errors_task`: `btree (task_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### ingest.pages

Paginação recebida; a chave impede contar a mesma página duas vezes.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| task_id | bigint | sim |  |  |
| page_number | integer | sim |  |  |
| record_count | integer | sim |  |  |
| payload_hash | text | sim |  |  |
| received_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK ((page_number >= 1))`
- Regra: `CHECK ((record_count >= 0))`
- Referência: `FOREIGN KEY (task_id) REFERENCES ingest.tasks(id) ON DELETE CASCADE`
- Chave primária: `PRIMARY KEY (task_id, page_number)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### ingest.sources

Sistemas de origem autorizados.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| code | text | sim |  |  |
| description | text | sim |  |  |
| active | boolean | sim | true |  |
| created_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK ((code ~ '^[a-z][a-z0-9_]{1,31}$'::text))`
- Chave primária: `PRIMARY KEY (code)`
- qi_ingest: SELECT
- qi_reader: SELECT

### ingest.tasks

Uma execução de coleta. Toda linha publicada em core aponta para a tarefa que a gravou.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim | identity |  |
| source_code | text | sim |  |  |
| resource | text | sim |  |  |
| idempotency_key | text | sim |  |  |
| mode | text | sim | 'incremental'::text |  |
| status | text | sim | 'PENDING'::text |  |
| expected_total | integer |  |  |  |
| received_records | integer | sim | 0 |  |
| cursor | text |  |  |  |
| error_message | text |  |  |  |
| started_at | timestamp with time zone | sim | now() |  |
| finished_at | timestamp with time zone |  |  |  |
| updated_at | timestamp with time zone | sim | now() |  |

- Regra: `CHECK ((expected_total >= 0))`
- Regra: `CHECK ((mode = ANY (ARRAY['full'::text, 'incremental'::text])))`
- Regra: `CHECK ((received_records >= 0))`
- Regra: `CHECK ((status = ANY (ARRAY['PENDING'::text, 'QUEUED'::text, 'RUNNING'::text, 'PROCESSING'::text, 'RECONCILE_REQUIRED'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'ERROR'::text])))`
- Referência: `FOREIGN KEY (source_code) REFERENCES ingest.sources(code)`
- Chave primária: `PRIMARY KEY (id)`
- Único: `UNIQUE (source_code, resource, idempotency_key)`
- Índice `tasks_status`: `btree (status, updated_at)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

## Schema `audit`

### audit.publication_conflicts

Registros que não puderam ser publicados sem revisão.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| id | bigint | sim | identity |  |
| resource | text | sim |  |  |
| source_id | text | sim |  |  |
| reason | text | sim |  |  |
| task_id | bigint |  |  |  |
| detected_at | timestamp with time zone | sim | now() |  |
| resolved_at | timestamp with time zone |  |  |  |

- Referência: `FOREIGN KEY (task_id) REFERENCES ingest.tasks(id)`
- Chave primária: `PRIMARY KEY (id)`
- Índice `publication_conflicts_open`: `btree (resource, source_id) WHERE (resolved_at IS NULL)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT

### audit.publication_state

Última versão publicada de cada registro de origem.

| coluna | tipo | obrigatória | padrão | observação |
|---|---|---|---|---|
| resource | text | sim |  |  |
| source_id | text | sim |  |  |
| task_id | bigint |  |  |  |
| record_hash | text |  |  |  |
| published_at | timestamp with time zone | sim | now() |  |

- Referência: `FOREIGN KEY (task_id) REFERENCES ingest.tasks(id)`
- Chave primária: `PRIMARY KEY (resource, source_id)`
- qi_ingest: INSERT, SELECT, UPDATE
- qi_reader: SELECT
