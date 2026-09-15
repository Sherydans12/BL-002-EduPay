# Topología productiva EduPay

Verificado: **2026-09-15**, después de promover el corte administrativo de
mapping BL con flags apagados. Estado funcional:
**MAPPING_BL_DEPLOYED_FLAGS_OFF** (pantalla desplegada; no se asignaron
mappings durante este despliegue).
Esta es la referencia operativa vigente. Los ADR aceptados conservan autoridad
sobre arquitectura y contratos; los runbooks anteriores son evidencia histórica.

## Observación del corte administrativo de mapping — 2026-09-15

El merge aprobado `04687aa8c5249ad1f9be94c7ad62099fb41d5d6c` fue promovido
manualmente por recurso, después de verificar que `origin/main` y los checks
seguían aprobados. Coolify conserva auto deploy desactivado (`Manual deployments
only`), por lo que actualizar documentación no inicia otra promoción.

| Recurso | Deployment | Código importado | Imagen local realmente construida | Resultado |
|---|---|---|---|---|
| BL BACK | `hyazttydvyryxkrvy9asscwo` | `04687aa8c5249ad1f9be94c7ad62099fb41d5d6c` | `km0aljzabdiqtaixj9dsequu:04687aa8c5249ad1f9be94c7ad62099fb41d5d6c`, manifiesto `sha256:4b0f403a51bc45b3ce229bf01d97e108804d3326765f1e3f4e788834bac76a1a` | Coolify Success; contenedor healthy; `/api/v1/health` HTTP 200 y base `up` |
| BL FRONT | `nkdxjzelyq4ontdnmt3zbh3t` | `04687aa8c5249ad1f9be94c7ad62099fb41d5d6c` | `ktgdely86kx0by10p9cb91os:04687aa8c5249ad1f9be94c7ad62099fb41d5d6c`, manifiesto `sha256:9b2193b1783b764ae2ff304f7ccd14154af6cb37277359d23cb0215301e3b2d9` | Coolify Success; health interno `/login` healthy; login público HTTP 200 |

La primera acción manual `rlhzsonbpmykhwkihknepv0w` fue sólo un redeploy del
artefacto anterior `16e208af6a50e5703bc8f6edd51d7ff11b9c6381`; no se considera
evidencia del corte y no cambió el resultado funcional. El build posterior fijó
explícitamente el SHA aprobado y usó el Dockerfile local de Coolify, no una
imagen GHCR candidata ni credenciales nuevas.

Los guards operativos permanecen sin activación: `RUN_MIGRATIONS=false`, sin
runner de migración en los logs del deployment (el `prisma generate` observado
es parte del build), y producer, publisher, shadow y projection permanecen
apagados. No se modificaron Académico, Identity ni workers.

La ruta pública `/dashboard/vinculacion` redirigió a
`/login?redirect=%2Fdashboard%2Fvinculacion` sin sesión. No había una sesión
SUPER_ADMIN disponible para la comprobación productiva, por lo que el acceso
autorizado no se declara verificado ni se introdujeron credenciales. La
pantalla está desplegada; asignaciones de mapping en producción: **0 operaciones
de escritura ejecutadas en este despliegue**, y ninguna confirmación real fue
realizada.

Rollback preparado por recurso: BL BACK al artefacto anterior observado
`km0aljzabdiqtaixj9dsequu@sha256:85b202901f77a60cb120f0cc720b878f54e0e570da4d8c191d3040ee511ef64f`
(deployment `rlhzsonbpmykhwkihknepv0w` / código `16e208a`); BL FRONT al tag
anterior `ktgdely86kx0by10p9cb91os:502e6463464de0a54b440362a64da0c31450818f`.
Ante un fallo, restaurar sólo el recurso afectado y repetir sus healthchecks.

## Observación de release — 2026-09-14

El tramo BL del release de proyección quedó desplegado con funcionalidades
desactivadas. Coolify fijó el BACK al commit aprobado
`16e208af6a50e5703bc8f6edd51d7ff11b9c6381`; el deployment manual
`nhwca59ptvsocugghdh0uiwv` construyó y dejó saludable la imagen local con
digest `sha256:85b202901f77a60cb120f0cc720b878f54e0e570da4d8c191d3040ee511ef64f`.
La imagen GHCR preconstruida `ghcr.io/sherydans12/edupay-bl002@sha256:c19015e02821bcb5ede62b837ab33eba542d947f0de9a70d93bde89f5c5e1cf4`
se verificó localmente, pero el daemon de la VPS no pudo extraerla por falta de
autenticación; no se la declara como imagen desplegada. El build de Coolify
usó el commit exacto y su Dockerfile aprobado.

Antes del deployment se aplicaron exclusivamente las migraciones
`20260903090000_add_tenant_canonical_mapping` y
`20260903113000_add_academic_financial_projection_shadow`. El ledger BL quedó
con 36 intentos: 28 aplicados, 8 revertidos históricos y 0 no resueltos; cada
reversión histórica tiene una aplicación posterior exitosa. Las cinco tablas
nuevas existen y permanecen vacías. BL BACK conserva `RUN_MIGRATIONS=false`;
`ACADEMIC_FINANCIAL_PROJECTION_ENABLED` y las credenciales inbound/snapshot
no están configuradas. BL FRONT permanece en `502e646` y no fue redeployado.
BL FRONT/BACK conservan auto deploy desactivado (`Manual deployments only`).

Este archivo y `coolify-inventory.json` son la referencia operativa vigente
para BL-002 y su fotografía conjunta con Académico. Ante cualquier diferencia
futura entre esta fotografía y Coolify, hacer inventario read-only y reconciliar
antes de desplegar. Un nombre, una rama o un contenedor healthy por sí solos no
identifican al producto correcto.

## Repositorios y responsabilidades

| Repositorio | Responsabilidad | Código productivo al cierre |
|---|---|---|
| [Sherydans12/BL-002-EduPay](https://github.com/Sherydans12/BL-002-EduPay) | Administración de pagos, alumnos/cursos de origen, autenticación administrativa y API de integración | FRONT/BACK: `04687aa8c5249ad1f9be94c7ad62099fb41d5d6c` |
| [Sherydans12/edupay-academico](https://github.com/Sherydans12/edupay-academico) | Experiencia académica, autorización académica, aprendizaje, entregas, sincronización y notificaciones | FRONT: `4f5ad2839e08e561e0335f6e4fdedfe448f15415`; API: `e5bd78a3c0588df540878b130d7d22cd039cf7d1`; workers: `b2f489f3bfbb67da8fc8ff71be7ea551e1de27c9` |
| [Sherydans12/edupay-identity](https://github.com/Sherydans12/edupay-identity) | Credenciales, sesiones, membresías, roles, activación, recuperación y auditoría de autenticación | OCI `b38849be78fee492f68f2d0e99cff3b69a08415a` |

BL-002 conserva su dominio de autenticación propio. No valida sesiones
administrativas con Identity ni debe consumir la API Académico como backend.
Académico usa Identity para autenticación y su propia API para datos académicos.

## Ubicación canónica en Coolify

- Consola: [coolify.baselogic.cl](https://coolify.baselogic.cl).
- Proyecto: **My first project**, UUID `p5gswqrr8ot1oaoxwytrpsho`.
- Entorno: **production**, UUID `oej046b1ozl6a1w329bx8zdd`.
- Servidor: **localhost**, UUID `h10grmpaqnhiissqexi1k4mu`, VPS `187.77.250.148`.
- Proxy: Traefik administrado por Coolify. Red compartida de acceso privado:
  `coolify`, además de las redes propias de cada stack.
- El antiguo proyecto **EduPay Académico** fue eliminado por estar vacío.
  No recrearlo ni buscar allí la producción.
- **Admission** y los demás sitios de My first project pertenecen a otros
  alcances. Compartir VPS no autoriza a detenerlos, cambiar sus bases o podarlos.

## Un dominio, un recurso

| Tipo / nombre Coolify | UUID | Dominio único | Puerto interno |
|---|---|---|---|
| Aplicación EDUPAY FRONT | `ktgdely86kx0by10p9cb91os` | `edupay.baselogic.cl` | 3000 |
| Aplicación EDUPAY BACK | `km0aljzabdiqtaixj9dsequu` | `api-edupay.baselogic.cl` | 3001 |
| Aplicación edupay-academico-web | `qf65r4ltig6jhb6t8dmv2qyw` | `academico.edupay.baselogic.cl` | 3000 |
| Servicio edupay-academico-pinned | `iobfkpujjoa2kj5urbpnjvzi` | `academico-api.edupay.baselogic.cl` | 3001 |
| Servicio edupay-identity-pinned | `0vrvqepcukwcubxga0narorf` | `identity.edupay.baselogic.cl` | 3000 |
| Servicio edupay-academico-notification-worker-pinned | `nn8yrhitex2r6squev0auwrs` | Ninguno | Sin publicación |
| Servicio edupay-academico-sync-worker-pinned | `r8mtn1xqtex96j4a8wu5hae6` | Ninguno | Sin publicación |
| Aplicación clamav | `ttrrmrkod9hmqo68er6q2ghs` | Ninguno | Privado |

**Nunca asignar edupay.baselogic.cl a Académico ni
academico.edupay.baselogic.cl a BL-002.** Verificar también labels efectivos
del contenedor y upstreams Traefik: un dominio vacío en Coolify no elimina por
sí solo una ruta vieja de un contenedor anterior.

Los nombres de los contenedores de aplicaciones tienen sufijos por deployment;
usar UUID como identidad estable, no un sufijo antiguo. No añadir puertos del
host para resolver fallos de comunicación privada.

## Imágenes y build

Los workers Académico conservan exactamente:

`ghcr.io/sherydans12/edupay-academico@sha256:b3e45d7c0afad1729947bdea6fe16d517c3dc9060891b38b313ce14a0548084a`

La API Académico conserva exactamente:

`ghcr.io/sherydans12/edupay-academico@sha256:87daba03ee6ab34f00998270e4959a0e5073fdb3548c3a11d60b140bd0280cff`

Identity conserva exactamente:

`ghcr.io/sherydans12/edupay-identity@sha256:eb35930f4fb0358d891c50c57e301d47fb033b9d9a0b53284fea0b68e73aa7f8`

Un digest de manifiesto, el ID local de imagen y un SHA Git son identificadores
distintos. No sustituirlos entre sí ni cambiar el pinned a `latest`.

| Recurso | Rama configurada | Base / Dockerfile Coolify | Target / health |
|---|---|---|---|
| BL-002 FRONT | `main`, SHA fijado arriba | `/frontend` + `/Dockerfile` | `runner`; HTTP 127.0.0.1:3000/login |
| BL-002 BACK | `main`, SHA fijado arriba | `/backend` + `/Dockerfile` | Etapa final; health público /api/v1/health; imagen observada `sha256:4b0f403a51bc45b3ce229bf01d97e108804d3326765f1e3f4e788834bac76a1a` |
| Academic FRONT | `codex/production-latest-web-recovery`, SHA fijado arriba | `/` + `/deploy/Dockerfile.web` | `runtime`; HTTP 127.0.0.1:3000/login |

Conservar los comandos del recurso validado. Academic FRONT escucha en todas
las interfaces dentro del contenedor mediante HOSTNAME; su health usa loopback.
No vaciar el target sin verificar persistencia: Coolify conservó un target
anterior al intentar hacerlo.

## Bases y persistencia

| Propietario | Recurso Coolify | UUID | Imagen observada / volumen |
|---|---|---|---|
| BL-002 BACK | postgresql-database-EDUPAY | `dms5i3e0i5t4kyh7h683mi7v` | postgres:18-alpine; `postgres-data-dms5i3e0i5t4kyh7h683mi7v` → /var/lib/postgresql |
| Académico API y workers | academico-db | `v5w9hacwtftulf4m46l1rn2g` | postgres:15-alpine; `postgres-data-v5w9hacwtftulf4m46l1rn2g` → /var/lib/postgresql/data |
| Identity | identity-db | `bluypktxta8uisbrfzu6p9pw` | postgres:15-alpine; `postgres-data-bluypktxta8uisbrfzu6p9pw` → /var/lib/postgresql/data |

Las tres conexiones se comprobaron relacionando internamente el hostname de la
configuración con el contenedor, sin imprimir DATABASE_URL. No hay tablas,
credenciales, consultas SQL ni claves foráneas compartidas entre productos.
Cada backend usa exclusivamente su base. El Sync Worker escribe en Académico y
lee BL-002 por HTTP, nunca conectándose a PostgreSQL BL-002.

Los frontends no tienen acceso a bases. BACK BL-002 conserva el bind
`/edupay-backend-uploads` → `/usr/src/app/uploads`. Académico conserva su
almacenamiento privado, STORAGE_ROOT y STORAGE_TEMP_ROOT; verificar sus montajes
reales antes de recrear el servicio. ClamAV es una dependencia de la API para
análisis de archivos; sus originales de evidencia mantienen la política del ADR
de almacenamiento. No reemplazar ni inicializar volúmenes en un redeploy.

El inventario completo incluye **11 contenedores de aplicación/dependencia
EduPay healthy**, contando PostgreSQL BL-002. Los anteriores recuentos de 10
tras la limpieza cubrían los recursos de la remediación y omitían esa base
preexistente. Coolify, su base, proxy y otros proyectos son infraestructura
adicional, no instancias duplicadas de EduPay.

## Cómo se conectan

```mermaid
flowchart LR
  BF["BL-002 FRONT"] -->|"HTTPS: API BL-002"| BB["BL-002 BACK"]
  BB --> BDB[("PostgreSQL BL-002")]
  AF["Academic FRONT"] -->|"HTTPS: API Académico"| AA["Academic API pinned"]
  AF -->|"Login / refresh / membresías"| ID["Identity pinned"]
  AA -->|"JWT: issuer, audience, JWKS; checks internos autorizados"| ID
  AA --> ADB[("PostgreSQL Académico")]
  ID --> IDB[("PostgreSQL Identity")]
  SW["Sync Worker"] -->|"Pull S2S autenticado: cursos y estudiantes"| BB
  SW --> ADB
  NW["Notification Worker"] --> ADB
  AA --> AV["ClamAV privado"]
```

- Base del bundle BL-002: `https://api-edupay.baselogic.cl/api`.
- Base del bundle Académico: `https://academico-api.edupay.baselogic.cl/api/v1`.
  La ruta versionada es obligatoria en el código publicado; `/api` no equivale
  a `/api/v1` para este frontend.
- Identity público: `https://identity.edupay.baselogic.cl`.
  JWT/JWKS, cookies seguras y CORS pertenecen al flujo Identity–Académico.
  Verificar el origen exacto `https://academico.edupay.baselogic.cl`.
- Integración BL-002: GET `/api/v1/integrations/academico/snapshot`,
  `/snapshot/complete`, `/courses` y `/students`, bajo ese mismo prefijo.
  Contrato v1, token S2S dedicado, allowlist de tenants y cursores firmados.
  La dirección base del Sync Worker se comprobó contra el backend público BL-002.
- BL-002 es fuente administrativa de cursos, estudiantes y curso actual.
  Académico mantiene pedagogía, docentes, asignaturas, entregas e historia.
  Identity mantiene autenticación. Un tenant de origen BL-002 no es una
  autorización ni una equivalencia automática con el tenant canónico:
  el mapeo es explícito y controlado en servidor.
- El worker sano y la presencia del token no prueban que cada tenant tenga una
  sincronización de negocio completa. Auditar runs, conflictos y cursores sin
  leer ni publicar payloads personales antes de cerrar una nueva fase de sync.

## Configuración: solo nombres

| Recurso | Nombres que deben comprobarse | Regla |
|---|---|---|
| BL FRONT | NEXT_PUBLIC_API_URL, JWT_SECRET | Base propia compilada; JWT_SECRET solo servidor y coherente con BACK |
| BL BACK | DATABASE_URL, JWT_SECRET, FRONTEND_URL, RUN_MIGRATIONS | Conexión propia; migración automática desactivada en producción |
| BL integración | EDUPAY_ACADEMICO_INTEGRATION_TOKEN, EDUPAY_ACADEMICO_ALLOWED_TENANTS, EDUPAY_ACADEMICO_CURSOR_SECRET | S2S y tenant; nunca credenciales del navegador |
| Academic FRONT | NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_IDENTITY_BASE_URL, HOSTNAME, PORT | Solo las bases públicas correctas en el bundle |
| Academic API | DATABASE_URL, IDENTITY_ISSUER, IDENTITY_AUDIENCE, IDENTITY_JWKS_URI, IDENTITY_INTERNAL_BASE_URL, IDENTITY_INTERNAL_SERVICE_TOKEN, ACADEMIC_TRUSTED_WEB_ORIGINS | Identidad validada, CORS exacto y base privada propia |
| API / Sync | EDUPAY_INTEGRATION_BASE_URL, EDUPAY_INTEGRATION_TOKEN y EDUPAY_SYNC_* | Fuente HTTP BL-002; datos de sincronización en base Académico |
| API / Notification | ACADEMIC_EMAIL_MODE, ACADEMIC_RESEND_API_KEY, NOTIFICATION_* | Entrega y reintentos del outbox Académico |
| API / almacenamiento | STORAGE_ROOT, STORAGE_TEMP_ROOT, ACADEMIC_MALWARE_SCANNER, ACADEMIC_CLAMAV_HOST, ACADEMIC_CLAMAV_PORT | Volúmenes privados y scanner accesible |

Nombres heredados presentes en BL FRONT (NEXT_PUBLIC_API_BASE_URL y
NEXT_PUBLIC_IDENTITY_BASE_URL) no son el contrato de configuración de su código
502e646. No usarlos para configurar su API ni inferir integración con Identity;
el bundle efectivo fue comprobado contra BL-002. Su eventual retirada exige
comparar el código y el artefacto, no cambiar valores a ciegas.

Guardar secretos exclusivamente en mecanismos protegidos. No adjuntar dumps,
.env, tokens, cookies, contraseñas, claves privadas ni salidas completas de
docker inspect o logs a Git, PRs o documentos. No hay valores secretos aquí.

## Referencias

- [Inventario estructurado](coolify-inventory.json).
- [Runbook de cambios y recuperación](RUNBOOK.md).
- [Cierre de fase, evidencia y límites](PHASE-CLOSEOUT.md).
