-- Reasignar el curso que quedó con id 2 (ej. "Primero Básico") al id 1.
-- La FK students_courseId_fkey tiene ON UPDATE CASCADE: los courseId en students siguen al cambio de PK.
--
-- Si todavía existe una fila en id=1 (curso borrado en soft-delete u otro), la movemos a un id alto
-- para liberar el 1 antes de promover el curso que está en id=2.
UPDATE "courses"
SET "id" = (SELECT COALESCE(MAX("id"), 0) + 10000 FROM "courses" c2)
WHERE "id" = 1
  AND EXISTS (SELECT 1 FROM "courses" WHERE "id" = 2);

UPDATE "courses" SET "id" = 1 WHERE "id" = 2;

SELECT setval(
  pg_get_serial_sequence('courses', 'id'),
  COALESCE((SELECT MAX("id") FROM "courses"), 1)
);
