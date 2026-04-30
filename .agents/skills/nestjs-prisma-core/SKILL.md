---
name: nestjs-prisma-core
description: Reglas arquitectónicas estrictas para crear módulos, controladores y servicios en NestJS usando Prisma ORM.
---

# NestJS & Prisma Architecture Rules

## Estructura de Módulos

- Cada entidad (Course, Student, Payment, etc.) debe tener su propio módulo independiente.
- Usa DTOs (Data Transfer Objects) con `class-validator` y `class-transformer` para validar todos los payloads de entrada estáticamente.

## Patrones de Diseño

- **Controladores**: Solo deben recibir la petición, validar el payload y delegar la ejecución. Cero lógica de negocio en los controladores.
- **Servicios**: Deben manejar la lógica de negocio y las transacciones de Prisma.
- **Manejo de Errores**: Usa filtros de excepción (`Exception Filters`) globales o `HttpException` estándar para mapear errores de Prisma (ej. P2002 para duplicados) a códigos HTTP correctos.

## Archivos (Multer)

- Para procesar el `boletaFileUrl`, usa `FileInterceptor` de `@nestjs/platform-express`.
- Configura Multer para guardar en disco local (`./uploads`), asegurando que la ruta estática sea accesible.
