-- Compactar IDs de cursos activos a 1, 2, 3, … manteniendo el orden educativo actual
-- (orden por id temporal tras el desplazamiento = mismo orden relativo que ya tenían).
--
-- 1) Todos los cursos salen del rango bajo (FK students_courseId_fkey ON UPDATE CASCADE).
-- 2) Solo filas con deletedAt IS NULL reciben ids consecutivos 1..n según su orden por id.
--    Los cursos soft-deleted permanecen en el rango alto.

UPDATE "courses" SET "id" = "id" + 1000000;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id" ASC) AS rn
  FROM "courses"
  WHERE "deletedAt" IS NULL
)
UPDATE "courses" c
SET "id" = r.rn
FROM ranked r
WHERE c."id" = r."id";

SELECT setval(
  pg_get_serial_sequence('courses', 'id'),
  COALESCE((SELECT MAX("id") FROM "courses"), 1)
);
