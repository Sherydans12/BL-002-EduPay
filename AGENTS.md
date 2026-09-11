# BL-002: desarrollo y operación

Leer [topología productiva](docs/operations/PRODUCTION.md),
[runbook](docs/operations/RUNBOOK.md) y
[cierre de fase](docs/operations/PHASE-CLOSEOUT.md) antes de operar o continuar mejoras.

- BL-002 es Sherydans12/BL-002-EduPay. FRONT y BACK son dos aplicaciones Coolify
  distintas. edupay.baselogic.cl pertenece a FRONT BL-002; api-edupay.baselogic.cl
  a BACK BL-002. Nunca asignarles los dominios de Académico.
- Autenticación administrativa BL-002 separada de EduPay Identity. La integración
  Académico es S2S de lectura, con token dedicado y tenant de origen autorizado.
  No compartir tablas, credenciales, bases ni contexto de autorización.
- PostgreSQL productivo BL-002 es 18; los contenedores de pruebas pueden usar
  otra versión explícita. No sustituir volumen/imagen por un ejemplo local.
- Consultar UUID, SHA/digest y configuración vigentes; no inferir recursos desde
  nombres parecidos o del último deployment. main tiene auto deploy activo al
  cierre: revisar automatismos antes de fusionar.
- Crear rama codex/<mejora> y worktree propio desde la baseline publicada.
  No descartar cambios existentes, usar reset/clean/force push o integrar WIP
  para hacer parecer limpio un directorio.
- Pruebas obligatorias para cambios de autenticación/autorización y tenant:
  casos permitidos, denegados, contexto revocado y acceso entre tenants.
- No publicar secretos, .env, cookies, tokens, dumps o datos reales de usuarios.
  Documentar variables por nombre/presencia y evidencia por código/requestId.
- No ejecutar migraciones automáticas o destructivas en producción. Mantener
  RUN_MIGRATIONS desactivado; cualquier cambio de esquema requiere comprobación
  documentada, backup del sistema afectado y autorización específica.
- Limitar cambios al alcance solicitado. Cambios de contrato/esquema que afecten
  Académico requieren revisar sus ADR/contratos y actualizar ambos repositorios.
- Las instrucciones y ejemplos locales de README no son comandos productivos.
  README-deploy.md describe cPanel histórico, no la topología vigente.
- Actualizar docs/operations/coolify-inventory.json y PRODUCTION.md en ambos
  repositorios al cambiar conexiones o recursos. Conservar rollback por recurso.
