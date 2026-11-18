# ADR-0027: modo escritura de la proyección Académico → Pagos

Estado: **Aceptado** (2026-11-17). Implementación detrás de un flag apagado;
activarlo en producción requiere la autorización y los pasos de la sección
[Activación](#activación).

Relacionado: ADR-0025 de Académico (`docs/decisions/ADR-0025-data-authority-and-annual-cycle.md`,
decisión 2), [ADR-0026](ADR-0026-billing-by-academic-year.md) (cobranza por
año) y el contrato de proyección v2 (`docs/integration/academic-financial-projection.md`
en Académico).

## Contexto

La proyección v2 llega a BL en sombra (`academic_financial_projections`) y
concilia 242/242 alumnos y 12/12 cursos, pero BL no cambia sus propios
registros. Sin escritura, los alumnos que Académico incorpora a 2027 no llegan
a la cobranza (ADR-0025, decisión 3).

En BL todo alumno exige un apoderado (`guardianId` obligatorio) y un `rut`
único. Académico no modela apoderados (ADR-0015) y puede enviar un alumno con
IPE en vez de RUN.

## Decisión

Con `ACADEMIC_FINANCIAL_PROJECTION_WRITE_ENABLED=true` (además de
`ACADEMIC_FINANCIAL_PROJECTION_ENABLED`), cada evento aplicado a la sombra se
escribe también en las tablas de BL **en la misma transacción**. Un
administrador de plataforma puede escribir de una vez las filas pendientes.

| Registro BL | Vínculo (en este orden)                                                          | Si no existe                     | Actualiza                                        |
| ----------- | -------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| Año         | `canonicalAcademicYearId`; luego etiqueta sin vínculo                            | Lo crea con fechas y estado      | Etiqueta, fechas y estado                        |
| Curso       | `canonicalCourseId`; luego `integrationId` heredado; luego nombre en el año      | Lo crea en su año                | Nombre                                           |
| Alumno      | `canonicalStudentId`; luego `integrationId` heredado                             | **Bandeja por incorporar**       | Nombres. El RUN nunca: una diferencia se informa |
| Matrícula   | `canonicalEnrollmentId`; luego la matrícula del alumno en ese año, si está libre | La crea `ACTIVE`, plan `PENDING` | Curso y estado                                   |

Reglas:

- **Nunca por nombre, curso ni correo** para alumnos (ADR-0025).
- **No se crea un alumno sin apoderado.** Un alumno nuevo queda
  `PENDING_INTAKE` en la bandeja `GET /academic-intake`. Un operador con
  `manage:students` lo incorpora con
  `POST /academic-intake/{academicStudentId}/accept`:
  - con `{ guardianId }`, crea la ficha (`rut` = RUN formateado o IPE, con
    `nationalIdType`) y sus matrículas;
  - con `{ existingStudentId }`, vincula un alumno de BL con el mismo RUN, que
    la bandeja sugiere sin vincularlo sola.
- **No se borra nada.** Una baja o un tombstone solo desactiva la matrícula
  **vinculada**; cuotas y pagos no cambian. Una baja de una matrícula que BL no
  tiene vinculada no se aplica (`SKIPPED`).
- **Una matrícula por alumno y año** (restricción de BL). Si Académico cambia
  de curso con una matrícula nueva, se reemplaza el vínculo solo cuando la
  sombra ya muestra cerrada la anterior; si no, queda `CONFLICT` y se
  reintenta.
- **Datos compartidos desde la fila más reciente.** Etiqueta, fechas y estado
  del año, nombre del curso y nombres del alumno se toman solo de su fila con
  `sourceUpdatedAt` más reciente: una matrícula cerrada con datos viejos no
  revierte un cambio nuevo.
- **Espejo del año activo** (ADR-0026). `Student.courseId` y
  `Student.financialSetup` siguen la matrícula del año `ACTIVE` más reciente.
  Cuando Académico activa 2027 y BL lo recibe, ese año pasa a ser el activo y
  el espejo de cada alumno con matrícula 2027 se mueve a ella, con su plan
  `PENDING`.
- **Resultado por fila** en la sombra: `writeOutcome` (`APPLIED`,
  `PENDING_INTAKE`, `CONFLICT`, `SKIPPED`), `writeReasonCode`, `writtenAt` y
  `writtenVersion`. Son pendientes las filas no escritas en su versión vigente
  y las `PENDING_INTAKE`/`CONFLICT`, que se reintentan.

Endpoints de plataforma (`SuperAdminGuard`):

- `GET /integrations/academic-financial-projection/shadow/tenants/{tenantId}/write-plan`:
  ejecuta las escrituras pendientes en una transacción que se revierte y
  devuelve conteos por resultado, cambio y motivo, más los ids de matrícula en
  conflicto u omitidos. No incluye nombres ni RUN/IPE.
- `POST .../write-plan/apply`: aplica en lotes de 200 filas por transacción;
  repetible. Responde `503` si el modo escritura está apagado.

Migración `20261117120000_academic_projection_write_mode`, **aditiva**:
columnas `students.canonicalStudentId`, `students.nationalIdType`,
`courses.canonicalCourseId` (únicos por tenant) y las de resultado en
`academic_financial_projections`. No modifica filas existentes.

## Fuera de este corte

- La pantalla de la bandeja en el FRONT de BL (usa los endpoints de arriba).
- Retirar el alta y edición de alumnos y cursos en BL (ADR-0025, después de
  verificar la escritura).
- Eventos de proyección desde el sync heredado de Académico: sus escrituras no
  pasan por el outbox. Con su worker detenido no hay efecto; si se ejecuta, un
  snapshot y `write-plan/apply` reparan las diferencias.

## Activación

Cada paso con su autorización. Sin datos reales fuera de los servicios.

1. **Recovery point y migración** de BL según el RUNBOOK (gate, ensayo
   aislado, ledger). La migración no cambia datos.
2. **Desplegar BL BACK** con el flag de escritura apagado.
3. **Snapshot y conciliación** de la sombra (como el 2026-11-15) y
   `GET .../write-plan`. Revisar: años y cursos a crear o vincular, alumnos
   vinculados y renombrados, `STUDENT_NATIONAL_ID_DIFFERS`, conflictos y
   omitidos. Resolver lo que corresponda antes de seguir.
4. **Encender** `ACADEMIC_FINANCIAL_PROJECTION_WRITE_ENABLED=true`, redeploy y
   `POST .../write-plan/apply`. Verificar conteos de alumnos, cursos,
   matrículas y cuotas (sin cambios en montos ni pagos).
5. **Eventos en línea:** credencial de entrada en BL y publicador de Académico
   (`ACADEMIC_FINANCIAL_PROJECTION_PUBLISHER_ENABLED`), que drena el outbox
   acumulado. Repetir el plan para confirmar que no quedan pendientes salvo la
   bandeja.

Rollback: apagar el flag detiene la escritura; los vínculos y registros ya
creados se conservan (no se borran cuotas ni pagos).

## Consecuencias

- BL recibe años, cursos y matrículas de Académico sin digitación; el único
  paso manual es el apoderado de un alumno nuevo, que BL igual debe registrar.
- Los nombres de los alumnos vinculados pasan a ser los de Académico; el plan
  muestra cuántos cambian antes de aplicar.
- Mientras haya dos años `ACTIVE`, BL usa el más reciente como año por defecto
  (ADR-0026).
