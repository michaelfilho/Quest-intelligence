-- Preparação do banco por um SUPERUSUÁRIO, conectado ao banco "postgres" (nunca ao banco da aplicação).
-- Executado por deploy/install.sh. Reexecutável. Espera as variáveis psql:
--   db, migrator_password, app_password, reader_password
\set ON_ERROR_STOP on
-- Senhas não vão para o log do servidor.
SET log_statement = 'none';
SET log_min_duration_statement = -1;
SET password_encryption = 'scram-sha-256';

SELECT format('CREATE ROLE %I NOLOGIN', r) FROM unnest(ARRAY['qi_owner','qi_migrator','qi_app','qi_reader','qi_ingest']) r
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec

ALTER ROLE qi_owner    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE qi_migrator LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
ALTER ROLE qi_app      LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
ALTER ROLE qi_reader   LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'reader_password';
-- Integração (n8n): sem login até a etapa de coleta ser homologada (docs/CONTRATOS_N8N.md).
ALTER ROLE qi_ingest   NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE qi_reader SET default_transaction_read_only = on;
GRANT qi_owner TO qi_migrator;

-- Isolamento: ninguém além das roles novas conecta (credenciais e workflows antigos ficam de fora).
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO qi_migrator, qi_app, qi_reader, qi_ingest;
GRANT CREATE ON DATABASE :"db" TO qi_owner;
ALTER DATABASE :"db" ALLOW_CONNECTIONS true;
