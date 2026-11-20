# ADR-0028: alumnos y cursos se gestionan solo en Académico

Estado: **Aceptado** (2026-11-20). Cierra en Pagos la decisión 1 de ADR-0025
de Académico ("BL-002 retirará el alta y edición de alumnos y cursos solo
cuando la sincronización esté activa y verificada").

Relacionado: [ADR-0027](ADR-0027-academic-projection-write-mode.md) (modo
escritura de la proyección), ADR-0025 y ADR-0026 de Académico
(`docs/decisions/`).

## Contexto

Desde el 2026-11-20 la proyección Académico → Pagos escribe en Pagos y el sync
legado EduPay → Académico está retirado (ADR-0026 de Académico). Pagos aún
permitía crear, editar y eliminar alumnos y cursos. Esos cambios ya no llegan a
Académico, y el siguiente evento de Académico los reemplaza: dos pantallas para
lo mismo y datos que divergen.

## Decisión

Para un tenant **con mapping canónico** y con
`ACADEMIC_FINANCIAL_PROJECTION_ENABLED` y `ACADEMIC_FINANCIAL_PROJECTION_WRITE_ENABLED`
activos, Académico es la única autoridad sobre alumnos, cursos y años:

- El BACK responde `409` con `code: "MANAGED_BY_ACADEMICO"` a:
  - `POST /students`, `DELETE /students/:id` y `POST /students/:id/name-review`;
  - `PUT /students/:id` cuando trae `rut`, `firstName`, `lastName`, `name`,
    `courseId` o `status`;
  - `POST /courses`, `PUT /courses/:id` y `DELETE /courses/:id`.
- `PUT /students/:id` con solo `guardianId` sigue permitido: el apoderado es
  dato de Pagos.
- `GET /academic-authority` devuelve `{ managedByAcademico }` para que el FRONT
  oculte las acciones y muestre el aviso con el enlace a Académico
  (`NEXT_PUBLIC_ACADEMICO_URL`, por defecto `https://academico.edupay.baselogic.cl`).
- No cambian: apoderados, plan de cobro, cuotas, pagos, boletas, la bandeja
  "Nuevos desde Académico" ni la escritura de la proyección.

Un tenant sin mapping (por ejemplo, el de pruebas) sigue gestionando alumnos y
cursos en Pagos. Sin usuario con tenant, se usa el tenant por defecto, igual
que el esquema y `CoursesService`.

## Consecuencias

- Un solo lugar para cada dato: alumnos, cursos, matrículas y nombres en
  Académico; apoderados y cobranza en Pagos.
- Un alumno nuevo llega a Pagos solo por la bandeja. Un alumno eliminado antes
  en Pagos conserva su RUT (índice único por tenant): la bandeja no puede crear
  otra ficha con ese RUT ni vincular la eliminada. Ese caso requiere una
  decisión aparte.
- Apagar `ACADEMIC_FINANCIAL_PROJECTION_WRITE_ENABLED` devuelve la edición a
  Pagos para ese tenant (rollback operativo).
