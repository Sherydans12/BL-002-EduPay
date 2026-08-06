import { BadRequestException } from '@nestjs/common';
import { GuardiansService } from './guardians.service';

describe('GuardiansService', () => {
  const guardianCreate = jest.fn();
  const studentFindMany = jest.fn();
  const prisma = {
    guardian: { create: guardianCreate },
    student: { findMany: studentFindMany },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea un apoderado sin relación cuando studentIds viene vacío', async () => {
    const createdGuardian = { id: 1, name: 'María Pérez', students: [] };
    guardianCreate.mockResolvedValue(createdGuardian);
    const service = new GuardiansService(
      prisma as never,
      { enqueue: jest.fn() } as never,
    );

    await expect(
      service.create({
        name: 'María Pérez',
        studentIds: [],
      }),
    ).resolves.toEqual(createdGuardian);

    expect(studentFindMany).not.toHaveBeenCalled();
    expect(guardianCreate).toHaveBeenCalledWith({
      data: { name: 'María Pérez' },
      include: {
        students: {
          where: { deletedAt: null },
          include: { course: true },
        },
      },
    });
  });

  it('rechaza quitar alumnos existentes de un apoderado', async () => {
    const guardianFindFirst = jest.fn().mockResolvedValue({
      id: 10,
      name: 'Apoderado',
      students: [{ id: 7 }],
    });
    studentFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 7, name: 'Alumno Uno' }]);
    const service = new GuardiansService(
      {
        guardian: { findFirst: guardianFindFirst },
        student: { findMany: studentFindMany },
      } as never,
      { enqueue: jest.fn() } as never,
    );

    await expect(
      service.update(10, { studentIds: [] }, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
    expect(guardianFindFirst).toHaveBeenCalledTimes(1);
  });

  it('genera un evento atómico cuando un administrador cambia el correo', async () => {
    const previousUpdatedAt = new Date('2026-07-30T16:20:00.000Z');
    const nextUpdatedAt = new Date('2026-07-30T16:25:00.000Z');
    const guardianFindFirst = jest.fn().mockResolvedValueOnce({
      id: 10,
      tenantId: 'colegio-conquistadores',
      rut: '12.345.678-5',
      name: 'Apoderado',
      email: 'anterior@example.cl',
      updatedAt: previousUpdatedAt,
      students: [],
    });
    const tx = {
      guardian: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          tenantId: 'colegio-conquistadores',
          rut: '12.345.678-5',
          email: 'anterior@example.cl',
        }),
        update: jest.fn().mockResolvedValue({
          id: 10,
          tenantId: 'colegio-conquistadores',
          rut: '12.345.678-5',
          name: 'Apoderado',
          email: 'nuevo@example.cl',
          updatedAt: nextUpdatedAt,
          students: [],
        }),
      },
      guardianEmailWebhookEvent: { create: jest.fn() },
    };
    const enqueue = jest.fn();
    const service = new GuardiansService(
      {
        guardian: { findFirst: guardianFindFirst },
        student: { findMany: jest.fn() },
        $transaction: jest.fn(
          (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
        ),
      } as never,
      { enqueue } as never,
    );

    await expect(
      service.update(10, { email: 'nuevo@example.cl' }, 'admin-user-123'),
    ).resolves.toMatchObject({ email: 'nuevo@example.cl' });

    expect(enqueue).toHaveBeenCalledWith(tx, {
      tenantId: 'colegio-conquistadores',
      guardianId: 10,
      guardianRut: '12.345.678-5',
      email: 'nuevo@example.cl',
      previousEmail: 'anterior@example.cl',
      guardianUpdatedAt: nextUpdatedAt,
      source: 'EDUPAY_ADMIN',
      actorId: 'admin-user-123',
    });
  });

  it('no genera evento administrativo si el correo no cambia', async () => {
    const updatedAt = new Date('2026-07-30T16:20:00.000Z');
    const guardian = {
      id: 10,
      tenantId: 'colegio-conquistadores',
      rut: '12.345.678-5',
      name: 'Apoderado',
      email: 'vigente@example.cl',
      updatedAt,
      students: [],
    };
    const tx = {
      guardian: {
        findFirst: jest.fn().mockResolvedValue(guardian),
        update: jest.fn().mockResolvedValue(guardian),
      },
    };
    const enqueue = jest.fn();
    const service = new GuardiansService(
      {
        guardian: { findFirst: jest.fn().mockResolvedValue(guardian) },
        student: { findMany: jest.fn() },
        $transaction: jest.fn(
          (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
        ),
      } as never,
      { enqueue } as never,
    );

    await service.update(10, { email: 'vigente@example.cl' }, 'admin-user-123');
    expect(enqueue).not.toHaveBeenCalled();
  });
});
