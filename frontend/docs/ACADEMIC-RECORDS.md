# Dónde se hace cada cosa (alumnos, cursos y cobranza)

Para el colegio, desde el 2026-11-20 ([ADR-0028](../../backend/docs/decisions/ADR-0028-academic-records-managed-by-academico.md)):

| Qué                                                     | Dónde                                                    |
| ------------------------------------------------------- | -------------------------------------------------------- |
| Años académicos y cursos                                 | **Académico** → Cursos                                   |
| Alumno nuevo (1° básico o cualquier curso)               | **Académico** → Matrículas → Incorporar                  |
| Matricular, cambiar de curso o dar de baja               | **Académico** → Matrículas o Cursos → curso → Alumnos     |
| Nombre, RUN/IPE y estado del alumno                      | **Académico** → Personas                                 |
| Avance anual                                             | **Académico** → Matrículas → Avance anual                |
| Asignar apoderado a un alumno nuevo                      | **Pagos** → Alumnos → Nuevos desde Académico             |
| Apoderados, plan de cobro, cuotas, pagos y boletas       | **Pagos**                                                |

En Pagos, Alumnos, Cursos y el detalle de curso muestran el aviso "Alumnos,
cursos y matrículas se gestionan en EduPay Académico" con el enlace "Abrir
Académico". No aparecen "Nuevo Alumno", "Nuevo Curso", "Inscribir Alumno",
editar ni eliminar. En la ficha financiera, "Editar" solo cambia el apoderado.

La pantalla decide con `GET /academic-authority`. Mientras carga, las acciones
académicas quedan ocultas. Si el BACK no tiene esa ruta (404), se conserva el
comportamiento anterior. En cualquier caso el BACK rechaza las operaciones.

Un alumno nuevo creado en Académico llega a [Nuevos desde Académico](ACADEMIC-INTAKE.md)
en alrededor de un minuto.
