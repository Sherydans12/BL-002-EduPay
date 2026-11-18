# Nuevos desde Académico (bandeja de incorporación)

Pantalla `/alumnos/por-incorporar`, enlazada desde **Alumnos → Nuevos desde
Académico**. Implementa la bandeja de ADR-0027 del BACK
(`backend/docs/decisions/ADR-0027-academic-projection-write-mode.md`).

## Para qué sirve

Con el modo escritura de la proyección activo, Académico es la fuente de
alumnos, cursos y matrículas. Un alumno que Académico matricula y que no existe
en Pagos no se crea solo, porque Pagos exige un apoderado y es su dueño. Queda
en esta bandeja hasta que alguien:

- **le asigna un apoderado** existente (buscado con `PersonSearchPicker` y
  `searchGuardians`), lo que crea la ficha (RUN o IPE de Académico) y su
  matrícula del año con el plan de cobro `PENDING`; o
- **vincula la ficha existente** que la bandeja sugiere cuando hay un alumno de
  Pagos con el mismo RUN. La sugerencia nunca se aplica sola.

Un alumno sin RUN ni IPE no se puede crear: se corrige en Académico. Si el
apoderado no existe, se crea en **Apoderados** (otra pestaña) y se vuelve a
buscar. El plan de cobro se configura después en **Setup Financiero**.

## API

| Acción              | Endpoint                                                                   | Permiso           |
| ------------------- | -------------------------------------------------------------------------- | ----------------- |
| Listar              | `GET /academic-intake`                                                     | `view:students`   |
| Crear con apoderado | `POST /academic-intake/{academicStudentId}/accept` `{ guardianId }`        | `manage:students` |
| Vincular existente  | `POST /academic-intake/{academicStudentId}/accept` `{ existingStudentId }` | `manage:students` |

Cliente: `academicIntakeApi` en `src/lib/api.ts`; textos y reglas puras en
`src/lib/academic-intake.ts` (con pruebas).

## Estados

Carga, error con **Reintentar** (con mensajes para falta de permiso y para un
BACK sin la bandeja), vacío, lista y diálogo con error en línea. Mientras
guarda, el diálogo no se cierra.

## Despliegue

Requiere el BACK con ADR-0027. Si el FRONT se publica antes, la pantalla
muestra que Pagos aún no tiene habilitada la llegada desde Académico. La
bandeja solo se llena cuando el modo escritura está activo.
