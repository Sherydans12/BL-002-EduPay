import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType, PaymentMethod } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const mailService = {
    sendPaymentConfirmation: jest.fn().mockResolvedValue(undefined),
  };

  const notificationsService = {
    dispatchEmail: jest.fn().mockResolvedValue(undefined),
  };

  const mockStudent = {
    id: 1,
    name: 'Ana Pérez',
    rut: '11.111.111-1',
    courseId: 1,
    guardianId: 1,
    course: { id: 1, name: '1° Básico' },
    guardian: {
      id: 1,
      name: 'María Pérez',
      email: 'maria@example.com',
      rut: '22.222.222-2',
      phone: null,
    },
  };

  const prisma = {
    student: { findMany: jest.fn(), findUnique: jest.fn() },
    payment: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    paymentGroup: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  describe('createBatch', () => {
    const batchDto = {
      totalAmount: 150000,
      method: PaymentMethod.CASH,
      paymentDate: '2026-06-01',
      allocations: [
        { studentId: 1, conceptId: 1, amount: 75000 },
        { studentId: 2, conceptId: 1, amount: 75000 },
      ],
    };

    it('crea PaymentGroup y un Payment por cada allocation', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      prisma.paymentGroup.create.mockResolvedValue({ id: 10 });
      prisma.payment.create.mockResolvedValue({ id: 1 });
      prisma.paymentGroup.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        totalAmount: 150000,
        method: PaymentMethod.CASH,
        paymentDate: new Date('2026-06-01'),
        payments: [
          {
            id: 1,
            amount: 75000,
            student: mockStudent,
            concept: { id: 1, name: 'Mensualidad' },
          },
          {
            id: 2,
            amount: 75000,
            student: { ...mockStudent, id: 2, name: 'Luis Pérez' },
            concept: { id: 1, name: 'Mensualidad' },
          },
        ],
      });

      const result = await service.createBatch(batchDto, '/uploads/boleta.pdf');

      expect(prisma.student.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] }, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.paymentGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          totalAmount: 150000,
          method: PaymentMethod.CASH,
          boletaFileUrl: '/uploads/boleta.pdf',
        }),
      });
      expect(prisma.payment.create).toHaveBeenCalledTimes(2);
      expect(result.id).toBe(10);
    });

    it('envía boleta por correo cuando se crea un pago manual con boleta inmediata', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      prisma.student.findUnique.mockResolvedValue(mockStudent);
      prisma.paymentGroup.create.mockResolvedValue({ id: 10 });
      prisma.payment.create.mockResolvedValue({ id: 1 });
      prisma.paymentGroup.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        totalAmount: 150000,
        method: PaymentMethod.CASH,
        paymentDate: new Date('2026-06-01'),
        payments: [],
      });

      await service.createBatch(
        {
          ...batchDto,
          boletaNumber: 'BOL-001',
          isBoletaPending: false,
        },
        '/uploads/boleta.pdf',
      );

      expect(prisma.student.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { guardian: true },
      });
      expect(notificationsService.dispatchEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.BOLETA_DELIVERY,
          recipientEmail: 'maria@example.com',
          subject: 'Su boleta de pago está lista - N° BOL-001',
          studentId: 1,
          paymentGroupId: 10,
          attachments: [
            expect.objectContaining({
              filename: 'boleta-BOL-001.pdf',
            }),
          ],
        }),
      );
    });

    it('lanza NotFoundException si falta algún alumno', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 1 }]);

      await expect(service.createBatch(batchDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.createBatch(batchDto)).rejects.toThrow(
        'Alumno(s) no encontrado(s): 2',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('crea grupo y pago individual y envía correo si hay email válido', async () => {
      const paymentDate = new Date('2026-06-01');
      prisma.paymentGroup.create.mockResolvedValue({ id: 5 });
      prisma.payment.create.mockResolvedValue({
        id: 99,
        amount: 75000,
        method: PaymentMethod.CASH,
        paymentDate,
        student: mockStudent,
        concept: null,
      });

      const result = await service.create(
        {
          amount: 75000,
          method: PaymentMethod.CASH,
          paymentDate: '2026-06-01',
          studentId: 1,
        },
        '/uploads/comprobante.pdf',
      );

      expect(result.id).toBe(99);
      expect(mailService.sendPaymentConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'maria@example.com',
          studentName: 'Ana Pérez',
          amount: 75000,
        }),
      );
    });

    it('no envía correo si el apoderado no tiene email válido', async () => {
      prisma.paymentGroup.create.mockResolvedValue({ id: 5 });
      prisma.payment.create.mockResolvedValue({
        id: 100,
        amount: 50000,
        method: PaymentMethod.TRANSFER,
        paymentDate: new Date('2026-06-01'),
        student: {
          ...mockStudent,
          guardian: { ...mockStudent.guardian, email: 'no-es-email' },
        },
        concept: null,
      });

      await service.create({
        amount: 50000,
        method: PaymentMethod.TRANSFER,
        paymentDate: '2026-06-01',
        studentId: 1,
      });

      expect(mailService.sendPaymentConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('migrateLegacyPayments', () => {
    it('agrupa pagos huérfanos en PaymentGroup 1:1', async () => {
      const orphan = {
        id: 7,
        amount: 30000,
        method: PaymentMethod.CASH,
        paymentDate: new Date('2026-05-01'),
        boletaFileUrl: null,
        boletaNumber: null,
        notes: null,
      };
      prisma.payment.findMany.mockResolvedValue([orphan]);
      prisma.paymentGroup.create.mockResolvedValue({ id: 20 });
      prisma.payment.update = jest.fn().mockResolvedValue({});

      await service.migrateLegacyPayments();

      expect(prisma.paymentGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ totalAmount: 30000 }),
      });
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { paymentGroupId: 20 },
      });
    });
  });
});
