import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { CommunicationType, DeliveryStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { CommunicationsService } from '../communications/communications.service';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  const communicationsService = {
    logCommunication: jest.fn().mockResolvedValue({ id: 'comm-1' }),
    updateDelivery: jest.fn().mockResolvedValue({ id: 'comm-1' }),
    getEmailSettings: jest.fn().mockResolvedValue({
      senderName: 'Colegio Conquistadores',
      replyToEmail: null,
      emailFooter: null,
      enableManualPaymentEmails: true,
      enableBoletaEmails: true,
      enableReminderEmails: true,
    }),
  };
  const send = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    send.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              if (key === 'RESEND_API_KEY') return 're_test_key';
              return fallback;
            }),
          },
        },
        {
          provide: CommunicationsService,
          useValue: communicationsService,
        },
      ],
    }).compile();

    service = module.get(MailService);
    Object.defineProperty(service, 'resend', {
      value: { emails: { send } },
    });
  });

  it('registra SENT después de un envío exitoso', async () => {
    await service.sendReminder({
      to: 'apoderado@example.com',
      recipientName: 'María Pérez',
      studentName: 'Ana Pérez',
      studentId: 1,
      amount: 45000,
      conceptName: 'Mensualidad',
    });

    expect(send).toHaveBeenCalled();
    expect(communicationsService.logCommunication).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'apoderado@example.com',
        type: CommunicationType.PAYMENT_REMINDER,
        status: DeliveryStatus.SENT,
        resendEmailId: 'email-1',
      }),
    );
  });

  it('actualiza la comunicación original al reintentar', async () => {
    await service.sendReminder({
      to: 'apoderado@example.com',
      studentName: 'Ana Pérez',
      amount: 45000,
      trackingCommunicationId: 'comm-1',
    });

    expect(communicationsService.updateDelivery).toHaveBeenCalledWith(
      'comm-1',
      expect.objectContaining({
        status: DeliveryStatus.SENT,
        resendEmailId: 'email-1',
      }),
    );
    expect(communicationsService.logCommunication).not.toHaveBeenCalled();
  });

  it('omite el envío si el tenant deshabilita los recordatorios', async () => {
    communicationsService.getEmailSettings.mockResolvedValueOnce({
      senderName: 'Colegio Conquistadores',
      replyToEmail: null,
      emailFooter: null,
      enableManualPaymentEmails: true,
      enableBoletaEmails: true,
      enableReminderEmails: false,
    });

    await service.sendReminder({
      to: 'apoderado@example.com',
      studentName: 'Ana Pérez',
      amount: 45000,
    });

    expect(send).not.toHaveBeenCalled();
    expect(communicationsService.logCommunication).not.toHaveBeenCalled();
  });

  it('registra FAILED y propaga el error de Resend', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    send.mockResolvedValue({
      data: null,
      error: { message: 'Resend unavailable' },
    });

    await expect(
      service.sendReminder({
        to: 'apoderado@example.com',
        studentName: 'Ana Pérez',
        amount: 45000,
      }),
    ).rejects.toThrow('Resend unavailable');

    expect(communicationsService.logCommunication).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CommunicationType.PAYMENT_REMINDER,
        status: DeliveryStatus.FAILED,
        errorMessage: 'Resend unavailable',
      }),
    );
    loggerError.mockRestore();
  });
});
