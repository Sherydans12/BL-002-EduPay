# Academic Financial Projection v2 — shadow de BL

Estado: **Fases 1A, 1B y 1C implementadas en worktrees aislados; shadow BL
desactivado por defecto y no conectado a decisiones financieras**. No hay
activación de producción, migración aplicada ni backfill real.

BL puede mantener una proyección académica shadow procedente de Académico,
pero dicha proyección aún no participa de obligaciones, cuotas, pagos,
conciliación, reportes, portal ni roster legado. Esta integración no reemplaza
el feed BL → Académico existente y no toca el bloque local de rollover.

## Contrato v2 (ADR-0025)

Desde 2026-11-15 el consumer acepta **solo** el contrato v2 de Académico
(`...enrollment.upserted.v2` / `...tombstoned.v2`, `schemaVersion: "2"`); v1
nunca se activó y se cuarentena como `INVALID_CONTRACT`. Además de los
identificadores, cada matrícula trae:

- `student`: nombres, `nationalIdType`/`nationalId` (RUN o IPE canónico, sin
  puntos ni guion; ambos o ninguno) y `legacyIntegrationId`;
- `course`: etiqueta y `legacyIntegrationId`;
- `academicYear`: etiqueta, fechas `YYYY-MM-DD` y estado.

`legacyIntegrationId` es el `integrationId` de BL que Académico conserva para
fichas y cursos de origen `EDUPAY`; es `null` para registros creados en
Académico. La validación es estricta: campos extra, pares RUN/IPE incompletos,
RUN con formato, fechas imposibles o estados desconocidos se cuarentenan sin
tocar la sombra.

Los descriptores se guardan solo en `academic_financial_projections`
(migración `20261115160000_academic_financial_projection_v2_descriptors`,
aditiva y nullable). **RUN/IPE es dato sensible**: no se registra en logs ni
auditoría y el reporte de conciliación no lo devuelve. La cuarentena conserva
el payload completo para diagnóstico, igual que antes.

La sombra sigue sin escribir `Student`, `Course`, `Charge` ni `Payment`. Crear
o actualizar alumnos y cursos de BL desde la proyección es un corte posterior
(modo escritura) que exige la conciliación limpia descrita abajo.

## Frontera de datos

Las tablas nuevas son `academic_financial_projections`,
`academic_financial_projection_consumed_events`,
`academic_financial_projection_quarantine` y
`academic_financial_projection_snapshots`. No tienen FK ni consultas a
`Course`, `Student`, `Charge` o `Payment` de BL; los UUID de Académico se
conservan como identificadores externos opacos.

Antes de aceptar un evento o empezar un snapshot, BL resuelve únicamente:

```text
canonicalTenantId de credencial/evento
→ TenantCanonicalMapping (Fase 1A)
→ tenantId local BL
```

No hay inferencia por slug, nombre, RUT ni JWT de navegador. Un mapping ausente
queda en cuarentena con `CANONICAL_TENANT_MAPPING_MISSING`; no crea una fila
implícita.

## S2S y activación

`ACADEMIC_FINANCIAL_PROJECTION_ENABLED=false` es el valor seguro. Con `false`,
el endpoint consumer y el bootstrap devuelven servicio no disponible y no
escriben la shadow projection.

Con activación explícita, se usan arreglos JSON independientes de credenciales
para entrada Académico → BL y salida BL → Académico:

```json
[
  {
    "keyId": "academic-2026-01",
    "token": "managed-secret",
    "canonicalTenantId": "uuid"
  }
]
```

El header de entrada debe identificar `ACADEMIC_PRODUCER`, portar `keyId` y
Bearer token correspondiente. La credencial liga el evento a un solo tenant;
un JWT de usuario no es una credencial S2S válida. Dos `keyId` permiten una
ventana de rotación. Secretos no se persisten, no se registran y no se exponen
al frontend.

## Consumer y consistencia

El ledger se identifica por `(producer, canonicalTenantId, eventId)`. Replay
del mismo evento resulta `DUPLICATE`. Otro evento con versión menor o igual a
la almacenada resulta `STALE`, sin reemplazar la versión nueva. Mensajes
inválidos se cuarentenan cuando su tenant/evento es identificable; tombstones
se conservan como estado lógico y nunca eliminan información financiera.

## Runbook de snapshot/reconciliación

1. Un `SUPER_ADMIN` confirma antes el mapping canónico mediante el endpoint
   1A (puede usar `dryRun`).
2. Habilita de forma controlada las variables S2S para un tenant sintético o
   aislado; nunca use datos reales durante esta fase.
3. Llama `POST /api/integrations/academic-financial-projection/shadow/tenants/{tenantId}/snapshots`.
4. BL persiste `STARTED`/`INCOMPLETE`, reanuda por cursor opaco, aplica cada
   página a la shadow projection y conserva el watermark terminal.
5. Sólo después de `COMPLETE`, obtiene
   `GET .../snapshots/{snapshotId}/reconciliation`. El estado pasa a
   `RECONCILED` únicamente si conteos y tombstones pendientes son consistentes.
6. Si el proceso se interrumpe, usa `POST .../snapshots/{snapshotId}/resume`.
   Una página parcial nunca implica bajas por ausencia.

El informe muestra `missing`, `extra`, `stale`, `versionMismatch`,
`tenantMismatch`, `mappingMissing` y `tombstonePending`. Puede reparar sólo
la shadow projection con nuevo snapshot/replay; jamás toca pagos o cargos.

`GET .../legacy-comparison` es la **conciliación v2** contra el roster
legado. Es de solo lectura, exige `SUPER_ADMIN` y vincula **solo** por
`legacyIntegrationId` ↔ `integrationId`; el RUN se usa únicamente para detectar
conflictos y nunca para vincular. No compara nombres ni etiquetas.

| Categoría | Significado | Tipo |
| --- | --- | --- |
| `students.linked` / `courses.linked` | Referencia heredada encontrada en BL | OK |
| `students.newInAcademico` / `courses.newInAcademico` | Sin referencia: se crearía en modo escritura | OK |
| `*.legacyReferenceNotFound` | La referencia no existe (o está borrada) en BL | Bloqueante |
| `students.duplicateLegacyReference` | Dos alumnos de Académico apuntan al mismo alumno BL | Bloqueante |
| `students.runMismatch` | Vinculado, pero el RUN difiere del RUT en BL | Bloqueante |
| `students.runConflictWithLegacy` | Alumno nuevo cuyo RUN ya existe en BL | Bloqueante |
| `students.missingDescriptors` | Fila aplicada antes de v2; requiere nuevo snapshot | Bloqueante |
| `*.onlyInLegacyBl` | Registro BL que ninguna matrícula activa referencia | Requiere decisión |

Cada categoría entrega `count` completo y hasta 20 identificadores (UUID de
Académico o `integrationId` de BL), nunca nombres ni RUN. `blocking`,
`requiresDecision` y `readyForWriteMode` resumen si se puede pasar a
escritura. Con el padrón del 2026-11-15 (241 alumnos en Académico y 246 en BL)
se esperan al menos 5 `students.onlyInLegacyBl` que alguien debe decidir.

## Migración y límites

`20260903113000_add_academic_financial_projection_shadow` se aplicó en la
base BL productiva junto con el mapping canónico; sus tablas quedaron vacías
(ver `docs/operations/PRODUCTION.md`).
`20261115160000_academic_financial_projection_v2_descriptors` agrega once
columnas nullable y dos índices a la sombra; tampoco se ejecutó en una base
real y requiere recovery point y autorización del runbook. No contiene
backfill, activación, sincronización ni cambios a finance. Su prueba sólo está
permitida en una base PostgreSQL aislada.

## Gate HTTP de integración

El escenario de snapshot se ejecuta por el endpoint administrativo real
`POST /api/integrations/academic-financial-projection/shadow/tenants/{tenantId}/snapshots`.
El arnés crea un `SUPER_ADMIN` sintético en la base de prueba, interrumpe la
segunda página a través de un proxy de loopback y verifica que BL conserve el
cursor y el estado `INCOMPLETE`. `POST .../{snapshotId}/resume` continúa desde
esa página; sólo después de recibir el watermark terminal se permite
`RECONCILED`. La ausencia durante un snapshot parcial nunca elimina filas ni
crea tombstones.

El gate también prueba las flags de producer, publisher y consumer de forma
independiente. Con producer apagado siguen disponibles las operaciones normales
de matrícula, pero no se crea outbox. Con publisher apagado el evento queda
`PENDING`. Con consumer apagado BL responde servicio no disponible y no escribe
shadow, ledger ni tablas financieras; al reactivar, el mismo evento se acepta.
Todas las pruebas usan datos, tokens, puertos y PostgreSQL aislados.
