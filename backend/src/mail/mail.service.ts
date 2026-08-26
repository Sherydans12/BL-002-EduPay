import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CommunicationType,
  DeliveryStatus,
  type Prisma,
  type TenantEmailConfig,
} from '@prisma/client';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Resend } from 'resend';
import { CommunicationsService } from '../communications/communications.service';
import {
  renderBoletaTemplate,
  renderConsolidatedReminderTemplate,
  renderCustomMessageTemplate,
  renderPaymentConfirmationTemplate,
  renderReminderTemplate,
  type ConsolidatedReminderCharge,
} from './templates/email-templates';

type PaymentConfirmationPayload = {
  to: string;
  recipientName?: string;
  studentName: string;
  studentId?: number;
  paymentGroupId?: number;
  amount: number;
  paymentDate: Date;
  boletaFileUrl?: string | null;
  trackingCommunicationId?: string;
};

type BoletaNotificationPayload = {
  to: string;
  recipientName?: string;
  studentName: string;
  studentId?: number;
  paymentGroupId: number;
  boletaNumber?: string | null;
  boletaFileUrl: string;
  trackingCommunicationId?: string;
};

type ReminderPayload = {
  to: string;
  recipientName?: string;
  studentName: string;
  studentId?: number;
  amount: number;
  dueDate?: Date;
  conceptName?: string;
  trackingCommunicationId?: string;
};

type ConsolidatedReminderPayload = {
  to: string;
  recipientName?: string;
  studentName: string;
  studentId?: number;
  courseName?: string;
  totalAmount: number;
  charges: Array<{
    conceptName: string;
    amount: number;
    dueDate?: Date | null;
  }>;
  paymentPortalUrl?: string;
  trackingCommunicationId?: string;
};

type CustomMessagePayload = {
  to: string;
  recipientName?: string;
  studentName?: string;
  studentId?: number;
  courseName?: string;
  subject: string;
  message: string;
  trackingCommunicationId?: string;
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

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => CommunicationsService))
    private readonly communicationsService: CommunicationsService,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey || 're_placeholder_dev_no_email');
    this.from =
      this.config.get<string>('MAIL_FROM')?.trim() ||
      this.config.get<string>('RESEND_FROM')?.trim() ||
      'notificaciones@baselogic.cl';
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
    trackingCommunicationId,
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
    const html = renderPaymentConfirmationTemplate({
      recipientName,
      studentName,
      formattedAmount,
      formattedDate,
    });

    await this.sendTrackedEmail(
      {
        to,
        recipientName,
        type: CommunicationType.MANUAL_PAYMENT_RECEIPT,
        subject,
        html,
        metadata: {
          ...(paymentGroupId ? { paymentGroupId } : {}),
          ...(studentId ? { studentId } : {}),
          studentName,
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
      },
      trackingCommunicationId,
    );
  }

  async sendBoletaNotification({
    to,
    recipientName,
    studentName,
    studentId,
    paymentGroupId,
    boletaNumber,
    boletaFileUrl,
    trackingCommunicationId,
  }: BoletaNotificationPayload): Promise<void> {
    const numberLabel = boletaNumber ? ` N° ${boletaNumber}` : '';
    const subject = `Su boleta de pago está lista${numberLabel}`;
    const html = renderBoletaTemplate({
      recipientName,
      studentName,
      boletaNumber,
    });

    await this.sendTrackedEmail(
      {
        to,
        recipientName,
        type: CommunicationType.BOLETA_EMITTED,
        subject,
        html,
        metadata: {
          paymentGroupId,
          ...(studentId ? { studentId } : {}),
          studentName,
          ...(boletaNumber ? { boletaNumber } : {}),
          boletaUrl: boletaFileUrl,
        },
        attachment: {
          fileUrl: boletaFileUrl,
          filename: boletaNumber
            ? `boleta-${boletaNumber}.pdf`
            : path.basename(boletaFileUrl),
        },
      },
      trackingCommunicationId,
    );
  }

  async sendReminder({
    to,
    recipientName,
    studentName,
    studentId,
    amount,
    dueDate,
    conceptName = 'cuota pendiente',
    trackingCommunicationId,
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
    const html = renderReminderTemplate({
      recipientName,
      studentName,
      conceptName,
      formattedAmount,
      formattedDueDate,
    });

    await this.sendTrackedEmail(
      {
        to,
        recipientName,
        type: CommunicationType.PAYMENT_REMINDER,
        subject,
        html,
        metadata: {
          ...(studentId ? { studentId } : {}),
          studentName,
          amount,
          ...(dueDate ? { dueDate: dueDate.toISOString() } : {}),
          conceptName,
        },
      },
      trackingCommunicationId,
    );
  }

  async sendConsolidatedReminder({
    to,
    recipientName,
    studentName,
    studentId,
    courseName,
    totalAmount,
    charges,
    paymentPortalUrl,
    trackingCommunicationId,
  }: ConsolidatedReminderPayload): Promise<void> {
    const totalFormattedAmount = totalAmount.toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });

    const renderedCharges: ConsolidatedReminderCharge[] = charges.map((c) => ({
      conceptName: c.conceptName,
      formattedAmount: c.amount.toLocaleString('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
      }),
      formattedDueDate: c.dueDate
        ? new Intl.DateTimeFormat('es-CL', {
            dateStyle: 'short',
            timeZone: 'UTC',
          }).format(c.dueDate)
        : undefined,
    }));

    const subject = `Aviso de cobranza: Estado de cuotas de ${studentName}`;
    const html = renderConsolidatedReminderTemplate({
      recipientName,
      studentName,
      courseName,
      totalFormattedAmount,
      charges: renderedCharges,
      paymentPortalUrl,
    });

    await this.sendTrackedEmail(
      {
        to,
        recipientName,
        type: CommunicationType.PAYMENT_REMINDER,
        subject,
        html,
        metadata: {
          ...(studentId ? { studentId } : {}),
          studentName,
          ...(courseName ? { courseName } : {}),
          amount: totalAmount,
          chargesCount: charges.length,
          conceptsSummary: charges.map((c) => c.conceptName).join(', '),
        },
      },
      trackingCommunicationId,
    );
  }

  async sendCustomMessage({
    to,
    recipientName,
    studentName,
    studentId,
    courseName,
    subject,
    message,
    trackingCommunicationId,
  }: CustomMessagePayload): Promise<void> {
    const html = renderCustomMessageTemplate({
      recipientName,
      studentName,
      courseName,
      subject,
      message,
    });

    await this.sendTrackedEmail(
      {
        to,
        recipientName,
        type: CommunicationType.ACCOUNT_STATEMENT,
        subject,
        html,
        metadata: {
          ...(studentId ? { studentId } : {}),
          ...(studentName ? { studentName } : {}),
          ...(courseName ? { courseName } : {}),
          isCustomMessage: true,
        },
      },
      trackingCommunicationId,
    );
  }

  private async sendTrackedEmail(
    data: SendTrackedEmailData,
    trackingCommunicationId?: string,
  ): Promise<void> {
    try {
      const emailConfig = await this.communicationsService.getEmailSettings();
      const simulationReason = this.getSimulationReason(emailConfig);
      if (simulationReason) {
        this.logger.log(
          `Envío simulado (${simulationReason}). Destinatario: ${data.to}`,
        );
        await this.logDelivery(
          data,
          DeliveryStatus.DELIVERED,
          undefined,
          undefined,
          trackingCommunicationId,
        );
        return;
      }

      const resendEmailId = await this.sendViaResend(data, emailConfig);
      if (!resendEmailId) {
        this.logger.log(
          `Email omitted by tenant configuration: ${data.type} to ${data.to}`,
        );
        return;
      }

      await this.logDelivery(
        data,
        DeliveryStatus.SENT,
        undefined,
        resendEmailId,
        trackingCommunicationId,
      );
      this.logger.log(`Email sent to ${data.to}: ${data.subject}`);
    } catch (error) {
      const errorMessage = this.toErrorMessage(error);
      await this.logDelivery(
        data,
        DeliveryStatus.FAILED,
        errorMessage,
        undefined,
        trackingCommunicationId,
      );
      this.logger.error(
        `Failed to send email to ${data.to}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async sendViaResend(
    data: SendTrackedEmailData,
    emailConfig: TenantEmailConfig,
  ): Promise<string | null> {
    if (!this.isCommunicationEnabled(data.type, emailConfig)) {
      return null;
    }

    const recipientEmail = data.to.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      throw new Error('Correo electrónico de destino inválido');
    }

    if (!this.config.get<string>('RESEND_API_KEY')) {
      throw new Error(
        'Email deshabilitado en entorno local (sin RESEND_API_KEY)',
      );
    }

    const attachment = data.attachment
      ? await this.buildAttachment(data.attachment)
      : undefined;
    const result = await this.resend.emails.send({
      from: this.formatSender(emailConfig.senderName, emailConfig.senderEmail),
      to: recipientEmail,
      subject: data.subject,
      html: this.withEmailFooter(data.html, emailConfig.emailFooter),
      replyTo: emailConfig.replyToEmail || undefined,
      attachments: attachment ? [attachment] : undefined,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (!result.data?.id) {
      throw new Error('Resend no devolvió el identificador del correo');
    }

    return result.data.id;
  }

  private isCommunicationEnabled(
    type: CommunicationType,
    config: {
      enableManualPaymentEmails: boolean;
      enableBoletaEmails: boolean;
      enableReminderEmails: boolean;
    },
  ): boolean {
    switch (type) {
      case CommunicationType.MANUAL_PAYMENT_RECEIPT:
        return config.enableManualPaymentEmails;
      case CommunicationType.BOLETA_EMITTED:
        return config.enableBoletaEmails;
      case CommunicationType.PAYMENT_REMINDER:
        return config.enableReminderEmails;
      default:
        return true;
    }
  }

  private areEmailsEnabled(): boolean {
    const enableEmails = this.config.get<boolean>('ENABLE_EMAILS') as
      | boolean
      | string
      | undefined;

    return enableEmails !== false && enableEmails !== 'false';
  }

  private getSimulationReason(config: TenantEmailConfig): string | null {
    if (!this.areEmailsEnabled()) return 'ENABLE_EMAILS=false';
    if (config.enableAllEmails === false) return 'enableAllEmails=false';
    return null;
  }

  private formatSender(
    senderName: string,
    tenantSenderEmail?: string | null,
  ): string {
    const senderEmail =
      this.extractEmail(tenantSenderEmail) ??
      this.extractEmail(this.from) ??
      'notificaciones@baselogic.cl';
    const safeName = senderName.replace(/[\r\n"]/g, '').trim();

    return safeName ? `"${safeName}" <${senderEmail}>` : senderEmail;
  }

  private extractEmail(value?: string | null): string | null {
    if (!value?.trim()) return null;

    const email = value.match(/<([^>]+)>/)?.[1] ?? value.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }

  private withEmailFooter(html: string, emailFooter: string | null): string {
    const footer = emailFooter?.trim();
    if (!footer) return html;

    return `${html}<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 24px auto 0; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 16px;">${footer}</div>`;
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
    resendEmailId?: string,
    trackingCommunicationId?: string,
  ): Promise<void> {
    try {
      if (trackingCommunicationId) {
        await this.communicationsService.updateDelivery(
          trackingCommunicationId,
          {
            status,
            resendEmailId: resendEmailId ?? null,
            errorMessage: errorMessage ?? null,
          },
        );
        return;
      }

      await this.communicationsService.logCommunication({
        recipientEmail: data.to,
        recipientName: data.recipientName,
        type: data.type,
        subject: data.subject,
        status,
        resendEmailId,
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
}
