# EduPay → Académico source integration contract

This document defines the EduPay source-side contract accepted by Académico ADR-0015 and ADR-0016. It does not define or implement the Académico consumer. The stable contract version is `schemaVersion = "1"`.

## Boundary and routes

The integration is read-only and isolated from normal administrator and Portal APIs:

- `GET /api/v1/integrations/academico/snapshot`
- `GET /api/v1/integrations/academico/snapshot/complete`
- `GET /api/v1/integrations/academico/courses`
- `GET /api/v1/integrations/academico/students`

Only Course, Student, and the Student's current Course relationship are exposed. Guardian, RUT, payments, charges, financial state, notifications, users, roles, permissions, and credentials are excluded. EduPay does not invent Teacher, Subject, AcademicYear, grade, level, or section concepts, and does not parse them from Course names.

## Service authentication and tenant scope

Every request requires:

```http
Authorization: Bearer <dedicated service token>
X-Source-Tenant-ID: colegio-conquistadores
X-Correlation-ID: optional-safe-caller-id
```

The service token comes only from `EDUPAY_ACADEMICO_INTEGRATION_TOKEN`. It is independent from administrator JWTs and Portal credentials. A previous token can be accepted briefly during rotation through `EDUPAY_ACADEMICO_INTEGRATION_TOKEN_PREVIOUS`. Tokens must contain at least 32 characters, are compared through fixed-size SHA-256 digests with constant-time comparison, and must never be placed in browser configuration, documentation values, URLs, or logs.

The source tenant must be present in the server-only comma-separated `EDUPAY_ACADEMICO_ALLOWED_TENANTS` allowlist and must resolve to one active EduPay Tenant. Knowing or guessing a tenant string is not authorization. Every database query is scoped both explicitly and through EduPay's tenant context, and every returned item carries `sourceTenantId`.

Production startup fails if the token, cursor secret, or tenant allowlist is absent or invalid.

## Sparse items and conflicts

Course items contain exactly:

```json
{
  "integrationId": "uuid",
  "sourceTenantId": "colegio-conquistadores",
  "name": "1° Básico A",
  "updatedAt": "2026-08-11T12:00:00.000Z",
  "deletedAt": null
}
```

Student items contain exactly:

```json
{
  "integrationId": "uuid",
  "sourceTenantId": "colegio-conquistadores",
  "firstName": "María José",
  "lastName": "Pérez Soto",
  "status": "ACTIVE",
  "courseIntegrationId": "uuid",
  "updatedAt": "2026-08-11T12:00:00.000Z",
  "deletedAt": null
}
```

`status` is one of `ACTIVE`, `INACTIVE`, or `GRADUATED`. Deleted rows remain in both full and incremental feeds with a non-null `deletedAt`; these are trusted tombstones. Restoration clears `deletedAt` without changing `integrationId` and appears as another source change.

Rows that cannot be represented safely do not appear as valid items. They occupy a bounded scanned position and appear in `conflicts` with safe metadata only. The required conflict is:

- `STUDENT_STRUCTURED_NAME_MISSING`: `firstName` or `lastName` is null, empty, or whitespace.

`COURSE_NAME_MISSING` is also reported defensively. Conflict details contain no legacy name, RUT, Guardian, financial data, or raw Student payload. Fixing the source row makes its next version appear as a normal item.

## Immutable identity and source ordering

`Course.integrationId` and `Student.integrationId` are database-generated UUIDs independent of integer IDs, names, RUT, tenant, and labels. A global append-only identity registry and database triggers prevent mutation, cross-entity collisions, and reuse even after a physical database deletion. Normal application DTO validation also rejects attempts to submit these fields.

The database maintains internal global monotonic source positions for creation and change. They are not payload fields. This avoids timestamp ambiguity: equal `updatedAt` values are ordered safely, and clients never reconstruct database ordering. Every cursor and watermark is an HMAC-signed opaque token bound to schema version, source tenant, entity, mode, and server-captured bounds.

## Pagination and incremental watermarks

Feed query parameters are:

- `mode=incremental|full` (default `incremental`)
- `schemaVersion=1` (optional assertion)
- `limit=1..500` (default `100`; values outside the range are rejected)
- `cursor=<opaque continuation>` for the next page of the same run
- `watermark=<opaque persisted position>` only when beginning an incremental run
- `snapshot=<opaque snapshot token>` only when beginning a full run

On a new incremental request, the server captures an exclusive upper source position. It reads changes strictly after the supplied watermark and strictly before that reserved upper position. Continuation cursors keep the same lower/upper bounds and last scanned source position. A row changed after the boundary is intentionally deferred to the next run; it cannot be lost.

`page.nextCursor` is non-null only when another page remains. It is a continuation token and must not be persisted as the next incremental watermark. `watermark.next` is non-null only on the terminal successful page (`page.complete = true`); that opaque token is the position to persist for the next incremental run. Failed or partial page sequences produce no terminal watermark and must be retried from the last persisted watermark.

Replaying the same cursor is read-only and deterministic while the retained source rows are unchanged. A cursor is bound to its endpoint, tenant, mode, and schema, so it cannot be moved between Course/Student or tenants.

## Complete reconciliation

A complete tenant snapshot has an explicit three-stage protocol:

1. Call `GET /snapshot`. The response supplies one `snapshotToken`, `runId`, boundary time, and `requiredEntities = ["COURSE", "STUDENT"]` with `complete = false`.
2. Drain both feeds with `mode=full&snapshot=<snapshotToken>`. Each feed uses an immutable creation position to include every identity that existed at the shared boundary, including tombstones. Updates after the boundary cannot make an identity disappear. Each entity is complete only on its terminal page and returns its terminal watermark.
3. Call `GET /snapshot/complete` with the original `snapshot`, `courseWatermark`, and `studentWatermark`. The server verifies that both entity positions equal the shared boundary and only then returns `snapshot.complete = true`.

An invalid response, timeout, failed page, missing entity watermark, or mismatched boundary never returns a complete tenant snapshot. Consumers must not apply absence-based lifecycle changes until their own reconciliation policy has observed the required consecutive complete successful snapshots described by ADR-0015/0016. Explicit tombstones can be applied immediately.

## Response shape

Every feed response includes:

- `schemaVersion`, `sourceTenantId`, `entity`, and `mode`;
- bounded `items` and `conflicts` arrays;
- `page.limit`, `scannedCount`, `itemCount`, `conflictCount`, `nextCursor`, and `complete`;
- `watermark.next` and `watermark.available`;
- a full `snapshot` descriptor or incremental `run` descriptor.

`scannedCount` includes both valid items and conflicts so invalid source rows cannot stall cursor progress.

## Stable errors and resource controls

Errors use `{ statusCode, code, message, timestamp, path, correlationId? }`. Stable integration codes include:

- `INTEGRATION_AUTHENTICATION_FAILED`
- `SOURCE_TENANT_REQUIRED`
- `INTEGRATION_TENANT_FORBIDDEN`
- `INTEGRATION_NOT_CONFIGURED`
- `INTEGRATION_RATE_LIMITED`
- `INVALID_PAGE_SIZE`
- `INVALID_CURSOR`
- `INVALID_WATERMARK`
- `INVALID_SNAPSHOT`
- `FULL_SNAPSHOT_TOKEN_REQUIRED`
- `INCOMPLETE_SNAPSHOT`
- `UNSUPPORTED_SCHEMA_VERSION`
- `UNSUPPORTED_INTEGRATION_MODE`

The API has GET-only payloads, a maximum page size of 500, bounded query/token lengths, and a dedicated per-tenant rate limit (default 120 requests/minute). It has no general export route.

Operational logs contain only route, source tenant, correlation ID, safe error category, counts, completion state, and duration. Authorization headers, tokens, RUT, names, Guardian/financial data, and raw payloads are never logged by the integration components.
