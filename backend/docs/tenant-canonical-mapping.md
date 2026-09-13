# Fase 1A — Mapeo de tenant canónico

BL conserva su `Tenant.id` local como PK. Este módulo crea una asignación
explícita, uno-a-uno y de solo alta entre ese identificador y el UUID de
`TenantRealm` administrado por EduPay Identity:

```text
BL Tenant.id (local)  <->  Identity TenantRealm.id (canonicalTenantId UUID)
```

No existe una FK entre las bases de datos. Tampoco se infiere el UUID desde
nombre, slug, correo, JWT de navegador ni datos académicos. La migración crea
la tabla vacía; no hace backfill ni cambia datos reales.

## Operación segura

Solo un usuario local `SUPER_ADMIN` puede invocar
`POST /api/tenants/:tenantId/canonical-mapping`. Debe aportar el UUID obtenido
por un canal administrativo de Identity y un `reason` auditable. La respuesta
incluye el operador, correlación y fecha. Si se reintenta exactamente el mismo
par, devuelve la asignación previa con `created: false`; nunca actualiza ni
reasigna una fila existente. Si cualquiera de los dos extremos ya pertenece a
otro par, responde `409`.

`x-correlation-id` es opcional; si no se envía, BL genera un UUID. El parámetro
`dryRun=true` valida existencia, unicidad y aislamiento sin crear una fila; es
apto para preflight de staging. Una asignación real en staging deja trazabilidad
sin ejecutar una migración de datos productivos.

## Uso futuro en contratos

En la Fase 1B, Académico publicará `canonicalTenantId` dentro del contrato
Academic → Financial Projection. BL resolverá ese valor exclusivamente contra
esta tabla antes de procesar una proyección. Un cliente no podrá elegir un
tenant enviando un UUID: la autorización servicio-a-servicio y el mapeo local
deben concordar. Esta fase no conecta el contrato ni modifica obligaciones,
pagos, conciliación, rollover o autenticación local.
