import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 25),
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER', ''),
        pass: this.config.get<string>('SMTP_PASS', ''),
      },
      tls: {
        rejectUnauthorized: false, // cPanel self-signed certs
      },
    });
  }

  async sendMail(to: string, subject: string, html: string): Promise<void> {
    try {
      const from = this.config.get<string>('SMTP_FROM', 'noreply@colegio.cl');
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      // No lanza excepción para no bloquear el flujo principal
    }
  }

  async sendPaymentConfirmation(
    to: string,
    studentName: string,
    amount: number,
    paymentDate: string,
  ): Promise<void> {
    const subject = `Confirmación de Pago - ${studentName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a56db;">Confirmación de Pago</h2>
        <p>Se ha registrado un pago exitosamente.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Alumno</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${studentName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Monto</td>
            <td style="padding: 8px; border: 1px solid #ddd;">$${amount.toLocaleString('es-CL')}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${paymentDate}</td>
          </tr>
        </table>
        <p style="color: #666; font-size: 12px;">Este es un correo automático del sistema EduPay.</p>
      </div>
    `;
    await this.sendMail(to, subject, html);
  }
}
