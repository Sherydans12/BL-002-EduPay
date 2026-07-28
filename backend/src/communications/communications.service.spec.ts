import { ForbiddenException } from '@nestjs/common';
import { CommunicationType, DeliveryStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { tenantContext } from '../core/tenant/tenant.context';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationsService } from './communications.service';

describe('CommunicationsService', () => {
  let service: CommunicationsService;
  const prisma = {
    sentCommunication: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
    },
    student: { findFirst: jest.fn() },
    tenantEmailConfig: { upsert: jest.fn() },
  };
  const mailService = {
    sendBoletaNotification: jest.fn(),
    sendPaymentConfirmation: jest.fn(),
    sendReminder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(CommunicationsService);
  });

  it('registra la comunicación con el tenant actual', async () => {
    prisma.sentCommunication.create.mockResolvedValue({ id: 'comm-1' });

    await tenantContext.run(
      { tenantId: 'colegio-test', isSuperAdmin: false },
      () =>
        service.logCommunication({
          recipientEmail: 'apoderado@example.com',
          recipientName: 'María Pérez',
          type: CommunicationType.BOLETA_EMITTED,
          subject: 'Su boleta está lista',
          status: DeliveryStatus.SENT,
          metadata: { paymentGroupId: 10 },
        }),
    );

    expect(prisma.sentCommunication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'colegio-test',
        recipientEmail: 'apoderado@example.com',
        type: CommunicationType.BOLETA_EMITTED,
        status: DeliveryStatus.SENT,
      }),
    });
  });

  it('pagina y filtra siempre por el tenant actual', async () => {
    prisma.sentCommunication.findMany.mockResolvedValue([]);
    prisma.sentCommunication.count.mockResolvedValue(0);

    const result = await tenantContext.run(
      { tenantId: 'colegio-test', isSuperAdmin: false },
      () =>
        service.getSentCommunications(2, 10, {
          search: 'boleta',
          status: DeliveryStatus.FAILED,
        }),
    );

    expect(prisma.sentCommunication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'colegio-test',
          status: DeliveryStatus.FAILED,
        }),
        skip: 10,
        take: 10,
      }),
    );
    expect(result.meta).toEqual({
      total: 0,
      page: 2,
      limit: 10,
      totalPages: 0,
    });
  });

  it('rechaza consultas sin un tenant seleccionado', async () => {
    await expect(service.getSentCommunications()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('crea la configuración de correo por defecto para el tenant actual', async () => {
    prisma.tenantEmailConfig.upsert.mockResolvedValue({
      tenantId: 'colegio-test',
      senderName: 'Colegio Conquistadores',
    });

    await tenantContext.run(
      { tenantId: 'colegio-test', isSuperAdmin: false },
      () => service.getEmailSettings(),
    );

    expect(prisma.tenantEmailConfig.upsert).toHaveBeenCalledWith({
      where: { tenantId: 'colegio-test' },
      create: { tenantId: 'colegio-test' },
      update: {},
    });
  });

  it('reintenta una comunicación fallida del tenant actual y actualiza el mismo registro', async () => {
    prisma.sentCommunication.findFirst.mockResolvedValueOnce({
      id: '0bd3b1b8-e2bb-418a-a54e-ef9375363150',
      tenantId: 'colegio-test',
      recipientEmail: 'apoderado@example.com',
      recipientName: 'María Pérez',
      type: CommunicationType.PAYMENT_REMINDER,
      status: DeliveryStatus.FAILED,
      metadata: {
        studentId: 7,
        amount: 45000,
        dueDate: '2026-07-30T00:00:00.000Z',
        conceptName: 'Mensualidad',
      },
    });
    prisma.sentCommunication.findFirstOrThrow.mockResolvedValue({
      id: '0bd3b1b8-e2bb-418a-a54e-ef9375363150',
      status: DeliveryStatus.SENT,
    });
    prisma.student.findFirst.mockResolvedValue({
      id: 7,
      name: 'Ana Pérez',
      guardian: { name: 'María Pérez' },
    });
    mailService.sendReminder.mockResolvedValue(undefined);

    const result = await tenantContext.run(
      { tenantId: 'colegio-test', isSuperAdmin: false },
      () => service.retryCommunication('0bd3b1b8-e2bb-418a-a54e-ef9375363150'),
    );

    expect(mailService.sendReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'apoderado@example.com',
        studentName: 'Ana Pérez',
        trackingCommunicationId: '0bd3b1b8-e2bb-418a-a54e-ef9375363150',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ status: DeliveryStatus.SENT }),
    );
  });
});
