---
name: cpanel-passenger-build
description: Configuración estricta para asegurar que el build de Next.js y NestJS sea compatible con cPanel y Phusion Passenger (Node.js App).
---

# cPanel & Passenger Deployment Rules

## Backend (NestJS)

- El punto de entrada para producción debe estar optimizado para Passenger. Asegúrate de que el `dist/main.js` generado pueda ser el archivo de arranque (startup file) en cPanel sin requerir comandos complejos de npm.
- Manejo de rutas: Usa `path.join(__dirname, ...)` con cautela, asumiendo que el `cwd` en Passenger puede diferir del de desarrollo local.

## Frontend (Next.js)

- Dependiendo de la configuración del servidor, si cPanel no soportará un demonio SSR estable, prioriza componentes estáticos donde sea posible.
- Si se usa el App Router completo, genera un script de build claro e instrucciones en un `README-deploy.md` sobre cómo setear el entorno Node.js de cPanel para arrancar Next.js.
