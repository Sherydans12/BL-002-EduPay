import { Logger } from '@nestjs/common';
import { NotificationStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prisma = {
    tenant: {
      findMany: jest.fn(),
    },
    notificationLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: NotificationsService;
  let sendEmail: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationsService(prisma as unknown as PrismaService);
    sendEmail = jest.fn();

    const mutableService = service as unknown as {
      isEmailEnabled: boolean;
      resend: { emails: { send: jest.Mock } };
    };
    mutableService.isEmailEnabled = true;
    mutableService.resend = { emails: { send: sendEmail } };
  });

  it('registra FAILED en el tenant correcto cuando Resend rechaza el envío', async () => {
    sendEmail.mockRejectedValueOnce(new Error('Domain not verified'));
    prisma.notificationLog.create.mockResolvedValue({ id: 1 });

    await service.dispatchEmail({
      tenantId: 'colegio-pruebas',
      type: NotificationType.PAYMENT_RECEIPT,
      recipientEmail: 'apoderado@example.com',
      subject: 'Comprobante de pago - Orden OC-125',
      html: '<p>Comprobante</p>',
      paymentGroupId: 92,
    });

    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant: { connect: { id: 'colegio-pruebas' } },
        type: NotificationType.PAYMENT_RECEIPT,
        status: NotificationStatus.FAILED,
        recipientEmail: 'apoderado@example.com',
        errorMessage: 'Domain not verified',
        paymentGroup: { connect: { id: 92 } },
      }),
      include: { student: true, paymentGroup: true },
    });
  });

  it('reintenta FAILED por tenant y actualiza la fila original', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 'colegio-a' },
      { id: 'colegio-b' },
    ]);
    prisma.notificationLog.findMany
      .mockResolvedValueOnce([
        {
          id: 10,
          type: NotificationType.PAYMENT_RECEIPT,
          recipientEmail: 'guardian-a@example.com',
          subject: 'Pago A',
          body: '<p>Pago A</p>',
          retryCount: 1,
          paymentGroup: null,
        },
        {
          id: 11,
          type: NotificationType.COBRANZA_MORA,
          recipientEmail: 'guardian-b@example.com',
          subject: 'Cobranza B',
          body: '<p>Cobranza B</p>',
          retryCount: 2,
          paymentGroup: null,
        },
      ])
      .mockResolvedValueOnce([]);
    sendEmail
      .mockResolvedValueOnce({ data: { id: 'email-10' }, error: null })
      .mockRejectedValueOnce(new Error('Invalid API key'));
    prisma.notificationLog.update.mockResolvedValue({});
    const loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await expect(service.retryFailedNotifications()).resolves.toEqual({
      processed: 2,
      sent: 1,
      failed: 1,
    });

    expect(prisma.notificationLog.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          tenantId: 'colegio-a',
          status: NotificationStatus.FAILED,
          retryCount: { lt: 3 },
          deletedAt: null,
        },
      }),
    );
    expect(prisma.notificationLog.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'colegio-b' }),
      }),
    );
    expect(prisma.notificationLog.update).toHaveBeenNthCalledWith(1, {
      where: { id: 10, tenantId: 'colegio-a' },
      data: {
        status: NotificationStatus.SENT,
        errorMessage: null,
      },
    });
    expect(prisma.notificationLog.update).toHaveBeenNthCalledWith(2, {
      where: { id: 11, tenantId: 'colegio-a' },
      data: {
        status: NotificationStatus.FAILED,
        retryCount: { increment: 1 },
        errorMessage: 'Invalid API key',
      },
    });
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'NOTIFICATION_RETRY_FAILED',
        tenantId: 'colegio-a',
        notificationLogId: 11,
        retryCount: 3,
      }),
    );
    loggerWarn.mockRestore();
  });
});
