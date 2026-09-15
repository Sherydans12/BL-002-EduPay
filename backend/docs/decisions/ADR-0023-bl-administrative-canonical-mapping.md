# ADR-0023 — Vinculación administrativa del tenant canónico en BL

- **Estado:** Accepted (alcance acotado de BL)
- **Fecha:** 2026-09-14
- **Relacionado:** `EduPayAcademico/docs/decisions/ADR-0022-academic-onboarding-governance-proposal.md` (sigue `Proposed`)
- **Precede:** Fase 1A — mapeo de tenant canónico

## Contexto

BL ya dispone de una operación 1A para crear una relación explícita,
uno-a-uno e inmutable entre `Tenant.id` local y el
`canonicalTenantId` UUID de EduPay Identity. La tabla y sus restricciones
únicas ya existen; el vínculo no debe inferirse desde nombres, slugs, JWT,
correo ni datos académicos.

ADR-0022 propone en el futuro un gobierno de onboarding con estados,
segregación de funciones e historial de revisión. Esta decisión habilita
solamente el primer corte administrativo de vinculación y no acepta ni
implementa esas propuestas futuras.

## Decisión

1. El flujo se expone en una superficie administrativa separada del
   `TenantSwitcher`. La autorización efectiva es backend-only mediante una
   política de plataforma para el usuario local `SUPER_ADMIN`; el frontend
   solamente mejora la navegación y los estados.
2. El operador debe verificar manualmente el tenant canónico en el canal
   administrativo de Identity. BL no crea un contrato BL→Identity ni presenta
   esa declaración como una comprobación automática.
3. La revisión es un `dryRun` sin escritura. La aprobación ejecuta la
   operación 1A existente y revalida sus condiciones al confirmar. La
   asignación continúa siendo inmutable, uno-a-uno e idempotente; no hay
   reasignación ni sobrescritura.
4. Se reutilizan los campos de auditoría existentes: actor autenticado,
   `correlationId`, `reason` y `createdAt`. La referencia de evidencia se
   incorpora al `reason` sin secretos ni datos personales innecesarios.
5. El tenant seleccionado es únicamente el recurso objetivo. Los endpoints
   de mapping no aceptan un contexto de tenant seleccionado como autorización;
   el listado general de tenants conserva su guard existente. No se amplía el
   acceso de `SUPER_ADMIN` a datos académicos.
6. No se crean `OnboardingRun`, doble aprobación, persistencia de revisión,
   migraciones nuevas ni infraestructura de workflow. `producer`,
   `publisher` y `shadow` permanecen apagados.

## Consecuencias y límites

- El primer corte audita la asignación 1A, no un historial separado de
  propuestas, rechazos o aprobaciones de dos personas.
- La existencia o estado del `TenantRealm` no se valida automáticamente en
  Identity; la evidencia manual del operador es un requisito explícito.
- Si posteriormente se exige segregación de funciones, auditoría de cada
  transición o verificación automática entre servicios, deberá revisarse
  ADR-0022 y aprobarse una decisión y persistencia/contrato adicionales.
