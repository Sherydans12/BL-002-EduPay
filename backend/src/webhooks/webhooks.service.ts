import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus } from '@prisma/client';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service';

type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

type ResendEmailWebhookPayload = {
  type: string;
  data?: {
    email_id?: string;
    bounce?: { message?: string };
  };
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly resend: Resend;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.resend = new Resend(
      this.config.get<string>('RESEND_API_KEY') ||
        're_placeholder_dev_no_email',
    );
  }

  /**
   * Verifica la firma de Resend, correlaciona el email_id y actualiza el
   * estado de entrega. El webhook se procesa sin contexto de tenant porque
   * Resend no conoce el colegio que originó el correo.
   */
  async processResendWebhook(
    rawPayload: string,
    headers: ResendWebhookHeaders,
  ) {
    const payload = this.verifyPayload(
      rawPayload,
      headers,
    ) as ResendEmailWebhookPayload;
    const emailId = payload.data?.email_id;

    if (!emailId) {
      this.logger.warn('Webhook de Resend sin data.email_id');
      return { processed: false, matched: false };
    }

    const update = this.deliveryUpdateFor(payload);
    if (!update) {
      return { processed: false, matched: false, emailId };
    }

    const communication = await this.prisma.sentCommunication.findFirst({
      where: { resendEmailId: emailId },
      select: { id: true, status: true },
    });

    if (!communication) {
      this.logger.warn(
        `No existe comunicación asociada al email_id de Resend ${emailId}`,
      );
      return { processed: true, matched: false, emailId };
    }

    // email.delivery_delayed no es un estado terminal y no debe revertir un
    // resultado que pudo llegar antes por el orden no garantizado de webhooks.
    if (payload.type === 'email.delivery_delayed') {
      return {
        processed: true,
        matched: true,
        emailId,
        status: communication.status,
      };
    }

    const updated = await this.prisma.sentCommunication.update({
      where: { id: communication.id },
      data: update,
      select: { id: true, status: true, resendEmailId: true },
    });

    return { processed: true, matched: true, emailId, status: updated.status };
  }

  private verifyPayload(
    rawPayload: string,
    headers: ResendWebhookHeaders,
  ): unknown {
    const webhookSecret = this.config.get<string>('RESEND_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.error(
        '[RESEND_WEBHOOK_SIGNATURE_VERIFICATION_FAILED] RESEND_WEBHOOK_SECRET no está configurado',
      );
      throw new ServiceUnavailableException(
        'RESEND_WEBHOOK_SECRET no está configurado',
      );
    }

    try {
      return this.resend.webhooks.verify({
        payload: rawPayload,
        headers,
        webhookSecret,
      });
    } catch (error) {
      this.logger.error(
        `[RESEND_WEBHOOK_SIGNATURE_VERIFICATION_FAILED] webhookId=${headers.id || 'unknown'}`,
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
      throw new UnauthorizedException('Firma de webhook de Resend inválida');
    }
  }

  private deliveryUpdateFor(
    payload: ResendEmailWebhookPayload,
  ): { status: DeliveryStatus; errorMessage?: string | null } | null {
    switch (payload.type) {
      case 'email.delivered':
        return { status: DeliveryStatus.DELIVERED, errorMessage: null };
      case 'email.bounced':
        return {
          status: DeliveryStatus.BOUNCED,
          errorMessage:
            payload.data?.bounce?.message ||
            'Resend informó que el correo rebotó',
        };
      case 'email.complained':
        return {
          status: DeliveryStatus.COMPLAINED,
          errorMessage: 'El destinatario marcó el correo como no deseado',
        };
      case 'email.delivery_delayed':
        return { status: DeliveryStatus.SENT };
      case 'email.failed':
        return {
          status: DeliveryStatus.FAILED,
          errorMessage: 'Resend no pudo entregar el correo',
        };
      default:
        return null;
    }
  }
}
