-- Privilégios mínimos por responsabilidade. As roles são criadas antes (server/db/bootstrap.sql).
-- qi_app: apenas o schema app. qi_reader: apenas leitura analítica. qi_ingest: apenas publicação de dados.
REVOKE ALL ON SCHEMA app, core, ingest, audit FROM PUBLIC;

GRANT USAGE ON SCHEMA app TO qi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.roles, app.users, app.sessions, app.app_settings, app.login_locks, app.ip_allowlist, app.ip_requests TO qi_app;
GRANT SELECT, INSERT, DELETE ON app.audit_log TO qi_app;           -- auditoria não é alterável; DELETE só para retenção
GRANT SELECT, UPDATE ON app.access_state TO qi_app;
GRANT SELECT ON app.schema_migrations TO qi_app;

GRANT USAGE ON SCHEMA core, ingest, audit TO qi_reader, qi_ingest;
GRANT SELECT ON ALL TABLES IN SCHEMA core, ingest, audit TO qi_reader;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA core, ingest, audit TO qi_ingest;
-- Metas, regras e origens autorizadas são decisões gerenciais, não dados coletados.
REVOKE INSERT, UPDATE ON core.goals, core.allocation_rules, ingest.sources FROM qi_ingest;
-- Rateios e vínculos podem ser removidos na origem.
GRANT DELETE ON core.financial_entry_cost_centers, core.employee_department_links TO qi_ingest;
