-- Columnas generadas para búsqueda de RUT sin depender de puntos ni guiones (alineado con normalizeChileanRut en TS).

ALTER TABLE "guardians" ADD COLUMN "rut_normalized" TEXT GENERATED ALWAYS AS (
  regexp_replace(upper(COALESCE(rut, '')), '[^0-9K]', '', 'g')
) STORED;

ALTER TABLE "students" ADD COLUMN "rut_normalized" TEXT GENERATED ALWAYS AS (
  regexp_replace(upper(COALESCE(rut, '')), '[^0-9K]', '', 'g')
) STORED;
