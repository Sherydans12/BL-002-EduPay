-- Existing administrative users belong to the primary institution unless
-- they are global SUPER_ADMIN accounts.
UPDATE "users" AS u
SET "tenantId" = 'colegio-conquistadores'
FROM "roles" AS r
WHERE u."roleId" = r."id"
  AND r."name" <> 'SUPER_ADMIN'
  AND u."tenantId" IS NULL;
