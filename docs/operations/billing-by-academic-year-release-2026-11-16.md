# Cobranza por año académico — release BL-002, 2026-11-16

Ventana autorizada por el operador el 2026-11-16 para
[ADR-0026](../../backend/docs/decisions/ADR-0026-billing-by-academic-year.md)
(PR #10, merge `ec61e31da2bec10d9613046b1f58cf2bd683439d`). Horas en UTC. Sin
secretos, tokens, nombres ni RUT.

Resultado: migración `20261116120000_billing_by_academic_year` aplicada, BL
BACK desplegado en `ec61e31` y verificado. Conteos y montos sin cambios.

## Orden de la ventana y por qué

El código nuevo **lee** `courses.academicYearId` y `charges.enrollmentId`; si
se desplegaba antes de migrar, las pantallas de cursos, alumnos y cuotas
fallarían. El código anterior, en cambio, sigue leyendo sobre el esquema
nuevo. Por eso el orden fue: recovery point → ensayo aislado → migración con
el BACK anterior en servicio → redeploy. Entre la migración (22:02:09) y el
nuevo contenedor (22:08:41), el código anterior no podía crear cursos ni
configurar planes de cobro (columnas `NOT NULL` nuevas); lecturas y pagos
siguieron operando.

## Recovery point `20261116T215819Z`

`/root/edupay-recovery/bl-002/20261116T215819Z/` (directorio 700, archivos 600):

| Archivo                            | Bytes      | SHA-256                                                            |
| ---------------------------------- | ---------- | ------------------------------------------------------------------ |
| `bl-postgres.dump`                 | 397.869    | `cb425cb27b1ab7be835091d065dd256e8bf3efe3bb0834542bf4be5cdc9503ae` |
| `bl-uploads.tar.gz`                | 43.122.069 | `b56b98f24c2075fe512f85d2dce8c2f103e8386868ef990c8b6e78c9b326a9ed` |
| `migration.sql` (copia del commit) | 6.136      | `44afb70baa97424cf4f760b8e25c48224dac46733c0b9c6f49fdf2d8bdc3211d` |

`migration.sql` se transfirió en base64 desde `ec61e31` y se verificó contra
el blob LF del commit.

## Ensayo aislado

Restauración del dump en PostgreSQL 18.3 (`--network none`, misma imagen de la
base) y `psql -1 -v ON_ERROR_STOP=1 -f migration.sql`. Antes y después:
256 alumnos, 16 cursos, 2.723 cuotas (suma 579.107.907; pagado 414.492.215),
2.184 pagos (suma 470.797.113), 252 apoderados. Resultado: un año `2026`
`ACTIVE` por tenant (`colegio-conquistadores` 2026-03-01 → 2026-12-15 con
canónico `2330fa9a-1ab1-4c45-99ef-4116c25554c7`; `colegio-pruebas` con fechas
por defecto), 256 matrículas (246 activas: 242 + 4; 247 con plan configurado),
0 cursos sin año, 0 cuotas sin matrícula, 0 inconsistencias cuota/matrícula/
alumno. Contenedor de ensayo eliminado.

## Migración en producción

- Preflight: ledger 37 intentos (29 aplicados, 8 revertidos resueltos, 0 sin
  resolver); v2 aplicada; la nueva ausente.
- La imagen en servicio (`33ffdaf`) no traía el archivo y su contenedor corre
  como `node`. En vez de modificar el contenedor productivo se usó un runner
  desechable: **la misma imagen** `km0aljzabdiqtaixj9dsequu:33ffdafb…`,
  `--entrypoint npx`, red `coolify`, las 29 migraciones del contenedor más la
  nueva montadas en solo lectura y `DATABASE_URL` por `--env-file` 600,
  eliminado al terminar. `migrate status` mostró solo la migración nueva
  pendiente; `migrate deploy` la aplicó a las 22:02:09 con salida 0.
- Postflight: ledger 38 intentos (30 aplicados, 8 revertidos, 0 sin resolver);
  checksum registrado `44afb70b…dc3211d`; conteos, montos, años, matrículas e
  integridad idénticos al ensayo; `/api/v1/health` 200.

## Despliegue y verificación

| Recurso                            | Código                                     | Imagen local                                                              | Estado                                         |
| ---------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------- |
| BL BACK `km0aljzabdiqtaixj9dsequu` | `ec61e31da2bec10d9613046b1f58cf2bd683439d` | `sha256:3409d21e5ce32b5d736b91b18a1b6cc76e427c64ec126eaf4eaa9c51ed62912b` | Healthy desde 22:08:41; `RUN_MIGRATIONS=false` |

- `prisma migrate status` desde la imagen desplegada: 30 migraciones, "Database
  schema is up to date!".
- Sin sesión: `/api/v1/health` 200; `GET /api/academic-years` 401.
- Con sesión `SUPER_ADMIN` (solo conteos e IDs): `GET /academic-years` →
  `2026` `ACTIVE`; plan de un alumno sin año y con `academicYearId` del año
  activo → mismas 11 cuotas; estado de cuenta 200; conciliación de la sombra
  242/242 alumnos y 12/12 cursos, sin bloqueantes.
- BL FRONT sin cambio (`d72b0da`); no se verificó visualmente.

Rollback de aplicación: imagen local retenida
`km0aljzabdiqtaixj9dsequu:33ffdafbbb82180a1d40d6473fe0b851daee4b22`
(id `sha256:6135b820…15284e`). La migración es aditiva y no se revierte; con el
código anterior las lecturas y pagos funcionan, pero no la creación de cursos
ni de planes.
