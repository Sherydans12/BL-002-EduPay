import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import {
  ChargeStatus,
  PaymentMethod,
  PaymentSource,
  Prisma,
} from '@prisma/client';
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
    paymentGroup: {
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
              concept: { id: 1, name: 'Matrícula' },
              payments: [
                {
                  id: 100,
                  amount: 50000,
                  method: 'TRANSFER',
                  paymentDate: new Date('2026-01-05T12:00:00.000Z'),
                },
              ],
            },
            {
              id: 11,
              amount: 50000,
              paidAmount: 10000,
              dueDate: new Date('2020-01-05T00:00:00.000Z'),
              status: ChargeStatus.PARTIALLY_PAID,
              concept: null,
              payments: [],
            },
            {
              id: 12,
              amount: 50000,
              paidAmount: 0,
              dueDate: new Date('2099-01-05T00:00:00.000Z'),
              status: ChargeStatus.PENDING,
              concept: { id: 2, name: 'Colegiatura' },
              payments: [],
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
        concept: { id: 1, name: 'Matrícula' },
        payments: [
          {
            id: 100,
            amount: 50000,
            method: 'TRANSFER',
            paymentDate: new Date('2026-01-05T12:00:00.000Z'),
          },
        ],
      },
      {
        id: 11,
        month: '2020-01',
        amount: 50000,
        paidAmount: 10000,
        outstandingAmount: 40000,
        status: 'VENCIDO',
        concept: null,
        payments: [],
      },
      {
        id: 12,
        month: '2099-01',
        amount: 50000,
        paidAmount: 0,
        outstandingAmount: 50000,
        status: 'PENDIENTE',
        concept: { id: 2, name: 'Colegiatura' },
        payments: [],
      },
    ]);
    expect(result.students[0].totalDebt).toBe(90000);
    expect(result.totalDebt).toBe(90000);
  });

  it('retorna arreglos vacíos y deuda cero si el apoderado no tiene alumnos', async () => {
    prisma.guardian.findFirst.mockResolvedValue({
      rut: '11.111.111-1',
      name: 'Apoderado sin alumnos',
      students: [],
    });

    await expect(service.getGuardianStatement('11111111-1')).resolves.toEqual({
      guardian: {
        rut: '11.111.111-1',
        name: 'Apoderado sin alumnos',
      },
      students: [],
      totalDebt: 0,
    });
  });

  it('tolera un alumno sin curso ni cargos en datos históricos', async () => {
    prisma.guardian.findFirst.mockResolvedValue({
      rut: '11.111.111-1',
      name: 'Apoderado',
      students: [
        {
          id: 20,
          rut: '20.000.002-3',
          name: 'Alumno sin configuración financiera',
          course: null,
          charges: undefined,
        },
      ],
    });

    await expect(service.getGuardianStatement('11111111-1')).resolves.toEqual({
      guardian: { rut: '11.111.111-1', name: 'Apoderado' },
      students: [
        {
          id: 20,
          rut: '20.000.002-3',
          name: 'Alumno sin configuración financiera',
          course: null,
          installments: [],
          totalDebt: 0,
        },
      ],
      totalDebt: 0,
    });
  });

  it('sincroniza el pago y salda todas las cuotas en una transacción', async () => {
    const loggerLog = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    tx.paymentGroup.findFirst.mockResolvedValue(null);
    tx.paymentGroup.create.mockResolvedValue({
      id: 90,
      totalAmount: 120000,
      paymentDate: new Date('2026-06-23T15:30:00.000Z'),
      payments: [],
    });
    tx.charge.findMany.mockResolvedValue([
      {
        id: 10,
        amount: 70000,
        paidAmount: 20000,
        status: ChargeStatus.PARTIALLY_PAID,
        studentId: 1,
        conceptId: 3,
        dueDate: new Date('2026-06-05T00:00:00.000Z'),
        concept: { name: 'Colegiatura junio' },
        student: {
          id: 1,
          name: 'Alumno Prueba',
          guardian: {
            rut: '12.345.678-5',
            name: 'Apoderado Prueba',
            email: 'apoderado@example.com',
          },
        },
      },
      {
        id: 11,
        amount: 70000,
        paidAmount: 0,
        status: ChargeStatus.PENDING,
        studentId: 1,
        conceptId: 3,
        dueDate: new Date('2026-07-05T00:00:00.000Z'),
        concept: { name: 'Colegiatura julio' },
        student: {
          id: 1,
          name: 'Alumno Prueba',
          guardian: {
            rut: '12.345.678-5',
            name: 'Apoderado Prueba',
            email: 'apoderado@example.com',
          },
        },
      },
    ]);

    const result = await service.syncPayment(
      {
        buyOrder: ' OC-123 ',
        amount: 120000,
        paymentMethod: PaymentMethod.WEBPAY,
        authorizationCode: '1213',
        cardNumber: '6623',
        chargeIds: [10, 11],
      },
      'colegio-pruebas',
    );

    expect(result).toEqual({
      synced: true,
      alreadyProcessed: false,
      buyOrder: 'OC-123',
      paymentGroupId: 90,
      amount: 120000,
      chargeIds: [10, 11],
    });
    expect(tx.payment.create).toHaveBeenCalledTimes(2);
    expect(tx.charge.update).toHaveBeenCalledTimes(2);
    expect(tx.paymentGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: PaymentSource.PORTAL }),
    });
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: PaymentSource.PORTAL }),
    });
    expect(tx.paymentGroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'colegio-pruebas', buyOrder: 'OC-123' },
      }),
    );
    expect(loggerLog).toHaveBeenCalledWith({
      event: 'WEBPAY_SYNCED',
      tenantId: 'colegio-pruebas',
      buyOrder: 'OC-123',
      amount: 120000,
      durationMs: expect.any(Number),
    });
    loggerLog.mockRestore();
  });

  it('ignora guardianEmail porque el Portal ya despachó el comprobante', async () => {
    const loggerLog = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    tx.paymentGroup.findFirst.mockResolvedValue(null);
    tx.paymentGroup.create.mockResolvedValue({
      id: 92,
      paymentDate: new Date('2026-06-23T15:30:00.000Z'),
    });
    tx.charge.findMany.mockResolvedValue([
      {
        id: 12,
        amount: 45000,
        paidAmount: 0,
        status: ChargeStatus.PENDING,
        studentId: 2,
        conceptId: 4,
        dueDate: new Date('2026-08-05T00:00:00.000Z'),
        concept: { name: 'Colegiatura agosto' },
        student: {
          id: 2,
          name: 'Alumno Dos',
          guardian: {
            rut: '11.111.111-1',
            name: 'Apoderado Dos',
            email: 'apoderado2@example.com',
          },
        },
      },
    ]);
    await expect(
      service.syncPayment(
        {
          buyOrder: 'OC-125',
          amount: 45000,
          paymentMethod: PaymentMethod.WEBPAY,
          authorizationCode: '1215',
          cardNumber: '1234',
          guardianEmail: 'apoderado2@example.com',
          chargeIds: [12],
        },
        'colegio-pruebas',
      ),
    ).resolves.toEqual({
      synced: true,
      alreadyProcessed: false,
      buyOrder: 'OC-125',
      paymentGroupId: 92,
      amount: 45000,
      chargeIds: [12],
    });
    expect(loggerLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'WEBPAY_SYNCED',
        tenantId: 'colegio-pruebas',
        buyOrder: 'OC-125',
        amount: 45000,
        durationMs: expect.any(Number),
      }),
    );
    loggerLog.mockRestore();
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
      service.syncPayment(
        {
          buyOrder: 'OC-124',
          amount: 60000,
          paymentMethod: PaymentMethod.WEBPAY,
          authorizationCode: '1214',
          cardNumber: '6623',
          chargeIds: [10],
        },
        'colegio-pruebas',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta un reintento idempotente y rechaza datos diferentes', async () => {
    const loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    tx.paymentGroup.findFirst.mockResolvedValue({
      id: 90,
      totalAmount: 120000,
      method: PaymentMethod.WEBPAY,
      authorizationCode: '1213',
      cardLast4: '6623',
      payments: [{ chargeId: 10 }, { chargeId: 11 }],
    });

    await expect(
      service.syncPayment(
        {
          buyOrder: 'OC-123',
          amount: 120000,
          paymentMethod: PaymentMethod.WEBPAY,
          authorizationCode: '1213',
          cardNumber: '6623',
          chargeIds: [11, 10],
        },
        'colegio-pruebas',
      ),
    ).resolves.toMatchObject({ alreadyProcessed: true });

    await expect(
      service.syncPayment(
        {
          buyOrder: 'OC-123',
          amount: 999,
          paymentMethod: PaymentMethod.WEBPAY,
          authorizationCode: '1213',
          cardNumber: '6623',
          chargeIds: [10, 11],
        },
        'colegio-pruebas',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'WEBPAY_SYNC_DUPLICATE',
        tenantId: 'colegio-pruebas',
        buyOrder: 'OC-123',
        amount: 120000,
        durationMs: expect.any(Number),
      }),
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'WEBPAY_SYNC_CONFLICT',
        tenantId: 'colegio-pruebas',
        buyOrder: 'OC-123',
        amount: 999,
        durationMs: expect.any(Number),
      }),
    );
    loggerWarn.mockRestore();
  });

  it('recupera la confirmación existente ante una carrera por buyOrder', async () => {
    const loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const concurrentGroup = {
      id: 91,
      totalAmount: 120000,
      method: PaymentMethod.WEBPAY,
      authorizationCode: '1213',
      cardLast4: '6623',
      payments: [{ chargeId: 10 }, { chargeId: 11 }],
    };
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );
    prisma.paymentGroup.findFirst.mockResolvedValue(concurrentGroup);

    await expect(
      service.syncPayment(
        {
          buyOrder: 'OC-123',
          amount: 120000,
          paymentMethod: PaymentMethod.WEBPAY,
          authorizationCode: '1213',
          cardNumber: '6623',
          chargeIds: [10, 11],
        },
        'colegio-pruebas',
      ),
    ).resolves.toEqual({
      synced: true,
      alreadyProcessed: true,
      buyOrder: 'OC-123',
      paymentGroupId: 91,
      amount: 120000,
      chargeIds: [10, 11],
    });
    expect(prisma.paymentGroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'colegio-pruebas', buyOrder: 'OC-123' },
      }),
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'WEBPAY_SYNC_DUPLICATE',
        tenantId: 'colegio-pruebas',
        buyOrder: 'OC-123',
        amount: 120000,
        durationMs: expect.any(Number),
      }),
    );
    loggerWarn.mockRestore();
  });
});
