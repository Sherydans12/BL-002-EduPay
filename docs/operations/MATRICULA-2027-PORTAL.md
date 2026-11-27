# Cobro de matrícula 2027 en el portal

## Dónde se prepara cada parte

1. **Académico.** Crea 2027 y sus cursos en borrador desde **Administración → Inicio → Preparar 2027**. Crea el primer 4.º medio si aún falta. En **Matrículas → Avance anual**, selecciona el destino de cada curso. Guarda las decisiones para retomar la revisión. Usa **Preparar matrículas para Pagos** cuando el padrón de ese curso esté revisado. Este paso deja operativo 2026.
2. **Académico y Pagos.** Incorpora manualmente los alumnos nuevos en el año y curso correctos después de revisar los RUN/IPE legados. En BL-002, **Alumnos → Nuevos desde Académico** completa el vínculo con el apoderado. Un alumno por incorporar todavía no está disponible para emitir matrícula en Pagos.
3. **BL-002.** En **Cobranzas → Configuración financiera → Emitir matrícula por año**, selecciona 2027, el concepto activo de matrícula, el monto por alumno y el vencimiento definidos por el colegio. Revisa cuántos cargos se emitirían, cuántos ya existen y cuántos alumnos quedan fuera. La vista previa puede repetirse durante la preparación.
4. **Apertura del 1 de diciembre.** Ejecuta **Emitir cargos** en la ventana acordada. Una vez emitidos, el portal los puede ofrecer de inmediato. Habilitar la cobranza no requiere activar 2027 en Académico. Cambiar el padrón después de emitir requiere revisar en Pagos los cargos y pagos asociados antes de corregir la matrícula.
5. **Portal.** Un apoderado con cargos vigentes puede seleccionar **2027** en su estado de cuenta y pagar el concepto de matrícula. Los cargos de 2026 quedan accesibles en su año. Comprueba la primera familia y el primer flujo de pago con un caso controlado antes de comunicar disponibilidad.

## Contratos y fuente de verdad

- **Académico → BL-002.** El outbox envía la proyección v2 de la matrícula futura. La escritura proyecta el año, curso, alumno y matrícula. El año puede estar en borrador. El apoderado y la cobranza se gestionan en BL-002.
- **Panel BL-002 → BL BACK.** `POST /api/charges/enrollment-fees/preview` y `POST /api/charges/enrollment-fees/issue` requieren `manage:payments`, tenant activo y año explícito. El segundo exige una vista previa vigente y crea únicamente cargos para matrículas activas sin cobro de matrícula vigente del mismo año. Los cargos históricos y los pagos se conservan.
- **Portal → BL BACK.** El repositorio [portal-edupay](https://github.com/Sherydans12/portal-edupay) consulta por S2S `GET /api/v1/portal/guardian/{rut}/statement` con la clave y tenant del portal. Cada cuota recibe `academicYear` desde la matrícula asociada, `enrollmentCourse`, `dueDate`, concepto, saldo y estado. Una matrícula 2027 puede vencer en diciembre de 2026 y aparecer en 2027.
- **Webpay → Portal → BL BACK.** Al iniciar el pago, el servidor del portal vuelve a consultar los cargos del apoderado y comprueba el saldo exacto. Al confirmar Webpay, `POST /api/v1/portal/payments/sync` registra la confirmación en BL-002.

## Orden técnico

Aplicar la migración aditiva de borradores en la base de Académico con el [runbook](RUNBOOK.md), publicar API y luego web de Académico. Publicar BL BACK antes del frontend administrativo y el portal. El cambio BL-002 no agrega migraciones. La revisión de despliegue debe confirmar proyección en escritura y recursos vigentes. La validación local usa datos sintéticos y Webpay simulado o sandbox.
