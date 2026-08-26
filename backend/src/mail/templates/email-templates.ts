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

export type ConsolidatedReminderCharge = {
  conceptName: string;
  formattedAmount: string;
  formattedDueDate?: string;
};

export type ConsolidatedReminderTemplateData = {
  recipientName?: string;
  studentName: string;
  courseName?: string;
  totalFormattedAmount: string;
  charges: ConsolidatedReminderCharge[];
  paymentPortalUrl?: string;
  footerText?: string;
};

export type CustomMessageTemplateData = {
  recipientName?: string;
  studentName?: string;
  courseName?: string;
  subject: string;
  message: string;
  footerText?: string;
};

export function renderConsolidatedReminderTemplate({
  recipientName,
  studentName,
  courseName,
  totalFormattedAmount,
  charges,
  paymentPortalUrl,
  footerText,
}: ConsolidatedReminderTemplateData): string {
  const chargeRows = charges
    .map(
      (c) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${escapeHtml(c.conceptName)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; text-align: center;">${escapeHtml(c.formattedDueDate ?? '—')}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827; text-align: right;">${escapeHtml(c.formattedAmount)}</td>
      </tr>
    `,
    )
    .join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 24px; color: #ffffff;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 700;">Estado de Pagos Pendientes</h2>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">BaseLogic EduPay &bull; Notificación Oficial</p>
      </div>

      <div style="padding: 24px;">
        <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${escapeHtml(recipientName ?? 'apoderado/a')}</strong>,
        </p>
        <p style="margin: 0 0 20px; font-size: 14px; color: #4b5563; line-height: 1.5;">
          Le informamos que el alumno/a <strong>${escapeHtml(studentName)}</strong>${courseName ? ` (${escapeHtml(courseName)})` : ''} mantiene las siguientes cuotas con vencimiento cumplido o pendiente de pago:
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="padding: 10px 12px; border-bottom: 2px solid #e2e8f0; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b;">Concepto</th>
              <th style="padding: 10px 12px; border-bottom: 2px solid #e2e8f0; text-align: center; font-size: 12px; text-transform: uppercase; color: #64748b;">Vencimiento</th>
              <th style="padding: 10px 12px; border-bottom: 2px solid #e2e8f0; text-align: right; font-size: 12px; text-transform: uppercase; color: #64748b;">Monto Pendiente</th>
            </tr>
          </thead>
          <tbody>
            ${chargeRows}
          </tbody>
          <tfoot>
            <tr style="background-color: #f8fafc; font-size: 15px;">
              <td colspan="2" style="padding: 12px; font-weight: 700; color: #1e293b; text-align: right;">Total Pendiente:</td>
              <td style="padding: 12px; font-weight: 700; color: #dc2626; text-align: right;">${escapeHtml(totalFormattedAmount)}</td>
            </tr>
          </tfoot>
        </table>

        ${
          paymentPortalUrl
            ? `
          <div style="text-align: center; margin: 28px 0 16px;">
            <a href="${escapeHtml(paymentPortalUrl)}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
              Pagar Online en Portal
            </a>
          </div>
        `
            : ''
        }

        <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
          Si ya realizó este pago a través de transferencia bancaria o en secretaría, por favor envíenos el comprobante o desestime este recordatorio.
        </p>
      </div>

      <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px 24px; font-size: 12px; color: #9ca3af; text-align: center;">
        ${escapeHtml(footerText ?? 'Sistema de Gestión y Recaudación Escolar &bull; BaseLogic EduPay')}
      </div>
    </div>
  `;
}

export function renderCustomMessageTemplate({
  recipientName,
  studentName,
  courseName,
  subject,
  message,
  footerText,
}: CustomMessageTemplateData): string {
  const formattedMessage = escapeHtml(message).replace(/\n/g, '<br />');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px; color: #ffffff;">
        <h2 style="margin: 0; font-size: 18px; font-weight: 700;">${escapeHtml(subject)}</h2>
        <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.85;">Comunicado Oficial &bull; BaseLogic EduPay</p>
      </div>

      <div style="padding: 24px;">
        <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5;">
          Estimado/a <strong>${escapeHtml(recipientName ?? 'apoderado/a')}</strong>,
        </p>
        ${
          studentName
            ? `
          <div style="background-color: #f1f5f9; border-left: 4px solid #3b82f6; padding: 10px 14px; margin-bottom: 16px; border-radius: 0 6px 6px 0; font-size: 13px; color: #334155;">
            <strong>Alumno/a:</strong> ${escapeHtml(studentName)}${courseName ? ` &bull; <strong>Curso:</strong> ${escapeHtml(courseName)}` : ''}
          </div>
        `
            : ''
        }

        <div style="margin: 16px 0; font-size: 14px; line-height: 1.7; color: #374151;">
          ${formattedMessage}
        </div>
      </div>

      <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px 24px; font-size: 12px; color: #9ca3af; text-align: center;">
        ${escapeHtml(footerText ?? 'Sistema de Gestión y Recaudación Escolar &bull; BaseLogic EduPay')}
      </div>
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
