# BaseLogic-EduPay (BL-002)

## Estado operativo vigente

BL-002 es el dominio financiero del ecosistema. La última verificación directa
de sus recursos documentada aquí corresponde al **2026-09-15**. El inventario
transversal de Académico registra otra fotografía compartida el **2026-09-24**;
la edición actual sólo actualizó Git y no verificó Coolify. `origin/main` ahora
está en `d3e40da0bcf893e8d02f2c23d7c79a4d46b8071f`; los cambios desde el commit
de release `04687aa8c5249ad1f9be94c7ad62099fb41d5d6c` afectan cuatro documentos
operativos y no prueban qué artefacto está corriendo. Consulta la fuente fechada
antes de identificar commit de build o digest.

- [Mapa transversal EduPay: dominios, conexiones y backlog](https://github.com/Sherydans12/edupay-academico/blob/main/docs/architecture/edupay-ecosystem-architecture.md).
- [Índice de documentación BL-002](docs/README.md).
- [Topología, repositorios, conexiones y recursos Coolify](docs/operations/PRODUCTION.md).
- [Runbook de despliegue, rollback y entornos aislados](docs/operations/RUNBOOK.md).
- [Cierre de fase y límites verificados](docs/operations/PHASE-CLOSEOUT.md).
- [Última fotografía conjunta Coolify, verificada 2026-09-24](https://github.com/Sherydans12/edupay-academico/blob/main/docs/operations/coolify-inventory.json).
- [Inventario local del corte BL del 2026-09-15](docs/operations/coolify-inventory.json), preservado como evidencia histórica.
- [Reglas para agentes y próximas mejoras](AGENTS.md).

Identity posee autenticación; Académico posee dominio académico y DIE; BL
mantiene acceso administrativo legado y dominio financiero. La sincronización
heredada BL → Académico es distinta de la proyección financiera Académico → BL,
que sigue desactivada. DIE y sus datos están fuera de BL.

Para desarrollo, usa un worktree propio desde `origin/main` actualizado. Los
directorios con WIP no son configuración productiva. La restauración del backup
real protegido de PostgreSQL BL está verificada; la consistencia completa de la
base viva y la cobertura integral de uploads siguen sin certificarse.

> Sistema de registro manual de pagos para colegios.

[![Version](https://img.shields.io/badge/version-1.0--RC-blue)]()
[![NestJS](https://img.shields.io/badge/Backend-NestJS%2011-red)]()
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black)]()
[![PostgreSQL](https://img.shields.io/badge/DB%20produccion-PostgreSQL%2018-blue)]()

---

## Descripción

EduPay permite al personal administrativo de un colegio:

- **Registrar pagos manuales** asociados a alumnos, con soporte para subir boletas en PDF.
- **Gestionar entidades** (cursos, alumnos, apoderados).
- **Generar reportes** de recaudación filtrados por fecha, curso y método de pago.
- **Autenticación y autorización** basada en JWT con roles y permisos (RBAC).
- **Envío de notificaciones** por correo SMTP nativo (cPanel).

---

## Documentación para desarrollo y agentes

| Recurso | Contenido |
|---------|-----------|
| [docs/TESTING.md](docs/TESTING.md) | Suite de pruebas (unit + e2e), flujo de pagos, CI y cómo ejecutarlas |
| [frontend/docs/UI-STYLES.md](frontend/docs/UI-STYLES.md) | Colores (`--color-*`), formularios, desplegables (`DropdownChevron`, `NativeSelectField`), glass, tablas |
| [frontend/AGENTS.md](frontend/AGENTS.md) | Next.js en este repo + enlace a la guía UI |
| [docs/ACADEMICO-INTEGRATION.md](docs/ACADEMICO-INTEGRATION.md) | Contrato S2S EduPay → Académico, autenticación, cursores, snapshots y tombstones |
| [docs/ACADEMIC-FINANCIAL-PROJECTION-SHADOW.md](docs/ACADEMIC-FINANCIAL-PROJECTION-SHADOW.md) | Proyección Académico → BL en modo shadow, desactivada y sin efectos financieros |
| [docs/README.md](docs/README.md) | Índice actual y orden de lectura; marca guías históricas |

---

## Variables de entorno por finalidad

Los nombres completos están en [`backend/.env.example`](backend/.env.example)
y [`frontend/.env.example`](frontend/.env.example). Los valores se guardan en
archivos ignorados localmente o en el gestor de secretos; no se copian a Git ni
a bundles públicos.

| Componente | Nombres | Finalidad |
| --- | --- | --- |
| BACK | `DATABASE_URL`, `PORT`, `NODE_ENV`, `JWT_SECRET` | PostgreSQL BL, puerto/runtime y firma de la sesión JWT local de BL. |
| BACK → portal y Académico | `PORTAL_TENANT_KEYS`, `EDUPAY_ACADEMICO_INTEGRATION_TOKEN`, `EDUPAY_ACADEMICO_INTEGRATION_TOKEN_PREVIOUS`, `EDUPAY_ACADEMICO_CURSOR_SECRET`, `EDUPAY_ACADEMICO_ALLOWED_TENANTS`, `EDUPAY_ACADEMICO_RATE_LIMIT_PER_MINUTE` | Acceso de portal por tenant y feed heredado BL → Académico con token, rotación opcional, cursores y allowlist. Sólo server-side. |
| Proyección Académico → BL | `ACADEMIC_FINANCIAL_PROJECTION_ENABLED`, `ACADEMIC_FINANCIAL_PROJECTION_BASE_URL`, `ACADEMIC_FINANCIAL_PROJECTION_TIMEOUT_MS`, `ACADEMIC_FINANCIAL_PROJECTION_INBOUND_CREDENTIALS`, `ACADEMIC_FINANCIAL_PROJECTION_SNAPSHOT_CREDENTIALS` | Consumer shadow y snapshots nuevos; permanecen desactivados hasta release explícito. |
| BACK — web, correo y archivos | `PORTAL_URL`, `NEXT_PUBLIC_APP_URL`, `ENABLE_EMAILS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `UPLOAD_DIR` | Orígenes permitidos, entrega SMTP opcional y almacenamiento de archivos. |
| FRONT | `NEXT_PUBLIC_API_URL`, `NODE_ENV`, `JWT_SECRET`, `NEXT_ALLOWED_DEV_ORIGINS` | URL pública del backend, runtime de Next, sesión del lado servidor y origen HMR sólo para desarrollo. `NEXT_PUBLIC_*` se incorpora al build. |

El feed heredado BL → Académico no depende de la proyección shadow. DIE no se
envía a BL.

En producción `RUN_MIGRATIONS=false` impide que BACK ejecute migraciones al
iniciar; se aplican mediante un cambio de release explícito, después de revisar
el destino y el migrador.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS 11, TypeScript, Prisma 7, Passport JWT |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS, Zod 4, React Hook Form |
| Base de Datos | PostgreSQL 18 en producción; PostgreSQL 15 en el ejemplo local histórico |
| Documentación API | Swagger (OpenAPI 3.0) en `/api/docs` |
| Despliegue | Coolify: aplicaciones FRONT y BACK separadas; cPanel es histórico |
| Contenedor local | Docker Compose (PostgreSQL) |

---

## Requisitos Previos

- **Node.js 22** para reproducir el entorno de CI; no cambiar por ello la imagen productiva
- **npm** >= 9.x
- **Docker** y **Docker Compose** (para la base de datos local)
- **Git**

---

## Levantamiento Local (Paso a Paso)

### 1. Clonar el repositorio

```bash
git clone https://github.com/Sherydans12/BL-002-EduPay.git
cd BL-002-EduPay
```

### 2. Levantar PostgreSQL con Docker

```bash
docker compose up -d
```

Esto levanta un contenedor `edupay-postgres` con el puerto local `5435` mapeado
al `5432` del contenedor:
- **Usuario**: `postgres`
- **Contraseña**: `postgres`
- **Base de datos**: `edupay`

Configura `DATABASE_URL` local para el puerto publicado `5435`; el valor del
archivo de ejemplo es ilustrativo y no toma el puerto de Compose.

### 3. Configurar variables de entorno

```bash
# Backend
cp backend/.env.example backend/.env
# Editar si es necesario (DB, JWT_SECRET, SMTP)

# Frontend
cp frontend/.env.example frontend/.env.local
```

### 4. Instalar dependencias

```bash
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 5. Generar cliente Prisma y aplicar migraciones locales

```bash
cd backend
npx prisma generate
npm run db:migrate:deploy
```

### 6. Ejecutar el Seeder (usuario administrador)

```bash
cd backend
npx prisma db seed
```

### 7. Levantar los servidores de desarrollo

**Terminal 1 — Backend (puerto 3001):**
```bash
cd backend
npm run start:dev
```

**Terminal 2 — Frontend (puerto 3000):**
```bash
cd frontend
npm run dev
```

### 8. Acceder a la aplicación

| Recurso | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API REST | http://localhost:3001/api |
| Swagger Docs | http://localhost:3001/api/docs |

---

## Credenciales y acceso

No publicar credenciales de administrador en documentación. Usar cuentas sintéticas
para desarrollo y mecanismos protegidos para accesos productivos. Los seeders y
usuarios de ejemplo son exclusivamente locales; no ejecutarlos en producción.

## Estructura del Proyecto

```
BL-002/
├── backend/                    ← NestJS API
│   ├── prisma/
│   │   ├── schema.prisma       ← 7 modelos: Course, Guardian, Student, Payment, User, Role, Permission
│   │   └── seed.ts             ← Seeder: roles, permisos, usuario admin
│   ├── src/
│   │   ├── auth/               ← Login JWT, guards, decorators (@Public, @RequirePermissions)
│   │   ├── users/              ← CRUD de usuarios
│   │   ├── roles/              ← CRUD de roles con permisos
│   │   ├── courses/            ← CRUD de cursos
│   │   ├── guardians/          ← CRUD de apoderados
│   │   ├── students/           ← CRUD de alumnos
│   │   ├── payments/           ← Registro de pagos + Multer upload PDF
│   │   ├── reports/            ← Reportes con aggregation y groupBy
│   │   ├── mail/               ← Servicio SMTP (nodemailer)
│   │   └── common/             ← ExceptionFilter, TransformInterceptor
│   └── uploads/                ← PDFs de boletas (servido estáticamente)
├── frontend/                   ← Next.js App Router
│   ├── src/app/
│   │   ├── login/              ← Página de autenticación
│   │   ├── dashboard/          ← Panel principal
│   │   ├── pagos/nuevo/        ← Formulario de registro (Zod + RHF)
│   │   ├── reportes/           ← Tabla + resumen por curso
│   │   ├── cursos/             ← CRUD cursos
│   │   ├── alumnos/            ← CRUD alumnos
│   │   └── apoderados/         ← CRUD apoderados
│   └── src/lib/
│       ├── api.ts              ← Cliente API tipado
│       └── schemas/            ← Validación Zod (RUT chileno, PDF, etc.)
├── docker-compose.yml          ← PostgreSQL 15 local
├── README.md                   ← Este archivo
└── README-deploy.md            ← Guía de despliegue para cPanel
```

---

## API Endpoints Principales

### Autenticación
| Método | Ruta | Protegido | Descripción |
|--------|------|:---------:|-------------|
| `POST` | `/api/auth/login` | ❌ | Login → devuelve JWT |

### Entidades
| Método | Ruta | Descripción |
|--------|------|-------------|
| `CRUD` | `/api/courses` | Cursos |
| `CRUD` | `/api/guardians` | Apoderados |
| `CRUD` | `/api/students` | Alumnos |
| `CRUD` | `/api/users` | Usuarios del sistema |
| `CRUD` | `/api/roles` | Roles y permisos |

### Pagos
| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/payments` | Registrar pago (`multipart/form-data`) |
| `GET` | `/api/payments?dateFrom=&dateTo=&courseId=&page=&limit=` | Listar con filtros y paginación |
| `GET` | `/api/payments/summary/by-course` | Resumen agrupado por curso |

### Reportes
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/reports/summary?startDate=&endDate=&courseId=` | Resumen de recaudación |

---

## Scripts Útiles

```bash
# Backend
npm run start:dev        # Desarrollo con hot-reload
npm run build            # Build para producción
npm run start:prod       # Ejecutar build
npm test                 # Tests unitarios (Jest)
npm run test:e2e         # Tests e2e (requiere Postgres; ver docs/TESTING.md)
npx prisma studio        # GUI para la base de datos
npx prisma migrate dev   # Crear/aplicar migración

# Frontend
npm run dev              # Desarrollo con hot-reload
npm run build            # Build para producción
npm test                 # Tests unitarios (Vitest)
```

Detalle de cada prueba, cobertura del flujo de pagos y CI: **[docs/TESTING.md](docs/TESTING.md)**.

---

## Despliegue productivo

La operación vigente usa Coolify con FRONT y BACK separados. Seguir
[el runbook actual](docs/operations/RUNBOOK.md). README-deploy.md conserva
referencias de cPanel como documentación histórica; no aplicarlas a la VPS actual.

La guía local de este README usa el PostgreSQL Compose de desarrollo. En
producción cada backend usa su PostgreSQL nativo de Coolify; los contenedores
Compose `edupay-pilot` históricos no son destinos de migración productiva.
Mantén `RUN_MIGRATIONS=false` en el backend productivo: las migraciones se
ejecutan en una operación explícita y revisada.

## Licencia

Proyecto privado — **BaseLogic** © 2026. Todos los derechos reservados.
