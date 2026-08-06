import {
  GuardianEmailUpdateSource,
  GuardianEmailWebhookEvent,
  GuardianEmailWebhookStatus,
} from '@prisma/client';
import { createHmac } from 'node:crypto';
import {
  GuardianEmailWebhooksService,
  signGuardianEmailWebhook,
} from './guardian-email-webhooks.service';

describe('GuardianEmailWebhooksService', () => {
  const secret = 'secret-for-tests-with-at-least-32-characters';
  const configValues: Record<string, string> = {
    NODE_ENV: 'test',
    GUARDIAN_EMAIL_WEBHOOKS: JSON.stringify({
      'colegio-conquistadores': {
        url: 'https://portal.example.cl/webhooks/guardian-email',
        secret,
      },
    }),
    GUARDIAN_EMAIL_WEBHOOK_BATCH_SIZE: '10',
    GUARDIAN_EMAIL_WEBHOOK_MAX_ATTEMPTS: '3',
    GUARDIAN_EMAIL_WEBHOOK_RETRY_BASE_SECONDS: '1',
    GUARDIAN_EMAIL_WEBHOOK_TIMEOUT_MS: '1000',
  };
  const occurredAt = new Date('2026-07-30T16:25:00.000Z');

  function event(
    overrides: Partial<GuardianEmailWebhookEvent> = {},
  ): GuardianEmailWebhookEvent {
    return {
      id: '11111111-2222-4333-8444-555555555555',
      tenantId: 'colegio-conquistadores',
      guardianId: 42,
      guardianRut: '12.345.678-5',
      email: 'nuevo.correo@example.cl',
      previousEmail: 'anterior@example.cl',
      guardianUpdatedAt: occurredAt,
      occurredAt,
      source: GuardianEmailUpdateSource.PORTAL,
      actorId: 'portal-s2s',
      status: GuardianEmailWebhookStatus.PENDING,
      attemptCount: 0,
      nextAttemptAt: occurredAt,
      lockedAt: null,
      deliveredAt: null,
      lastError: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      ...overrides,
    };
  }

  function setup(events: GuardianEmailWebhookEvent[]) {
    const findFirst = jest.fn();
    for (const item of events) findFirst.mockResolvedValueOnce(item);
    findFirst.mockResolvedValue(null);

    const findUnique = jest.fn();
    for (const item of events) findUnique.mockResolvedValueOnce(item);

    const prisma = {
      guardianEmailWebhookEvent: {
        findFirst,
        findUnique,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
    };
    const config = {
      get: jest.fn((name: string) => configValues[name]),
    };
    const service = new GuardianEmailWebhooksService(
      prisma as never,
      config as never,
    );
    return { service, prisma };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('firma timestamp y cuerpo con HMAC SHA-256', () => {
    const timestamp = '2026-07-30T16:25:05.000Z';
    const body = '{"eventId":"event-1"}';
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`, 'utf8')
      .digest('hex');

    expect(signGuardianEmailWebhook(secret, timestamp, body)).toBe(
      `sha256=${expected}`,
    );
  });

  it('envía el contrato, la firma y el eventId estable', async () => {
    const outboxEvent = event();
    const { service, prisma } = setup([outboxEvent]);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    await expect(service.dispatchPendingEvents()).resolves.toEqual({
      processed: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    const headers = request?.headers as Record<string, string>;
    const body = String(request?.body);
    const payload = JSON.parse(body) as Record<string, unknown>;

    expect(payload).toEqual({
      eventId: outboxEvent.id,
      type: 'guardian.email.updated',
      occurredAt: '2026-07-30T16:25:00.000Z',
      tenantId: 'colegio-conquistadores',
      guardian: {
        id: 42,
        rut: '12.345.678-5',
        email: 'nuevo.correo@example.cl',
        previousEmail: 'anterior@example.cl',
        updatedAt: '2026-07-30T16:25:00.000Z',
      },
      source: 'PORTAL',
    });
    expect(headers['x-edupay-event-id']).toBe(outboxEvent.id);
    expect(headers['x-edupay-signature']).toBe(
      signGuardianEmailWebhook(secret, headers['x-edupay-timestamp'], body),
    );
    expect(prisma.guardianEmailWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: outboxEvent.id },
      data: expect.objectContaining({
        status: GuardianEmailWebhookStatus.DELIVERED,
        attemptCount: { increment: 1 },
      }),
    });
  });

  it('reintenta errores transitorios con el mismo eventId', async () => {
    const firstAttempt = event();
    const secondAttempt = event({
      status: GuardianEmailWebhookStatus.PENDING,
      attemptCount: 1,
    });
    const { service, prisma } = setup([firstAttempt, secondAttempt]);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    await service.dispatchPendingEvents();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<
      string,
      string
    >;
    expect(firstHeaders['x-edupay-event-id']).toBe(firstAttempt.id);
    expect(secondHeaders['x-edupay-event-id']).toBe(firstAttempt.id);
    expect(prisma.guardianEmailWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: firstAttempt.id },
      data: expect.objectContaining({
        status: GuardianEmailWebhookStatus.PENDING,
        attemptCount: 1,
        nextAttemptAt: expect.any(Date),
      }),
    });
    expect(prisma.guardianEmailWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: firstAttempt.id },
      data: expect.objectContaining({
        status: GuardianEmailWebhookStatus.DELIVERED,
      }),
    });
  });

  it('no entrega si otra instancia ya reclamó el evento', async () => {
    const outboxEvent = event();
    const { service, prisma } = setup([outboxEvent]);
    prisma.guardianEmailWebhookEvent.updateMany.mockResolvedValue({ count: 0 });
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(service.dispatchPendingEvents()).resolves.toEqual({
      processed: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
