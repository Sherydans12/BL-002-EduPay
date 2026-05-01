import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as path from 'node:path';

type PaymentConfirmationPayload = {
  to: string;
  studentName: string;
  amount: number;
  paymentDate: Date;
  boletaFileUrl?: string | null;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 25);

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port,
      secure: this.config.get<string>('SMTP_SECURE') === 'true' || port === 465,
      auth: {
        user: this.config.get<string>('SMTP_USER', ''),
        pass: this.config.get<string>('SMTP_PASS', ''),
      },
      tls: {
        rejectUnauthorized: false, // cPanel self-signed certs
      },
    });
  }

  async sendMail(options: nodemailer.SendMailOptions): Promise<void> {
    try {
      const from = this.config.get<string>('SMTP_FROM', 'noreply@colegio.cl');
      await this.transporter.sendMail({ from, ...options });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error);
      // No lanza excepción para no bloquear el flujo principal
    }
  }

  async sendPaymentConfirmation({
    to,
    studentName,
    amount,
    paymentDate,
    boletaFileUrl,
  }: PaymentConfirmationPayload): Promise<void> {
    const subject = 'Comprobante de Pago - BaseLogic EduPay';
    const formattedDate = new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'long',
    }).format(paymentDate);
    const formattedAmount = amount.toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });
    const attachmentPath = boletaFileUrl
      ? path.resolve(process.cwd(), boletaFileUrl.replace(/^\/+/, ''))
      : undefined;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
        <h2 style="color: #1d4ed8; margin-bottom: 8px;">Comprobante de Pago</h2>
        <p style="margin: 0 0 16px;">Estimado apoderado, informamos que se ha registrado un pago exitosamente en BaseLogic EduPay.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Alumno</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${this.escapeHtml(studentName)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Monto</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${formattedAmount}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Fecha</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${formattedDate}</td>
          </tr>
        </table>
        <p style="margin: 0 0 12px;">Se adjunta el comprobante PDF correspondiente a esta transacción.</p>
        <p style="color: #6b7280; font-size: 12px;">Este es un correo automático, por favor no responder directamente a este mensaje.</p>
      </div>
    `;

    await this.sendMail({
      to,
      subject,
      html,
      attachments: attachmentPath
        ? [
            {
              filename: path.basename(attachmentPath),
              path: attachmentPath,
              contentType: 'application/pdf',
            },
          ]
        : undefined,
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
