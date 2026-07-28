import { ConfigService } from '@nestjs/config';
import { DeliveryStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  const verify = jest.fn();
  const prisma = {
    sentCommunication: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'RESEND_WEBHOOK_SECRET') return 'whsec_test';
              return 're_test_key';
            }),
          },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(WebhooksService);
    Object.defineProperty(service, 'resend', {
      value: { webhooks: { verify } },
    });
  });

  it('actualiza a DELIVERED el correo correlacionado con email.delivered', async () => {
    verify.mockReturnValue({
      type: 'email.delivered',
      data: { email_id: 're_email_1' },
    });
    prisma.sentCommunication.findFirst.mockResolvedValue({
      id: 'comm-1',
      status: DeliveryStatus.SENT,
    });
    prisma.sentCommunication.update.mockResolvedValue({
      id: 'comm-1',
      status: DeliveryStatus.DELIVERED,
      resendEmailId: 're_email_1',
    });

    const result = await service.processResendWebhook(
      '{"type":"email.delivered"}',
      {
        id: 'msg-1',
        timestamp: '1',
        signature: 'v1,test',
      },
    );

    expect(prisma.sentCommunication.findFirst).toHaveBeenCalledWith({
      where: { resendEmailId: 're_email_1' },
      select: { id: true, status: true },
    });
    expect(prisma.sentCommunication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comm-1' },
        data: { status: DeliveryStatus.DELIVERED, errorMessage: null },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        matched: true,
        status: DeliveryStatus.DELIVERED,
      }),
    );
  });

  it('registra el motivo al recibir email.bounced', async () => {
    verify.mockReturnValue({
      type: 'email.bounced',
      data: {
        email_id: 're_email_2',
        bounce: { message: 'Mailbox unavailable' },
      },
    });
    prisma.sentCommunication.findFirst.mockResolvedValue({
      id: 'comm-2',
      status: DeliveryStatus.SENT,
    });
    prisma.sentCommunication.update.mockResolvedValue({
      id: 'comm-2',
      status: DeliveryStatus.BOUNCED,
      resendEmailId: 're_email_2',
    });

    await service.processResendWebhook('{"type":"email.bounced"}', {
      id: 'msg-2',
      timestamp: '1',
      signature: 'v1,test',
    });

    expect(prisma.sentCommunication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: DeliveryStatus.BOUNCED,
          errorMessage: 'Mailbox unavailable',
        },
      }),
    );
  });
});
