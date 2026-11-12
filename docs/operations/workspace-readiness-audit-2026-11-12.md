# Auditoría de preparación de BL-002 — 2026-11-12

## Alcance

Revisión de Git, ramas remotas, PRs y documentación para dejar el checkout listo
para continuar desde `main`. No se consultó Coolify en vivo, no se modificaron
datos y no se desplegó.

## Git y ramas

- Antes de esta actualización documental, `main` y `origin/main` coincidían en
  `684689b6551b71c3f86e04c6266f7b4d9c852d02`, con checkout limpio.
- `origin/feat/academic-sync-name-review` no tiene commits exclusivos frente a
  `origin/main`; no falta integrar esa rama de nombres estructurados.
- `origin/agent/guardian-email-s2s` corresponde al PR #1, que permanece en
  borrador. La rama está 49 commits detrás y aporta 3 commits que no están en
  `main`; agrega una migración, una outbox de webhooks y configuración por
  tenant. El texto del PR declara validaciones previas, pero no acredita checks
  actuales sobre la rama frente al `main` de esta auditoría. No se integró.
- `origin/develop` aporta tres commits fechados en julio y está muy detrás de
  `main`; se conserva como trabajo histórico, sin integrarlo en este cierre.

## Producción y propiedad del dominio

- La evidencia versionada más reciente de BL sigue fechada el 2026-09-15; el
  inventario transversal disponible es del 2026-09-24. Ambos registran
  despliegues manuales y auto deploy desactivado en BL FRONT/BACK. Estas fechas
  no son una comprobación en vivo del 2026-11-12.
- EduPay Académico es el dueño de años, cursos, matrículas y admisión. El código
  de BL conserva cobros, pagos, reportes y portal. La proyección financiera
  shadow permanece desactivada.
- El checkout `main` ya estaba sincronizado con su remoto antes de la rama de
  documentación. No se aplicaron migraciones, no se cambiaron variables de
  producción y no se inició un deployment.

## Estado de salida

El repositorio no tenía un cambio de producto seguro y actual para incorporar a
`main`. Se mantiene el PR #1 como borrador y se corrigen aquí las instrucciones
que confundían estado de Git con automatización de deployment. Antes de revisar
ese PR será necesario actualizarlo contra el `main` actual, volver a revisar su
migración y configuración, y obtener checks vigentes.
