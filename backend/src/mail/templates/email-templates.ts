export const EMAIL_TEMPLATE_TYPES = [
  'MANUAL_PAYMENT',
  'BOLETA',
  'REMINDER',
] as const;

export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];

type PaymentConfirmationTemplateData = {
  recipientName?: string;
  studentName: string;
  formattedAmount: string;
  formattedDate: string;
};

type BoletaTemplateData = {
  recipientName?: string;
  studentName: string;
  boletaNumber?: string | null;
};

type ReminderTemplateData = {
  recipientName?: string;
  studentName: string;
  conceptName: string;
  formattedAmount: string;
  formattedDueDate?: string | null;
};

export function renderPaymentConfirmationTemplate({
  recipientName,
  studentName,
  formattedAmount,
  formattedDate,
}: PaymentConfirmationTemplateData): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
      <h2 style="color: #1d4ed8; margin-bottom: 8px;">Comprobante de Pago</h2>
      <p style="margin: 0 0 16px;">Estimado/a ${escapeHtml(recipientName ?? 'apoderado/a')}, informamos que se ha registrado un pago exitosamente en BaseLogic EduPay.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Alumno</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(studentName)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Monto</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(formattedAmount)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Fecha</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(formattedDate)}</td>
        </tr>
      </table>
      <p style="color: #6b7280; font-size: 12px;">Este es un correo automático, por favor no responder directamente a este mensaje.</p>
    </div>
  `;
}

export function renderBoletaTemplate({
  recipientName,
  studentName,
  boletaNumber,
}: BoletaTemplateData): string {
  const numberLabel = boletaNumber ? ` N° ${boletaNumber}` : '';

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="margin: 0 0 16px;">Su boleta de pago está lista</h2>
      <p>Estimado/a ${escapeHtml(recipientName ?? 'apoderado/a')},</p>
      <p>
        La boleta${escapeHtml(numberLabel)} asociada al pago de
        ${escapeHtml(studentName)} se encuentra disponible y se adjunta
        en este correo.
      </p>
      <p>Saludos cordiales,<br />Equipo de Administración</p>
    </div>
  `;
}

export function renderReminderTemplate({
  recipientName,
  studentName,
  conceptName,
  formattedAmount,
  formattedDueDate,
}: ReminderTemplateData): string {
  const dueDateText = formattedDueDate
    ? `, con vencimiento el ${escapeHtml(formattedDueDate)}`
    : '';

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="margin: 0 0 16px;">Recordatorio de pago</h2>
      <p>Estimado/a ${escapeHtml(recipientName ?? 'apoderado/a')},</p>
      <p>
        Le recordamos que ${escapeHtml(studentName)} mantiene
        ${escapeHtml(conceptName)} por ${escapeHtml(formattedAmount)}${dueDateText}.
      </p>
      <p>Si ya realizó el pago, por favor ignore este mensaje.</p>
    </div>
  `;
}

export function renderEmailTemplatePreview(type: EmailTemplateType): string {
  const content = (() => {
    switch (type) {
      case 'MANUAL_PAYMENT':
        return renderPaymentConfirmationTemplate({
          recipientName: 'María Pérez',
          studentName: 'Antonia González',
          formattedAmount: '$45.000',
          formattedDate: '28 de julio de 2026',
        });
      case 'BOLETA':
        return renderBoletaTemplate({
          recipientName: 'María Pérez',
          studentName: 'Antonia González',
          boletaNumber: '12345',
        });
      case 'REMINDER':
        return renderReminderTemplate({
          recipientName: 'María Pérez',
          studentName: 'Antonia González',
          conceptName: 'mensualidad de julio',
          formattedAmount: '$45.000',
          formattedDueDate: '05/08/2026',
        });
    }
  })();

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vista previa: ${type}</title>
  </head>
  <body style="margin: 0; padding: 32px; background: #f3f4f6;">
    <main style="max-width: 704px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);">
      ${content}
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
