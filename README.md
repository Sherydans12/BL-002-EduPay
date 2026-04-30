# BaseLogic-EduPay (BL-002)

> Sistema de registro manual de pagos para colegios.

[![Version](https://img.shields.io/badge/version-1.0--RC-blue)]()
[![NestJS](https://img.shields.io/badge/Backend-NestJS%2011-red)]()
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black)]()
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL%2015-blue)]()

---

## Descripción

EduPay permite al personal administrativo de un colegio:

- **Registrar pagos manuales** asociados a alumnos, con soporte para subir boletas en PDF.
- **Gestionar entidades** (cursos, alumnos, apoderados).
- **Generar reportes** de recaudación filtrados por fecha, curso y método de pago.
- **Autenticación y autorización** basada en JWT con roles y permisos (RBAC).
- **Envío de notificaciones** por correo SMTP nativo (cPanel).

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS 11, TypeScript, Prisma 7, Passport JWT |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS, Zod 4, React Hook Form |
| Base de Datos | PostgreSQL 15 |
| Documentación API | Swagger (OpenAPI 3.0) en `/api/docs` |
| Despliegue | cPanel / Passenger (Node.js App) |
| Contenedor local | Docker Compose (PostgreSQL) |

---

## Requisitos Previos

- **Node.js** >= 18.x
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

Esto levanta un contenedor `edupay-postgres` en `localhost:5432` con:
- **Usuario**: `postgres`
- **Contraseña**: `postgres`
- **Base de datos**: `edupay`

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

### 5. Generar cliente Prisma y migrar base de datos

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
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

## Credenciales del Super Admin

El seeder (`prisma/seed.ts`) crea automáticamente:

| Campo | Valor |
|-------|-------|
| **Email** | `admin@baselogic.cl` |
| **Contraseña** | `admin123` |
| **Rol** | `SUPER_ADMIN` (todos los permisos) |

> ⚠️ **Cambiar la contraseña** inmediatamente tras el primer login en producción.

---

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
npx prisma studio        # GUI para la base de datos
npx prisma migrate dev   # Crear/aplicar migración

# Frontend
npm run dev              # Desarrollo con hot-reload
npm run build            # Build para producción
```

---

## Despliegue en Producción (cPanel)

Consultar la guía detallada en [`README-deploy.md`](./README-deploy.md).

---

## Licencia

Proyecto privado — **BaseLogic** © 2026. Todos los derechos reservados.
