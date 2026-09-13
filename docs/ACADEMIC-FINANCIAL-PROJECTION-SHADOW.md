# Academic Financial Projection v1 — shadow de BL

Estado: **Fases 1A, 1B y 1C implementadas en worktrees aislados; shadow BL
desactivado por defecto y no conectado a decisiones financieras**. No hay
activación de producción, migración aplicada ni backfill real.

BL puede mantener una proyección académica shadow procedente de Académico,
pero dicha proyección aún no participa de obligaciones, cuotas, pagos,
conciliación, reportes, portal ni roster legado. Esta integración no reemplaza
el feed BL → Académico existente y no toca el bloque local de rollover.

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

`GET .../legacy-comparison` compara conteos de roster legado contra la shadow
projection de modo observacional. Informa alumnos/cursos sin correspondencia
explícita, pero no crea matching automático por nombre/RUT/label.

## Migración y límites

`20260903113000_add_academic_financial_projection_shadow` está **CREADA y
validada contra schema Prisma; NO EJECUTADA en una base real**. No contiene
backfill, activación, sincronización ni cambios a finance. Su prueba sólo está
permitida en una base PostgreSQL aislada.
