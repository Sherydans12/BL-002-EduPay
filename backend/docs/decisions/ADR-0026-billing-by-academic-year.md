# ADR-0026 — Cobranza por año académico en BL

- **Estado:** Accepted (primer corte implementado)
- **Fecha:** 2026-11-16
- **Relacionado:** `EduPayAcademico/docs/decisions/ADR-0025-data-authority-and-annual-cycle.md`
  (decisión 4: el plan de cobro pertenece a una matrícula de un año académico).
  La numeración sigue la de Académico para no confundir ambos ADR-0025.

## Contexto

Hasta ahora BL no modelaba años. `Course` era único por nombre en el tenant,
cada alumno tenía un solo `courseId`, `Student.financialSetup` pasaba una sola
vez de `PENDING` a `CONFIGURED` y las cuotas solo tenían `dueDate`. Los
reportes deducían el año de la fecha de vencimiento o de pago.

Ese supuesto es incorrecto para un colegio chileno: la matrícula de un año se
cobra en noviembre y diciembre del año anterior. En producción, al
2026-11-15, una cuota de matrícula vence el 2025-12-15 y es del año escolar
2026, y hay 275 pagos de 2025 que pagan cuotas de 2026. Además,
`PUT /charges/plan/:studentId` reemplazaba **todas** las cuotas del alumno:
editar un plan 2027 habría borrado o alterado cuotas 2026.

## Decisión

1. **Modelo.** `AcademicYear` (local, enlazable al año canónico de Académico
   por `canonicalAcademicYearId`), `Course.academicYearId` con nombre único por
   tenant **y año**, y `Enrollment` (alumno + curso + año, con su
   `financialSetup` y, más adelante, `canonicalEnrollmentId`). Cada `Charge`
   pertenece a una `Enrollment` (`enrollmentId` obligatorio).
2. **El año nunca se deduce de una fecha.** Una cuota es del año de su
   matrícula, aunque venza el año anterior.
3. **Datos existentes → 2026.** La migración
   `20261116120000_billing_by_academic_year` crea un año `2026` `ACTIVE` por
   tenant (con fechas e ID canónico tomados de la sombra v2 cuando existen),
   asigna a 2026 todos los cursos, crea una matrícula 2026 por alumno
   (incluidos eliminados e inactivos, como `INACTIVE`, para que toda cuota
   histórica tenga dueño) y enlaza cada cuota. No modifica montos, pagos ni
   estados.
4. **Planes por año.** `POST /charges/setup/:studentId`,
   `GET|PUT /charges/plan/:studentId` aceptan `?academicYearId=`; sin él usan
   el año `ACTIVE` del tenant **del alumno**. Editar un plan solo toca las
   cuotas de esa matrícula. `GET /charges/statement/:studentId?academicYearId=`
   filtra cuotas y pagos asignados a ese año; sin parámetro cubre todos.
   `GET /academic-years` lista los años del tenant.
5. **Transición.** `Student.courseId` y `Student.financialSetup` quedan como
   espejo del año `ACTIVE` para no romper pantallas, reportes, portal y
   comunicaciones que los leen. Crear un alumno crea su matrícula del año
   activo; cambiar su curso o estado actualiza esa matrícula; los cursos
   nuevos van al año activo. El tenant del año activo se toma del propio
   registro (alumno o curso), nunca de un contexto vacío.
6. **Origen de 2027.** El año 2027, sus cursos y matrículas llegan **solo**
   desde Académico mediante el modo escritura de la proyección (ADR-0025,
   decisión 1). BL no crea años ni matrículas de otro año desde su interfaz.

## Consecuencias

- Un alumno puede tener el plan 2026 cerrado o con deuda y el 2027 en
  configuración, sin interferencia.
- Los reportes, el portal y la caja siguen operando como antes porque solo
  existe 2026; su filtro por año académico y el indicador de año en el
  frontend son el siguiente corte.
- Con varios años, `GET /courses` y los selectores de curso mostrarán cursos de
  todos los años hasta ese corte de interfaz.
- El modo escritura de la proyección debe crear o enlazar `AcademicYear`,
  `Course` y `Enrollment` por sus IDs canónicos y `integrationId`.
- Aplicar la migración en producción exige recovery point de PostgreSQL y
  uploads y autorización específica (RUNBOOK).

## Hallazgo fuera de alcance

`ChargesController` solo tiene el guard JWT global, sin `RequirePermissions`.
Se registra para un corte de autorización separado; esta decisión no lo cambia.
