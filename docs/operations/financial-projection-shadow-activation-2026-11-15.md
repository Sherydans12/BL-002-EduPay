# Proyección financiera v2 en sombra — BL-002, 2026-11-15/16

Ventana autorizada por el operador para el paso 3 de ADR-0025 (Académico):
migración v2 de la sombra, mapping canónico, sombra encendida y conciliación
contra el roster legado. Horas en UTC. Sin secretos, tokens, nombres ni RUN.
La evidencia del lado Académico está en
[edupay-academico: financial-projection-shadow-activation-2026-11-15.md](https://github.com/Sherydans12/edupay-academico/blob/main/docs/operations/financial-projection-shadow-activation-2026-11-15.md).

Resultado: **242 de 242 alumnos y 12 de 12 cursos de `colegio-conquistadores`
vinculados por `integrationId`, sin diferencias.** La sombra no escribió
`students`, `courses`, `charges` ni `payments`.

## Artefactos

| Recurso                             | Código                                             | Imagen local construida por Coolify                                                                                | Estado                                                |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| BL BACK `km0aljzabdiqtaixj9dsequu`  | `33ffdafbbb82180a1d40d6473fe0b851daee4b22` (PR #8) | `km0aljzabdiqtaixj9dsequu:33ffdafb…`, id `sha256:6135b820652d921ae507f7304967b5b00f0286ed59266b47563373648c15284e` | Healthy; `/api/v1/health` 200; `RUN_MIGRATIONS=false` |
| BL FRONT `ktgdely86kx0by10p9cb91os` | `d72b0da` (sin cambio en esta ventana)             | id `sha256:a0a4e6a3cd69518f4875c8af7beb9b1ed4a2a202f8d3ea78d5009cd47036c73d`                                       | Healthy                                               |

Rollback de BL BACK: imagen local retenida
`km0aljzabdiqtaixj9dsequu:d72b0da37544f912289bbdce9066278d8e4339ce`
(id `sha256:a311f3094921125c5b55865761591a97104f48182d0367d9741a40c324f80ea4`).
La migración es aditiva y compatible con ese código.

## Recovery point `20261115T230006Z`

Ruta protegida `/root/edupay-recovery/bl-002/20261115T230006Z/` (directorio
700, archivos 600):

| Archivo                                                           | Bytes      | SHA-256                                                            |
| ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `bl-postgres.dump` (`pg_dump -Fc` desde el contenedor de la base) | 361.665    | `a6c6d851293ef1ee957d0b68711708b5e63a9cb7c0fea4c3dd4fbf095a675b47` |
| `bl-uploads.tar.gz` (`/edupay-backend-uploads`, 1.385 entradas)   | 43.090.560 | `f618d1d79254ca3334512530d6398e9b3e7b22ed5e0c63913de915937568f8ab` |

Restauración aislada en un PostgreSQL 18.3 sin red, con la misma imagen de la
base viva; conteos idénticos a la base viva (students 256, courses 16,
guardians 252, charges 2.723, payments 2.183, `_prisma_migrations` 36, sombra 0,
mappings 0). `sha256sum -c` OK; contenedor de prueba eliminado.

## Migración `20261115160000_academic_financial_projection_v2_descriptors`

- Preflight: 36 intentos (28 aplicados, 8 revertidos con reaplicación
  posterior, 0 sin resolver); únicamente esa migración pendiente.
- Archivo en el contenedor desplegado: SHA-256
  `7c040eeda9104b4483ca1123c917884e52e34cc7625e99658fbf079402d12e3f` (igual al
  blob LF del commit).
- Aplicada con `npx prisma migrate deploy` dentro de BL BACK `33ffdaf`, después
  de su redeploy con la sombra apagada (la imagen anterior no traía el archivo).
- Postflight: 37 intentos (29 aplicados, 8 revertidos, 0 sin resolver);
  checksum registrado igual al anterior; `academic_financial_projections` con
  28 columnas y los índices `…_tenantId_studentLegacyIntegr_idx` y
  `…_tenantId_courseLegacyIntegra_idx`; datos de negocio sin cambios.

## Mapping y sombra

- Mapping `colegio-conquistadores` ↔ `6dc797a8-2012-4c28-b212-c1449109a12f`,
  `dryRun` aprobado y asignado a las 23:17:32 por `/dashboard/vinculacion` con
  sesión `SUPER_ADMIN`. El UUID es el único tenant de Académico; el motivo
  auditado deja constancia de que la base de Identity no se consultó.
- Variables cargadas por el operador en BL BACK:
  `ACADEMIC_FINANCIAL_PROJECTION_ENABLED=true`,
  `ACADEMIC_FINANCIAL_PROJECTION_SNAPSHOT_CREDENTIALS` (keyId
  `bl-shadow-2026-11`, idéntica por hash a la del API) y
  `ACADEMIC_FINANCIAL_PROJECTION_BASE_URL=https://academico-api.edupay.baselogic.cl`.
  `ACADEMIC_FINANCIAL_PROJECTION_INBOUND_CREDENTIALS` sigue sin cargar: el
  endpoint de eventos responde 503 hasta encender el publisher.

## Conciliación

| Momento                                                                              | Alumnos vinculados | Solo en BL | Nuevos en Académico    | Cursos vinculados      |
| ------------------------------------------------------------------------------------ | ------------------ | ---------- | ---------------------- | ---------------------- |
| Primer snapshot (242 matrículas)                                                     | 241 / 242          | 1          | 1 (registro de prueba) | 12 / 12 (+1 de prueba) |
| Snapshot final `e98f1f47-9a6c-49c4-98f6-090c36b6844b` (243 ítems, `reconciled=true`) | **242 / 242**      | 0          | 0                      | **12 / 12**            |

El alumno solo en BL había sido creado el 2026-10-06, después del último sync;
una corrida incremental manual del sync en Académico lo importó como `EDUPAY`.
El registro de prueba se dio de baja en Académico. Sin RUN distintos, conflictos
de RUN, referencias inexistentes ni duplicados.

El tenant `colegio-pruebas` (4 alumnos, 3 cursos) no tiene mapping ni participa
de la sombra.

## Pendiente

- Credencial entrante y publisher de Académico, después de resolver que el sync
  heredado no emite eventos de proyección.
- Modelo por año (cursos, matrículas y plan de cobro por año) y modo escritura.
