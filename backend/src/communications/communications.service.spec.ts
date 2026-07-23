import { ForbiddenException } from '@nestjs/common';
import { CommunicationType, DeliveryStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { tenantContext } from '../core/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationsService } from './communications.service';

describe('CommunicationsService', () => {
  let service: CommunicationsService;
  const prisma = {
    sentCommunication: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunicationsService,
        { provide: PrismaService, useValue: prisma },
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
});
