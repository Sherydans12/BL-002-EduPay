# BL-002 — índice de documentación

BL-002 mantiene el dominio financiero existente: cobros, pagos, asignaciones,
reportes, notificaciones y portal. No es dueño de identidad central, del
dominio académico ni de DIE. Identity mantiene la autenticación de Académico;
BL conserva su acceso administrativo legado.

## Estado comprobado y última verificación

- Git, consultado el **2026-09-24**: `origin/main` en
  `d3e40da0bcf893e8d02f2c23d7c79a4d46b8071f`. Entre el release documentado
  `04687aa8c5249ad1f9be94c7ad62099fb41d5d6c` y ese ref, Git sólo muestra
  cambios a cuatro documentos `docs/operations/*`; esto no verifica runtime.
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

La proyección shadow está desactivada. Su activación, el rollover anual y los
cambios locales no integrados siguen aparcados hasta una revisión y autorización
propias; documentarlos no constituye aceptación.
