import { AcademicFinancialProjectionReconciliationService } from './academic-financial-projection-reconciliation.service';

// Synthetic identifiers and RUNs only.
const tenant = 'local-tenant-a';
const year2026 = 'a0000000-0000-4000-8000-000000002026';
const legacy = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const academic = (n: number) =>
  `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const course = (n: number) =>
  `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;

const row = (
  student: number,
  options: {
    legacyStudent?: string | null;
    run?: string | null;
    courseId?: number;
    legacyCourse?: string | null;
    descriptors?: boolean;
  } = {},
) => ({
  academicStudentId: academic(student),
  academicCourseId: course(options.courseId ?? 1),
  academicYearId: year2026,
  academicYearLabel: options.descriptors === false ? null : '2026',
  studentFirstName: options.descriptors === false ? null : 'Alumno',
  studentNationalIdType:
    options.run === undefined || options.run === null ? null : 'RUN',
  studentNationalId: options.run ?? null,
  studentLegacyIntegrationId:
    options.legacyStudent === undefined
      ? legacy(student)
      : options.legacyStudent,
  courseLegacyIntegrationId:
    options.legacyCourse === undefined ? legacy(900) : options.legacyCourse,
});

describe('AcademicFinancialProjectionReconciliationService', () => {
  const findProjections = jest.fn();
  const findStudents = jest.fn();
  const findCourses = jest.fn();
  const write = jest.fn();
  const prisma = {
    academicFinancialProjection: { findMany: findProjections, upsert: write },
    student: { findMany: findStudents, create: write, update: write },
    course: { findMany: findCourses, create: write, update: write },
  };
  const service = new AcademicFinancialProjectionReconciliationService(
    prisma as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('links only by legacy integrationId and reports every difference category', async () => {
    findProjections.mockResolvedValue([
      row(1, { run: '111111111' }), // linked, same RUN
      row(2, { run: '222222222' }), // linked, RUN differs from BL
      row(3, { legacyStudent: legacy(99) }), // reference not in BL
      row(4, {
        legacyStudent: null,
        run: '444444444',
        courseId: 2,
        legacyCourse: null,
      }), // new
      row(5, { legacyStudent: null, run: '5555555K' }), // new but RUN already in BL
      row(6, { legacyStudent: legacy(1) }), // second student pointing at BL #1
      row(7, { descriptors: false }), // pre-v2 row
    ]);
    findStudents.mockResolvedValue([
      { integrationId: legacy(1), rut: '11.111.111-1' },
      { integrationId: legacy(2), rut: '33.333.333-3' },
      { integrationId: legacy(50), rut: '5.555.555-k' },
      { integrationId: legacy(51), rut: '6.666.666-6' },
    ]);
    findCourses.mockResolvedValue([
      { integrationId: legacy(900) },
      { integrationId: legacy(901) },
    ]);

    const report = await service.legacyReconciliation(tenant);

    expect(report.students).toMatchObject({
      academico: 7,
      legacyBl: 4,
      linked: { count: 3 },
      newInAcademico: { count: 2 },
      legacyReferenceNotFound: { count: 1, sample: [academic(3)] },
      duplicateLegacyReference: {
        count: 2,
        sample: [academic(1), academic(6)],
      },
      runMismatch: { count: 1, sample: [academic(2)] },
      runConflictWithLegacy: { count: 1, sample: [academic(5)] },
      missingDescriptors: { count: 1, sample: [academic(7)] },
      onlyInLegacyBl: { count: 2, sample: [legacy(50), legacy(51)] },
    });
    expect(report.courses).toMatchObject({
      academico: 2,
      legacyBl: 2,
      linked: { count: 1 },
      newInAcademico: { count: 1, sample: [course(2)] },
      onlyInLegacyBl: { count: 1, sample: [legacy(901)] },
    });
    expect(report.academicYears).toEqual([
      { academicYearId: year2026, label: '2026', activeEnrollments: 7 },
    ]);
    expect(report.blocking).toEqual([
      'students.legacyReferenceNotFound',
      'students.duplicateLegacyReference',
      'students.runMismatch',
      'students.runConflictWithLegacy',
      'students.missingDescriptors',
    ]);
    expect(report.requiresDecision).toEqual([
      'students.onlyInLegacyBl',
      'courses.onlyInLegacyBl',
    ]);
    expect(report.readyForWriteMode).toBe(false);
  });

  it('never returns names or RUN values and never writes', async () => {
    findProjections.mockResolvedValue([row(1, { run: '111111111' })]);
    findStudents.mockResolvedValue([
      { integrationId: legacy(1), rut: '11.111.111-1' },
    ]);
    findCourses.mockResolvedValue([{ integrationId: legacy(900) }]);

    const report = await service.legacyReconciliation(tenant);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/Alumno|111111111|11\.111\.111/);
    expect(report.readyForWriteMode).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(findProjections).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: tenant, operation: 'UPSERT' },
      }),
    );
  });

  it('does not treat a name or label coincidence as a link', async () => {
    findProjections.mockResolvedValue([
      row(1, { legacyStudent: null, legacyCourse: null }),
    ]);
    findStudents.mockResolvedValue([{ integrationId: legacy(1), rut: null }]);
    findCourses.mockResolvedValue([{ integrationId: legacy(900) }]);

    const report = await service.legacyReconciliation(tenant);

    expect(report.students.linked.count).toBe(0);
    expect(report.students.newInAcademico.count).toBe(1);
    expect(report.students.onlyInLegacyBl.count).toBe(1);
    expect(report.courses.linked.count).toBe(0);
  });
});
