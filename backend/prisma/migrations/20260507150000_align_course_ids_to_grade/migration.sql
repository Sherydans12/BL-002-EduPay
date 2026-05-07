-- Reasignar ids de cursos activos al número de grado (Sexto → 6, Séptimo → 7, etc.).
-- Si hay dos hojas con el mismo grado, solo el id menor conserva 1…8; el resto va a 801+.
--
-- Desplazar todas las filas para liberar ids 1…8 (incluye soft-deleted).

UPDATE "courses" SET "id" = "id" + 10000000;

WITH labeled AS (
  SELECT
    "id",
    CASE
      WHEN LOWER("name") ~ '(^|[^a-záéíóúñ])primero([^a-záéíóúñ]|$)' OR "name" ~ '[\s]1[°º]' OR "name" ~ '^1[°º]' THEN 1
      WHEN LOWER("name") ~ 'segundo' OR "name" ~ '[\s]2[°º]' OR "name" ~ '^2[°º]' THEN 2
      WHEN LOWER("name") ~ 'tercer[oa]?' OR "name" ~ '[\s]3[°º]' OR "name" ~ '^3[°º]' THEN 3
      WHEN LOWER("name") ~ 'cuarto' OR "name" ~ '[\s]4[°º]' OR "name" ~ '^4[°º]' THEN 4
      WHEN LOWER("name") ~ 'quinto' OR "name" ~ '[\s]5[°º]' OR "name" ~ '^5[°º]' THEN 5
      WHEN LOWER("name") ~ 'sexto' OR "name" ~ '[\s]6[°º]' OR "name" ~ '^6[°º]' THEN 6
      WHEN LOWER("name") ~ 's[eé]ptimo' OR "name" ~ '[\s]7[°º]' OR "name" ~ '^7[°º]' THEN 7
      WHEN LOWER("name") ~ 'octavo' OR "name" ~ '[\s]8[°º]' OR "name" ~ '^8[°º]' THEN 8
      ELSE NULL
    END AS gid
  FROM "courses"
  WHERE "deletedAt" IS NULL AND "id" > 10000000
),
winners AS (
  SELECT DISTINCT ON ("gid") "id", "gid" AS new_id
  FROM labeled
  WHERE "gid" IS NOT NULL
  ORDER BY "gid", "id" ASC
),
assign AS (
  SELECT "id", "new_id" FROM winners
  UNION ALL
  SELECT l."id", 800 + ROW_NUMBER() OVER (ORDER BY l."id") AS new_id
  FROM labeled l
  WHERE l."gid" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM winners w WHERE w."id" = l."id")
  UNION ALL
  SELECT l."id", 100 + ROW_NUMBER() OVER (ORDER BY l."id") AS new_id
  FROM labeled l
  WHERE l."gid" IS NULL
)
UPDATE "courses" c
SET "id" = a.new_id
FROM assign a
WHERE c."id" = a."id";

SELECT setval(
  pg_get_serial_sequence('courses', 'id'),
  COALESCE((SELECT MAX("id") FROM "courses"), 1)
);
