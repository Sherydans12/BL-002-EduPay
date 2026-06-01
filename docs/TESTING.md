# Pruebas automatizadas — EduPay (BL-002)

Esta guía documenta la suite de tests creada para el **flujo de registro de pagos** (`POST /api/payments/batch` y formulario `/pagos/nuevo`), y cómo ejecutarla en local y en CI.

---

## Resumen

| Capa | Herramienta | Archivos | Qué valida |
|------|-------------|----------|------------|
| Backend — unitarios | Jest | `backend/src/**/*.spec.ts` | DTO, servicio y controlador de pagos |
| Backend — e2e | Jest + Supertest + Postgres | `backend/test/**/*.e2e-spec.ts` | API HTTP real (multipart, JWT, BD) |
| Frontend — unitarios | Vitest | `frontend/src/**/*.test.ts` | Schema Zod y serialización `FormData` |
| CI | GitHub Actions | `.github/workflows/ci.yml` | Lint, tests, build en cada push/PR a `main` |

**Total aproximado:** 12 tests backend unitarios · 6 tests backend e2e · 6 tests frontend.

---

## Bug de producción que cubren estas pruebas

Al registrar un pago desde el frontend, el body llega como **`multipart/form-data`**. El campo `allocations` es un **JSON en string** y los montos vienen como **strings** (`"75000"`).

Sin coerción numérica, el validador sumaba `0 + "75000"` → `"075000"` y rechazaba el pago aunque los datos fueran correctos.

Los tests de `CreatePaymentBatchDto` y el e2e `POST /api/payments/batch` reproducen exactamente ese escenario.

---

## Cómo ejecutar las pruebas

### Requisitos

- **Docker** con PostgreSQL en `localhost:5432` (ver `docker compose up -d`).
- Dependencias instaladas en `backend/` y `frontend/`.

### Backend — tests unitarios

```bash
cd backend
npm test
```

Modo watch:

```bash
npm run test:watch
```

Cobertura:

```bash
npm run test:cov
```

### Backend — tests e2e

Usan la base **`edupay_test`** (se crea sola si no existe). **No uses la base de desarrollo `edupay`** para evitar borrar datos reales: el seed e2e limpia tablas antes de cada suite.

```bash
cd backend
npm run test:e2e
```

Variables por defecto (sobreescribibles):

| Variable | Valor por defecto |
|----------|-------------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/edupay_test?schema=public` |
| `JWT_SECRET` | `e2e-jwt-secret-key-at-least-32-characters` |
| `ENABLE_EMAILS` | `false` |

El archivo `test/global-setup.ts` ejecuta `prisma migrate deploy` antes de los e2e.

### Frontend — tests unitarios

```bash
cd frontend
npm test
```

Modo watch:

```bash
npm run test:watch
```

### Lint (también corre en CI)

```bash
cd backend && npm run lint
cd frontend && npm run lint
```

### Todo el flujo (checklist manual)

```bash
docker compose up -d
cd backend && npm test && npm run test:e2e
cd ../frontend && npm test
```

---

## CI (GitHub Actions)

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

| Job | Pasos |
|-----|--------|
| `backend-tests` | Postgres 15 → `npm ci` → `prisma generate` → lint → unit → e2e → build |
| `frontend-tests` | `npm ci` → tests (Vitest) → lint → build |

Se dispara en **push** y **pull_request** a la rama `main`.

Revisar resultados: pestaña **Actions** del repositorio en GitHub.

---

## Inventario de archivos de prueba

### Backend — unitarios (`npm test`)

#### `src/payments/dto/create-payment-batch.dto.spec.ts`

Validación del DTO `CreatePaymentBatchDto` (misma lógica que el `ValidationPipe` en producción).

| Test | Descripción |
|------|-------------|
| multipart con montos string | `totalAmount` y `allocations` como en el browser (`"75000"`, JSON string) |
| cobro agrupado 2 alumnos | Dos líneas en `allocations`, suma = `totalAmount` |
| suma incorrecta | Debe fallar validación `allocationsSumMatchesTotal` |
| allocations vacío | Debe fallar `@ArrayMinSize` |
| body JSON directo | Sin `multipart`; array de objetos ya parseado |

#### `src/payments/payments.service.spec.ts`

`PaymentsService` con Prisma y Mail **mockeados**.

| Bloque | Tests |
|--------|--------|
| `createBatch` | Crea `PaymentGroup` + N `Payment`; verifica alumnos existentes |
| `createBatch` error | `NotFoundException` si falta un `studentId` |
| `create` | Pago individual + envío de correo si el apoderado tiene email válido |
| `create` sin correo | No llama a `sendPaymentConfirmation` si el email es inválido |
| `migrateLegacyPayments` | Pagos sin grupo se agrupan 1:1 (migración idempotente) |

#### `src/payments/payments.controller.spec.ts`

Controlador delgado: delegación al servicio y ruta del PDF subido.

| Test | Descripción |
|------|-------------|
| con archivo | Pasa `boletaFileUrl` = `/uploads/{filename}` |
| sin archivo | `createBatch(dto, undefined)` |

> Nota: se mockea `./multer.config` para evitar dependencia ESM de `uuid` en Jest.

---

### Backend — e2e (`npm run test:e2e`)

#### Helpers

| Archivo | Rol |
|---------|-----|
| `test/helpers/create-e2e-app.ts` | Arranca Nest con prefijo `/api`, `ValidationPipe`, filtros e interceptor igual que `main.ts` |
| `test/helpers/seed-e2e-db.ts` | Limpia BD y crea usuario `e2e@baselogic.cl`, curso, apoderado, 2 alumnos, concepto |
| `test/global-setup.ts` | Crea DB `edupay_test` si falta + `prisma migrate deploy` |

#### `test/app.e2e-spec.ts`

| Test | Descripción |
|------|-------------|
| `GET /api` | Health check; respuesta `{ data: { ok: true, service: 'EduPay API' } }` |

#### `test/payments.e2e-spec.ts`

Flujo completo contra Postgres real.

| Test | HTTP | Esperado |
|------|------|----------|
| multipart montos string | `POST /api/payments/batch` | `201`, grupo con 1 pago |
| suma inválida | `POST /api/payments/batch` | `400`, mensaje de validación |
| cobro 2 alumnos | `POST /api/payments/batch` | `201`, 2 payments, `boletaNumber` |
| listar grupos | `GET /api/payments/groups` | `200`, `data` + `meta` |
| sin JWT | `POST /api/payments/batch` | `401` |

Credenciales e2e (solo BD de test): `e2e@baselogic.cl` / `e2e-secret`.

---

### Frontend — unitarios (`npm test` en `frontend/`)

Config: [`frontend/vitest.config.ts`](../frontend/vitest.config.ts).

#### `src/lib/schemas/payment.schema.test.ts`

Schema Zod del formulario [`pagos/nuevo`](../frontend/src/app/(dashboard)/pagos/nuevo/page.tsx).

| Test | Descripción |
|------|-------------|
| pago simple | Una allocation, apoderado requerido |
| suma ≠ total | `superRefine` en `totalAmount` |
| pagador alternativo | Exige `payerName` si `useAltPayer` |
| dos alumnos | Cobro agrupado válido |

#### `src/lib/api.payment-batch.test.ts`

Función `buildPaymentBatchFormData` (lo que envía el frontend al API).

| Test | Descripción |
|------|-------------|
| serialización | `totalAmount`, `method`, `allocations` como JSON string, trim de `boletaNumber`/`notes` |
| campos opcionales | No adjunta `boletaNumber`/`notes` si están vacíos |

---

## Relación con el código de producción

```
Frontend                          Backend
─────────                         ───────
payment.schema.ts (Zod)    →      ValidationPipe + CreatePaymentBatchDto
buildPaymentBatchFormData  →      POST /api/payments/batch (multipart)
pagos/nuevo/page.tsx       →      PaymentsController.createBatch
                                  PaymentsService.createBatch
```

Al agregar campos al formulario de pago:

1. Actualizar DTO backend + `@Transform` si es multipart.
2. Actualizar `buildPaymentBatchFormData` y `payment.schema.ts`.
3. Añadir casos en los `.spec.ts` / `.test.ts` correspondientes.
4. Si el comportamiento es HTTP, añadir caso en `payments.e2e-spec.ts`.

---

## Convenciones para nuevos tests

| Tipo | Ubicación | Sufijo |
|------|-----------|--------|
| Unitario backend | Junto al módulo en `src/` | `*.spec.ts` |
| E2E backend | `backend/test/` | `*.e2e-spec.ts` |
| Unitario frontend | Junto al módulo en `src/` | `*.test.ts` |

- **E2E:** siempre base `edupay_test`, nunca producción.
- **Mocks:** Prisma y Mail en unitarios de servicio; app real en e2e.
- **Multipart:** en e2e usar `.field()` de Supertest, no solo JSON.

---

## Solución de problemas

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| e2e: `ECONNREFUSED` | Postgres no corre | `docker compose up -d` |
| e2e: migraciones fallan | `DATABASE_URL` incorrecta | Revisar `.env` o variable de entorno |
| unit backend: 0 tests | Ejecutar desde `backend/` | `cd backend && npm test` |
| Jest no encuentra specs | `rootDir` es `src/` | Los e2e viven en `test/` con config aparte |
| CI lint rojo | Reglas ESLint | Ver `backend/eslint.config.mjs` y `frontend/eslint.config.mjs` |

---

## Referencias

- [README.md](../README.md) — levantamiento local
- [README-deploy.md](../README-deploy.md) — despliegue
- Swagger (dev): http://localhost:3001/api/docs — endpoint `POST /payments/batch`
