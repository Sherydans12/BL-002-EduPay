# EduPay – Guía de Despliegue (Coolify + Docker)

## Requisitos
- VPS con [Coolify](https://coolify.io/) instalado
- Acceso al repositorio Git del proyecto
- Node.js >= 20 (solo para desarrollo local; en producción lo provee Docker)

---

## Arquitectura en Producción

```
Coolify
├── Recurso: PostgreSQL          ← base de datos gestionada
├── Recurso: backend (Docker)    ← NestJS, subdirectorio /backend
└── Recurso: frontend (Docker)   ← Next.js standalone, subdirectorio /frontend
```

---

## Paso 1 – Base de Datos PostgreSQL

1. En el panel de Coolify, ve a **Resources → New Resource → PostgreSQL**.
2. Asigna nombre (ej. `edupay-db`) y deja que Coolify genere la `DATABASE_URL`.
3. Copia la `DATABASE_URL` para usarla en las variables de entorno del backend.

---

## Paso 2 – Backend (NestJS)

### 2.1 Crear recurso Docker
1. **New Resource → Docker / Dockerfile**.
2. Apunta al repositorio y configura **Base Directory**: `backend`.
3. Coolify detectará el `Dockerfile` automáticamente.

### 2.2 Variables de entorno del backend
```
DATABASE_URL=postgresql://USER:PASS@HOST:5432/edupay?schema=public
PORT=3001
NODE_ENV=production
JWT_SECRET=<cadena aleatoria ≥32 chars>
FRONTEND_URL=https://tu-dominio.cl

# Email — activar solo cuando SMTP esté configurado
ENABLE_EMAILS=false
SMTP_HOST=smtp.ejemplo.cl
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@colegio.cl

UPLOAD_DIR=uploads
```

### 2.3 Volumen persistente
En la pestaña **Storages** del recurso backend, añade:

| Host path / Volume name | Container path          |
|-------------------------|-------------------------|
| `uploads`               | `/usr/src/app/uploads`  |

### 2.4 Comando post-deploy (migraciones)
En la pestaña **Advanced → Post-deployment Command**:
```bash
npx prisma migrate deploy
```

---

## Paso 3 – Frontend (Next.js)

### 3.1 Crear recurso Docker
1. **New Resource → Docker / Dockerfile**.
2. Apunta al repositorio y configura **Base Directory**: `frontend`.
3. Coolify detectará el `Dockerfile` automáticamente.

### 3.2 Variables de entorno del frontend
```
NEXT_PUBLIC_API_URL=https://api.tu-dominio.cl/api
NODE_ENV=production
JWT_SECRET=<misma cadena que en el backend; obligatoria para el proxy de sesión>
```

Opcional en desarrollo local (HMR al abrir la app por IP de red): `NEXT_ALLOWED_DEV_ORIGINS` — ver comentarios en `frontend/.env.example`.

### 3.3 Puerto
El contenedor expone el puerto `3000`. Configura el dominio/proxy de Coolify apuntando a ese puerto.

---

## Documentación de API (Swagger)

Swagger solo se activa cuando `NODE_ENV != production`. Para acceder en desarrollo:
```
http://localhost:3001/api/docs
```

Exportar OpenAPI JSON:
```
http://localhost:3001/api/docs-json
```

### Importar en Postman
1. **Import → Link** → pega `http://localhost:3001/api/docs-json`

### Importar en Bruno
```bash
curl http://localhost:3001/api/docs-json -o edupay-openapi.json
```
Luego: **Import Collection → OpenAPI V3 Spec**.
