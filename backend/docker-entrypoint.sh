#!/bin/sh
set -e

if [ -z "${DATABASE_URL}" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL no está definida. Configúrala en Coolify antes de desplegar."
  exit 1
fi

if [ "${RUN_MIGRATIONS:-true}" != "false" ]; then
  echo "[entrypoint] Aplicando migraciones pendientes (prisma migrate deploy)..."
  npx prisma migrate deploy
else
  echo "[entrypoint] RUN_MIGRATIONS=false — se omiten migraciones."
fi

echo "[entrypoint] Iniciando aplicación NestJS..."
if [ -f dist/main.js ]; then
  exec node dist/main.js
elif [ -f dist/src/main.js ]; then
  exec node dist/src/main.js
else
  echo "[entrypoint] CRITICAL ERROR: main.js no encontrado. Estructura de dist:"
  find dist
  exit 1
fi
