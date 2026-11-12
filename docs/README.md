# BL-002 — índice de documentación

BL-002 mantiene el dominio financiero existente: cobros, pagos, asignaciones,
reportes, notificaciones y portal. No es dueño de identidad central, del
dominio académico ni de DIE. Identity mantiene la autenticación de Académico;
BL conserva su acceso administrativo legado.

## Estado comprobado y última verificación

- Git, consultado el **2026-11-12**, antes de este cierre documental:
  `main` y `origin/main` coinciden en
  `684689b6551b71c3f86e04c6266f7b4d9c852d02`; el checkout estaba limpio.
  Es estado de código fuente, no una verificación de runtime.
- La revisión de ramas, PR y alcance está en
  [auditoría de preparación del 2026-11-12](operations/workspace-readiness-audit-2026-11-12.md).
- Verificación directa BL que contiene este repo: **2026-09-15** en
  [topología](operations/PRODUCTION.md) e
  [inventario Coolify local](operations/coolify-inventory.json).
- Fotografía transversal posterior disponible: **2026-09-24** en el
  [inventario de Académico](https://github.com/Sherydans12/edupay-academico/blob/main/docs/operations/coolify-inventory.json).
  Para recursos compartidos utiliza esa fecha y fuente. El inventario local
  BL conserva su evidencia anterior; no es una comprobación en vivo hecha al
  actualizar esta documentación.

## Lectura recomendada

1. [Mapa transversal del ecosistema](https://github.com/Sherydans12/edupay-academico/blob/main/docs/architecture/edupay-ecosystem-architecture.md): dominios, conexiones y backlog.
2. [Producción y recursos Coolify](operations/PRODUCTION.md): repositorio → aplicación → dominio, commits y artefactos registrados.
3. [Runbook de release y rollback](operations/RUNBOOK.md).
4. [Cierre operativo](operations/PHASE-CLOSEOUT.md), con sus fechas y límites históricos.
5. [Feed heredado BL → Académico](ACADEMICO-INTEGRATION.md) y [contrato shadow Académico → BL](ACADEMIC-FINANCIAL-PROJECTION-SHADOW.md). Son integraciones diferentes; la proyección sigue desactivada y DIE no se publica en BL.
6. [Testing](TESTING.md), [guía local](../README.md) y los ADR backend en [`backend/docs/decisions`](../backend/docs/decisions).

`README-deploy.md` contiene una guía histórica de Coolify/Docker/cPanel y no
describe la operación productiva actual. El [root README](../README.md) es la
entrada de desarrollo; `docker-compose.yml` levanta PostgreSQL de desarrollo,
no la base productiva, que es un recurso PostgreSQL nativo de Coolify.

## Desarrollo y mantenimiento

- Node.js 22 y npm. Instala por separado en `backend` y `frontend`.
- Backend: `npm run start:dev`, `npm test`, `npm run test:e2e`, `npm run build`;
  para una base local migrada, `npm run db:migrate:deploy`.
- Frontend: `npm run dev`, `npm test`, `npm run lint`, `npm run build`.
- La configuración de cada app está en su `.env.example`; el root README
  agrupa los nombres por finalidad. No pongas credenciales en cliente o Git.
- Antes de cualquier migración productiva, comprobar destino PostgreSQL Coolify
  por UUID y no usar el Compose histórico; revisar `RUN_MIGRATIONS=false`,
  backup y migrador inmutable con digest en el runbook.

La proyección financiera shadow de BL-002 permanece desactivada. El avance anual
de matrículas y la admisión de alumnos pertenecen al dominio de Académico; no
activan esta proyección ni justifican migraciones o escrituras de producción en
BL-002. Los cambios de una rama, un stash o una nota operativa no se consideran
integrados hasta verificarlos contra `origin/main`.
