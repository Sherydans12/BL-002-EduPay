import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  GuardianEmailUpdateSource,
  GuardianEmailWebhookEvent,
  GuardianEmailWebhookStatus,
  Prisma,
} from '@prisma/client';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const EVENT_TYPE = 'guardian.email.updated' as const;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_RETRY_BASE_SECONDS = 60;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_BATCH_SIZE = 20;
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BACKOFF_SECONDS = 24 * 60 * 60;

type WebhookTenantConfig = {
  url: string;
  secret: string;
};

type WebhookConfigMap = Record<string, WebhookTenantConfig>;

export type GuardianEmailUpdatedPayload = {
  eventId: string;
  type: typeof EVENT_TYPE;
  occurredAt: string;
  tenantId: string;
  guardian: {
    id: number;
    rut: string | null;
    email: string | null;
    previousEmail: string | null;
    updatedAt: string;
  };
  source: GuardianEmailUpdateSource;
};

export type EnqueueGuardianEmailUpdateInput = {
  tenantId: string;
  guardianId: number;
  guardianRut: string | null;
  email: string | null;
  previousEmail: string | null;
  guardianUpdatedAt: Date;
  source: GuardianEmailUpdateSource;
  actorId: string | null;
};

type OutboxClient = Pick<Prisma.TransactionClient, 'guardianEmailWebhookEvent'>;

class GuardianEmailWebhookConfigurationError extends Error {}

export function signGuardianEmailWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  return `sha256=${digest}`;
}

@Injectable()
export class GuardianEmailWebhooksService {
  private readonly logger = new Logger(GuardianEmailWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async enqueue(
    client: OutboxClient,
    input: EnqueueGuardianEmailUpdateInput,
  ): Promise<GuardianEmailWebhookEvent> {
    const event = await client.guardianEmailWebhookEvent.create({
      data: {
        tenantId: input.tenantId,
        guardianId: input.guardianId,
        guardianRut: input.guardianRut,
        email: input.email,
        previousEmail: input.previousEmail,
        guardianUpdatedAt: input.guardianUpdatedAt,
        occurredAt: input.guardianUpdatedAt,
        source: input.source,
        actorId: input.actorId,
      },
    });

    this.logger.log({
      event: 'GUARDIAN_EMAIL_UPDATED',
      eventId: event.id,
      source: input.source,
      actorId: input.actorId,
      tenantId: input.tenantId,
      guardianId: input.guardianId,
      occurredAt: event.occurredAt.toISOString(),
    });

    return event;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchPendingEvents(): Promise<{ processed: number }> {
    let processed = 0;
    const batchSize = this.positiveInteger(
      'GUARDIAN_EMAIL_WEBHOOK_BATCH_SIZE',
      DEFAULT_BATCH_SIZE,
    );

    for (let index = 0; index < batchSize; index += 1) {
      const event = await this.claimNextEvent();
      if (!event) break;

      await this.deliverClaimedEvent(event);
      processed += 1;
    }

    return { processed };
  }

  private async claimNextEvent(): Promise<GuardianEmailWebhookEvent | null> {
    const now = new Date();
    const staleLock = new Date(now.getTime() - LOCK_TIMEOUT_MS);
    const eligible: Prisma.GuardianEmailWebhookEventWhereInput = {
      OR: [
        {
          status: GuardianEmailWebhookStatus.PENDING,
          nextAttemptAt: { lte: now },
        },
        {
          status: GuardianEmailWebhookStatus.PROCESSING,
          lockedAt: { lte: staleLock },
        },
      ],
    };

    const candidate = await this.prisma.guardianEmailWebhookEvent.findFirst({
      where: eligible,
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!candidate) return null;

    const claimed = await this.prisma.guardianEmailWebhookEvent.updateMany({
      where: { id: candidate.id, ...eligible },
      data: {
        status: GuardianEmailWebhookStatus.PROCESSING,
        lockedAt: now,
      },
    });
    if (claimed.count !== 1) return null;

    return this.prisma.guardianEmailWebhookEvent.findUnique({
      where: { id: candidate.id },
    });
  }

  private async deliverClaimedEvent(
    event: GuardianEmailWebhookEvent,
  ): Promise<void> {
    try {
      const tenantConfig = this.tenantConfig(event.tenantId);
      const payload = this.toPayload(event);
      const rawBody = JSON.stringify(payload);
      const timestamp = new Date().toISOString();
      const signature = signGuardianEmailWebhook(
        tenantConfig.secret,
        timestamp,
        rawBody,
      );
      const timeoutMs = this.positiveInteger(
        'GUARDIAN_EMAIL_WEBHOOK_TIMEOUT_MS',
        DEFAULT_REQUEST_TIMEOUT_MS,
      );

      const response = await fetch(tenantConfig.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-edupay-event-id': event.id,
          'x-edupay-timestamp': timestamp,
          'x-edupay-signature': signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        await this.markDelivered(event);
        return;
      }

      const transient =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500;
      await this.markFailed(
        event,
        `Portal respondió HTTP ${response.status}`,
        transient,
      );
    } catch (error) {
      const configurationError =
        error instanceof GuardianEmailWebhookConfigurationError;
      await this.markFailed(
        event,
        error instanceof Error ? error.message : 'Error de entrega desconocido',
        true,
      );

      this.logger.warn({
        event: configurationError
          ? 'GUARDIAN_EMAIL_WEBHOOK_CONFIGURATION_ERROR'
          : 'GUARDIAN_EMAIL_WEBHOOK_DELIVERY_ERROR',
        eventId: event.id,
        tenantId: event.tenantId,
        guardianId: event.guardianId,
      });
    }
  }

  private async markDelivered(event: GuardianEmailWebhookEvent): Promise<void> {
    const deliveredAt = new Date();
    await this.prisma.guardianEmailWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: GuardianEmailWebhookStatus.DELIVERED,
        attemptCount: { increment: 1 },
        deliveredAt,
        lockedAt: null,
        lastError: null,
      },
    });

    this.logger.log({
      event: 'GUARDIAN_EMAIL_WEBHOOK_DELIVERED',
      eventId: event.id,
      tenantId: event.tenantId,
      guardianId: event.guardianId,
      deliveredAt: deliveredAt.toISOString(),
    });
  }

  private async markFailed(
    event: GuardianEmailWebhookEvent,
    errorMessage: string,
    transient: boolean,
  ): Promise<void> {
    const attemptCount = event.attemptCount + 1;
    const maxAttempts = this.positiveInteger(
      'GUARDIAN_EMAIL_WEBHOOK_MAX_ATTEMPTS',
      DEFAULT_MAX_ATTEMPTS,
    );
    const exhausted = attemptCount >= maxAttempts;
    const shouldRetry = transient && !exhausted;
    const nextAttemptAt = shouldRetry
      ? new Date(Date.now() + this.backoffMs(attemptCount))
      : event.nextAttemptAt;

    await this.prisma.guardianEmailWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: shouldRetry
          ? GuardianEmailWebhookStatus.PENDING
          : GuardianEmailWebhookStatus.DEAD_LETTER,
        attemptCount,
        nextAttemptAt,
        lockedAt: null,
        lastError: errorMessage.slice(0, 1000),
      },
    });

    this.logger.warn({
      event: shouldRetry
        ? 'GUARDIAN_EMAIL_WEBHOOK_RETRY_SCHEDULED'
        : 'GUARDIAN_EMAIL_WEBHOOK_DEAD_LETTER',
      eventId: event.id,
      tenantId: event.tenantId,
      guardianId: event.guardianId,
      attemptCount,
      nextAttemptAt: shouldRetry ? nextAttemptAt.toISOString() : null,
    });
  }

  private backoffMs(attemptCount: number): number {
    const baseSeconds = this.positiveInteger(
      'GUARDIAN_EMAIL_WEBHOOK_RETRY_BASE_SECONDS',
      DEFAULT_RETRY_BASE_SECONDS,
    );
    const seconds = Math.min(
      baseSeconds * 2 ** Math.max(attemptCount - 1, 0),
      MAX_BACKOFF_SECONDS,
    );
    return seconds * 1000;
  }

  private toPayload(
    event: GuardianEmailWebhookEvent,
  ): GuardianEmailUpdatedPayload {
    return {
      eventId: event.id,
      type: EVENT_TYPE,
      occurredAt: event.occurredAt.toISOString(),
      tenantId: event.tenantId,
      guardian: {
        id: event.guardianId,
        rut: event.guardianRut,
        email: event.email,
        previousEmail: event.previousEmail,
        updatedAt: event.guardianUpdatedAt.toISOString(),
      },
      source: event.source,
    };
  }

  private tenantConfig(tenantId: string): WebhookTenantConfig {
    const rawConfig = this.config.get<string>('GUARDIAN_EMAIL_WEBHOOKS');
    let configMap: WebhookConfigMap;

    try {
      const parsed = rawConfig ? (JSON.parse(rawConfig) as unknown) : null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid webhook configuration');
      }
      configMap = parsed as WebhookConfigMap;
    } catch {
      throw new GuardianEmailWebhookConfigurationError(
        'La configuración de webhooks de apoderados no es válida',
      );
    }

    const tenantConfig = configMap[tenantId];
    if (
      !tenantConfig ||
      typeof tenantConfig.url !== 'string' ||
      typeof tenantConfig.secret !== 'string' ||
      tenantConfig.secret.length < 32
    ) {
      throw new GuardianEmailWebhookConfigurationError(
        `No existe configuración válida de webhook para el tenant ${tenantId}`,
      );
    }

    try {
      const url = new URL(tenantConfig.url);
      if (
        url.protocol !== 'https:' &&
        this.config.get<string>('NODE_ENV') === 'production'
      ) {
        throw new Error('HTTPS required');
      }
    } catch {
      throw new GuardianEmailWebhookConfigurationError(
        `La URL de webhook del tenant ${tenantId} no es válida`,
      );
    }

    return tenantConfig;
  }

  private positiveInteger(name: string, fallback: number): number {
    const parsed = Number(this.config.get<string>(name));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
