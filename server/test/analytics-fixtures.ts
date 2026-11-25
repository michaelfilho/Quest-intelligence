import type { PGlite } from "@electric-sql/pglite";
export async function initialiseFixtures(pg: PGlite) {
  await pg.exec(`SET TIME ZONE 'America/Sao_Paulo'; CREATE SCHEMA core;
    CREATE TABLE core.jobs (iclips_id bigint PRIMARY KEY, client_id bigint, client_group_id bigint,
      principal_employee_id bigint, auxiliary_employee_id bigint, status_text text,
      entered_at timestamptz, completed_at timestamptz, expected_end_at timestamptz);
    CREATE TABLE core.time_entries (id bigint PRIMARY KEY, job_id bigint, employee_id bigint, department_id text,
      started_at timestamptz, finished_at timestamptz, completed_at timestamptz,
      duration_seconds numeric, duration_minutes numeric, is_rework boolean);
    CREATE TABLE core.invoices (iclips_id bigint PRIMARY KEY, invoice_number text, status text,
      issued_at timestamptz, competence_date date, service_amount numeric, net_amount numeric,
      iss_amount numeric, client_name text, last_seen_at timestamptz);
    INSERT INTO core.jobs VALUES
      (1, 10, 5, 1, NULL, 'Exemplo', '2026-01-05', '2026-01-15', NULL),
      (2, 20, 5, 2, NULL, 'Exemplo', '2026-01-06', '2099-01-15', NULL);
    INSERT INTO core.time_entries VALUES
      (1, 1, 1, 'A', '2026-01-05', '2026-01-05 01:00', NULL, 3600, 60, false),
      (2, 1, 1, 'A', '2026-01-05 02:00', '2026-01-05 02:30', NULL, NULL, 30, true),
      (3, 1, 1, 'A', '2026-01-05 03:00', NULL, NULL, -5, 30, false),
      (4, 1, 1, 'A', '2026-01-05 04:00', NULL, NULL, 3600, 120, false),
      (5, 2, 2, 'B', '2026-01-06', NULL, NULL, 7200, 120, false),
      (6, NULL, 3, 'A', '2026-01-07', NULL, NULL, 900, 15, false),
      (7, 1, 1, 'A', NULL, NULL, NULL, 3600, 60, false),
      (8, 1, 1, 'A', '2026-02-01 02:59:59+00', NULL, NULL, 3600, 60, false),
      (9, 1, 1, 'A', '2026-02-01 03:00:00+00', NULL, NULL, 3600, 60, false),
      (10, 1, 1, 'A', '2099-01-01', NULL, NULL, 3600, 60, false),
      (11, 1, 1, 'A', '2026-01-07', '2099-01-01', NULL, 3600, 60, false);
    ALTER TABLE core.time_entries ADD COLUMN labor_cost numeric;
    UPDATE core.time_entries SET labor_cost = 100 WHERE id = 1;
    UPDATE core.time_entries SET labor_cost = 50 WHERE id = 5;
    INSERT INTO core.invoices VALUES
      (1, 'N1', 'issued', '2026-01-05', '2025-12-01', 100, 90, 10, 'Fixture', '2026-01-06'),
      (2, 'N2', 'cancelled', '2026-01-06', '2026-01-01', 999, 999, 0, 'Fixture', '2026-01-06'),
      (3, 'N3', 'issued', '2026-01-07', '2026-01-01', -10, -9, -1, 'Fixture', '2026-01-07'),
      (4, 'N4', 'issued', '2026-01-08', '2026-01-01', NULL, NULL, NULL, 'Fixture', NULL),
      (5, 'N5', 'issued', '2099-01-01', '2099-01-01', 5000, 5000, 0, 'Fixture', NULL);`);
}
