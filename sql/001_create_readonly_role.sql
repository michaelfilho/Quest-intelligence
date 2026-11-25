-- QUEST RINNE — role de aplicação SOMENTE LEITURA.
-- NÃO executado automaticamente. Revisar e rodar manualmente como superusuário, dentro do container:
--   docker exec -it quest-rinne-db-1 psql -U postgres -d quest_rinne -v pwd="'<senha-forte>'" -f /caminho/001_create_readonly_role.sql
-- Não altera dados, tabelas nem funções existentes: apenas cria a role e concede SELECT.

\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quest_rinne_app_ro') THEN
    CREATE ROLE quest_rinne_app_ro LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END $$;

ALTER ROLE quest_rinne_app_ro PASSWORD :pwd;
ALTER ROLE quest_rinne_app_ro SET default_transaction_read_only = on;
ALTER ROLE quest_rinne_app_ro SET statement_timeout = '15s';
ALTER ROLE quest_rinne_app_ro CONNECTION LIMIT 20;

GRANT CONNECT ON DATABASE quest_rinne TO quest_rinne_app_ro;
GRANT USAGE ON SCHEMA core, ingest, audit TO quest_rinne_app_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA core, ingest, audit TO quest_rinne_app_ro;

-- Tabelas futuras criadas pelo owner atual dos schemas (rodar com o mesmo usuário que cria as tabelas, normalmente postgres).
ALTER DEFAULT PRIVILEGES IN SCHEMA core, ingest, audit GRANT SELECT ON TABLES TO quest_rinne_app_ro;

COMMIT;

-- Verificação (deve retornar somente SELECT):
-- SELECT table_schema, privilege_type, count(*) FROM information_schema.role_table_grants
--  WHERE grantee = 'quest_rinne_app_ro' GROUP BY 1, 2;
