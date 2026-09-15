# Validación de vinculación administrativa BL

**Estado:** completada en entorno aislado, sin publicación ni despliegue  
**Árbol validado:** `abc8e4280b00cf2f241d78ce6299adc67fca4ffc` (incluye
`a07c8d8`)  
**Base exacta:** `origin/main` =
`b569a9e0ad8ba3c0080576a697dd104e822909e7`  
**Relación:** [ADR-0023](../../backend/docs/decisions/ADR-0023-bl-administrative-canonical-mapping.md),
enlazado a ADR-0022, que permanece `Proposed`.

## Entorno y método

Se usó un PostgreSQL efímero `postgres:16-alpine`, una base nueva con datos
sintéticos y procesos BL en `127.0.0.1` separados del entorno productivo. Las
migraciones existentes se aplicaron sólo a esa base vacía para poder ejecutar
el backend real; el corte no agrega migraciones ni ejecuta ninguna en
producción. El proxy local de prueba registró método, ruta y presencia de
`x-tenant-id`, sin guardar Authorization, cookies ni secretos.

## Flujo frontend → backend

| Caso | Evidencia observada | Resultado |
| --- | --- | --- |
| Sesión y selección previa | `SUPER_ADMIN` inició sesión, seleccionó `Synthetic BL Tenant A` en `TenantSwitcher` y abrió `/dashboard/vinculacion`; la pantalla mantuvo ese tenant seleccionado y ocultó el switcher | OK |
| Aislamiento de headers | En la superficie de vinculación, `GET /tenants`, `GET /tenants/:id/canonical-mapping`, `POST ...?dryRun=true` y `POST .../canonical-mapping` llegaron sin `x-tenant-id` | OK |
| Comportamiento normal | El `TenantSwitcher` mantuvo `x-tenant-id=synthetic-bl-tenant-a` en su `GET /tenants` y `GET /analytics/dashboard`; el listado siguió respondiendo `200` con contexto seleccionado | OK |
| Consulta | La pantalla consultó el vínculo del tenant sintético y mostró que no existía | OK |
| Dry run | La UI mostró `Validación local aprobada` y explicitó que no comprueba Identity ni reserva el vínculo; antes de confirmar la base tenía `0` mappings | OK |
| Declaración manual | Se exigió checkbox, motivo y referencia sintéticos; la UI separó la declaración manual de la validación local y no la presentó como comprobación automática de Identity | OK |
| Revalidación y confirmación | El diálogo mostró nombre/ID BL y `canonicalTenantId` antes de ejecutar la operación 1A | OK |
| Timeout y recuperación | El proxy demoró 16 s la primera respuesta; la UI mostró recuperación y permitió reintentar con la misma correlación | OK |
| Idempotencia | El reintento respondió `201` con `created:false`; la fila final fue única y conservó actor, `reason`, `correlationId` y `createdAt` originales | OK |
| Conflictos | Otro tenant local con el mismo UUID respondió `409`; intentar otro UUID para el tenant ya vinculado respondió `409` | OK |
| Autorización | `TENANT_ADMIN` recibió `403 Acceso exclusivo para SUPER_ADMIN`; un `SUPER_ADMIN` con `x-tenant-id` en la operación de mapping recibió `403` por contexto de plataforma | OK |

## Integraciones apagadas

Tras el flujo aislado, la base contenía `1` fila en
`tenant_canonical_mappings` y `0` filas en proyecciones, eventos consumidos y
snapshots. El proxy sólo observó rutas de tenants, analytics y mapping; no hubo
llamadas de producer, publisher ni shadow. La pantalla también mantiene esa
restricción visible. No se modificó configuración de flags.

## Cobertura del guard

`TenantsController` conserva `SuperAdminGuard` a nivel de clase. Sólo
`findCanonicalMapping` y `assignCanonicalMapping` declaran además
`CanonicalMappingPlatformGuard`, que exige rol local `SUPER_ADMIN`, actor
autenticado, `tenantContext.tenantId === null` e identidad de plataforma. Así
`GET /tenants` no cambia para consumidores legítimos, mientras que las dos
operaciones de mapping quedan cubiertas. La cobertura está fijada por prueba de
metadatos y por la prueba HTTP anterior. No se amplía `SUPER_ADMIN` a datos
académicos.

## Typecheck global comparado

Se ejecutó bajo las mismas condiciones en dos worktrees limpios, con
`npm ci --no-audit --no-fund`, y `npx prisma generate` en backend:

```text
npx tsc --noEmit --pretty false

backend  origin/main: 0 errores, salida 0
backend  abc8e42:     0 errores, salida 0
frontend origin/main: 29 errores, salida 1
frontend abc8e42:     29 errores, salida 1
```

Los 29 diagnósticos de frontend son preexistentes: `next.config.ts` (`eslint`),
la página de finanzas de alumno (6), setup de cobranzas (1), detalle de curso
(9), dashboard (1), pagos (2), modales de recordatorios (2), modal de
comunicación (4), `tenant-switcher` (1) y los dos usos de
`RevenueTrendItem` faltante en `lib/api.ts` (2). No apareció ningún diagnóstico
en los archivos del corte. El build de backend y frontend también terminó con
éxito; el build frontend informa además el warning preexistente de `eslint` y
omite su propia validación de tipos, por lo que la comparación anterior usa
`tsc` explícito.

## Pruebas dirigidas

- Backend: 3 suites, 12 tests, incluyendo guards, cobertura de rutas y
  idempotencia/conflictos del servicio.
- Frontend: 2 archivos, 4 tests, incluyendo timeout y headers de plataforma vs
  tenant normal.
- Lint dirigido de backend y frontend: sin errores.

No se publicaron commits, no se fusionó, no se desplegó y no se crearon
mappings en ningún entorno productivo.
