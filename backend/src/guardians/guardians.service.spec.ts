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
    const service = new GuardiansService(prisma as never);

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
    const service = new GuardiansService({
      guardian: { findFirst: guardianFindFirst },
      student: { findMany: studentFindMany },
    } as never);

    await expect(service.update(10, { studentIds: [] })).rejects.toThrow(
      BadRequestException,
    );
    expect(guardianFindFirst).toHaveBeenCalledTimes(1);
  });
});
