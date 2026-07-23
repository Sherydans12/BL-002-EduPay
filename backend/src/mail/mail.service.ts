import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationType, DeliveryStatus, type Prisma } from '@prisma/client';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Resend } from 'resend';
import { CommunicationsService } from '../communications/communications.service';

type PaymentConfirmationPayload = {
  to: string;
  recipientName?: string;
  studentName: string;
  studentId?: number;
  paymentGroupId?: number;
  amount: number;
  paymentDate: Date;
  boletaFileUrl?: string | null;
};

type BoletaNotificationPayload = {
  to: string;
  recipientName?: string;
  studentName: string;
  studentId?: number;
  paymentGroupId: number;
  boletaNumber?: string | null;
  boletaFileUrl: string;
};

type ReminderPayload = {
  to: string;
  recipientName?: string;
  studentName: string;
  studentId?: number;
  amount: number;
  dueDate?: Date;
  conceptName?: string;
};

type SendTrackedEmailData = {
  to: string;
  recipientName?: string;
  type: CommunicationType;
  subject: string;
  html: string;
  metadata?: Prisma.InputJsonObject;
  attachment?: {
    fileUrl: string;
    filename: string;
  };
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly isEmailEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly communicationsService: CommunicationsService,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey || 're_placeholder_dev_no_email');
    this.from = this.config.get<string>('RESEND_FROM', 'pagos@colegio.edu.cl');
    this.isEmailEnabled = Boolean(apiKey);
  }

  async sendPaymentConfirmation({
    to,
    recipientName,
    studentName,
    studentId,
    paymentGroupId,
    amount,
    paymentDate,
    boletaFileUrl,
  }: PaymentConfirmationPayload): Promise<void> {
    const subject = 'Comprobante de Pago - BaseLogic EduPay';
    const formattedDate = new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(paymentDate);
    const formattedAmount = amount.toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
        <h2 style="color: #1d4ed8; margin-bottom: 8px;">Comprobante de Pago</h2>
        <p style="margin: 0 0 16px;">Estimado/a ${this.escapeHtml(recipientName ?? 'apoderado/a')}, informamos que se ha registrado un pago exitosamente en BaseLogic EduPay.</p>
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
        <p style="color: #6b7280; font-size: 12px;">Este es un correo automático, por favor no responder directamente a este mensaje.</p>
      </div>
    `;

    await this.sendTrackedEmail({
      to,
      recipientName,
      type: CommunicationType.MANUAL_PAYMENT_RECEIPT,
      subject,
      html,
      metadata: {
        ...(paymentGroupId ? { paymentGroupId } : {}),
        ...(studentId ? { studentId } : {}),
        amount,
        paymentDate: paymentDate.toISOString(),
        ...(boletaFileUrl ? { boletaUrl: boletaFileUrl } : {}),
      },
      attachment: boletaFileUrl
        ? {
            fileUrl: boletaFileUrl,
            filename: path.basename(boletaFileUrl),
          }
        : undefined,
    });
  }

  async sendBoletaNotification({
    to,
    recipientName,
    studentName,
    studentId,
    paymentGroupId,
    boletaNumber,
    boletaFileUrl,
  }: BoletaNotificationPayload): Promise<void> {
    const numberLabel = boletaNumber ? ` N° ${boletaNumber}` : '';
    const subject = `Su boleta de pago está lista${numberLabel}`;
    const html = `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
        <h2 style="margin: 0 0 16px;">Su boleta de pago está lista</h2>
        <p>Estimado/a ${this.escapeHtml(recipientName ?? 'apoderado/a')},</p>
        <p>
          La boleta${this.escapeHtml(numberLabel)} asociada al pago de
          ${this.escapeHtml(studentName)} se encuentra disponible y se adjunta
          en este correo.
        </p>
        <p>Saludos cordiales,<br />Equipo de Administración</p>
      </div>
    `;

    await this.sendTrackedEmail({
      to,
      recipientName,
      type: CommunicationType.BOLETA_EMITTED,
      subject,
      html,
      metadata: {
        paymentGroupId,
        ...(studentId ? { studentId } : {}),
        ...(boletaNumber ? { boletaNumber } : {}),
        boletaUrl: boletaFileUrl,
      },
      attachment: {
        fileUrl: boletaFileUrl,
        filename: boletaNumber
          ? `boleta-${boletaNumber}.pdf`
          : path.basename(boletaFileUrl),
      },
    });
  }

  async sendReminder({
    to,
    recipientName,
    studentName,
    studentId,
    amount,
    dueDate,
    conceptName = 'cuota pendiente',
  }: ReminderPayload): Promise<void> {
    const formattedAmount = amount.toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });
    const formattedDueDate = dueDate
      ? new Intl.DateTimeFormat('es-CL', {
          dateStyle: 'short',
          timeZone: 'UTC',
        }).format(dueDate)
      : null;
    const subject = `Recordatorio de pago: ${conceptName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
        <h2 style="margin: 0 0 16px;">Recordatorio de pago</h2>
        <p>Estimado/a ${this.escapeHtml(recipientName ?? 'apoderado/a')},</p>
        <p>
          Le recordamos que ${this.escapeHtml(studentName)} mantiene
          ${this.escapeHtml(conceptName)} por ${formattedAmount}${formattedDueDate ? `, con vencimiento el ${formattedDueDate}` : ''}.
        </p>
        <p>Si ya realizó el pago, por favor ignore este mensaje.</p>
      </div>
    `;

    await this.sendTrackedEmail({
      to,
      recipientName,
      type: CommunicationType.PAYMENT_REMINDER,
      subject,
      html,
      metadata: {
        ...(studentId ? { studentId } : {}),
        amount,
        ...(dueDate ? { dueDate: dueDate.toISOString() } : {}),
        conceptName,
      },
    });
  }

  private async sendTrackedEmail(data: SendTrackedEmailData): Promise<void> {
    try {
      await this.sendViaResend(data);
      await this.logDelivery(data, DeliveryStatus.SENT);
      this.logger.log(`Email sent to ${data.to}: ${data.subject}`);
    } catch (error) {
      const errorMessage = this.toErrorMessage(error);
      await this.logDelivery(data, DeliveryStatus.FAILED, errorMessage);
      this.logger.error(
        `Failed to send email to ${data.to}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async sendViaResend(data: SendTrackedEmailData): Promise<void> {
    const recipientEmail = data.to.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      throw new Error('Correo electrónico de destino inválido');
    }

    if (!this.isEmailEnabled) {
      throw new Error(
        'Email deshabilitado en entorno local (sin RESEND_API_KEY)',
      );
    }

    const attachment = data.attachment
      ? await this.buildAttachment(data.attachment)
      : undefined;
    const result = await this.resend.emails.send({
      from: this.from,
      to: recipientEmail,
      subject: data.subject,
      html: data.html,
      attachments: attachment ? [attachment] : undefined,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  private async buildAttachment(attachment: {
    fileUrl: string;
    filename: string;
  }) {
    if (/^https?:\/\//i.test(attachment.fileUrl)) {
      return {
        filename: attachment.filename,
        path: attachment.fileUrl,
        contentType: 'application/pdf',
      };
    }

    const attachmentPath = path.resolve(
      process.cwd(),
      attachment.fileUrl.replace(/^\/+/, ''),
    );

    return {
      filename: attachment.filename,
      content: await fs.readFile(attachmentPath),
      contentType: 'application/pdf',
    };
  }

  private async logDelivery(
    data: SendTrackedEmailData,
    status: DeliveryStatus,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.communicationsService.logCommunication({
        recipientEmail: data.to,
        recipientName: data.recipientName,
        type: data.type,
        subject: data.subject,
        status,
        metadata: data.metadata,
        errorMessage,
      });
    } catch (logError) {
      this.logger.error(
        `No fue posible registrar la trazabilidad del correo a ${data.to}: ${this.toErrorMessage(logError)}`,
        logError instanceof Error ? logError.stack : undefined,
      );
    }
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Error de correo desconocido';
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
