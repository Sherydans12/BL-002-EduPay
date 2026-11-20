# Activación del modo escritura Académico → BL — 2026-11-18 a 2026-11-20

Estado: **activado y verificado (fases A–D).** Pendiente solo la prueba de
punta a punta con un cambio real de Académico. Cada fase tuvo autorización
específica. El operador hace los redeploy y la configuración en Coolify; la
sesión del orquestador solo ejecuta en la terminal del servidor lo que se
autorice, verificando antes que es `localhost · Server` / `root@srv1524006`.

Base: [ADR-0027](../../backend/docs/decisions/ADR-0027-academic-projection-write-mode.md).
Código en `main` `081b84c` (PR #12 BACK y PR #13 FRONT), luego `5329ca0`
(PR #14, corrección hallada en la fase B). Sin secretos, nombres
ni RUN en este documento.

Decisiones del operador (2026-11-18): el publicador de Académico se ejecuta con
una **tarea programada de Coolify**; la credencial entrante de BL **reutiliza**
la credencial S2S existente del tenant.

## Recursos

| Recurso       | UUID (documentado)         | Cambio                                              |
| ------------- | -------------------------- | --------------------------------------------------- |
| BL BACK       | `km0aljzabdiqtaixj9dsequu` | Redeploy desde `main`; variables de las fases C y D |
| BL FRONT      | `ktgdely86kx0by10p9cb91os` | Redeploy desde `main`                               |
| PostgreSQL BL | `dms5i3e0i5t4kyh7h683mi7v` | Migración aditiva                                   |
| Académico API | `iobfkpujjoa2kj5urbpnjvzi` | Variables y tarea programada (fase D)               |

Comprobar cada UUID en vivo en Coolify antes de tocarlo; los de esta tabla son
documentación del 2026-11-16.

## Fase A — Migración y despliegue (flag apagado)

Objetivo: BL corre `081b84c` con la migración
`20261117120000_academic_projection_write_mode` aplicada y
`ACADEMIC_FINANCIAL_PROJECTION_WRITE_ENABLED` ausente o `false`. No cambia
datos.

1. **Recovery point** según RUNBOOK (`pg_dump -Fc` dentro del contenedor de la
   base y `tar -czf` de `/edupay-backend-uploads`, en
   `/root/edupay-recovery/bl-002/<UTC>/`, `umask 077`, `SHA256SUMS`).
2. **Archivo de migración**: transferirlo en base64 desde `081b84c` y verificar
   SHA-256 `099fd3a1ea53730d7ddde4461a5ae079b9cb7a847a4d2157703af81038a828bb`
   (1.228 bytes, blob LF).
3. **Ensayo aislado**: restaurar el dump en PostgreSQL 18.3 desechable
   (`--network none`, misma imagen), `psql -1 -v ON_ERROR_STOP=1 -f
migration.sql`, y comparar antes/después: alumnos, cursos, matrículas,
   cuotas (cantidad y suma), pagos (cantidad y suma), apoderados. Deben ser
   idénticos; las columnas nuevas, todas nulas. Eliminar el contenedor.
4. **Preflight**: `prisma migrate status` con la imagen en servicio — solo la
   migración nueva pendiente; ledger sin intentos sin resolver.
5. **Migrar** con el runner desechable del 2026-11-16 (misma imagen en servicio,
   `--entrypoint npx`, red `coolify`, migraciones del contenedor más la nueva
   en solo lectura, `DATABASE_URL` por `--env-file` 600, eliminado al
   terminar). Postflight: ledger con la migración aplicada y su checksum;
   conteos idénticos al ensayo.
6. **Redeploy BL BACK** (operador). Verificar `GET /api/v1/health` 200,
   `migrate status` "up to date", y sin sesión `GET /api/academic-intake` →
   `401`.
7. **Redeploy BL FRONT** (operador). Verificar `/login` y que
   **Alumnos → Nuevos desde Académico** muestre "No hay alumnos por
   incorporar" (la bandeja está vacía mientras no se escriba).

**Detenerse si:** el ensayo cambia algún conteo o monto; hay más de una
migración pendiente o intentos sin resolver; el BACK no queda sano.

Orden: la migración va **antes** del BACK nuevo (el código lee las columnas
nuevas); el código anterior funciona sobre el esquema nuevo.

### Evidencia fase A — 2026-11-18 (horas UTC)

Terminal `localhost · Server` (`root@srv1524006`).

- Estado previo: BL BACK `km0aljzabdiqtaixj9dsequu-20261116T220513`, imagen
  `km0aljzabdiqtaixj9dsequu:ec61e31da2bec10d9613046b1f58cf2bd683439d`,
  healthy; base `postgres:18-alpine` (`sha256:54451ecb…`), healthy;
  `RUN_MIGRATIONS=false`, sombra `true`, escritura sin definir; 30 migraciones,
  "up to date".
- **Recovery point `20261118T162733Z`** en
  `/root/edupay-recovery/bl-002/20261118T162733Z/` (archivos 600):

  | Archivo             | Bytes      | SHA-256                                                            |
  | ------------------- | ---------- | ------------------------------------------------------------------ |
  | `bl-postgres.dump`  | 417.848    | `04b4f6d1ea845fda22298428378139dff1e9756e6c1145853436e968eb075261` |
  | `bl-uploads.tar.gz` | 43.652.160 | `a23621678070e757b515305329da420519c080a3642c4125b22a8b9769360d69` |
  | `migration.sql`     | 1.228      | `099fd3a1ea53730d7ddde4461a5ae079b9cb7a847a4d2157703af81038a828bb` |

- **Ensayo aislado** (PostgreSQL 18, `--network none`, eliminado): antes y
  después idénticos — 256 alumnos, 16 cursos, 252 apoderados, 256 matrículas,
  2 años, 2.723 cuotas (suma 579.107.907; pagado 419.035.215), 2.207 pagos
  (suma 475.710.113), 243 filas de sombra; columnas nuevas todas nulas.
- **Preflight**: 31 migraciones, solo la nueva pendiente.
- **Migración** con runner desechable (misma imagen `ec61e31`, red `coolify`,
  migraciones en solo lectura, `DATABASE_URL` por `--env-file` 600, eliminado):
  aplicada 16:29:42 UTC, salida 0, "up to date".
- **Postflight**: conteos y montos de la base viva idénticos al ensayo;
  columnas nuevas nulas; ledger 39 intentos (31 aplicados, 8 revertidos
  resueltos, 0 sin resolver); checksum registrado `099fd3a1…828bb`;
  `/api/v1/health` 200 con el BACK anterior.
- **Redeploy** (operador) y verificación 17:00 UTC:

  | Recurso                                | Código    | Imagen local                                                              | Estado              |
  | -------------------------------------- | --------- | ------------------------------------------------------------------------- | ------------------- |
  | BL BACK `km0aljzabdiqtaixj9dsequu`     | `081b84c` | `sha256:feeb3aaa0cd8acc710efa3fca73457d9d2cb9f6cdcdcf174f3977154abc9eda0` | Healthy desde 16:54 |
  | BL FRONT `ktgdely86kx0by10p9cb91os`    | `081b84c` | `sha256:c8f60b1b1beb83912a87adf8aee8a11e2b08240ffea4b33746f9be16ba34b225ff` | Healthy desde 16:58 |

  `RUN_MIGRATIONS=false`, sombra `true`, escritura sin definir; 31 migraciones
  "up to date"; `/api/v1/health` 200; sin sesión `GET /api/academic-intake` y
  `write-plan` → 401; FRONT `/login` 200 y `/alumnos/por-incorporar` → 307 al
  login. Rollback de aplicación: imágenes locales `ec61e31` (BACK) y
  `d72b0da` (FRONT); la migración es aditiva y compatible con ellas.

**Fase A completada.** Sin cambios en alumnos, cursos, matrículas, cuotas ni
pagos.

## Fase B — Plan de escritura (solo lectura)

1. Snapshot y conciliación de la sombra como el 2026-11-15
   (`POST .../shadow/tenants/colegio-conquistadores/snapshots` y su
   `reconciliation`), con sesión `SUPER_ADMIN`.
2. `GET /api/integrations/academic-financial-projection/shadow/tenants/colegio-conquistadores/write-plan`.
   Registrar solo conteos e IDs de matrícula.
3. **Revisión con el operador** antes de seguir:
   - 2026 ya está vinculado por ID canónico desde la migración del
     2026-11-16: no debe aparecer `YEAR_LINKED` ni `YEAR_CREATED` para 2026.
     `YEAR_CREATED` y `COURSE_CREATED` solo si Académico ya tiene matrículas 2027.
   - `COURSE_LINKED` ≈ cursos conciliados (12).
   - `STUDENT_LINKED` ≈ alumnos conciliados (242).
   - `STUDENT_RENAMED`: cuántos nombres de BL pasarán a los de Académico
     (ADR-0025: Académico es la fuente). Decidir si se acepta.
   - `STUDENT_NATIONAL_ID_DIFFERS`: RUN distintos; no se cambian, pero deben
     revisarse.
   - `PENDING_INTAKE`, `CONFLICT` y `SKIPPED` con sus motivos.

**Detenerse si:** hay conflictos no explicados, `COURSE_LEGACY_NOT_FOUND` o
`STUDENT_LEGACY_NOT_FOUND`, o la cantidad de renombres no se acepta.

### Evidencia fase B — 2026-11-18 (horas UTC)

Sesión `SUPER_ADMIN` en BL; solo conteos, IDs y etiquetas de curso.

- `legacy-comparison`: alumnos 242/242 vinculados, cursos 12/12, sin
  bloqueantes ni decisiones pendientes, `runMismatch` 0,
  `readyForWriteMode: true`; año `2026` (`2330fa9a…`) con 242 matrículas
  activas.
- Snapshots 17:02 UTC (dos, el segundo `6815ccea-1811-4a2f-94ef-af3d4e44452f`):
  conciliado, 243 vistos, 0 faltantes, 0 extra, 0 desactualizados, 0 de otro
  tenant, 0 tombstones pendientes.
- `write-plan` 17:02:53 UTC (simulación revertida): 243 filas; `APPLIED` 242,
  `PENDING_INTAKE` 1 (`NEW_STUDENT`), `CONFLICT` 0, `SKIPPED` 0. Cambios:
  `STUDENT_LINKED` 242, `COURSE_LINKED` 12, `ENROLLMENT_LINKED` 242,
  `COURSE_CREATED` 1. Sin renombres, sin RUN distintos, sin cambios de curso
  ni de años; espejos sin cambios.
- **Hallazgo:** la fila restante es la matrícula de prueba dada de baja
  (curso `TEST-ONLY — 1° Medio A`, 2026, `INACTIVE`/tombstone, alumno manual
  sin RUN/IPE, sin homónimo en BL). El aplicador crearía ese curso en BL
  (`COURSE_CREATED`) aunque el alumno queda pendiente y la bandeja no lo
  muestra. **Fase C detenida** hasta corregirlo: una fila inactiva o de un
  alumno no vinculado no debe crear años ni cursos.

### Corrección y plan repetido — 2026-11-18/19

- PR #14 (`34b1f45`, merge `5329ca0`): el aplicador resuelve primero al
  alumno; una fila sin alumno vinculado no crea años ni cursos.
- Redeploy (operador): BL BACK `km0aljzabdiqtaixj9dsequu:5329ca0`, imagen
  local `sha256:a42d580f82ba630f4ecb15118a614ed3fb4c9d7188c7ef8afae35f7b9920e7b0`,
  healthy desde 2026-11-18 17:19:40 UTC; escritura sin definir; 31
  migraciones "up to date"; `/api/v1/health` 200.
- Snapshot 2026-11-19 14:15 UTC `1c39bc49-1779-4a95-8707-54b4e562dd7e`:
  conciliado, 243 vistos, 0 faltantes, 0 extra, 0 desactualizados.
- `write-plan` 14:15:22 UTC: 243 filas; `APPLIED` 242, `SKIPPED` 1
  (`INACTIVE_NOT_LINKED`, la matrícula de prueba
  `3797d18c-0d2e-4c5e-a3d2-3baac237eb81`), `PENDING_INTAKE` 0, `CONFLICT` 0.
  Cambios: `STUDENT_LINKED` 242, `COURSE_LINKED` 12, `ENROLLMENT_LINKED` 242;
  sin años ni cursos creados, sin renombres ni RUN distintos; espejos sin
  cambios. **Plan aceptable para la fase C.**

## Fase C — Escritura inicial

1. **Recovery point nuevo** (los mismos pasos de A.1): esta fase sí cambia
   datos.
2. Operador: en BL BACK, `ACADEMIC_FINANCIAL_PROJECTION_WRITE_ENABLED=true`;
   redeploy (desmarcar "Run Docker Cleanup").
3. `POST .../write-plan/apply` con sesión `SUPER_ADMIN`. Debe coincidir con el
   plan de B.
4. Verificar: cuotas (cantidad y suma) y pagos (cantidad y suma) **sin
   cambios**; matrículas por año y estado; alumnos con `canonicalStudentId`;
   repetir `write-plan` → solo `PENDING_INTAKE`/`CONFLICT` reintentables, sin
   cambios nuevos; bandeja con los alumnos nuevos, si los hay.

**Detenerse si:** cambia cualquier cuota o pago. Rollback: apagar el flag y
redeploy; si hace falta volver datos, restaurar el recovery point de C.1
(con autorización).

### Evidencia fase C — 2026-11-19 (horas UTC)

- **Recovery point `20261119T141711Z`** en
  `/root/edupay-recovery/bl-002/20261119T141711Z/` (archivos 600):

  | Archivo             | Bytes      | SHA-256                                                            |
  | ------------------- | ---------- | ------------------------------------------------------------------ |
  | `bl-postgres.dump`  | 420.295    | `f80af179dc1f689788e6c4cf564684dc2f15e4fe77c6ecf6cdee3ee86ca39e31` |
  | `bl-uploads.tar.gz` | 43.746.207 | `9cbc164b2834d846dcc18e26fb34d40163203c23aedb22e52335e94a6d180494` |

- Línea base 14:17 UTC: 256 alumnos, 16 cursos, 252 apoderados, 256
  matrículas (246 activas), 2 años, 2.723 cuotas (suma 579.107.907; pagado
  419.882.215), 2.211 pagos (suma 476.557.113), 243 filas de sombra; 0
  vínculos canónicos escritos. (Desde el 2026-11-18 se registraron 4 pagos
  por operación normal.)
- Flag (operador): `ACADEMIC_FINANCIAL_PROJECTION_WRITE_ENABLED=true`; BL BACK
  `5329ca0` reconstruido, imagen local
  `sha256:977bf20c7d2db62d3fb54e491e7f96d9297783c12b256a71ba472c988b43e6a5`,
  healthy desde 14:33:29; credencial entrante aún sin cargar.
- Corte previo 14:37:59: 2.723 cuotas (suma 579.107.907; pagado 422.478.115),
  2.223 pagos (suma 479.153.013); 0 vínculos.
- `write-plan/apply` 14:38:34–14:38:37 (201), precedido por un plan idéntico
  al revisado: 243 filas; `APPLIED` 242, `SKIPPED` 1
  (`INACTIVE_NOT_LINKED`); `STUDENT_LINKED` 242, `COURSE_LINKED` 12,
  `ENROLLMENT_LINKED` 242; sin años, cursos ni renombres; espejos sin cambios.
- Verificación 14:38–14:39: plan repetido sin filas pendientes; bandeja
  vacía; cuotas y pagos **idénticos** al corte (0 pagos nuevos, 0 cuotas
  tocadas); vínculos 242 alumnos / 12 cursos / 242 matrículas; matrículas 246
  activas y 10 inactivas, sin cambio; 2 años; resultados en la sombra 242
  `APPLIED` y 1 `SKIPPED`.

**Fase C completada.** Desde aquí, cada evento que llegue a BL se escribe en
sus tablas.

## Fase D — Eventos en línea

1. Operador, BL BACK: `ACADEMIC_FINANCIAL_PROJECTION_INBOUND_CREDENTIALS` con
   **el mismo valor** que `ACADEMIC_FINANCIAL_PROJECTION_SNAPSHOT_CREDENTIALS`;
   redeploy.
2. Operador, Académico API:
   - `ACADEMIC_FINANCIAL_PROJECTION_PUBLISHER_ENABLED=true`;
   - `BL_FINANCIAL_PROJECTION_BASE_URL=https://api-edupay.baselogic.cl`
     (sin `/api`: el publicador agrega
     `/api/integrations/academic-financial-projection/events`);
   - `BL_FINANCIAL_PROJECTION_SERVICE_KEY_ID` y
     `BL_FINANCIAL_PROJECTION_SERVICE_TOKEN` con el `keyId` y el `token` de la
     credencial S2S del tenant (el validador exige que existan; para el tenant
     mapeado el publicador usa la entrada de
     `ACADEMIC_FINANCIAL_PROJECTION_S2S_CREDENTIALS`).
   - Redeploy del API. **Si falta cualquiera de las tres variables `BL_*`, el
     API no arranca** (validación de entorno): revisar los logs del deploy y
     corregir antes de seguir.
3. **Un drenaje manual** en la terminal del contenedor del API:
   `node dist/financial-projection/financial-projection-publisher-main.js`.
   Revisar la línea `FINANCIAL_PROJECTION_PUBLISH_DRAIN` (publicados,
   reintentos, fallidos). En BL, los eventos ya escritos por el snapshot
   quedan `STALE`; ninguno `QUARANTINED` ni `401`.
4. Repetir el drenaje hasta vaciar el outbox acumulado desde el 2026-11-15 (50
   por ejecución).
5. Operador, Académico API → **Scheduled Tasks**: tarea cada minuto
   (`* * * * *`) con el mismo comando, en el contenedor del API.
6. Prueba de punta a punta con un caso controlado (autorizado aparte):
   un cambio real en Académico aparece en BL en ~1 minuto.

**Detenerse si:** BL responde `401`/`403` (credencial), aparecen eventos
`QUARANTINED`, o el publicador marca `FAILED`. Rollback: desactivar la tarea
programada y `ACADEMIC_FINANCIAL_PROJECTION_PUBLISHER_ENABLED=false`; los
eventos quedan en el outbox.

### Evidencia fase D — 2026-11-20 (horas UTC)

- Pre-chequeo 05:10 (solo presencia de variables y huellas, sin valores):
  Académico API `ghcr.io/sherydans12/edupay-academico@sha256:7625ab22…`
  healthy; proyección y credencial S2S definidas; publicador y variables
  `BL_*` sin definir. BL BACK sin credencial entrante. La credencial S2S de
  Académico es idéntica (misma huella SHA-256) a la de snapshot de BL.
  Outbox de Académico: 1 evento `PENDING` (2026-11-16).
- Variables y redeploy (operador): BL BACK `5329ca0` healthy desde 05:17:53
  con `ACADEMIC_FINANCIAL_PROJECTION_INBOUND_CREDENTIALS` igual a la de
  snapshot; Académico API (`sha256:7625ab22…`) healthy desde 05:20:44 con
  publicador `true`, `BL_FINANCIAL_PROJECTION_BASE_URL=https://api-edupay.baselogic.cl`,
  y `BL_FINANCIAL_PROJECTION_SERVICE_KEY_ID`/`_TOKEN` iguales al `keyId` y
  `token` de la credencial S2S (comparación por huella, sin mostrar valores).
  `health/ready` Académico 200; `health` BL 200.
- Drenaje manual 05:22:
  `{"action":"FINANCIAL_PROJECTION_PUBLISH_DRAIN","published":1,"attempted":1}`;
  outbox `PUBLISHED` 1 (1 intento), sin pendientes. BL: el evento llegó
  autenticado y quedó `STALE` (`ENTITY_VERSION_NOT_NEWER`, ya escrito por el
  snapshot); cuarentena 0; cuotas y pagos sin cambios (2.723 cuotas, suma
  579.107.907; 2.227 pagos, suma 480.033.013).
- Tarea programada (operador) en el servicio Académico API
  (`service/iobfkpujjoa2kj5urbpnjvzi`): "Auto Send", `* * * * *`, servicio
  `academic-api`, timeout 300 s, comando
  `node dist/financial-projection/financial-projection-publisher-main.js`.
  Ejecuciones cada minuto desde 05:26:03 hasta al menos 05:32:02, todas
  `Success` (1–3 s); salida
  `{"action":"FINANCIAL_PROJECTION_PUBLISH_DRAIN","published":0,"attempted":0}`
  con el outbox vacío. (Las ejecuciones de Coolify no aparecieron en
  `docker events` filtrado por `exec_start`; la evidencia es el historial de
  la tarea.)

**Fase D completada.** Cada cambio de matrícula en Académico llega a BL en
~1 minuto y se escribe en sus tablas. Pendiente: verificar el primer cambio
real (p. ej. una incorporación a 2027) de punta a punta.

## Después

- Registrar en este documento la evidencia de cada fase (horas UTC, conteos,
  digests e imágenes locales) y actualizar `PRODUCTION.md` de BL y Académico.
- Siguiente corte: retirar el alta y edición de alumnos y cursos en BL
  (ADR-0025), una vez verificada la escritura.
