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
});
