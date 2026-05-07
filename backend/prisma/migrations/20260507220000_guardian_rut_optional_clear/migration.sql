-- Los RUTs de apoderados fueron asignados erróneamente desde los alumnos asociados.
-- Se vacían todos los RUTs de apoderados y se hace la columna nullable.

-- 1. Hacer las columnas nullable primero (rut_normalized es generada, se actualiza sola)
ALTER TABLE guardians ALTER COLUMN rut DROP NOT NULL;
ALTER TABLE guardians ALTER COLUMN rut_normalized DROP NOT NULL;

-- 2. Borrar todos los RUTs de apoderados (rut_normalized se recalcula automáticamente a '')
UPDATE guardians SET rut = NULL;
