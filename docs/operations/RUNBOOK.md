# Cambios seguros y recuperación

Aplica a ambos repositorios. Leer primero [topología vigente](PRODUCTION.md).
Este runbook documenta la operación existente; no autoriza una migración,
un nuevo contrato ni cambios fuera del alcance aprobado.

## Inicio de una mejora

1. Obtener refs remotas y revisar git status, rama y worktrees. No usar un
   directorio sucio como imagen implícita de producción.
2. Partir de `origin/main` actualizado, que integra el código productivo y esta
   documentación. Crear una rama `codex/<mejora>` y otro worktree limpio.
   `codex/production-stable-baseline` conserva la referencia de cierre.
3. En Académico, main contiene el frontend 4f5ad28 y el código API de b2f489f.
   API y workers permanecen pinned a su digest: actualizar main no implica
   redeployar todos los recursos ni ejecutar migraciones.
4. Registrar alcance, recurso UUID afectado, contrato/esquema afectado y pruebas.
   Los pendientes locales de v2, rollover y almacenamiento son trabajo futuro,
   no parte de esta publicación.
5. Desarrollo y pruebas usan bases, volúmenes y secretos independientes. No
   reutilizar DATABASE_URL productiva, cuentas reales o dominios productivos.
   No existe un staging BL-002/Académico certificado por este cierre:
   crearlo requiere un inventario y validación propios, no reutilizar Admission.

## Antes de tocar Coolify

- Reconciliar UUID, proyecto, entorno, repositorio, rama, SHA/digest, Dockerfile,
  target, comando, dominios, puertos, healthchecks, redes, montajes y nombres de
  variables. Capturar snapshot privado con acceso restringido.
- Revisar historial y producto del último artefacto realmente sano. Un deployment
  reciente puede corresponder a código más antiguo. No inventar SHAs de rollback.
- Comprobar un único propietario por dominio tanto en Coolify como en labels
  de contenedores activos y upstreams Traefik.
- Conservar imagen anterior con tag de recuperación, configuración y montajes.
  Confirmar que la imagen existe; seleccionar rollback en Coolify puede
  reconstruir y sobrescribir tags, por lo que no basta el historial.
- Identificar hooks y entrypoints. BL BACK debe conservar RUN_MIGRATIONS
  desactivado. No lanzar migration runners como efecto lateral de un redeploy.
- Revisar automatismos antes de publicar en main: desde el release 2026-09-14,
  auto deploy está desactivado en BL FRONT y BACK (`Manual deployments only`) y
  Academic FRONT también permanece desactivado. Los SHAs están fijados, pero
  no asumir que publicar documentación no genera un webhook.
  Las ramas documentales y baselines no sustituyen la configuración de release.

## Gates por recurso

| Recurso | Gate obligatorio |
|---|---|
| BL BACK | Commit aprobado `16e208…`, imagen observada `sha256:85b202…`, /api/v1/health 200, JWT/conexión y uploads conservados, `RUN_MIGRATIONS=false` |
| BL FRONT | /login 200, producto BL-002, bundle usa API BL-002, login real y sesión tras recargar |
| Academic API | Digest exacto, /api/v1/health/live y /ready 200, DB propia y CORS exacto |
| Academic FRONT | Target runtime, puerto 3000, /login 200, base /api/v1, Identity propio, navegación real de los módulos cambiados |
| Identity | Health y JWKS 200, issuer/audience, cookies y CORS, conectividad privada de DB; ninguna ruta duplicada |
| Workers | Healthy, imagen aprobada, comando/DB propios, sin puertos públicos; distinguir salud de completitud de runs |
| Persistencia | Montajes conservados, backup del sistema afectado verificado y autorización específica si hay cambios de esquema |

HTTP→HTTPS debe volver al mismo dominio; verificar TLS en los cinco dominios.
Revisar assets públicos y rutas recuperadas, no únicamente el HTML de login.
No registrar tokens, cookies, cuerpos de login ni variables completas como
evidencia: guardar códigos HTTP, requestId, SHA/digest y comprobaciones booleanas.

## Orden y rollback

Desplegar únicamente recursos que lo necesitan: BL BACK, BL FRONT, Academic API
y Academic FRONT, en ese orden cuando todos estén implicados. Para el release
2026-09-14 sólo se desplegó BL BACK; BL FRONT, Identity, Académico y workers
quedaron en sus artefactos ya validados. No redeployar recursos sanos por
arrastre de un cambio de UI.

Si falla un gate real, detener la promoción y restaurar **solo ese recurso**
a su imagen/configuración comprobadas; repetir sus gates y comprobar que las
otras rutas siguen intactas. Un fallo del verificador debe investigarse sin
confundirlo con un fallo del producto. No ejecutar DOWN/reset/migraciones
destructivas para revertir código. Si el esquema ya cambió de forma aditiva,
evaluar compatibilidad hacia atrás: revertir la app no significa borrar columnas.

La asociación privada de Identity usa connect_to_docker_network en Coolify.
La versión instalada conecta la red compartida al iniciar el servicio; no
interpretar su ausencia en el Compose generado como prueba suficiente de error.
Comprobar el contenedor y la conectividad privada antes de cambiarlo.

## Backups y cambios de esquema

- Timer `edupay-backup.timer`, servicio `edupay-backup.service`, cada seis horas.
  Launcher protegido `/root/run-edupay-native-backup.sh`; uploader existente
  `/opt/edupay-pilot/academico/ops/backup/upload-to-r2.sh`.
- Cobertura verificada en esta fase: PostgreSQL Académico e Identity. Punto
  previo a reparación `20260911T130031Z`; posterior `20260911T130501Z`.
  Se verificaron checksums locales y objetos remotos R2.
- Se verificó la restauración del backup real protegido de PostgreSQL BL-002.
  La evidencia no demuestra por sí sola consistencia completa de la base viva
  ni cobertura/restauración íntegra de todos los uploads.
- Antes del tramo BL del release se verificó un recovery point vigente de
  PostgreSQL BL-002 y el servicio de backup sano. Se mantiene el requisito de
  un punto vigente de PostgreSQL y uploads, con checksum y restauración aislada
  verificable, antes de cualquier cambio posterior de esquema o datos.
  Antes de su próximo cambio con riesgo de datos, demostrar cobertura de su
  PostgreSQL 18 y uploads con herramientas compatibles y restauración aislada.
- Existe un backup administrativo Coolify separado; tampoco reemplaza un
  backup de datos de negocio.
- Conservar recovery points anteriores. Nunca borrar volúmenes o ejecutar
  `docker system prune --volumes` como limpieza genérica.
- La base Académico tiene una reparación aditiva autorizada que no alteró el
  ledger Prisma. Ver [cierre](PHASE-CLOSEOUT.md). **No ejecutar la cadena
  histórica de migrate deploy a ciegas** ni marcar migraciones como aplicadas
  sin comparar cada efecto y documentar una autorización nueva.
- Una nueva base desechable debe validar la cadena del release seleccionado;
  una base existente debe comparar catálogo y ledger. Son verificaciones
  diferentes. No usar el SQL ya aplicado como receta idempotente general.

## Limpieza y cierre de un cambio

No usar estado stopped, nombre de prueba o dominio vacío como única evidencia
de abandono. Buscar referencias, consumidores de red, volúmenes, backups y
artefactos de rollback; eliminar por UUID comprobado. No borrar otros proyectos.

Al cerrar: registrar SHA/digest y deployment, resultado de gates, rollback si lo
hubo, backup aplicable y pendientes reales. Actualizar el mismo inventario en
ambos repositorios cuando cambie una conexión. Dejar worktree limpio y rama
publicada; conservar trabajo ajeno sin reset, clean, force push o poda global.

## Release BL de proyección — 2026-09-14, flags apagados

El preflight BL clasifica `_prisma_migrations` por intento, no por número de
filas: 36 intentos, 28 aplicados (`finished_at` informado y sin
`rolled_back_at`), 8 revertidos (`rolled_back_at` informado) y 0 fallidos/no
resueltos (ambos campos vacíos). Las 8 reversiones pertenecen a historia ya
resuelta: cada una tiene una aplicación posterior exitosa para el mismo nombre.
No se borraron filas ni se cambiaron checksums.

Se ejecutaron únicamente, en este orden y contra el PostgreSQL BL productivo:

1. `20260903090000_add_tenant_canonical_mapping`
2. `20260903113000_add_academic_financial_projection_shadow`

Checksums SHA-256 canónicos registrados por Prisma después de la aplicación:

- `20260903090000_add_tenant_canonical_mapping/migration.sql` →
  `031f6e0efdb03e0cfb98e94c0a7105b462b3b760812e9dc033ca8582d79089b7`
- `20260903113000_add_academic_financial_projection_shadow/migration.sql` →
  `fee0f6ccdab5fde3c3cfdae1381ad7a0941bf1ebc1c6a578df3cd8f29402fcf8`
- `scripts/academic-financial-projection-preflight.sql` →
  `d8fb59768ad9d89339d968576ac0f0c7f0e1ef5d18c10652b23b8e1040bdf85bd`

La operación usó `psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f
scripts/academic-financial-projection-preflight.sql`, luego `prisma migrate
status` desde el árbol exacto del commit aprobado y finalmente
`prisma migrate deploy` sobre ese mismo árbol cerrado. El status previo mostró
exactamente los dos nombres anteriores como pendientes; por eso el deploy no
tuvo migraciones imprevistas disponibles para aplicar.

El status Prisma posterior desde el artefacto desplegado informó “Database
schema is up to date!”. El postflight verificó las cinco tablas nuevas,
18 índices y 50 constraints; todas las tablas tienen cero filas. No se hizo
backfill BL, no se crearon mappings, no se agregaron credenciales S2S nuevas y
no se modificó el ledger fuera de las dos aplicaciones normales de Prisma.

La imagen GHCR candidata `sha256:c19015…` fue validada localmente, pero no se
usó directamente porque el daemon productivo respondió `unauthorized`. Coolify
construyó desde el commit exacto `16e208…` y dejó desplegado
`sha256:85b202901f77a60cb120f0cc720b878f54e0e570da4d8c191d3040ee511ef64f`.
El rollback de aplicación queda preparado con la imagen anterior observada
`sha256:0b15f903be869ac7467b4d23f6ca25f11c9689575291310e90c42d5be0cc3dab`;
no existe rollback destructivo del esquema.

Gates finales: Coolify Success y healthcheck Docker healthy; `/api/v1/health`
HTTP 200; `RUN_MIGRATIONS=false`; projection flag y credenciales inbound /
snapshot ausentes; auto deploy BL FRONT/BACK manual; producer, publisher y
shadow funcional apagados. El despliegue no activa funcionalidades.
