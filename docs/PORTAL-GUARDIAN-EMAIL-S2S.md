# Contrato S2S de correo de apoderados

EduPay es la fuente oficial del correo del apoderado. El Portal de Pagos usa
el RUT solamente como identificador de integración y nunca puede modificarlo.
Las contraseñas del Portal no forman parte de este contrato ni se almacenan en
EduPay.

## Autenticación y tenant

Ambos endpoints requieren:

```http
Authorization: Bearer <portal-api-key>
x-tenant-id: colegio-conquistadores
```

La API key debe ser la configurada para ese mismo tenant en
`PORTAL_TENANT_KEYS`. Una key válida usada con otro tenant responde `401`.

## Consultar un apoderado

```http
GET /api/v1/portal/guardian/12.345.678-5
```

Respuesta `200` cuando existe:

```json
{
  "data": {
    "exists": true,
    "id": 42,
    "rut": "12.345.678-5",
    "name": "María González Pérez",
    "email": "maria.gonzalez@example.cl",
    "updatedAt": "2026-07-30T16:20:00.000Z"
  }
}
```

Respuesta `200` cuando no existe:

```json
{
  "data": {
    "exists": false,
    "id": null,
    "rut": null,
    "name": null,
    "email": null,
    "updatedAt": null
  }
}
```

## Actualizar exclusivamente el correo

```http
PATCH /api/v1/portal/guardian/12.345.678-5/email
Content-Type: application/json
```

```json
{
  "email": "nuevo.correo@example.cl",
  "expectedUpdatedAt": "2026-07-30T16:20:00.000Z"
}
```

El backend elimina espacios exteriores y guarda el correo en minúsculas. El
DTO rechaza cualquier propiedad adicional. El Portal debe haber verificado la
propiedad del nuevo correo antes de llamar a EduPay.

`expectedUpdatedAt` debe ser exactamente el valor de la última consulta. Si el
registro cambió, EduPay responde `409` y el Portal debe volver a consultar antes
de decidir si reintenta. La actualización condicional evita una carrera entre
la lectura y la escritura.

Respuesta `200`:

```json
{
  "data": {
    "id": 42,
    "rut": "12.345.678-5",
    "name": "María González Pérez",
    "email": "nuevo.correo@example.cl",
    "updatedAt": "2026-07-30T16:25:00.000Z"
  }
}
```

Enviar el correo que ya está vigente devuelve `200`, conserva `updatedAt` y no
crea un evento. Los correos duplicados están permitidos.

Errores:

- `400`: RUT, correo, timestamp o payload inválido.
- `401`: API key ausente, inválida o correspondiente a otro tenant.
- `404`: tenant o apoderado inexistente.
- `409`: `expectedUpdatedAt` ya no coincide.
- `500`: error interno o configuración S2S inválida.

Todos usan el formato global:

```json
{
  "statusCode": 409,
  "message": "El apoderado fue modificado después de la lectura del Portal",
  "timestamp": "2026-07-30T16:25:01.000Z",
  "path": "/api/v1/portal/guardian/12.345.678-5/email"
}
```

## Webhook `guardian.email.updated`

Se crea dentro de la misma transacción que modifica `Guardian.email`, tanto
para cambios S2S como administrativos. La outbox conserva un `eventId` UUID
estable hasta que la entrega termina.

```json
{
  "eventId": "6868375e-24bb-48cd-bf9a-bf7c8ce59a98",
  "type": "guardian.email.updated",
  "occurredAt": "2026-07-30T16:25:00.000Z",
  "tenantId": "colegio-conquistadores",
  "guardian": {
    "id": 42,
    "rut": "12.345.678-5",
    "email": "nuevo.correo@example.cl",
    "previousEmail": "correo.anterior@example.cl",
    "updatedAt": "2026-07-30T16:25:00.000Z"
  },
  "source": "PORTAL"
}
```

`source` puede ser `PORTAL` o `EDUPAY_ADMIN`. Si una edición administrativa
elimina el correo, `email` puede ser `null`.

### Headers y firma

```http
Content-Type: application/json
X-EduPay-Event-Id: 6868375e-24bb-48cd-bf9a-bf7c8ce59a98
X-EduPay-Timestamp: 2026-07-30T16:25:02.000Z
X-EduPay-Signature: sha256=<hexadecimal>
```

La entrada firmada es:

```text
<X-EduPay-Timestamp>.<raw request body>
```

La firma se calcula así:

```text
sha256=hex(HMAC-SHA256(tenantSecret, timestamp + "." + rawBody))
```

El Portal debe verificar la firma sobre el body sin reserializar, usar una
comparación en tiempo constante, rechazar timestamps fuera de una tolerancia
acordada y deduplicar por `eventId`.

### Entrega y reintentos

- Semántica: al menos una vez.
- Un evento es reclamado atómicamente para evitar entregas simultáneas.
- Los bloqueos abandonados se recuperan después de 10 minutos.
- Se reintentan errores de red/configuración y HTTP `408`, `425`, `429` o `5xx`.
- Otros `4xx` pasan directamente a `DEAD_LETTER`.
- Valores predeterminados: 8 intentos, base de 60 segundos, backoff
  exponencial y máximo de 24 horas.
- El trabajo se ejecuta cada minuto, con hasta un minuto adicional de variación.
- El cambio del correo no depende de una llamada de red: si falta configuración
  o el Portal está caído, la transacción conserva el evento y el worker lo
  reintenta. Al agotar intentos queda en `DEAD_LETTER` para intervención
  operativa; actualmente no existe un endpoint público de redrive.
- Si EduPay cae después de que el Portal aceptó el webhook y antes de marcarlo
  entregado, el mismo `eventId` puede recibirse nuevamente.

## Configuración

Guardar estos valores en el almacén seguro de la plataforma:

```dotenv
PORTAL_TENANT_KEYS='{"colegio-conquistadores":"<api-key-secreta>"}'
GUARDIAN_EMAIL_WEBHOOKS='{"colegio-conquistadores":{"url":"https://portal.example.cl/api/webhooks/edupay/guardian-email","secret":"<secreto-hmac-de-al-menos-32-caracteres>"}}'
GUARDIAN_EMAIL_WEBHOOK_MAX_ATTEMPTS=8
GUARDIAN_EMAIL_WEBHOOK_RETRY_BASE_SECONDS=60
GUARDIAN_EMAIL_WEBHOOK_TIMEOUT_MS=10000
GUARDIAN_EMAIL_WEBHOOK_BATCH_SIZE=20
```

Las URLs deben usar HTTPS en producción. API keys, secretos y firmas no se
incluyen en logs. La outbox registra origen, actor, tenant, apoderado, fecha,
cantidad de intentos y estado de entrega.

## OpenAPI

En un ambiente no productivo:

```text
GET /api/docs
GET /api/docs-json
```

Los endpoints S2S declaran esquemas completos de éxito y error con ejemplos
ficticios.
