import { BadRequestException, ConflictException } from '@nestjs/common';
import { ChargeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortalService } from './portal.service';

describe('PortalService', () => {
  const tx = {
    paymentGroup: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    charge: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
  };

  const prisma = {
    guardian: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  let service: PortalService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PortalService(prisma as unknown as PrismaService);
  });

  it('retorna exists=false cuando el RUT no está registrado', async () => {
    prisma.guardian.findFirst.mockResolvedValue(null);

    await expect(service.findGuardian('12.345.678-5')).resolves.toEqual({
      exists: false,
      rut: null,
      name: null,
      email: null,
    });

    expect(prisma.guardian.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rutNormalized: '123456785',
        }),
      }),
    );
  });

  it('mapea cuotas pagadas, vencidas y pendientes para el portal', async () => {
    prisma.guardian.findFirst.mockResolvedValue({
      rut: '12.345.678-5',
      name: 'Apoderado',
      students: [
        {
          id: 1,
          rut: '20.000.000-K',
          name: 'Alumno',
          course: { id: 2, name: '2° Básico' },
          charges: [
            {
              id: 10,
              amount: 50000,
              paidAmount: 50000,
              dueDate: new Date('2026-01-05T00:00:00.000Z'),
              status: ChargeStatus.PAID,
            },
            {
              id: 11,
              amount: 50000,
              paidAmount: 10000,
              dueDate: new Date('2020-01-05T00:00:00.000Z'),
              status: ChargeStatus.PARTIALLY_PAID,
            },
            {
              id: 12,
              amount: 50000,
              paidAmount: 0,
              dueDate: new Date('2099-01-05T00:00:00.000Z'),
              status: ChargeStatus.PENDING,
            },
          ],
        },
      ],
    });

    const result = await service.getGuardianStatement('12345678-5');

    expect(result.students[0].installments).toEqual([
      {
        id: 10,
        month: '2026-01',
        amount: 50000,
        paidAmount: 50000,
        outstandingAmount: 0,
        status: 'PAGADO',
      },
      {
        id: 11,
        month: '2020-01',
        amount: 50000,
        paidAmount: 10000,
        outstandingAmount: 40000,
        status: 'VENCIDO',
      },
      {
        id: 12,
        month: '2099-01',
        amount: 50000,
        paidAmount: 0,
        outstandingAmount: 50000,
        status: 'PENDIENTE',
      },
    ]);
  });

  it('sincroniza el pago y salda todas las cuotas en una transacción', async () => {
    tx.paymentGroup.findFirst.mockResolvedValue(null);
    tx.paymentGroup.create.mockResolvedValue({ id: 90 });
    tx.charge.findMany.mockResolvedValue([
      {
        id: 10,
        amount: 70000,
        paidAmount: 20000,
        status: ChargeStatus.PARTIALLY_PAID,
        studentId: 1,
        conceptId: 3,
        student: { id: 1, guardian: { rut: '12.345.678-5' } },
      },
      {
        id: 11,
        amount: 70000,
        paidAmount: 0,
        status: ChargeStatus.PENDING,
        studentId: 1,
        conceptId: 3,
        student: { id: 1, guardian: { rut: '12.345.678-5' } },
      },
    ]);

    const result = await service.syncPayment({
      buyOrder: ' OC-123 ',
      amount: 120000,
      paymentDate: '2026-06-23T15:30:00.000Z',
      installmentsIds: [10, 11],
    });

    expect(result).toEqual({
      synced: true,
      alreadyProcessed: false,
      buyOrder: 'OC-123',
      paymentGroupId: 90,
      amount: 120000,
      paidInstallmentsIds: [10, 11],
    });
    expect(tx.payment.create).toHaveBeenCalledTimes(2);
    expect(tx.charge.update).toHaveBeenCalledTimes(2);
    expect(tx.paymentGroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { buyOrder: 'OC-123' },
      }),
    );
  });

  it('rechaza el sync si el monto no coincide con el saldo', async () => {
    tx.paymentGroup.findFirst.mockResolvedValue(null);
    tx.charge.findMany.mockResolvedValue([
      {
        id: 10,
        amount: 70000,
        paidAmount: 0,
        status: ChargeStatus.PENDING,
        studentId: 1,
        conceptId: 3,
        student: { id: 1, guardian: { rut: null } },
      },
    ]);

    await expect(
      service.syncPayment({
        buyOrder: 'OC-124',
        amount: 60000,
        paymentDate: '2026-06-23T15:30:00.000Z',
        installmentsIds: [10],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta un reintento idempotente y rechaza datos diferentes', async () => {
    tx.paymentGroup.findFirst.mockResolvedValue({
      id: 90,
      totalAmount: 120000,
      payments: [{ chargeId: 10 }, { chargeId: 11 }],
    });

    await expect(
      service.syncPayment({
        buyOrder: 'OC-123',
        amount: 120000,
        paymentDate: '2026-06-23T15:30:00.000Z',
        installmentsIds: [11, 10],
      }),
    ).resolves.toMatchObject({ alreadyProcessed: true });

    await expect(
      service.syncPayment({
        buyOrder: 'OC-123',
        amount: 999,
        paymentDate: '2026-06-23T15:30:00.000Z',
        installmentsIds: [10, 11],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
