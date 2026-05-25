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

# Opcional: omitir migraciones al arranque (por defecto se aplican solas)
# RUN_MIGRATIONS=false
```

### 2.3 Volumen persistente
En la pestaña **Storages** del recurso backend, añade:

| Host path / Volume name | Container path          |
|-------------------------|-------------------------|
| `uploads`               | `/usr/src/app/uploads`  |

### 2.4 Migraciones y arranque automáticos

No hace falta configurar **Post-deployment Command** en Coolify para las migraciones: el contenedor las aplica solo al iniciar, mediante `backend/docker-entrypoint.sh`:

1. Verifica que exista `DATABASE_URL`.
2. Ejecuta `npx prisma migrate deploy` (aplica migraciones pendientes de `prisma/migrations/`).
3. Arranca NestJS (`node dist/.../main.js`).

Si en Coolify tenías un comando post-deploy con `prisma migrate deploy`, puedes **eliminarlo** para evitar ejecutar las migraciones dos veces por despliegue.

Para desactivar migraciones al arranque (solo casos excepcionales, p. ej. depuración):

```
RUN_MIGRATIONS=false
```

---

### 2.5 Qué ocurre en cada redespliegue (Coolify)

| Paso | Backend | Frontend |
|------|---------|----------|
| Build de imagen | `npm ci` instala dependencias según `package-lock.json` | `npm ci` + `npm run build` (standalone) |
| Prisma Client | `npx prisma generate` en etapa builder | — |
| Migraciones DB | Al **iniciar** el contenedor (`migrate deploy`) | — |
| Dependencias nuevas | Incluidas si subiste cambios en `package.json` / lock y Coolify reconstruyó la imagen | Igual |
| Runtime `npm install` | No aplica: todo va en la imagen Docker | No aplica |

**Importante:** cada push que dispare un rebuild ejecuta `npm ci` de cero; no depende de un `npm install` manual en el servidor. Si agregaste una librería, commitea `package.json` y `package-lock.json` y redespliega.

`prisma` está en `dependencies` (no solo en dev) para que el CLI exista en la imagen de producción.

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
