\set ON_ERROR_STOP on

SELECT 'BL_FINANCIAL_PROJECTION_PREFLIGHT' AS marker,
       current_database() AS database_name,
       current_user AS database_user,
       version() AS postgres_version;

SELECT migration_name,
       checksum,
       finished_at,
       rolled_back_at,
       applied_steps_count
FROM "_prisma_migrations"
ORDER BY started_at, migration_name;

SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)
         AS applied_attempts,
       count(*) FILTER (WHERE rolled_back_at IS NOT NULL)
         AS reverted_attempts,
       count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)
         AS unresolved_attempts,
       count(*) AS total_attempts
FROM "_prisma_migrations";

SELECT migration_name,
       count(*) AS attempts,
       count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)
         AS applied_attempts,
       count(*) FILTER (WHERE rolled_back_at IS NOT NULL)
         AS reverted_attempts,
       count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)
         AS unresolved_attempts,
       count(DISTINCT checksum) AS checksum_count
FROM "_prisma_migrations"
GROUP BY migration_name
ORDER BY min(started_at), migration_name;

SELECT count(*) AS reverted_without_later_successful_attempt
FROM "_prisma_migrations" AS reverted
WHERE reverted.rolled_back_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "_prisma_migrations" AS later
    WHERE later.migration_name = reverted.migration_name
      AND later.started_at > reverted.started_at
      AND later.finished_at IS NOT NULL
      AND later.rolled_back_at IS NULL
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "_prisma_migrations"
    WHERE finished_at IS NULL
      AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unresolved Prisma migration attempt exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_prisma_migrations" AS reverted
    WHERE reverted.rolled_back_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "_prisma_migrations" AS later
        WHERE later.migration_name = reverted.migration_name
          AND later.started_at > reverted.started_at
          AND later.finished_at IS NOT NULL
          AND later.rolled_back_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Reverted Prisma migration attempt lacks a later successful attempt';
  END IF;
END $$;

SELECT table_name,
       CASE WHEN to_regclass(format('public.%I', table_name)) IS NULL
            THEN 'ABSENT' ELSE 'PRESENT' END AS state
FROM (
  VALUES
    ('tenant_canonical_mappings'),
    ('academic_financial_projections'),
    ('academic_financial_projection_consumed_events'),
    ('academic_financial_projection_quarantine'),
    ('academic_financial_projection_snapshots')
) AS expected(table_name)
ORDER BY table_name;

SELECT typname,
       CASE WHEN to_regtype(format('public.%I', typname)) IS NULL
            THEN 'ABSENT' ELSE 'PRESENT' END AS state
FROM (
  VALUES
    ('AcademicFinancialProjectionOperation'),
    ('AcademicFinancialProjectionEventOutcome'),
    ('AcademicFinancialProjectionSnapshotStatus')
) AS expected(typname)
ORDER BY typname;

-- pg_indexes uses tablename, not table_name. This remains valid when the
-- candidate relations are absent and therefore works before and after release.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename = 'tenant_canonical_mappings'
       OR tablename LIKE 'academic_financial_projection%')
ORDER BY tablename, indexname;

SELECT cls.relname AS table_name,
       con.conname AS constraint_name,
       con.contype AS constraint_type,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS cls ON cls.oid = con.conrelid
JOIN pg_namespace AS nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'public'
  AND (cls.relname = 'tenant_canonical_mappings'
       OR cls.relname LIKE 'academic_financial_projection%')
ORDER BY cls.relname, con.conname;

-- Counts are conditional so the preflight does not fail on an older schema.
DO $$
DECLARE
  relation_name text;
  relation_names text[] := ARRAY[
    'tenant_canonical_mappings',
    'academic_financial_projections',
    'academic_financial_projection_consumed_events',
    'academic_financial_projection_quarantine',
    'academic_financial_projection_snapshots'
  ];
  row_count bigint;
BEGIN
  FOREACH relation_name IN ARRAY relation_names LOOP
    IF to_regclass(format('public.%I', relation_name)) IS NULL THEN
      RAISE NOTICE 'relation|%|ABSENT', relation_name;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I', relation_name)
        INTO row_count;
      RAISE NOTICE 'relation|%|PRESENT|rows=%', relation_name, row_count;
    END IF;
  END LOOP;
END $$;

SELECT 'BL_FINANCIAL_PROJECTION_PREFLIGHT_COMPLETE' AS marker;
