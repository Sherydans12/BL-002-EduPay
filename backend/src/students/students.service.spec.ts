import { StudentsService } from './students.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StudentsService structured names', () => {
  const prisma = {
    course: { findFirst: jest.fn() },
    guardian: { findFirst: jest.fn() },
    student: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new StudentsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.course.findFirst.mockResolvedValue({ id: 1 });
    prisma.guardian.findFirst.mockResolvedValue({ id: 1 });
  });

  it('derives the legacy name for a newly created structured Student', async () => {
    prisma.student.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        firstName: 'María José',
        lastName: 'Pérez Soto',
      }),
    );

    const result = await service.create({
      rut: '12.345.678-5',
      name: 'A conflicting legacy value',
      firstName: 'María José',
      lastName: 'Pérez Soto',
      courseId: 1,
      guardianId: 1,
    });

    expect(prisma.student.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: 'María José',
          lastName: 'Pérez Soto',
          name: 'María José Pérez Soto',
        }),
      }),
    );
    expect(result.integrationReady).toBe(true);
  });

  it('does not guess structured fields from a legacy name update', async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 10,
      name: 'Legacy Name',
      firstName: null,
      lastName: null,
    });
    prisma.student.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, firstName: null, lastName: null }),
    );

    const result = await service.update(10, { name: 'Corrected Legacy Name' });

    expect(prisma.student.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Corrected Legacy Name' } }),
    );
    expect(result.integrationReady).toBe(false);
  });

  it('keeps legacy name synchronized after structured-name correction', async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 11,
      name: 'Legacy Name',
      firstName: null,
      lastName: null,
    });
    prisma.student.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, firstName: 'Ana', lastName: 'Silva' }),
    );

    const result = await service.update(11, {
      firstName: 'Ana',
      lastName: 'Silva',
    });

    expect(prisma.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { firstName: 'Ana', lastName: 'Silva', name: 'Ana Silva' },
      }),
    );
    expect(result.integrationReady).toBe(true);
  });

  describe('getNameReviewQueue', () => {
    it('returns only active students with missing structured names and pending count', async () => {
      (prisma.student as any).findMany = jest.fn().mockResolvedValue([
        {
          id: 5,
          integrationId: 'int-uuid-5',
          name: 'VICENTE ESCOBAR MARIN',
          firstName: null,
          lastName: null,
          status: 'ACTIVE',
          courseId: 1,
          course: { id: 1, name: '1° BASICO' },
        },
        {
          id: 17,
          integrationId: 'int-uuid-17',
          name: 'TOBIAS ZABALA NARVAI',
          firstName: '',
          lastName: '',
          status: 'ACTIVE',
          courseId: 1,
          course: { id: 1, name: '1° BASICO' },
        },
      ]);

      const result = await service.getNameReviewQueue('colegio-conquistadores');

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            status: 'ACTIVE',
            tenantId: 'colegio-conquistadores',
            OR: [
              { firstName: null },
              { firstName: '' },
              { lastName: null },
              { lastName: '' },
            ],
          }),
        }),
      );
      expect(result.meta.pendingCount).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        id: 5,
        name: 'VICENTE ESCOBAR MARIN',
        reason: 'STUDENT_STRUCTURED_NAME_MISSING',
        tokenCount: 3,
      });
    });
  });

  describe('reviewStudentName', () => {
    it('successfully partitions and persists structured names when tokens are preserved', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 5,
        integrationId: 'int-uuid-5',
        name: 'VICENTE ESCOBAR MARIN',
        firstName: null,
        lastName: null,
        status: 'ACTIVE',
        courseId: 1,
        course: { id: 1, name: '1° BASICO' },
      });
      prisma.student.update.mockResolvedValue({
        id: 5,
        integrationId: 'int-uuid-5',
        name: 'VICENTE ESCOBAR MARIN',
        firstName: 'Vicente',
        lastName: 'Escobar Marin',
        status: 'ACTIVE',
        courseId: 1,
        course: { id: 1, name: '1° BASICO' },
      });

      const result = await service.reviewStudentName(
        5,
        {
          firstName: '  Vicente  ',
          lastName: ' Escobar   Marin ',
        },
        { id: 42, role: 'TENANT_ADMIN' },
      );

      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          firstName: 'Vicente',
          lastName: 'Escobar Marin',
        },
        select: expect.any(Object),
      });
      expect(result.data.integrationReady).toBe(true);
    });

    it('rejects partition with BadRequestException when tokens are missing or added', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 5,
        integrationId: 'int-uuid-5',
        name: 'VICENTE ESCOBAR MARIN',
        firstName: null,
        lastName: null,
        status: 'ACTIVE',
      });

      await expect(
        service.reviewStudentName(
          5,
          {
            firstName: 'Vicente',
            lastName: 'Escobar', // Missing MARIN!
          },
          { id: 42 },
        ),
      ).rejects.toThrow('El número de palabras no coincide');
    });

    it('rejects partition with BadRequestException when spelling is modified', async () => {
      prisma.student.findFirst.mockResolvedValue({
        id: 5,
        integrationId: 'int-uuid-5',
        name: 'VICENTE ESCOBAR MARIN',
        firstName: null,
        lastName: null,
        status: 'ACTIVE',
      });

      await expect(
        service.reviewStudentName(
          5,
          {
            firstName: 'Vicente',
            lastName: 'Escobar Marino', // Altered spelling!
          },
          { id: 42 },
        ),
      ).rejects.toThrow('no coincide con las palabras del nombre original');
    });

    it('throws NotFoundException when student does not exist', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(
        service.reviewStudentName(
          999,
          {
            firstName: 'Vicente',
            lastName: 'Escobar Marin',
          },
          { id: 42 },
        ),
      ).rejects.toThrow('Student #999 not found');
    });
  });
});
