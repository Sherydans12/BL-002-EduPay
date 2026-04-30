# EduPay – Guía de Despliegue (cPanel)

## Requisitos
- cPanel con Node.js App (Passenger)
- PostgreSQL (puede ser local en el server o remoto)
- Node.js >= 18

---

## Backend (NestJS)

### 1. Build
```bash
cd backend
npm install
npx prisma generate
npm run build
```

### 2. Migrar Base de Datos
```bash
npx prisma migrate deploy
```

### 3. Configurar en cPanel
- **Application Root**: `backend`
- **Application Startup File**: `dist/main.js`
- **Environment Variables**:
  - `DATABASE_URL`: tu connection string de PostgreSQL
  - `PORT`: el puerto asignado por cPanel (Passenger lo ignora, pero es buena práctica)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: configuración del SMTP nativo
  - `UPLOAD_DIR`: `./uploads`

### 4. Carpeta de uploads
Asegúrate de que la carpeta `uploads/` exista y tenga permisos de escritura.

---

## Frontend (Next.js)

### 1. Build
```bash
cd frontend
npm install
npm run build
```

### 2. Configurar en cPanel
- **Application Root**: `frontend`
- **Application Startup File**: `node_modules/.bin/next` (o crear un `server.js` wrapper)
- **Environment Variables**:
  - `NEXT_PUBLIC_API_URL`: URL del backend (ej. `https://api.colegio.cl/api`)

### Alternativa: Static Export
Si cPanel no soporta un demonio SSR estable, se puede configurar Next.js para generar un export estático:
1. En `next.config.ts`, agregar `output: 'export'`
2. Ejecutar `npm run build`
3. Servir la carpeta `out/` como sitio estático

---

## Estructura de Archivos en Producción
```
/home/user/
├── backend/
│   ├── dist/main.js          ← Startup file
│   ├── uploads/              ← PDFs de boletas
│   ├── node_modules/
│   └── .env
├── frontend/
│   ├── .next/                ← Build de Next.js
│   ├── node_modules/
│   └── .env.local
```

---

## Documentación de API (Swagger)

### Acceso a Swagger UI
Con el backend corriendo, la documentación interactiva está disponible en:
```
http://localhost:3001/api/docs
```
En producción será `https://tu-dominio.cl/api/docs`.

### Exportar JSON de Swagger (OpenAPI 3.0)
El documento OpenAPI en formato JSON se expone automáticamente en:
```
http://localhost:3001/api/docs-json
```

### Importar en Postman
1. Abre Postman → **Import** → **Link**
2. Pega la URL: `http://localhost:3001/api/docs-json`
3. Postman generará automáticamente una colección con todos los endpoints, ejemplos y schemas.

### Importar en Bruno
1. Abre Bruno → **Import Collection** → **OpenAPI V3 Spec**
2. Apunta al archivo descargado o la URL directa:
   ```bash
   curl http://localhost:3001/api/docs-json -o edupay-openapi.json
   ```
3. Bruno creará los requests organizados por tags (courses, guardians, students, payments).

### Exportar YAML (alternativa)
```
http://localhost:3001/api/docs-yaml
```

### Desactivar Swagger en Producción
Si se desea desactivar Swagger en producción por seguridad, se puede condicionar en `main.ts`:
```typescript
if (process.env.NODE_ENV !== 'production') {
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
```

